import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Connection, Model, Types } from 'mongoose';
import * as PDFDocument from 'pdfkit';
import { FlightBooking, FlightBookingDocument } from './schemas/flight-booking.schema';
import { Flight, FlightDocument } from '../flights/schemas/flight.schema';
import { Airline, AirlineDocument } from '../airlines/schemas/airline.schema';
import { AirlinesService } from '../airlines/airlines.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ChangeFlightDto,
  CreateFlightBookingDto,
  PassengerInputDto,
  SelectSeatDto,
} from './dto/flight-booking.dto';
import { BookingLifecycleStatus, UserRole } from '../../common/enums/role.enum';

const HOLD_DURATION_MS = 10 * 60 * 1000; // 10 minutes (FLT-22)

@Injectable()
export class FlightBookingsService {
  constructor(
    @InjectModel(FlightBooking.name)
    private readonly flightBookingModel: Model<FlightBookingDocument>,
    @InjectModel(Flight.name) private readonly flightModel: Model<FlightDocument>,
    @InjectModel(Airline.name) private readonly airlineModel: Model<AirlineDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly airlinesService: AirlinesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async releaseExpiredHoldsAndCompletePastFlights() {
    const now = new Date();
    const expiredBookings = await this.flightBookingModel.find({
      status: BookingLifecycleStatus.PENDING_PAYMENT,
      holdExpiresAt: { $lte: now },
    });

    for (const booking of expiredBookings) {
      booking.status = BookingLifecycleStatus.EXPIRED;
      await booking.save();

      await this.releaseHeldSeatsOnFlight(
        booking.outboundFlightId,
        booking.cabinCategory,
        booking.seatsReserved,
      );
      if (booking.returnFlightId) {
        await this.releaseHeldSeatsOnFlight(
          booking.returnFlightId,
          booking.cabinCategory,
          booking.seatsReserved,
        );
      }
    }

    // Transition Confirmed bookings whose departure/arrival has passed to Completed (GEN-11)
    await this.flightBookingModel.updateMany(
      {
        status: BookingLifecycleStatus.CONFIRMED,
        departureTimeUtc: { $lte: now },
      },
      { $set: { status: BookingLifecycleStatus.COMPLETED } },
    );
  }

  private calculateAgeOnDate(dobStr: string, referenceDate: Date): number {
    const dob = new Date(dobStr);
    if (isNaN(dob.getTime())) {
      throw new BadRequestException(`Invalid date of birth: ${dobStr}`);
    }
    let age = referenceDate.getUTCFullYear() - dob.getUTCFullYear();
    const m = referenceDate.getUTCMonth() - dob.getUTCMonth();
    if (m < 0 || (m === 0 && referenceDate.getUTCDate() < dob.getUTCDate())) {
      age--;
    }
    return age;
  }

  private validatePassengers(
    passengers: PassengerInputDto[],
    departureDate: Date,
    maxExtraBagsPerPassenger: number,
  ) {
    let adults = 0;
    let children = 0;
    let infants = 0;

    for (const p of passengers) {
      const age = this.calculateAgeOnDate(p.dateOfBirth, departureDate);
      if (p.passengerType === 'adult') {
        if (age < 12) {
          throw new BadRequestException(
            `Passenger '${p.fullName}' is marked as adult (12+) but is ${age} years old on departure (FLT-12).`,
          );
        }
        adults++;
      } else if (p.passengerType === 'child') {
        if (age < 2 || age > 11) {
          throw new BadRequestException(
            `Passenger '${p.fullName}' is marked as child (2-11) but is ${age} years old on departure (FLT-12).`,
          );
        }
        children++;
      } else if (p.passengerType === 'infant') {
        if (age >= 2 || age < 0) {
          throw new BadRequestException(
            `Passenger '${p.fullName}' is marked as infant (<2) but is ${age} years old on departure (FLT-12).`,
          );
        }
        infants++;
      }

      const extraBags = p.extraBags || 0;
      if (extraBags > maxExtraBagsPerPassenger) {
        throw new BadRequestException(
          `Passenger '${p.fullName}' requested ${extraBags} extra bag(s), exceeding the airline limit of ${maxExtraBagsPerPassenger} (FLT-08, FLT-19).`,
        );
      }
    }

    if (adults < 1) {
      throw new BadRequestException('At least one adult passenger is required per booking (FLT-12).');
    }
    if (infants > adults) {
      throw new BadRequestException('Number of infants cannot exceed number of adults (FLT-12).');
    }

    return { adults, children, infants, seatsRequired: adults + children };
  }

  private async atomicallyHoldSeatsOnFlight(
    flightId: Types.ObjectId,
    cabinCategory: string,
    seatsRequired: number,
  ) {
    const candidates = await this.flightModel.findOne({
      _id: flightId,
      status: 'Scheduled',
      departureTimeUtc: { $gt: new Date() },
    });

    if (!candidates) {
      throw new BadRequestException('Selected flight is not Scheduled or has already departed.');
    }

    const cabin = candidates.cabins.find((c) => c.category === cabinCategory);
    if (!cabin) {
      throw new BadRequestException(`Cabin category '${cabinCategory}' not found on flight.`);
    }

    // Atomic concurrency-safe update: ensure bookedSeats + heldSeats + seatsRequired <= seatCount (FLT-22)
    const maxAllowedCurrentReserved = cabin.seatCount - seatsRequired;
    const updated = await this.flightModel.findOneAndUpdate(
      {
        _id: flightId,
        status: 'Scheduled',
        cabins: {
          $elemMatch: {
            category: cabinCategory,
            $expr: {
              $lte: [{ $add: ['$bookedSeats', '$heldSeats'] }, maxAllowedCurrentReserved],
            },
          },
        },
      },
      {
        $inc: { 'cabins.$.heldSeats': seatsRequired },
      },
      { new: true },
    );

    if (!updated) {
      throw new ConflictException(
        `Not enough seats remaining in ${cabinCategory} on flight ${candidates.flightNumber} (FLT-22).`,
      );
    }

    return { flight: updated, cabin };
  }

  private async releaseHeldSeatsOnFlight(
    flightId: Types.ObjectId,
    cabinCategory: string,
    seatsCount: number,
  ) {
    await this.flightModel.updateOne(
      { _id: flightId, 'cabins.category': cabinCategory },
      { $inc: { 'cabins.$.heldSeats': -seatsCount } },
    );
  }

  async createHoldBooking(userId: string, dto: CreateFlightBookingDto) {
    await this.releaseExpiredHoldsAndCompletePastFlights();

    if (!Types.ObjectId.isValid(dto.outboundFlightId)) {
      throw new BadRequestException('Invalid outboundFlightId.');
    }

    const outboundId = new Types.ObjectId(dto.outboundFlightId);
    const outboundFlight = await this.flightModel.findById(outboundId);
    if (!outboundFlight || outboundFlight.status !== 'Scheduled') {
      throw new BadRequestException('Outbound flight is not available for booking.');
    }

    const airline = await this.airlineModel.findById(outboundFlight.airlineId);
    if (!airline || !airline.isActive) {
      throw new BadRequestException('Airline is currently deactivated and cannot be booked (ACC-15).');
    }

    const { adults, children, infants, seatsRequired } = this.validatePassengers(
      dto.passengers,
      outboundFlight.departureTimeUtc,
      airline.baggagePolicy.maxExtraBagsPerPassenger,
    );

    // Atomically hold outbound seats (FLT-22)
    const { cabin: outboundCabin } = await this.atomicallyHoldSeatsOnFlight(
      outboundId,
      dto.cabinCategory,
      seatsRequired,
    );

    let returnId: Types.ObjectId | null = null;
    let returnCabinPrice = 0;

    if (dto.returnFlightId) {
      if (!Types.ObjectId.isValid(dto.returnFlightId)) {
        await this.releaseHeldSeatsOnFlight(outboundId, dto.cabinCategory, seatsRequired);
        throw new BadRequestException('Invalid returnFlightId.');
      }
      returnId = new Types.ObjectId(dto.returnFlightId);
      try {
        const { flight: returnFlight, cabin: retCabin } = await this.atomicallyHoldSeatsOnFlight(
          returnId,
          dto.cabinCategory,
          seatsRequired,
        );
        if (
          returnFlight.departureTimeUtc.getTime() <= outboundFlight.arrivalTimeUtc.getTime()
        ) {
          await this.releaseHeldSeatsOnFlight(returnId, dto.cabinCategory, seatsRequired);
          throw new BadRequestException('Return flight must depart after outbound flight arrival.');
        }
        returnCabinPrice = retCabin.price;
      } catch (err) {
        await this.releaseHeldSeatsOnFlight(outboundId, dto.cabinCategory, seatsRequired);
        throw err;
      }
    }

    const legCount = returnId ? 2 : 1;
    const perSeatFare = outboundCabin.price + returnCabinPrice;
    // FLT-12: adults and children pay 100% of cabin fare; infants pay 10% and occupy no seat
    const baseFareTotal =
      Math.round(((adults + children) * perSeatFare + infants * 0.1 * perSeatFare) * 100) / 100;

    const totalExtraBags = dto.passengers.reduce((sum, p) => sum + (p.extraBags || 0), 0);
    const extraBaggageTotal =
      Math.round(totalExtraBags * airline.baggagePolicy.extraBagPrice * legCount * 100) / 100;

    const totalAmount = Math.round((baseFareTotal + extraBaggageTotal) * 100) / 100;
    const bookingReference = `FLT-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase()}`;

    const holdExpiresAt = new Date(Date.now() + HOLD_DURATION_MS);

    const booking = await this.flightBookingModel.create({
      userId: new Types.ObjectId(userId),
      bookingReference,
      tripType: returnId ? 'round-trip' : 'one-way',
      airlineId: airline._id,
      outboundFlightId: outboundId,
      returnFlightId: returnId,
      cabinCategory: dto.cabinCategory,
      seatsReserved: seatsRequired,
      passengers: dto.passengers.map((p) => ({
        fullName: p.fullName.trim(),
        dateOfBirth: p.dateOfBirth,
        passportOrId: p.passportOrId.trim(),
        passengerType: p.passengerType,
        extraBags: p.extraBags || 0,
        seatNumber: p.seatNumber || '',
      })),
      baseFareTotal,
      extraBaggageTotal,
      totalAmount,
      currency: process.env.PLATFORM_CURRENCY || 'USD',
      status: BookingLifecycleStatus.PENDING_PAYMENT,
      holdExpiresAt,
      departureTimeUtc: outboundFlight.departureTimeUtc,
      policyAccepted: false,
    });

    return {
      message: 'Seats atomically held for 10 minutes in Pending Payment status (FLT-21, FLT-22).',
      booking,
      summary: {
        bookingReference: booking.bookingReference,
        tripType: booking.tripType,
        cabinCategory: booking.cabinCategory,
        seatsReserved,
        baseFareTotal,
        extraBaggageTotal,
        totalAmount,
        currency: booking.currency,
        holdExpiresAt,
        airlinePolicies: {
          baggagePolicy: airline.baggagePolicy,
          cancellationTiers: airline.cancellationTiers,
        },
      },
    };
  }

  async getUserFlightBookings(userId: string) {
    await this.releaseExpiredHoldsAndCompletePastFlights();
    const bookings = await this.flightBookingModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('outboundFlightId')
      .populate('returnFlightId')
      .sort({ createdAt: -1 })
      .lean();

    const now = new Date();
    const upcoming = bookings.filter(
      (b) =>
        (b.status === BookingLifecycleStatus.CONFIRMED ||
          b.status === BookingLifecycleStatus.PENDING_PAYMENT) &&
        new Date(b.departureTimeUtc) > now,
    );
    const past = bookings.filter(
      (b) =>
        b.status === BookingLifecycleStatus.COMPLETED ||
        (b.status === BookingLifecycleStatus.CONFIRMED && new Date(b.departureTimeUtc) <= now),
    );
    const cancelled = bookings.filter(
      (b) =>
        b.status === BookingLifecycleStatus.CANCELLED ||
        b.status === BookingLifecycleStatus.EXPIRED,
    );

    return { upcoming, past, cancelled, all: bookings };
  }

  async getFlightBookingById(user: any, bookingId: string) {
    await this.releaseExpiredHoldsAndCompletePastFlights();
    const booking = await this.flightBookingModel
      .findById(bookingId)
      .populate('outboundFlightId')
      .populate('returnFlightId')
      .lean();

    if (!booking) {
      throw new NotFoundException('Flight booking not found.');
    }

    const isOwner = booking.userId.toString() === user.id;
    const isAdmin = user.role === UserRole.ADMIN;
    const isAssignedMod =
      user.role === UserRole.AIRLINE_MODERATOR &&
      user.assignedProviderType === 'airline' &&
      user.assignedProviderId?.toString() === booking.airlineId.toString();

    if (!isOwner && !isAdmin && !isAssignedMod) {
      throw new ForbiddenException('You do not have permission to view this booking (ACC-11).');
    }

    const refundRecord = await this.connection
      .collection('refunds')
      .findOne({ bookingType: 'flight', bookingId: booking._id });

    return {
      ...booking,
      refund: refundRecord || null,
    };
  }

  async cancelFlightBookingByUser(userId: string, bookingId: string, confirmed = true) {
    if (!confirmed) {
      throw new BadRequestException('Confirmation is required to cancel a booking (FLT-26, GEN-03).');
    }

    await this.releaseExpiredHoldsAndCompletePastFlights();
    const booking = await this.flightBookingModel.findById(bookingId);
    if (!booking) {
      throw new NotFoundException('Flight booking not found.');
    }

    if (booking.userId.toString() !== userId) {
      throw new ForbiddenException('You can only cancel your own flight bookings (ACC-11).');
    }

    if (booking.status !== BookingLifecycleStatus.CONFIRMED) {
      throw new BadRequestException('Only Confirmed flight bookings can be cancelled (FLT-26).');
    }

    if (new Date(booking.departureTimeUtc).getTime() <= Date.now()) {
      throw new BadRequestException('Cancellation after departure is blocked (FLT-26).');
    }

    const airline = await this.airlineModel.findById(booking.airlineId);
    const refundPercentage = this.airlinesService.computeRefundPercentage(
      airline?.cancellationTiers || [],
      booking.departureTimeUtc,
    );
    const refundAmount = Math.round(((booking.totalAmount * refundPercentage) / 100) * 100) / 100;

    booking.status = BookingLifecycleStatus.CANCELLED;
    booking.cancelledAt = new Date();
    booking.refundPercentage = refundPercentage;
    booking.refundAmount = refundAmount;
    await booking.save();

    // Return seats to inventory (FLT-26)
    await this.flightModel.updateOne(
      { _id: booking.outboundFlightId, 'cabins.category': booking.cabinCategory },
      { $inc: { 'cabins.$.bookedSeats': -booking.seatsReserved } },
    );
    if (booking.returnFlightId) {
      await this.flightModel.updateOne(
        { _id: booking.returnFlightId, 'cabins.category': booking.cabinCategory },
        { $inc: { 'cabins.$.bookedSeats': -booking.seatsReserved } },
      );
    }

    let refundRecord: any = null;
    if (refundAmount > 0) {
      const res = await this.connection.collection('refunds').insertOne({
        bookingType: 'flight',
        bookingId: booking._id,
        userId: booking.userId,
        amount: refundAmount,
        currency: booking.currency,
        refundPercentage,
        reason: 'User-initiated flight booking cancellation',
        status: 'Refunded',
        stripeRefundId: `re_user_${Date.now()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      refundRecord = { id: res.insertedId, amount: refundAmount, status: 'Refunded' };
    }

    await this.notificationsService.createNotification({
      userId: booking.userId,
      title: `Flight Booking Cancelled (${booking.bookingReference})`,
      message:
        refundAmount > 0
          ? `Your flight booking ${booking.bookingReference} was cancelled. A ${refundPercentage}% refund (${refundAmount} ${booking.currency}) has been issued.`
          : `Your flight booking ${booking.bookingReference} was cancelled. Per the airline policy, no refund applies (0%).`,
      type: 'booking_cancelled',
    });

    return {
      message: 'Flight booking cancelled and seats returned to inventory (FLT-26).',
      booking,
      refund: refundRecord,
    };
  }

  async generateETicketPdf(user: any, bookingId: string): Promise<Buffer> {
    const booking = await this.getFlightBookingById(user, bookingId);
    if (
      booking.status !== BookingLifecycleStatus.CONFIRMED &&
      booking.status !== BookingLifecycleStatus.COMPLETED
    ) {
      throw new BadRequestException('E-Tickets are only available for Confirmed bookings (FLT-23).');
    }

    const outbound: any = booking.outboundFlightId;
    const airline = await this.airlineModel.findById(booking.airlineId).lean();

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('ELECTRONIC FLIGHT TICKET (E-TICKET)', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Booking Reference (PNR): ${booking.bookingReference}`);
      doc.text(`Status: ${booking.status}`);
      doc.text(`Airline: ${airline?.name || 'Airline'} (${airline?.code || ''})`);
      doc.text(`Cabin Class: ${booking.cabinCategory}`);
      doc.text(`Total Paid: ${booking.totalAmount} ${booking.currency}`);
      doc.moveDown();

      if (outbound) {
        doc.fontSize(14).text('Outbound Flight Details', { underline: true });
        doc.fontSize(11).text(`Flight Number: ${outbound.flightNumber}`);
        doc.text(`Route: ${outbound.departureAirport} -> ${outbound.arrivalAirport}`);
        doc.text(`Departure (Local): ${outbound.departureTimeLocal} (${outbound.departureTimeZone})`);
        doc.text(`Arrival (Local): ${outbound.arrivalTimeLocal} (${outbound.arrivalTimeZone})`);
        doc.moveDown();
      }

      doc.fontSize(14).text('Passenger Manifest', { underline: true });
      booking.passengers.forEach((p: any, idx: number) => {
        doc
          .fontSize(11)
          .text(
            `${idx + 1}. ${p.fullName} | Type: ${p.passengerType.toUpperCase()} | Passport/ID: ${
              p.passportOrId
            } | Extra Bags: ${p.extraBags || 0} | Seat: ${p.seatNumber || 'Assigned at Gate'}`,
          );
      });

      doc.end();
    });
  }

  async changeFlight(userId: string, bookingId: string, dto: ChangeFlightDto) {
    const booking = await this.flightBookingModel.findById(bookingId);
    if (!booking || booking.userId.toString() !== userId) {
      throw new NotFoundException('Booking not found.');
    }
    if (booking.status !== BookingLifecycleStatus.CONFIRMED) {
      throw new BadRequestException('Only Confirmed bookings can be changed (FLT-27).');
    }

    const oldFlight = await this.flightModel.findById(booking.outboundFlightId);
    const newFlight = await this.flightModel.findById(dto.newOutboundFlightId);
    if (!newFlight || newFlight.status !== 'Scheduled') {
      throw new BadRequestException('New flight is not Scheduled.');
    }

    if (
      oldFlight.departureAirport !== newFlight.departureAirport ||
      oldFlight.arrivalAirport !== newFlight.arrivalAirport
    ) {
      throw new BadRequestException('New flight must be on the same route (FLT-27).');
    }

    const newCabin = newFlight.cabins.find((c) => c.category === booking.cabinCategory);
    if (
      !newCabin ||
      newCabin.seatCount - newCabin.bookedSeats - newCabin.heldSeats < booking.seatsReserved
    ) {
      throw new ConflictException('Not enough seats available on the new flight.');
    }

    await this.flightModel.updateOne(
      { _id: oldFlight._id, 'cabins.category': booking.cabinCategory },
      { $inc: { 'cabins.$.bookedSeats': -booking.seatsReserved } },
    );
    await this.flightModel.updateOne(
      { _id: newFlight._id, 'cabins.category': booking.cabinCategory },
      { $inc: { 'cabins.$.bookedSeats': booking.seatsReserved } },
    );

    booking.outboundFlightId = newFlight._id;
    booking.departureTimeUtc = newFlight.departureTimeUtc;
    await booking.save();

    return { message: 'Flight booking updated to new flight (FLT-27).', booking };
  }

  async selectSeat(userId: string, bookingId: string, dto: SelectSeatDto) {
    const booking = await this.flightBookingModel.findById(bookingId);
    if (!booking || booking.userId.toString() !== userId) {
      throw new NotFoundException('Booking not found.');
    }
    if (!booking.passengers[dto.passengerIndex]) {
      throw new BadRequestException('Invalid passenger index.');
    }
    booking.passengers[dto.passengerIndex].seatNumber = dto.seatNumber.trim().toUpperCase();
    await booking.save();
    return { message: 'Seat selected successfully (FLT-28).', booking };
  }

  async getFlightBookingsForModerator(user: any, flightId: string) {
    const flight = await this.flightModel.findById(flightId).lean();
    if (!flight) {
      throw new NotFoundException('Flight not found.');
    }
    if (
      user.role !== UserRole.ADMIN &&
      (user.role !== UserRole.AIRLINE_MODERATOR ||
        user.assignedProviderId?.toString() !== flight.airlineId.toString())
    ) {
      throw new ForbiddenException('Access restricted to the assigned airline moderator (FLT-29).');
    }

    const bookings = await this.flightBookingModel
      .find({
        $or: [{ outboundFlightId: flight._id }, { returnFlightId: flight._id }],
        status: { $in: [BookingLifecycleStatus.CONFIRMED, BookingLifecycleStatus.CANCELLED] },
      })
      .lean();

    const cabinsSummary = flight.cabins.map((c) => ({
      category: c.category,
      seatCount: c.seatCount,
      bookedSeats: c.bookedSeats,
      heldSeats: c.heldSeats,
      seatsRemaining: Math.max(0, c.seatCount - c.bookedSeats - c.heldSeats),
    }));

    return {
      flightId: flight._id,
      flightNumber: flight.flightNumber,
      cabinsSummary,
      bookings,
    };
  }

  async exportPassengersCsv(user: any, flightId: string): Promise<string> {
    const data = await this.getFlightBookingsForModerator(user, flightId);
    const rows = [
      'bookingReference,status,cabinCategory,fullName,passengerType,dateOfBirth,passportOrId,extraBags,seatNumber',
    ];

    for (const b of data.bookings) {
      for (const p of b.passengers || []) {
        rows.push(
          [
            b.bookingReference,
            b.status,
            b.cabinCategory,
            `"${(p.fullName || '').replace(/"/g, '""')}"`,
            p.passengerType,
            p.dateOfBirth,
            p.passportOrId,
            p.extraBags || 0,
            p.seatNumber || '',
          ].join(','),
        );
      }
    }

    return rows.join('\n');
  }
}
