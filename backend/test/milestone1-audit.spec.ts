import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import * as crypto from 'crypto';
import { buildSafeRegex } from '../src/common/utils/regex.util';
import { parseRfc4180Csv } from '../src/common/utils/csv.util';
import { UploadsService } from '../src/modules/uploads/uploads.service';
import { AirlinesService } from '../src/modules/airlines/airlines.service';
import { FlightBookingsService } from '../src/modules/flight-bookings/flight-bookings.service';
import { HotelBookingsService } from '../src/modules/hotel-bookings/hotel-bookings.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { BookingLifecycleStatus } from '../src/common/enums/role.enum';

describe('Milestone 1 Security, Concurrency & Validation Audit Suite', () => {
  beforeAll(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_unit_test_secret_key_2026_giu';
  });

  describe('1. Concurrency: 10 Parallel Requests on Last Flight Seat (FLT-22)', () => {
    it('allows strictly 1 booking and rejects the other 9 with 409 Conflict when 1 seat remains', async () => {
      const flightId = new Types.ObjectId();
      const airlineId = new Types.ObjectId();

      // In-memory atomic state simulating MongoDB document CAS on cabins subdocument
      const state = {
        _id: flightId,
        airlineId,
        flightNumber: 'MS800',
        status: 'Scheduled',
        departureTimeUtc: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        arrivalTimeUtc: new Date(Date.now() + 7 * 24 * 3600 * 1000 + 4 * 3600 * 1000),
        cabins: [
          {
            category: 'Economy',
            seatCount: 10,
            bookedSeats: 9,
            heldSeats: 0, // Only 1 seat remaining!
            price: 300,
          },
        ],
      };

      const mockFlightModel: any = {
        findById: jest.fn(async () => ({ ...state, cabins: state.cabins.map((c) => ({ ...c })) })),
        findOne: jest.fn(async () => ({ ...state, cabins: state.cabins.map((c) => ({ ...c })) })),
        findOneAndUpdate: jest.fn(async (filter: any, update: any) => {
          // Simulate MongoDB atomic document lock on $elemMatch state
          const elem = filter?.cabins?.$elemMatch;
          const cabin = state.cabins.find((c) => c.category === elem?.category);
          if (
            !cabin ||
            cabin.seatCount !== elem.seatCount ||
            cabin.bookedSeats !== elem.bookedSeats ||
            cabin.heldSeats !== elem.heldSeats
          ) {
            return null;
          }
          cabin.heldSeats += update.$inc['cabins.$.heldSeats'];
          return { ...state, cabins: state.cabins.map((c) => ({ ...c })) };
        }),
        updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
      };

      const mockFlightBookingModel: any = {
        findOneAndUpdate: jest.fn(async () => null),
        updateMany: jest.fn(async () => ({})),
        create: jest.fn(async (doc: any) => ({ _id: new Types.ObjectId(), ...doc })),
      };

      const mockAirlineModel: any = {
        findById: jest.fn(async () => ({
          _id: airlineId,
          isActive: true,
          baggagePolicy: { extraBagPrice: 30, maxExtraBagsPerPassenger: 2 },
          cancellationTiers: [],
        })),
      };

      const service = new FlightBookingsService(
        mockFlightBookingModel,
        mockFlightModel,
        mockAirlineModel,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const dto: any = {
        outboundFlightId: flightId.toString(),
        cabinCategory: 'Economy',
        passengers: [
          {
            fullName: 'Traveler One',
            dateOfBirth: '1998-01-01',
            passportOrId: 'P12345',
            passengerType: 'adult',
            extraBags: 0,
          },
        ],
      };

      // Fire 10 parallel requests for the single remaining seat
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          service.createHoldBooking(new Types.ObjectId().toString(), dto),
        ),
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r) => r.status === 'rejected' && r.reason instanceof ConflictException,
      );

      expect(succeeded).toHaveLength(1);
      expect(rejected).toHaveLength(9);
      expect(state.cabins[0].heldSeats).toBe(1);
      expect(state.cabins[0].bookedSeats + state.cabins[0].heldSeats).toBe(10);
    });
  });

  describe('2. Concurrency: 2 Parallel Requests on Same Hotel Room & Dates (HTL-18)', () => {
    it('allows strictly 1 room reservation and rejects the overlapping concurrent request with 409 Conflict', async () => {
      const hotelId = new Types.ObjectId();
      const roomId = new Types.ObjectId();

      const roomState: any = {
        _id: roomId,
        hotelId,
        roomNumber: '101',
        maxOccupancy: 2,
        pricePerNight: 150,
        isActive: true,
        availableRanges: [],
        blockedRanges: [],
        activeLocks: [],
      };

      const mockRoomModel: any = {
        find: jest.fn(() => ({
          lean: async () => [{ ...roomState }],
        })),
        updateOne: jest.fn(async () => ({})),
        updateMany: jest.fn(async () => ({})),
        findOneAndUpdate: jest.fn(async (filter: any, update: any) => {
          const checkIn = update.$push.activeLocks.checkInDate;
          const checkOut = update.$push.activeLocks.checkOutDate;
          const hasOverlap = roomState.activeLocks.some(
            (lock: any) => lock.checkInDate < checkOut && lock.checkOutDate > checkIn,
          );
          if (hasOverlap) {
            return null;
          }
          roomState.activeLocks.push(update.$push.activeLocks);
          return { ...roomState };
        }),
      };

      const mockHotelModel: any = {
        findById: jest.fn(async () => ({
          _id: hotelId,
          isActive: true,
          checkInTime: '14:00',
          checkOutTime: '11:00',
          cancellationTiers: [],
        })),
      };

      const mockHotelBookingModel: any = {
        findOneAndUpdate: jest.fn(async () => null),
        updateMany: jest.fn(async () => ({})),
        create: jest.fn(async (doc: any) => ({ _id: new Types.ObjectId(), ...doc })),
      };

      const service = new HotelBookingsService(
        mockHotelBookingModel,
        {} as any,
        mockHotelModel,
        mockRoomModel,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const dto: any = {
        hotelId: hotelId.toString(),
        checkInDate: '2027-06-10',
        checkOutDate: '2027-06-15',
        rooms: [{ roomId: roomId.toString(), adults: 2, children: 0 }],
      };

      const results = await Promise.allSettled([
        service.createHotelBookingHold(new Types.ObjectId().toString(), dto),
        service.createHotelBookingHold(new Types.ObjectId().toString(), dto),
      ]);

      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r) => r.status === 'rejected' && r.reason instanceof ConflictException,
      );

      expect(succeeded).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(roomState.activeLocks).toHaveLength(1);
    });
  });

  describe('3. Stripe Webhook Signature & Idempotency (PAY-01)', () => {
    it('rejects unsigned webhook calls with 400 Bad Request and processes duplicate signed events idempotently', async () => {
      const bookingId = new Types.ObjectId();
      const flightId = new Types.ObjectId();
      const userId = new Types.ObjectId();
      let bookedSeatsIncrementCount = 0;

      const bookingState: any = {
        _id: bookingId,
        userId,
        bookingReference: 'FLT-TEST1',
        outboundFlightId: flightId,
        returnFlightId: null,
        cabinCategory: 'Economy',
        seatsReserved: 2,
        status: BookingLifecycleStatus.PENDING_PAYMENT,
        holdExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      };

      const paymentDoc: any = {
        _id: new Types.ObjectId(),
        bookingType: 'flight',
        bookingId,
        userId,
        stripePaymentIntentId: 'pi_test_idempotent_1',
        status: 'processing',
        save: jest.fn(async () => {}),
      };

      const mockPaymentModel: any = {
        findOne: jest.fn(async () => paymentDoc),
      };

      const mockFlightBookingModel: any = {
        findOneAndUpdate: jest.fn(async () => {
          if (bookingState.status !== BookingLifecycleStatus.PENDING_PAYMENT) {
            return null;
          }
          bookingState.status = BookingLifecycleStatus.CONFIRMED;
          return { ...bookingState };
        }),
        findById: jest.fn(async () => bookingState),
      };

      const mockFlightModel: any = {
        updateOne: jest.fn(async () => {
          bookedSeatsIncrementCount += 1;
          return { modifiedCount: 1 };
        }),
      };

      const paymentsService = new PaymentsService(
        mockPaymentModel,
        {} as any,
        mockFlightBookingModel,
        {} as any,
        {} as any,
        {} as any,
        mockFlightModel,
        {} as any,
        { releaseExpiredHoldsAndCompletePastFlights: jest.fn() } as any,
        { syncReservationStates: jest.fn() } as any,
        { createNotification: jest.fn(), recordDevMailboxEntry: jest.fn() } as any,
      );

      const payload = {
        type: 'payment_intent.succeeded',
        paymentIntentId: 'pi_test_idempotent_1',
      };

      // 1. Unsigned webhook must be rejected
      await expect(
        paymentsService.handleWebhook(Buffer.from(JSON.stringify(payload)), payload, ''),
      ).rejects.toThrow(BadRequestException);

      // 2. Signed webhook sent twice concurrently must increment bookedSeats strictly ONCE
      const timestamp = Math.floor(Date.now() / 1000);
      const sig = crypto
        .createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET!)
        .update(`${timestamp}.${JSON.stringify(payload)}`)
        .digest('hex');
      const sigHeader = `t=${timestamp},v1=${sig}`;

      await Promise.all([
        paymentsService.handleWebhook(Buffer.from(JSON.stringify(payload)), payload, sigHeader),
        paymentsService.handleWebhook(Buffer.from(JSON.stringify(payload)), payload, sigHeader),
      ]);

      expect(bookedSeatsIncrementCount).toBe(1);
      expect(bookingState.status).toBe(BookingLifecycleStatus.CONFIRMED);
    });
  });

  describe('4. Regex Injection, RFC-4180 CSV & Magic-Bytes Upload Validation (GEN-02, GEN-08, GEN-12)', () => {
    const uploadsService = new UploadsService();

    it('escapes special regex characters like "(" or "[" without throwing 500', () => {
      expect(() => buildSafeRegex('(')).not.toThrow();
      expect(buildSafeRegex('Cairo (CAI)').test('Flight to Cairo (CAI) Airport')).toBe(true);
    });

    it('parses RFC-4180 quoted CSV fields containing commas', () => {
      const csv = 'code,name,currency\nEG,"Egypt, Arab Republic",EGP\nUS,United States,USD';
      const rows = parseRfc4180Csv(csv);
      expect(rows[0]).toEqual({ code: 'EG', name: 'Egypt, Arab Republic', currency: 'EGP' });
    });

    it('rejects a .exe binary disguised as .png and rejects 6MB oversized files', () => {
      const fakePngExe: any = {
        originalname: 'malware.png',
        mimetype: 'image/png',
        size: 1024,
        buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]),
      };
      expect(() => uploadsService.validateAndSaveImage(fakePngExe)).toThrow(BadRequestException);

      const oversizedPng = Buffer.alloc(6 * 1024 * 1024);
      oversizedPng.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
      expect(() =>
        uploadsService.validateAndSaveImage({
          originalname: 'big.png',
          mimetype: 'image/png',
          size: 6 * 1024 * 1024,
          buffer: oversizedPng,
        } as any),
      ).toThrow(BadRequestException);
    });

    it('computes airline cancellation tier refunds accurately', () => {
      const airlinesService = new AirlinesService({} as any);
      const tiers = [
        { daysBeforeDeparture: 7, refundPercentage: 80 },
        { daysBeforeDeparture: 2, refundPercentage: 50 },
        { daysBeforeDeparture: 0, refundPercentage: 0 },
      ];
      const threeDaysOut = new Date(Date.now() + 3.5 * 24 * 60 * 60 * 1000);
      expect(airlinesService.computeRefundPercentage(tiers, threeDaysOut)).toBe(50);
    });
  });
});
