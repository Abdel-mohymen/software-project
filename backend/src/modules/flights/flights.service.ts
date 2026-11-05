import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Flight, FlightDocument } from './schemas/flight.schema';
import { Airline, AirlineDocument } from '../airlines/schemas/airline.schema';
import { ReferenceService } from '../reference/reference.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateCabinDto,
  CreateFlightDto,
  SearchFlightsQueryDto,
  UpdateCabinDto,
  UpdateFlightDto,
} from './dto/flight.dto';
import {
  formatUtcToLocalAirportTime,
  parseLocalAirportTimeToUtc,
} from '../../common/utils/timezone.util';
import { BookingLifecycleStatus, UserRole } from '../../common/enums/role.enum';

@Injectable()
export class FlightsService {
  constructor(
    @InjectModel(Flight.name) private readonly flightModel: Model<FlightDocument>,
    @InjectModel(Airline.name) private readonly airlineModel: Model<AirlineDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly referenceService: ReferenceService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private ensureAirlineModerator(user: any, airlineId?: string) {
    if (user.role !== UserRole.AIRLINE_MODERATOR || user.assignedProviderType !== 'airline' || !user.assignedProviderId) {
      throw new ForbiddenException('Only an assigned Airline Moderator can perform this action.');
    }
    if (airlineId && user.assignedProviderId.toString() !== airlineId.toString()) {
      throw new ForbiddenException('You can only manage flights belonging to your assigned airline.');
    }
  }

  async syncDepartedFlights() {
    await this.flightModel.updateMany(
      { status: 'Scheduled', departureTimeUtc: { $lte: new Date() } },
      { $set: { status: 'Departed' } },
    );
  }

  async createFlight(user: any, dto: CreateFlightDto) {
    this.ensureAirlineModerator(user);
    const airlineId = new Types.ObjectId(user.assignedProviderId);

    const depCode = dto.departureAirport.trim().toUpperCase();
    const arrCode = dto.arrivalAirport.trim().toUpperCase();
    if (depCode === arrCode) {
      throw new BadRequestException('Departure and arrival airports cannot be identical (FLT-03).');
    }

    const [depAirport, arrAirport] = await Promise.all([
      this.referenceService.getAirportByCode(depCode),
      this.referenceService.getAirportByCode(arrCode),
    ]);

    if (!depAirport) {
      throw new BadRequestException(`Departure airport '${depCode}' is not in the predefined airport list (FLT-02).`);
    }
    if (!arrAirport) {
      throw new BadRequestException(`Arrival airport '${arrCode}' is not in the predefined airport list (FLT-02).`);
    }

    const departureTimeUtc = parseLocalAirportTimeToUtc(dto.departureTimeLocal, depAirport.time_zone);
    const arrivalTimeUtc = parseLocalAirportTimeToUtc(dto.arrivalTimeLocal, arrAirport.time_zone);

    if (departureTimeUtc.getTime() <= Date.now()) {
      throw new BadRequestException('Departure date-time cannot be in the past (FLT-03).');
    }

    if (arrivalTimeUtc.getTime() <= departureTimeUtc.getTime()) {
      throw new BadRequestException('Arrival time must be after departure time when compared in UTC (FLT-03).');
    }

    const departureTimeLocal = formatUtcToLocalAirportTime(departureTimeUtc, depAirport.time_zone);
    const arrivalTimeLocal = formatUtcToLocalAirportTime(arrivalTimeUtc, arrAirport.time_zone);
    const departureDateLocal = departureTimeLocal.slice(0, 10);
    const durationMinutes = Math.round((arrivalTimeUtc.getTime() - departureTimeUtc.getTime()) / 60000);
    const flightNumber = dto.flightNumber.trim().toUpperCase();

    const duplicate = await this.flightModel.findOne({
      airlineId,
      flightNumber,
      departureDateLocal,
    });

    if (duplicate) {
      throw new ConflictException(
        `Flight ${flightNumber} already exists for this airline on ${departureDateLocal} (FLT-03).`,
      );
    }

    return this.flightModel.create({
      airlineId,
      flightNumber,
      departureAirport: depCode,
      arrivalAirport: arrCode,
      departureTimeUtc,
      arrivalTimeUtc,
      departureTimeLocal,
      arrivalTimeLocal,
      departureDateLocal,
      departureTimeZone: depAirport.time_zone,
      arrivalTimeZone: arrAirport.time_zone,
      durationMinutes,
      status: 'Scheduled',
      cabins: [],
    });
  }

  async addCabin(user: any, flightId: string, dto: CreateCabinDto) {
    await this.syncDepartedFlights();
    const flight = await this.flightModel.findById(flightId);
    if (!flight) {
      throw new NotFoundException('Flight not found.');
    }
    this.ensureAirlineModerator(user, flight.airlineId.toString());

    if (flight.status !== 'Scheduled') {
      throw new BadRequestException('Only Scheduled flights can be edited (FLT-30).');
    }

    const duplicateCategory = flight.cabins.some((c) => c.category === dto.category);
    if (duplicateCategory) {
      throw new ConflictException(`Cabin category '${dto.category}' already exists on this flight (FLT-04).`);
    }

    flight.cabins.push({
      category: dto.category,
      seatCount: dto.seatCount,
      bookedSeats: 0,
      heldSeats: 0,
      price: dto.price,
      freeBaggageCount: dto.freeBaggageCount,
      maxBagWeightKg: dto.maxBagWeightKg,
    });

    await flight.save();
    return flight;
  }

  async updateCabin(user: any, flightId: string, cabinId: string, dto: UpdateCabinDto) {
    await this.syncDepartedFlights();
    const flight = await this.flightModel.findById(flightId);
    if (!flight) {
      throw new NotFoundException('Flight not found.');
    }
    this.ensureAirlineModerator(user, flight.airlineId.toString());

    if (flight.status !== 'Scheduled') {
      throw new BadRequestException('Only Scheduled flights can be edited (FLT-30).');
    }

    const cabin = flight.cabins.find(
      (c) => c._id?.toString() === cabinId || c.category.toLowerCase() === cabinId.toLowerCase(),
    );
    if (!cabin) {
      throw new NotFoundException('Cabin category not found on this flight.');
    }

    if (dto.seatCount !== undefined) {
      const reservedSeats = (cabin.bookedSeats || 0) + (cabin.heldSeats || 0);
      if (dto.seatCount < reservedSeats) {
        throw new BadRequestException(
          `Seat count cannot be reduced below seats already booked or held (${reservedSeats}) (FLT-05).`,
        );
      }
      cabin.seatCount = dto.seatCount;
    }

    if (dto.price !== undefined) cabin.price = dto.price;
    if (dto.freeBaggageCount !== undefined) cabin.freeBaggageCount = dto.freeBaggageCount;
    if (dto.maxBagWeightKg !== undefined) cabin.maxBagWeightKg = dto.maxBagWeightKg;

    await flight.save();
    return flight;
  }

  async updateFlight(user: any, flightId: string, dto: UpdateFlightDto) {
    await this.syncDepartedFlights();
    const flight = await this.flightModel.findById(flightId);
    if (!flight) {
      throw new NotFoundException('Flight not found.');
    }
    this.ensureAirlineModerator(user, flight.airlineId.toString());

    if (flight.status !== 'Scheduled') {
      throw new BadRequestException('Only Scheduled flights can be edited (FLT-05, FLT-30).');
    }

    const flightBookingsColl = this.connection.collection('flightbookings');
    const existingBookingsCount = await flightBookingsColl.countDocuments({
      $or: [{ outboundFlightId: flight._id }, { returnFlightId: flight._id }],
      status: { $ne: BookingLifecycleStatus.EXPIRED },
    });

    if (
      (dto.departureAirport && dto.departureAirport.toUpperCase() !== flight.departureAirport) ||
      (dto.arrivalAirport && dto.arrivalAirport.toUpperCase() !== flight.arrivalAirport)
    ) {
      if (existingBookingsCount > 0) {
        throw new BadRequestException('Airports cannot be changed once the flight has any booking (FLT-05).');
      }
      const depCode = (dto.departureAirport || flight.departureAirport).toUpperCase();
      const arrCode = (dto.arrivalAirport || flight.arrivalAirport).toUpperCase();
      if (depCode === arrCode) {
        throw new BadRequestException('Departure and arrival airports cannot be identical.');
      }
      const [depAirport, arrAirport] = await Promise.all([
        this.referenceService.getAirportByCode(depCode),
        this.referenceService.getAirportByCode(arrCode),
      ]);
      if (!depAirport || !arrAirport) {
        throw new BadRequestException('Airports must exist in predefined airport list.');
      }
      flight.departureAirport = depCode;
      flight.arrivalAirport = arrCode;
      flight.departureTimeZone = depAirport.time_zone;
      flight.arrivalTimeZone = arrAirport.time_zone;
    }

    let timeChanged = false;
    if (dto.departureTimeLocal || dto.arrivalTimeLocal) {
      const newDepLocal = dto.departureTimeLocal || flight.departureTimeLocal;
      const newArrLocal = dto.arrivalTimeLocal || flight.arrivalTimeLocal;
      const newDepUtc = parseLocalAirportTimeToUtc(newDepLocal, flight.departureTimeZone);
      const newArrUtc = parseLocalAirportTimeToUtc(newArrLocal, flight.arrivalTimeZone);

      if (newDepUtc.getTime() <= Date.now()) {
        throw new BadRequestException('Departure time cannot be in the past.');
      }
      if (newArrUtc.getTime() <= newDepUtc.getTime()) {
        throw new BadRequestException('Arrival time must be after departure time in UTC.');
      }

      if (
        newDepUtc.getTime() !== flight.departureTimeUtc.getTime() ||
        newArrUtc.getTime() !== flight.arrivalTimeUtc.getTime()
      ) {
        timeChanged = true;
      }

      flight.departureTimeUtc = newDepUtc;
      flight.arrivalTimeUtc = newArrUtc;
      flight.departureTimeLocal = formatUtcToLocalAirportTime(newDepUtc, flight.departureTimeZone);
      flight.arrivalTimeLocal = formatUtcToLocalAirportTime(newArrUtc, flight.arrivalTimeZone);
      flight.departureDateLocal = flight.departureTimeLocal.slice(0, 10);
      flight.durationMinutes = Math.round((newArrUtc.getTime() - newDepUtc.getTime()) / 60000);
    }

    await flight.save();

    // FLT-05: Any time change sends an in-app notification to passengers with Confirmed bookings
    if (timeChanged) {
      const confirmedBookings = await flightBookingsColl
        .find({
          $or: [{ outboundFlightId: flight._id }, { returnFlightId: flight._id }],
          status: BookingLifecycleStatus.CONFIRMED,
        })
        .toArray();

      for (const booking of confirmedBookings) {
        await this.notificationsService.createNotification({
          userId: booking.userId,
          title: `Flight Schedule Updated (${flight.flightNumber})`,
          message: `The schedule for flight ${flight.flightNumber} (${flight.departureAirport} -> ${flight.arrivalAirport}) has been updated to depart at ${flight.departureTimeLocal} local time.`,
          type: 'flight_schedule_change',
          metadata: { flightId: flight._id.toString(), bookingId: booking._id.toString() },
        });
      }
    }

    return flight;
  }

  async cancelFlightByModerator(user: any, flightId: string, confirmed = true) {
    if (!confirmed) {
      throw new BadRequestException('Confirmation is required to cancel a flight (FLT-06, GEN-03).');
    }

    await this.syncDepartedFlights();
    const flight = await this.flightModel.findById(flightId);
    if (!flight) {
      throw new NotFoundException('Flight not found.');
    }
    this.ensureAirlineModerator(user, flight.airlineId.toString());

    if (flight.status !== 'Scheduled') {
      throw new BadRequestException('Only Scheduled flights can be cancelled (FLT-06, FLT-30).');
    }

    flight.status = 'Cancelled';
    flight.cabins.forEach((c) => {
      c.heldSeats = 0;
      c.bookedSeats = 0;
    });
    await flight.save();

    // Cancel all Confirmed bookings with 100% refund & release pending holds (FLT-06, PAY-03)
    const flightBookingsColl = this.connection.collection('flightbookings');
    const refundsColl = this.connection.collection('refunds');

    const affectedBookings = await flightBookingsColl
      .find({
        $or: [{ outboundFlightId: flight._id }, { returnFlightId: flight._id }],
        status: { $in: [BookingLifecycleStatus.CONFIRMED, BookingLifecycleStatus.PENDING_PAYMENT] },
      })
      .toArray();

    for (const booking of affectedBookings) {
      if (booking.status === BookingLifecycleStatus.CONFIRMED) {
        await flightBookingsColl.updateOne(
          { _id: booking._id },
          {
            $set: {
              status: BookingLifecycleStatus.CANCELLED,
              cancelledAt: new Date(),
              cancellationReason: 'Cancelled by airline',
              refundAmount: booking.totalAmount,
              refundPercentage: 100,
            },
          },
        );

        await refundsColl.insertOne({
          bookingType: 'flight',
          bookingId: booking._id,
          userId: booking.userId,
          amount: booking.totalAmount,
          currency: booking.currency || 'USD',
          refundPercentage: 100,
          reason: 'Provider-initiated flight cancellation (100% refund)',
          status: 'Refunded',
          stripeRefundId: `re_provider_${Date.now()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await this.notificationsService.createNotification({
          userId: booking.userId,
          title: `Flight ${flight.flightNumber} Cancelled — 100% Refund Issued`,
          message: `Your flight ${flight.flightNumber} was cancelled by the airline. Your booking (${booking.bookingReference}) has been cancelled with a 100% refund of ${booking.totalAmount} ${booking.currency || 'USD'}.`,
          type: 'booking_cancelled',
          metadata: { bookingId: booking._id.toString(), flightId: flight._id.toString() },
        });
      } else {
        await flightBookingsColl.updateOne(
          { _id: booking._id },
          { $set: { status: BookingLifecycleStatus.EXPIRED } },
        );
      }
    }

    return {
      message:
        'Flight cancelled. All Confirmed bookings have been cancelled with a 100% refund and pending holds released (FLT-06).',
      flight,
    };
  }

  async getFlightDetails(flightId: string) {
    await this.syncDepartedFlights();
    const flight = await this.flightModel.findById(flightId).lean();
    if (!flight) {
      throw new NotFoundException('Flight not found.');
    }

    const airline = await this.airlineModel.findById(flight.airlineId).lean();
    const cabinsWithAvailability = flight.cabins.map((c) => ({
      ...c,
      seatsRemaining: Math.max(0, c.seatCount - (c.bookedSeats || 0) - (c.heldSeats || 0)),
    }));

    return {
      ...flight,
      cabins: cabinsWithAvailability,
      airline: airline || null,
    };
  }

  async searchFlights(query: SearchFlightsQueryDto) {
    await this.syncDepartedFlights();

    const depCode = query.departureAirport.trim().toUpperCase();
    const arrCode = query.arrivalAirport.trim().toUpperCase();

    const [depAirport, arrAirport] = await Promise.all([
      this.referenceService.getAirportByCode(depCode),
      this.referenceService.getAirportByCode(arrCode),
    ]);

    if (!depAirport || !arrAirport) {
      throw new BadRequestException(
        'Both departure and arrival airports must belong to the predefined airport list (FLT-02).',
      );
    }

    const adults = query.adults ?? 1;
    const children = query.children ?? 0;
    const infants = query.infants ?? 0;

    if (adults < 1) {
      throw new BadRequestException('Each booking requires at least one adult passenger (FLT-12).');
    }
    if (infants > adults) {
      throw new BadRequestException('Number of infants cannot exceed number of adults (FLT-12).');
    }

    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      throw new BadRequestException('Minimum price cannot be greater than maximum price (FLT-15).');
    }

    const seatsRequired = adults + children; // Infants occupy no seat (FLT-12)

    const activeAirlines = await this.airlineModel.find({ isActive: true }).lean();
    const activeAirlineMap = new Map(activeAirlines.map((a) => [a._id.toString(), a]));
    const activeAirlineIds = activeAirlines.map((a) => a._id);

    const searchLeg = async (fromCode: string, toCode: string, dateLocal: string) => {
      const flights = await this.flightModel
        .find({
          airlineId: { $in: activeAirlineIds },
          departureAirport: fromCode,
          arrivalAirport: toCode,
          departureDateLocal: dateLocal,
          status: 'Scheduled',
          departureTimeUtc: { $gt: new Date() },
        })
        .lean();

      const matching = [];
      for (const f of flights) {
        const qualifyingCabins = f.cabins
          .map((c) => ({
            ...c,
            seatsRemaining: c.seatCount - (c.bookedSeats || 0) - (c.heldSeats || 0),
          }))
          .filter((c) => {
            if (query.cabinClass && c.category !== query.cabinClass) return false;
            if (c.seatsRemaining < seatsRequired) return false;
            if (query.minPrice !== undefined && c.price < query.minPrice) return false;
            if (query.maxPrice !== undefined && c.price > query.maxPrice) return false;
            return true;
          });

        if (qualifyingCabins.length > 0) {
          const cheapestCabinPrice = Math.min(...qualifyingCabins.map((c) => c.price));
          matching.push({
            ...f,
            airline: activeAirlineMap.get(f.airlineId.toString()) || null,
            cabins: qualifyingCabins,
            lowestMatchingPrice: cheapestCabinPrice,
          });
        }
      }

      const dir = query.sortOrder === 'desc' ? -1 : 1;
      matching.sort((a, b) => {
        if (query.sortBy === 'price') {
          return (a.lowestMatchingPrice - b.lowestMatchingPrice) * dir;
        }
        if (query.sortBy === 'duration') {
          return (a.durationMinutes - b.durationMinutes) * dir;
        }
        return (
          (new Date(a.departureTimeUtc).getTime() - new Date(b.departureTimeUtc).getTime()) * dir
        );
      });

      return matching;
    };

    const outbound = await searchLeg(depCode, arrCode, query.departureDate);
    let returnOptions: any[] = [];
    if (query.returnDate) {
      returnOptions = await searchLeg(arrCode, depCode, query.returnDate);
    }

    return {
      tripType: query.returnDate ? 'round-trip' : 'one-way',
      passengers: { adults, children, infants, seatsRequired },
      outbound,
      returnOptions,
      message:
        outbound.length === 0 || (query.returnDate && returnOptions.length === 0)
          ? 'no flights found'
          : undefined,
    };
  }
}
