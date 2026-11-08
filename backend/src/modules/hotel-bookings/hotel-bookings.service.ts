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
import { HotelBooking, HotelBookingDocument } from './schemas/hotel-booking.schema';
import { Review, ReviewDocument } from './schemas/review.schema';
import { Hotel, HotelDocument } from '../hotels/schemas/hotel.schema';
import { Room, RoomDocument } from '../hotels/schemas/room.schema';
import { HotelsService } from '../hotels/hotels.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateHotelBookingDto,
  CreateReviewDto,
  ReplyToReviewDto,
  UpdateReviewDto,
} from './dto/hotel-booking.dto';
import { AccountStatus, BookingLifecycleStatus, UserRole } from '../../common/enums/role.enum';
import { paginateResult } from '../../common/dto/pagination.dto';

const HOLD_DURATION_MS = 10 * 60 * 1000; // 10 minutes (HTL-18)

@Injectable()
export class HotelBookingsService {
  constructor(
    @InjectModel(HotelBooking.name)
    private readonly hotelBookingModel: Model<HotelBookingDocument>,
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Hotel.name) private readonly hotelModel: Model<HotelDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly hotelsService: HotelsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async syncReservationStates() {
    const now = new Date();
    // Expire unpaid 10-minute holds (HTL-18, GEN-11)
    await this.hotelBookingModel.updateMany(
      {
        status: BookingLifecycleStatus.PENDING_PAYMENT,
        holdExpiresAt: { $lte: now },
      },
      { $set: { status: BookingLifecycleStatus.EXPIRED } },
    );

    // Transition Confirmed reservations whose check-out date has passed to Completed (HTL-23, GEN-11)
    await this.hotelBookingModel.updateMany(
      {
        status: BookingLifecycleStatus.CONFIRMED,
        checkOutDate: { $lte: now },
      },
      { $set: { status: BookingLifecycleStatus.COMPLETED } },
    );
  }

  private computeHotelRefundPercentage(
    tiers: { daysBeforeCheckIn: number; refundPercentage: number }[],
    checkInDate: Date,
  ): number {
    const msRemaining = new Date(checkInDate).getTime() - Date.now();
    const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
    if (daysRemaining < 0) return 0;

    const sorted = [...(tiers || [])].sort(
      (a, b) => b.daysBeforeCheckIn - a.daysBeforeCheckIn,
    );
    for (const tier of sorted) {
      if (tier.daysBeforeCheckIn <= daysRemaining) {
        return tier.refundPercentage;
      }
    }
    return 0;
  }

  async createHotelBookingHold(userId: string, dto: CreateHotelBookingDto) {
    await this.syncReservationStates();

    if (!Types.ObjectId.isValid(dto.hotelId)) {
      throw new BadRequestException('Invalid hotelId.');
    }

    const hotel = await this.hotelModel.findById(dto.hotelId);
    if (!hotel || !hotel.isActive) {
      throw new BadRequestException('Hotel is not active or cannot be booked (ACC-15).');
    }

    const checkIn = new Date(dto.checkInDate);
    const checkOut = new Date(dto.checkOutDate);
    const todayMidnight = new Date();
    todayMidnight.setUTCHours(0, 0, 0, 0);

    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) {
      throw new BadRequestException('Invalid check-in or check-out date.');
    }
    if (checkIn < todayMidnight) {
      throw new BadRequestException('Check-in date cannot be in the past (HTL-18).');
    }
    if (checkOut <= checkIn) {
      throw new BadRequestException('Check-out date must be after check-in date (HTL-18).');
    }

    const nights = Math.max(
      1,
      Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)),
    );

    const uniqueRoomIds = new Set<string>();
    let totalAdults = 0;
    let totalChildren = 0;

    for (const r of dto.rooms) {
      if (uniqueRoomIds.has(r.roomId)) {
        throw new BadRequestException('Duplicate roomId in the same reservation request.');
      }
      uniqueRoomIds.add(r.roomId);
      totalAdults += r.adults;
      totalChildren += r.children || 0;
    }

    if (totalAdults < 1) {
      throw new BadRequestException('At least one adult is required per reservation (HTL-16).');
    }

    const roomObjectIds = Array.from(uniqueRoomIds).map((id) => new Types.ObjectId(id));
    const roomDocs = await this.roomModel
      .find({ _id: { $in: roomObjectIds }, hotelId: hotel._id })
      .lean();

    if (roomDocs.length !== roomObjectIds.length) {
      throw new BadRequestException(
        'All selected rooms must belong to the same hotel and exist (HTL-16).',
      );
    }

    const now = new Date();
    const overlappingReservations = await this.hotelBookingModel
      .find({
        hotelId: hotel._id,
        roomIds: { $in: roomObjectIds },
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
      .lean();

    // HTL-18: If any room overlaps a Confirmed reservation, an unexpired hold or a blocked range, the whole request is rejected and nothing is held
    const allocations = [];
    let totalAmount = 0;

    for (const selection of dto.rooms) {
      const roomDoc = roomDocs.find((d) => d._id.toString() === selection.roomId);
      const roomGuests = selection.adults + (selection.children || 0);
      if (roomGuests < 1) {
        throw new BadRequestException(`Room ${roomDoc.roomNumber} must have at least 1 guest.`);
      }
      if (roomGuests > roomDoc.maxOccupancy) {
        throw new BadRequestException(
          `Guests (${roomGuests}) for room ${roomDoc.roomNumber} exceed its maximum occupancy (${roomDoc.maxOccupancy}) (HTL-16).`,
        );
      }

      const roomOverlaps = overlappingReservations.filter((b) =>
        b.roomIds.some((id) => id.toString() === roomDoc._id.toString()),
      );

      if (!this.hotelsService.isRoomFreeForStay(roomDoc, checkIn, checkOut, roomOverlaps)) {
        throw new ConflictException(
          `Room ${roomDoc.roomNumber} is not available for the selected dates (overlaps a reservation, active hold, or blocked range) (HTL-18).`,
        );
      }

      allocations.push({
        roomId: roomDoc._id,
        roomNumber: roomDoc.roomNumber,
        adults: selection.adults,
        children: selection.children || 0,
        pricePerNightAtBooking: roomDoc.pricePerNight,
      });

      totalAmount += roomDoc.pricePerNight * nights;
    }

    totalAmount = Math.round(totalAmount * 100) / 100;
    const bookingReference = `HTL-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .substring(2, 6)
      .toUpperCase()}`;

    const holdExpiresAt = new Date(Date.now() + HOLD_DURATION_MS);

    const reservation = await this.hotelBookingModel.create({
      userId: new Types.ObjectId(userId),
      bookingReference,
      hotelId: hotel._id,
      roomIds: roomObjectIds,
      rooms: allocations,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      nights,
      totalGuests: totalAdults + totalChildren,
      totalAmount,
      currency: process.env.PLATFORM_CURRENCY || 'USD',
      status: BookingLifecycleStatus.PENDING_PAYMENT,
      holdExpiresAt,
      policyAccepted: false,
    });

    return {
      message: 'Selected rooms held atomically for 10 minutes in Pending Payment status (HTL-16, HTL-18).',
      reservation,
      policies: {
        checkInTime: hotel.checkInTime,
        checkOutTime: hotel.checkOutTime,
        cancellationTiers: hotel.cancellationTiers,
      },
    };
  }

  async getUserHotelBookings(userId: string) {
    await this.syncReservationStates();
    const reservations = await this.hotelBookingModel
      .find({ userId: new Types.ObjectId(userId) })
      .populate('hotelId')
      .sort({ createdAt: -1 })
      .lean();

    const now = new Date();
    const upcoming = reservations.filter(
      (r) =>
        (r.status === BookingLifecycleStatus.CONFIRMED ||
          r.status === BookingLifecycleStatus.PENDING_PAYMENT) &&
        new Date(r.checkOutDate) > now,
    );
    const past = reservations.filter(
      (r) =>
        r.status === BookingLifecycleStatus.COMPLETED ||
        (r.status === BookingLifecycleStatus.CONFIRMED && new Date(r.checkOutDate) <= now),
    );
    const cancelled = reservations.filter(
      (r) =>
        r.status === BookingLifecycleStatus.CANCELLED ||
        r.status === BookingLifecycleStatus.EXPIRED,
    );

    return { upcoming, past, cancelled, all: reservations };
  }

  async getHotelBookingById(user: any, bookingId: string) {
    await this.syncReservationStates();
    const reservation = await this.hotelBookingModel
      .findById(bookingId)
      .populate('hotelId')
      .lean();

    if (!reservation) {
      throw new NotFoundException('Hotel reservation not found.');
    }

    const hotelIdStr =
      (reservation.hotelId as any)?._id?.toString() || reservation.hotelId.toString();

    const isOwner = reservation.userId.toString() === user.id;
    const isAdmin = user.role === UserRole.ADMIN;
    const isAssignedMod =
      user.role === UserRole.HOTEL_MODERATOR &&
      user.assignedProviderType === 'hotel' &&
      user.assignedProviderId?.toString() === hotelIdStr;

    if (!isOwner && !isAdmin && !isAssignedMod) {
      throw new ForbiddenException('You do not have permission to view this reservation (ACC-11).');
    }

    const refundRecord = await this.connection
      .collection('refunds')
      .findOne({ bookingType: 'hotel', bookingId: reservation._id });

    return {
      ...reservation,
      refund: refundRecord || null,
    };
  }

  async cancelHotelBookingByUser(userId: string, bookingId: string, confirmed = true) {
    if (!confirmed) {
      throw new BadRequestException('Confirmation is required to cancel a reservation (HTL-21, GEN-03).');
    }

    await this.syncReservationStates();
    const reservation = await this.hotelBookingModel.findById(bookingId);
    if (!reservation) {
      throw new NotFoundException('Hotel reservation not found.');
    }

    if (reservation.userId.toString() !== userId) {
      throw new ForbiddenException('You can only cancel your own reservations (ACC-11).');
    }

    if (reservation.status !== BookingLifecycleStatus.CONFIRMED) {
      throw new BadRequestException('Only Confirmed reservations can be cancelled (HTL-21).');
    }

    if (new Date(reservation.checkInDate).getTime() <= Date.now()) {
      throw new BadRequestException(
        'Reservations can only be cancelled before the check-in date (HTL-21).',
      );
    }

    const hotel = await this.hotelModel.findById(reservation.hotelId);
    const refundPercentage = this.computeHotelRefundPercentage(
      hotel?.cancellationTiers || [],
      reservation.checkInDate,
    );
    const refundAmount =
      Math.round(((reservation.totalAmount * refundPercentage) / 100) * 100) / 100;

    reservation.status = BookingLifecycleStatus.CANCELLED;
    reservation.cancelledAt = new Date();
    reservation.refundPercentage = refundPercentage;
    reservation.refundAmount = refundAmount;
    await reservation.save();

    let refundRecord: any = null;
    if (refundAmount > 0) {
      const res = await this.connection.collection('refunds').insertOne({
        bookingType: 'hotel',
        bookingId: reservation._id,
        userId: reservation.userId,
        amount: refundAmount,
        currency: reservation.currency,
        refundPercentage,
        reason: 'User-initiated hotel reservation cancellation',
        status: 'Refunded',
        stripeRefundId: `re_hotel_${Date.now()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      refundRecord = { id: res.insertedId, amount: refundAmount, status: 'Refunded' };
    }

    await this.notificationsService.createNotification({
      userId: reservation.userId,
      title: `Hotel Reservation Cancelled (${reservation.bookingReference})`,
      message:
        refundAmount > 0
          ? `Your hotel reservation ${reservation.bookingReference} was cancelled. A ${refundPercentage}% refund (${refundAmount} ${reservation.currency}) has been issued.`
          : `Your hotel reservation ${reservation.bookingReference} was cancelled. Per the hotel policy, no refund applies (0%).`,
      type: 'booking_cancelled',
    });

    return {
      message: 'Reservation cancelled as a whole and rooms released for those dates (HTL-21).',
      reservation,
      refund: refundRecord,
    };
  }

  async getHotelReservationsForModerator(user: any, hotelId: string) {
    if (
      user.role !== UserRole.ADMIN &&
      (user.role !== UserRole.HOTEL_MODERATOR ||
        user.assignedProviderId?.toString() !== hotelId)
    ) {
      throw new ForbiddenException('Access restricted to the assigned hotel moderator (HTL-22).');
    }

    await this.syncReservationStates();
    return this.hotelBookingModel
      .find({ hotelId: new Types.ObjectId(hotelId) })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .lean();
  }

  private async recalculateHotelRating(hotelId: Types.ObjectId) {
    const activeReviews = await this.reviewModel
      .find({ hotelId, isHidden: { $ne: true } })
      .lean();

    const count = activeReviews.length;
    const avg =
      count === 0
        ? 0
        : Math.round(
            (activeReviews.reduce((sum, r) => sum + r.rating, 0) / count) * 10,
          ) / 10;

    await this.hotelModel.updateOne(
      { _id: hotelId },
      { $set: { averageRating: avg, ratingsCount: count } },
    );
  }

  async createReview(userId: string, bookingId: string, dto: CreateReviewDto) {
    await this.syncReservationStates();
    const reservation = await this.hotelBookingModel.findById(bookingId);
    if (!reservation) {
      throw new NotFoundException('Hotel reservation not found.');
    }

    if (reservation.userId.toString() !== userId) {
      throw new ForbiddenException('You can only review your own stays (HTL-23).');
    }

    if (reservation.status !== BookingLifecycleStatus.COMPLETED) {
      throw new BadRequestException(
        'Reviews can only be submitted for Completed stays after the check-out date has passed (HTL-23).',
      );
    }

    const existing = await this.reviewModel.findOne({ hotelBookingId: reservation._id });
    if (existing) {
      throw new ConflictException(
        'You have already submitted a review for this reservation (HTL-23).',
      );
    }

    const review = await this.reviewModel.create({
      hotelBookingId: reservation._id,
      hotelId: reservation.hotelId,
      userId: new Types.ObjectId(userId),
      rating: dto.rating,
      comment: (dto.comment || '').trim(),
    });

    await this.recalculateHotelRating(reservation.hotelId);
    return review;
  }

  async updateReview(userId: string, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.reviewModel.findById(reviewId);
    if (!review) {
      throw new NotFoundException('Review not found.');
    }
    if (review.userId.toString() !== userId) {
      throw new ForbiddenException('You can only edit your own reviews (HTL-23).');
    }

    if (dto.rating !== undefined) review.rating = dto.rating;
    if (dto.comment !== undefined) review.comment = dto.comment.trim();
    await review.save();

    await this.recalculateHotelRating(review.hotelId);
    return review;
  }

  async deleteReview(userId: string, reviewId: string) {
    const review = await this.reviewModel.findById(reviewId);
    if (!review) {
      throw new NotFoundException('Review not found.');
    }
    if (review.userId.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own reviews (HTL-23).');
    }

    const hotelId = review.hotelId;
    await this.reviewModel.deleteOne({ _id: review._id });
    await this.recalculateHotelRating(hotelId);

    return { message: 'Review deleted and hotel rating recalculated (HTL-23).' };
  }

  async getHotelReviews(hotelId: string, page = 1, limit = 10) {
    const hotel = await this.hotelModel.findById(hotelId).lean();
    if (!hotel) {
      throw new NotFoundException('Hotel not found.');
    }

    const filter = { hotelId: new Types.ObjectId(hotelId), isHidden: { $ne: true } };
    const [reviews, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .populate('userId', 'name status')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.reviewModel.countDocuments(filter),
    ]);

    // ACC-12: Deactivated user reviews are shown as "Deleted user"
    const formatted = reviews.map((r: any) => {
      const author = r.userId;
      const isDeactivated = !author || author.status === AccountStatus.DEACTIVATED;
      return {
        ...r,
        authorName: isDeactivated ? 'Deleted user' : author.name,
        userId: isDeactivated ? null : author._id,
      };
    });

    return {
      hotelId,
      averageRating: hotel.averageRating,
      ratingsCount: hotel.ratingsCount,
      ...paginateResult(formatted, total, page, limit),
    };
  }

  async replyToReview(user: any, reviewId: string, dto: ReplyToReviewDto) {
    const review = await this.reviewModel.findById(reviewId);
    if (!review) {
      throw new NotFoundException('Review not found.');
    }

    if (
      user.role !== UserRole.HOTEL_MODERATOR ||
      user.assignedProviderId?.toString() !== review.hotelId.toString()
    ) {
      throw new ForbiddenException('Only the assigned hotel moderator can reply to this review (HTL-26).');
    }

    review.moderatorReply = dto.reply.trim();
    review.repliedAt = new Date();
    await review.save();
    return review;
  }
}
