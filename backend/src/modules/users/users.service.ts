import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { Favourite, FavouriteDocument } from './schemas/favourite.schema';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ReferenceService } from '../reference/reference.service';
import { AccountStatus, BookingLifecycleStatus } from '../../common/enums/role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Favourite.name) private readonly favouriteModel: Model<FavouriteDocument>,
    private readonly referenceService: ReferenceService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async getProfile(userId: string) {
    const user = await this.userModel
      .findById(userId)
      .select('-passwordHash -refreshTokenHash -passwordResetTokenHash -emailVerificationToken')
      .lean();
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const update: Record<string, any> = {};

    if (dto.name !== undefined) {
      update.name = dto.name.trim();
    }

    if (dto.phone !== undefined) {
      update.phone = dto.phone.trim();
    }

    if (dto.preferredCurrency !== undefined) {
      const currency = dto.preferredCurrency.trim().toUpperCase();
      const supported = await this.referenceService.getSupportedCurrencies();
      if (!supported.includes(currency)) {
        throw new BadRequestException(
          `Unsupported currency '${currency}'. Supported currencies: ${supported.join(', ')}`,
        );
      }
      update.preferredCurrency = currency;
    }

    const updated = await this.userModel
      .findByIdAndUpdate(userId, { $set: update }, { new: true })
      .select('-passwordHash -refreshTokenHash -passwordResetTokenHash -emailVerificationToken')
      .lean();

    if (!updated) {
      throw new NotFoundException('User not found.');
    }

    return updated;
  }

  async deactivateOwnAccount(userId: string, confirmed?: boolean) {
    if (!confirmed) {
      throw new BadRequestException(
        'Confirmation is required to deactivate your account (pass confirmed=true) (ACC-12, GEN-03).',
      );
    }

    const userObjectId = new Types.ObjectId(userId);
    const now = new Date();

    const flightBookingsColl = this.connection.collection('flightbookings');
    const upcomingFlightBooking = await flightBookingsColl.findOne({
      userId: userObjectId,
      status: BookingLifecycleStatus.CONFIRMED,
      departureTimeUtc: { $gt: now },
    });

    if (upcomingFlightBooking) {
      throw new BadRequestException(
        'Account deactivation is blocked while you have upcoming Confirmed flight bookings (ACC-12).',
      );
    }

    const hotelBookingsColl = this.connection.collection('hotelbookings');
    const upcomingHotelBooking = await hotelBookingsColl.findOne({
      userId: userObjectId,
      status: BookingLifecycleStatus.CONFIRMED,
      checkOutDate: { $gt: now },
    });

    if (upcomingHotelBooking) {
      throw new BadRequestException(
        'Account deactivation is blocked while you have upcoming Confirmed hotel reservations (ACC-12).',
      );
    }

    const user = await this.userModel.findByIdAndUpdate(
      userId,
      {
        $set: {
          status: AccountStatus.DEACTIVATED,
          refreshTokenHash: null,
        },
      },
      { new: true },
    );

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    await this.connection
      .collection('blogposts')
      .updateMany({ authorId: userObjectId }, { $set: { isHiddenByDeactivation: true } });

    await this.connection
      .collection('itineraries')
      .updateMany(
        { ownerId: userObjectId, visibility: 'public' },
        { $set: { visibility: 'private' } },
      );

    return {
      message:
        'Your account has been deactivated. Your public posts and itineraries are now hidden, and comments/reviews are anonymized as "Deleted user".',
    };
  }

  async addFavourite(userId: string, targetType: 'hotel' | 'itinerary', targetId: string) {
    if (!['hotel', 'itinerary'].includes(targetType)) {
      throw new BadRequestException('targetType must be "hotel" or "itinerary" (BON-02).');
    }
    if (!Types.ObjectId.isValid(targetId)) {
      throw new BadRequestException('Invalid targetId.');
    }

    const existing = await this.favouriteModel.findOne({
      userId: new Types.ObjectId(userId),
      targetType,
      targetId: new Types.ObjectId(targetId),
    });

    if (existing) {
      throw new ConflictException('Item is already in your favourites list.');
    }

    return this.favouriteModel.create({
      userId: new Types.ObjectId(userId),
      targetType,
      targetId: new Types.ObjectId(targetId),
    });
  }

  async listFavourites(userId: string) {
    return this.favouriteModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async removeFavourite(userId: string, id: string) {
    await this.favouriteModel.deleteOne({
      _id: id,
      userId: new Types.ObjectId(userId),
    });
    return { message: 'Removed from favourites (BON-02).' };
  }
}
