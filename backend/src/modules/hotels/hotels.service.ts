import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { Hotel, HotelDocument } from './schemas/hotel.schema';
import { Room, RoomDocument } from './schemas/room.schema';
import { ReferenceService } from '../reference/reference.service';
import {
  CreateHotelDto,
  CreateRoomDto,
  DateRangeDto,
  SearchHotelsQueryDto,
  SetRoomAvailabilityDto,
  UpdateHotelDto,
  UpdateHotelPoliciesDto,
  UpdateRoomAvailabilityAndBlocksDto,
  UpdateRoomDto,
} from './dto/hotel.dto';
import { BookingLifecycleStatus, UserRole } from '../../common/enums/role.enum';

@Injectable()
export class HotelsService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotelModel: Model<HotelDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly referenceService: ReferenceService,
  ) {}

  private assertHotelModerator(user: any, hotelId: string) {
    if (user.role === UserRole.ADMIN) return;
    if (
      user.role !== UserRole.HOTEL_MODERATOR ||
      user.assignedProviderType !== 'hotel' ||
      user.assignedProviderId?.toString() !== hotelId
    ) {
      throw new ForbiddenException('You may only manage your assigned hotel (ACC-11, HTL-01).');
    }
  }

  private validateAndParseDateRanges(ranges: DateRangeDto[]) {
    const parsed = ranges.map((r) => {
      const start = new Date(r.startDate);
      const end = new Date(r.endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        throw new BadRequestException(
          `Invalid date range (${r.startDate} to ${r.endDate}): endDate must be after startDate.`,
        );
      }
      return { startDate: start, endDate: end, reason: r.reason || '' };
    });

    // Ensure non-overlapping (HTL-04)
    parsed.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    for (let i = 1; i < parsed.length; i++) {
      if (parsed[i].startDate < parsed[i - 1].endDate) {
        throw new BadRequestException('Date ranges must not overlap with each other (HTL-04).');
      }
    }
    return parsed;
  }

  async createHotel(dto: CreateHotelDto) {
    if (dto.photos && dto.photos.length > 5) {
      throw new BadRequestException('A hotel can have at most 5 photos (GEN-08).');
    }

    const cities = await this.referenceService.getCities();
    const cityObj = cities.find((c) => c.city_id === dto.city_id.toLowerCase());
    if (!cityObj) {
      throw new BadRequestException(`City '${dto.city_id}' is not in the predefined Cities.csv (GEN-12).`);
    }

    return this.hotelModel.create({
      name: dto.name.trim(),
      address: dto.address.trim(),
      city_id: cityObj.city_id,
      country_code: cityObj.country_code,
      description: dto.description || '',
      photos: dto.photos || [],
      starClass: dto.starClass,
      amenities: dto.amenities || [],
      isActive: true,
    });
  }

  async updateHotel(user: any, hotelId: string, dto: UpdateHotelDto) {
    this.assertHotelModerator(user, hotelId);
    const hotel = await this.hotelModel.findById(hotelId);
    if (!hotel) {
      throw new NotFoundException('Hotel not found.');
    }

    if (dto.photos && dto.photos.length > 5) {
      throw new BadRequestException('A hotel can have at most 5 photos (GEN-08).');
    }

    if (dto.city_id) {
      const cities = await this.referenceService.getCities();
      const cityObj = cities.find((c) => c.city_id === dto.city_id.toLowerCase());
      if (!cityObj) {
        throw new BadRequestException(`City '${dto.city_id}' is not in the predefined Cities.csv.`);
      }
      hotel.city_id = cityObj.city_id;
      hotel.country_code = cityObj.country_code;
    }

    if (dto.name !== undefined) hotel.name = dto.name.trim();
    if (dto.address !== undefined) hotel.address = dto.address.trim();
    if (dto.description !== undefined) hotel.description = dto.description;
    if (dto.photos !== undefined) hotel.photos = dto.photos;
    if (dto.starClass !== undefined) hotel.starClass = dto.starClass;
    if (dto.amenities !== undefined) hotel.amenities = dto.amenities;

    await hotel.save();
    return hotel;
  }

  async updatePolicies(user: any, hotelId: string, dto: UpdateHotelPoliciesDto) {
    this.assertHotelModerator(user, hotelId);
    const thresholds = new Set<number>();
    for (const tier of dto.cancellationTiers) {
      if (thresholds.has(tier.daysBeforeCheckIn)) {
        throw new BadRequestException(
          `Duplicate daysBeforeCheckIn threshold: ${tier.daysBeforeCheckIn} (HTL-10).`,
        );
      }
      thresholds.add(tier.daysBeforeCheckIn);
    }

    const sortedTiers = [...dto.cancellationTiers].sort(
      (a, b) => b.daysBeforeCheckIn - a.daysBeforeCheckIn,
    );

    const hotel = await this.hotelModel.findByIdAndUpdate(
      hotelId,
      {
        $set: {
          checkInTime: dto.checkInTime.trim(),
          checkOutTime: dto.checkOutTime.trim(),
          cancellationTiers: sortedTiers,
        },
      },
      { new: true },
    );

    if (!hotel) {
      throw new NotFoundException('Hotel not found.');
    }
    return hotel;
  }

  async addRoom(user: any, hotelId: string, dto: CreateRoomDto) {
    this.assertHotelModerator(user, hotelId);
    const hotel = await this.hotelModel.findById(hotelId);
    if (!hotel) {
      throw new NotFoundException('Hotel not found.');
    }

    const duplicate = await this.roomModel.findOne({
      hotelId: hotel._id,
      roomNumber: dto.roomNumber.trim(),
    });
    if (duplicate) {
      throw new ConflictException(
        `Room '${dto.roomNumber}' already exists in this hotel (HTL-03).`,
      );
    }

    return this.roomModel.create({
      hotelId: hotel._id,
      roomNumber: dto.roomNumber.trim(),
      type: dto.type.trim(),
      beds: dto.beds,
      maxOccupancy: dto.maxOccupancy,
      pricePerNight: dto.pricePerNight,
      isActive: true,
      availableRanges: [],
      blockedRanges: [],
    });
  }

  private async getRoomActiveReservations(roomId: Types.ObjectId) {
    return this.connection
      .collection('hotelbookings')
      .find({
        roomIds: roomId,
        status: {
          $in: [BookingLifecycleStatus.CONFIRMED, BookingLifecycleStatus.PENDING_PAYMENT],
        },
      })
      .toArray();
  }

  async updateRoom(user: any, hotelId: string, roomId: string, dto: UpdateRoomDto) {
    this.assertHotelModerator(user, hotelId);
    const room = await this.roomModel.findOne({
      _id: roomId,
      hotelId: new Types.ObjectId(hotelId),
    });
    if (!room) {
      throw new NotFoundException('Room not found in this hotel.');
    }

    if (dto.isActive === false) {
      const activeRes = await this.getRoomActiveReservations(room._id);
      if (activeRes.length > 0) {
        throw new BadRequestException(
          'Room deactivation is rejected because it has Confirmed or Pending Payment reservations (HTL-06).',
        );
      }
      room.isActive = false;
    } else if (dto.isActive === true) {
      room.isActive = true;
    }

    if (dto.type !== undefined) room.type = dto.type.trim();
    if (dto.beds !== undefined) room.beds = dto.beds;
    if (dto.maxOccupancy !== undefined) room.maxOccupancy = dto.maxOccupancy;
    if (dto.pricePerNight !== undefined) room.pricePerNight = dto.pricePerNight;

    await room.save();
    return room;
  }

  async deleteRoom(user: any, hotelId: string, roomId: string) {
    this.assertHotelModerator(user, hotelId);
    const room = await this.roomModel.findOne({
      _id: roomId,
      hotelId: new Types.ObjectId(hotelId),
    });
    if (!room) {
      throw new NotFoundException('Room not found in this hotel.');
    }

    // HTL-06: deletion is allowed only for rooms that have never been reserved
    const anyReservation = await this.connection
      .collection('hotelbookings')
      .findOne({ roomIds: room._id });

    if (anyReservation) {
      throw new BadRequestException(
        'Room deletion is only allowed for rooms that have never been reserved. Deactivate the room instead (HTL-06).',
      );
    }

    await this.roomModel.deleteOne({ _id: room._id });
    return { message: 'Room deleted successfully (HTL-06).' };
  }

  async setRoomAvailability(
    user: any,
    hotelId: string,
    roomId: string,
    dto: SetRoomAvailabilityDto,
  ) {
    this.assertHotelModerator(user, hotelId);
    const room = await this.roomModel.findOne({
      _id: roomId,
      hotelId: new Types.ObjectId(hotelId),
    });
    if (!room) {
      throw new NotFoundException('Room not found in this hotel.');
    }

    const parsedRanges = this.validateAndParseDateRanges(dto.availableRanges);
    const activeReservations = await this.getRoomActiveReservations(room._id);

    // HTL-05: availability cannot be removed for dates with confirmed reservations
    for (const res of activeReservations) {
      const checkIn = new Date(res.checkInDate);
      const checkOut = new Date(res.checkOutDate);
      const covered = parsedRanges.some(
        (r) => r.startDate <= checkIn && r.endDate >= checkOut,
      );
      if (!covered) {
        throw new BadRequestException(
          `Cannot remove availability covering existing reservation ${res.bookingReference} (${checkIn
            .toISOString()
            .slice(0, 10)} to ${checkOut.toISOString().slice(0, 10)}) (HTL-05).`,
        );
      }
    }

    room.availableRanges = parsedRanges;
    await room.save();
    return room;
  }

  async updateRoomAvailabilityAndBlocks(
    user: any,
    hotelId: string,
    roomId: string,
    dto: UpdateRoomAvailabilityAndBlocksDto,
  ) {
    this.assertHotelModerator(user, hotelId);
    const room = await this.roomModel.findOne({
      _id: roomId,
      hotelId: new Types.ObjectId(hotelId),
    });
    if (!room) {
      throw new NotFoundException('Room not found in this hotel.');
    }

    const activeReservations = await this.getRoomActiveReservations(room._id);

    if (dto.availableRanges !== undefined) {
      const parsedAvail = this.validateAndParseDateRanges(dto.availableRanges);
      for (const res of activeReservations) {
        const checkIn = new Date(res.checkInDate);
        const checkOut = new Date(res.checkOutDate);
        const covered = parsedAvail.some(
          (r) => r.startDate <= checkIn && r.endDate >= checkOut,
        );
        if (!covered) {
          throw new BadRequestException(
            `Cannot remove availability covering existing reservation ${res.bookingReference} (HTL-05).`,
          );
        }
      }
      room.availableRanges = parsedAvail;
    }

    if (dto.blockedRanges !== undefined) {
      const parsedBlocks = this.validateAndParseDateRanges(dto.blockedRanges);
      // HTL-06: Blocking is rejected if it overlaps any Confirmed or Pending Payment reservation
      for (const block of parsedBlocks) {
        for (const res of activeReservations) {
          const checkIn = new Date(res.checkInDate);
          const checkOut = new Date(res.checkOutDate);
          if (block.startDate < checkOut && block.endDate > checkIn) {
            throw new BadRequestException(
              `Blocked range overlaps existing reservation ${res.bookingReference} (HTL-06).`,
            );
          }
        }
      }
      room.blockedRanges = parsedBlocks;
    }

    if (dto.isActive !== undefined) {
      if (!dto.isActive && activeReservations.length > 0) {
        throw new BadRequestException(
          'Cannot deactivate a room with Confirmed or Pending Payment reservations (HTL-06).',
        );
      }
      room.isActive = dto.isActive;
    }

    await room.save();
    return room;
  }

  isRoomFreeForStay(
    room: any,
    checkIn: Date,
    checkOut: Date,
    overlappingBookingsForRoom: any[],
  ): boolean {
    if (!room.isActive) return false;

    // If availableRanges are defined on the room, one range must cover [checkIn, checkOut] (HTL-04)
    if (room.availableRanges && room.availableRanges.length > 0) {
      const covered = room.availableRanges.some(
        (r: any) => new Date(r.startDate) <= checkIn && new Date(r.endDate) >= checkOut,
      );
      if (!covered) return false;
    }

    // Must not overlap any blocked range (HTL-06)
    if (room.blockedRanges && room.blockedRanges.length > 0) {
      const overlapsBlock = room.blockedRanges.some(
        (b: any) => new Date(b.startDate) < checkOut && new Date(b.endDate) > checkIn,
      );
      if (overlapsBlock) return false;
    }

    // Must not overlap any Confirmed or unexpired Pending Payment reservation (HTL-18)
    if (overlappingBookingsForRoom.length > 0) {
      return false;
    }

    return true;
  }

  private parseAndValidateStayDates(checkInStr: string, checkOutStr: string) {
    const checkIn = new Date(checkInStr);
    const checkOut = new Date(checkOutStr);
    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
      throw new BadRequestException('Invalid check-in or check-out date.');
    }
    const todayMidnight = new Date();
    todayMidnight.setUTCHours(0, 0, 0, 0);
    if (checkIn < todayMidnight) {
      throw new BadRequestException('Check-in date cannot be in the past (HTL-11, HTL-18).');
    }
    if (checkOut <= checkIn) {
      throw new BadRequestException('Check-out date must be after check-in date (HTL-11, HTL-18).');
    }
    const nights = Math.max(
      1,
      Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)),
    );
    return { checkIn, checkOut, nights };
  }

  async getAvailableRoomsForHotel(
    hotelId: string,
    checkInDate: string,
    checkOutDate: string,
  ) {
    const { checkIn, checkOut, nights } = this.parseAndValidateStayDates(
      checkInDate,
      checkOutDate,
    );

    const rooms = await this.roomModel
      .find({ hotelId: new Types.ObjectId(hotelId), isActive: true })
      .lean();

    const now = new Date();
    const overlappingBookings = await this.connection
      .collection('hotelbookings')
      .find({
        hotelId: new Types.ObjectId(hotelId),
        checkInDate: { $lt: checkOut },
        checkOutDate: { $gt: checkIn },
        $or: [
          { status: BookingLifecycleStatus.CONFIRMED },
          {
            status: BookingLifecycleStatus.PENDING_PAYMENT,
            holdExpiresAt: { $gt: now },
          },
        ],
      })
      .toArray();

    const freeRooms = rooms
      .filter((room) => {
        const roomBookings = overlappingBookings.filter((b) =>
          (b.roomIds || []).some((id: any) => id.toString() === room._id.toString()),
        );
        return this.isRoomFreeForStay(room, checkIn, checkOut, roomBookings);
      })
      .map((room) => ({
        ...room,
        nights,
        totalStayPrice: Math.round(room.pricePerNight * nights * 100) / 100,
      }));

    return {
      hotelId,
      checkInDate,
      checkOutDate,
      nights,
      availableRooms: freeRooms,
    };
  }

  async getHotelDetails(hotelId: string, checkInDate?: string, checkOutDate?: string) {
    const hotel = await this.hotelModel.findById(hotelId).lean();
    if (!hotel) {
      throw new NotFoundException('Hotel not found.');
    }

    let availableRooms: any[] = [];
    if (checkInDate && checkOutDate) {
      const avail = await this.getAvailableRoomsForHotel(hotelId, checkInDate, checkOutDate);
      availableRooms = avail.availableRooms;
    } else {
      availableRooms = await this.roomModel
        .find({ hotelId: hotel._id, isActive: true })
        .lean();
    }

    const reviews = await this.connection
      .collection('reviews')
      .find({ hotelId: hotel._id, isHidden: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    return {
      ...hotel,
      availableRooms,
      recentReviews: reviews,
    };
  }

  async searchHotels(query: SearchHotelsQueryDto) {
    const { checkIn, checkOut, nights } = this.parseAndValidateStayDates(
      query.checkInDate,
      query.checkOutDate,
    );

    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    ) {
      throw new BadRequestException('Minimum price cannot exceed maximum price.');
    }

    const hotelFilter: any = { isActive: true };
    if (query.city) {
      hotelFilter.city_id = query.city.trim().toLowerCase();
    }
    if (query.country) {
      hotelFilter.country_code = query.country.trim().toUpperCase();
    }
    if (query.minRating !== undefined) {
      // HTL-12: unrated hotels are excluded when a rating filter is set
      hotelFilter.ratingsCount = { $gt: 0 };
      hotelFilter.averageRating = { $gte: query.minRating };
    }

    const hotels = await this.hotelModel.find(hotelFilter).lean();
    const roomsRequested = query.rooms || 1;
    const guestsRequested = query.guests || 1;

    const matchingHotels: any[] = [];

    for (const hotel of hotels) {
      const { availableRooms } = await this.getAvailableRoomsForHotel(
        hotel._id.toString(),
        query.checkInDate,
        query.checkOutDate,
      );

      if (availableRooms.length < roomsRequested) {
        continue;
      }

      // Check combined maximum occupancy covers guests (HTL-11)
      const totalOccupancy = availableRooms.reduce((sum, r) => sum + r.maxOccupancy, 0);
      if (totalOccupancy < guestsRequested) {
        continue;
      }

      const cheapestRoomPrice = Math.min(...availableRooms.map((r) => r.pricePerNight));
      if (query.minPrice !== undefined && cheapestRoomPrice < query.minPrice) continue;
      if (query.maxPrice !== undefined && cheapestRoomPrice > query.maxPrice) continue;

      matchingHotels.push({
        ...hotel,
        cheapestQualifyingRoomPricePerNight: cheapestRoomPrice,
        nights,
        availableRoomsCount: availableRooms.length,
        availableRooms,
      });
    }

    const dir = query.sortOrder === 'desc' ? -1 : 1;
    matchingHotels.sort((a, b) => {
      if (query.sortBy === 'rating') {
        return (a.averageRating - b.averageRating) * dir;
      }
      return (
        (a.cheapestQualifyingRoomPricePerNight - b.cheapestQualifyingRoomPricePerNight) * dir
      );
    });

    return {
      checkInDate: query.checkInDate,
      checkOutDate: query.checkOutDate,
      nights,
      guests: guestsRequested,
      rooms: roomsRequested,
      results: matchingHotels,
    };
  }

  async getHotelAvailabilityMatrixForModerator(
    user: any,
    hotelId: string,
    startDateStr: string,
    endDateStr: string,
  ) {
    this.assertHotelModerator(user, hotelId);
    const start = startDateStr ? new Date(startDateStr) : new Date();
    const end = endDateStr
      ? new Date(endDateStr)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const rooms = await this.roomModel.find({ hotelId: new Types.ObjectId(hotelId) }).lean();
    const bookings = await this.connection
      .collection('hotelbookings')
      .find({
        hotelId: new Types.ObjectId(hotelId),
        checkInDate: { $lt: end },
        checkOutDate: { $gt: start },
        status: {
          $in: [BookingLifecycleStatus.CONFIRMED, BookingLifecycleStatus.PENDING_PAYMENT],
        },
      })
      .toArray();

    // HTL-08: view each room's status for a chosen date range as Available, Booked (with reservation reference) or Blocked
    const roomStatuses = rooms.map((room) => {
      const roomBookings = bookings.filter((b) =>
        (b.roomIds || []).some((id: any) => id.toString() === room._id.toString()),
      );
      const overlappingBlocks = (room.blockedRanges || []).filter(
        (bl) => new Date(bl.startDate) < end && new Date(bl.endDate) > start,
      );

      let status: 'Available' | 'Booked' | 'Blocked' = 'Available';
      if (roomBookings.length > 0) {
        status = 'Booked';
      } else if (overlappingBlocks.length > 0 || !room.isActive) {
        status = 'Blocked';
      }

      return {
        roomId: room._id,
        roomNumber: room.roomNumber,
        type: room.type,
        isActive: room.isActive,
        status,
        reservations: roomBookings.map((b) => ({
          bookingReference: b.bookingReference,
          checkInDate: b.checkInDate,
          checkOutDate: b.checkOutDate,
          status: b.status,
        })),
        blockedRanges: overlappingBlocks,
      };
    });

    return {
      hotelId,
      startDate: start,
      endDate: end,
      rooms: roomStatuses,
    };
  }
}
