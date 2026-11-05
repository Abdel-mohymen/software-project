import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from '../users/schemas/user.schema';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';
import { Report, ReportDocument } from './schemas/report.schema';
import {
  AccountListQueryDto,
  AdminBookingListQueryDto,
  AdminResetPasswordDto,
  CreateModeratorDto,
  CreateReportDto,
  ResolveReportDto,
} from './dto/admin.dto';
import { AccountStatus, UserRole } from '../../common/enums/role.enum';
import { paginateResult } from '../../common/dto/pagination.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(AuditLog.name) private readonly auditLogModel: Model<AuditLogDocument>,
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly notificationsService: NotificationsService,
  ) {}

  async logAdminAction(
    adminId: string,
    action: string,
    targetType: string,
    targetId: string,
    details: Record<string, any> = {},
  ) {
    return this.auditLogModel.create({
      adminId: new Types.ObjectId(adminId),
      action,
      targetType,
      targetId,
      details,
    });
  }

  async createModerator(adminId: string, dto: CreateModeratorDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.userModel.findOne({ email });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const providerType = dto.role === UserRole.AIRLINE_MODERATOR ? 'airline' : 'hotel';
    const collectionName = providerType === 'airline' ? 'airlines' : 'hotels';
    if (!Types.ObjectId.isValid(dto.providerId)) {
      throw new BadRequestException('Invalid providerId.');
    }

    const provider = await this.connection
      .collection(collectionName)
      .findOne({ _id: new Types.ObjectId(dto.providerId) });

    if (!provider) {
      throw new NotFoundException(`Assigned ${providerType} with ID ${dto.providerId} not found.`);
    }

    const passwordHash = await bcrypt.hash(dto.temporaryPassword, 10);
    const moderator = await this.userModel.create({
      name: dto.name.trim(),
      email,
      passwordHash,
      role: dto.role,
      status: AccountStatus.ACTIVE,
      mustChangePassword: true,
      assignedProviderType: providerType,
      assignedProviderId: new Types.ObjectId(dto.providerId),
      termsConsent: true,
      isEmailVerified: true,
    });

    await this.logAdminAction(adminId, 'CREATE_MODERATOR', 'user', moderator._id.toString(), {
      role: dto.role,
      providerType,
      providerId: dto.providerId,
    });

    return {
      message: 'Moderator account created. Password change is required on first login (ACC-13).',
      moderator: {
        id: moderator._id.toString(),
        name: moderator.name,
        email: moderator.email,
        role: moderator.role,
        assignedProviderType: moderator.assignedProviderType,
        assignedProviderId: moderator.assignedProviderId,
        mustChangePassword: moderator.mustChangePassword,
      },
    };
  }

  async adminResetPassword(adminId: string, targetUserId: string, dto: AdminResetPasswordDto) {
    const user = await this.userModel.findById(targetUserId);
    if (!user) {
      throw new NotFoundException('User account not found.');
    }

    user.passwordHash = await bcrypt.hash(dto.temporaryPassword, 10);
    user.mustChangePassword = true;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.refreshTokenHash = null;
    await user.save();

    await this.logAdminAction(adminId, 'ADMIN_RESET_PASSWORD', 'user', targetUserId);

    return {
      message:
        'Temporary password set. The user will be required to change it at their next login (ACC-07a).',
    };
  }

  async listAccounts(query: AccountListQueryDto) {
    const filter: any = {};
    if (query.role) {
      filter.role = query.role;
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.search) {
      const regex = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ name: regex }, { email: regex }];
    }

    const page = query.page || 1;
    const limit = query.limit || 10;

    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('name email role status createdAt assignedProviderType assignedProviderId')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    return paginateResult(items, total, page, limit);
  }

  async setAccountSuspension(adminId: string, targetUserId: string, suspend: boolean) {
    const user = await this.userModel.findById(targetUserId);
    if (!user) {
      throw new NotFoundException('Account not found.');
    }
    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException('Administrator accounts cannot be suspended.');
    }

    user.status = suspend ? AccountStatus.SUSPENDED : AccountStatus.ACTIVE;
    if (suspend) {
      user.refreshTokenHash = null;
    }
    await user.save();

    await this.notificationsService.createNotification({
      userId: user._id,
      title: suspend ? 'Account Suspended' : 'Account Reactivated',
      message: suspend
        ? 'Your account has been suspended by an administrator.'
        : 'Your account has been reactivated by an administrator.',
      type: 'account_status',
    });

    await this.logAdminAction(
      adminId,
      suspend ? 'SUSPEND_ACCOUNT' : 'REACTIVATE_ACCOUNT',
      'user',
      targetUserId,
      { role: user.role, email: user.email },
    );

    return {
      message: `Account ${suspend ? 'suspended' : 'reactivated'} successfully.`,
      id: user._id.toString(),
      status: user.status,
    };
  }

  async setProviderActivation(
    adminId: string,
    type: 'airline' | 'hotel',
    providerId: string,
    activate: boolean,
  ) {
    if (!['airline', 'hotel'].includes(type)) {
      throw new BadRequestException('Provider type must be "airline" or "hotel".');
    }
    if (!Types.ObjectId.isValid(providerId)) {
      throw new BadRequestException('Invalid provider ID.');
    }

    const collectionName = type === 'airline' ? 'airlines' : 'hotels';
    const providerObjId = new Types.ObjectId(providerId);
    const provider = await this.connection
      .collection(collectionName)
      .findOne({ _id: providerObjId });

    if (!provider) {
      throw new NotFoundException(`${type} not found.`);
    }

    await this.connection
      .collection(collectionName)
      .updateOne({ _id: providerObjId }, { $set: { isActive: activate } });

    // Notify assigned moderator(s) (ACC-15, GEN-01)
    const moderators = await this.userModel.find({
      assignedProviderType: type,
      assignedProviderId: providerObjId,
    });

    for (const mod of moderators) {
      await this.notificationsService.createNotification({
        userId: mod._id,
        title: activate ? `${type.toUpperCase()} Reactivated` : `${type.toUpperCase()} Deactivated`,
        message: activate
          ? `Your assigned ${type} (${provider.name}) has been reactivated and is visible in search.`
          : `Your assigned ${type} (${provider.name}) has been deactivated and hidden from new searches. Existing Confirmed bookings remain valid.`,
        type: 'provider_status',
      });
    }

    await this.logAdminAction(
      adminId,
      activate ? 'REACTIVATE_PROVIDER' : 'DEACTIVATE_PROVIDER',
      type,
      providerId,
      { name: provider.name },
    );

    return {
      message: `${type} ${activate ? 'reactivated' : 'deactivated'} successfully. Existing Confirmed bookings remain valid (ACC-15).`,
      providerId,
      type,
      isActive: activate,
    };
  }

  async listAllBookings(query: AdminBookingListQueryDto) {
    const page = query.page || 1;
    const limit = query.limit || 10;

    const dateFilter: any = {};
    if (query.startDate) {
      dateFilter.$gte = new Date(query.startDate);
    }
    if (query.endDate) {
      dateFilter.$lte = new Date(query.endDate);
    }

    const baseFilter: any = {};
    if (query.status) {
      baseFilter.status = query.status;
    }
    if (Object.keys(dateFilter).length > 0) {
      baseFilter.createdAt = dateFilter;
    }

    const results: any[] = [];

    if (!query.type || query.type === 'flight') {
      const flightBookings = await this.connection
        .collection('flightbookings')
        .find(baseFilter)
        .sort({ createdAt: -1 })
        .toArray();
      flightBookings.forEach((b) =>
        results.push({
          id: b._id.toString(),
          bookingType: 'flight',
          bookingReference: b.bookingReference,
          userId: b.userId?.toString(),
          providerId: b.airlineId?.toString(),
          totalAmount: b.totalAmount,
          currency: b.currency || 'USD',
          status: b.status,
          createdAt: b.createdAt,
        }),
      );
    }

    if (!query.type || query.type === 'hotel') {
      const hotelBookings = await this.connection
        .collection('hotelbookings')
        .find(baseFilter)
        .sort({ createdAt: -1 })
        .toArray();
      hotelBookings.forEach((b) =>
        results.push({
          id: b._id.toString(),
          bookingType: 'hotel',
          bookingReference: b.bookingReference,
          userId: b.userId?.toString(),
          providerId: b.hotelId?.toString(),
          totalAmount: b.totalAmount,
          currency: b.currency || 'USD',
          status: b.status,
          checkInDate: b.checkInDate,
          checkOutDate: b.checkOutDate,
          createdAt: b.createdAt,
        }),
      );
    }

    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const paged = results.slice((page - 1) * limit, page * limit);
    return paginateResult(paged, results.length, page, limit);
  }

  async createReport(reporterId: string, dto: CreateReportDto) {
    if (!Types.ObjectId.isValid(dto.targetId)) {
      throw new BadRequestException('Invalid targetId.');
    }

    const existing = await this.reportModel.findOne({
      reporterId: new Types.ObjectId(reporterId),
      targetType: dto.targetType,
      targetId: new Types.ObjectId(dto.targetId),
    });

    if (existing) {
      throw new ConflictException('You have already reported this item (GEN-09).');
    }

    const report = await this.reportModel.create({
      reporterId: new Types.ObjectId(reporterId),
      targetType: dto.targetType,
      targetId: new Types.ObjectId(dto.targetId),
      reason: dto.reason.trim(),
      status: 'open',
    });

    return report;
  }

  async listReports(status = 'open', page = 1, limit = 10) {
    const filter = status === 'all' ? {} : { status };
    const [items, total] = await Promise.all([
      this.reportModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.reportModel.countDocuments(filter),
    ]);
    return paginateResult(items, total, page, limit);
  }

  async resolveReport(adminId: string, reportId: string, dto: ResolveReportDto) {
    const report = await this.reportModel.findById(reportId);
    if (!report) {
      throw new NotFoundException('Report not found.');
    }

    if (dto.action === 'dismiss') {
      report.status = 'dismissed';
    } else if (dto.action === 'hide') {
      await this.moderateContentInternal(
        adminId,
        report.targetType,
        report.targetId.toString(),
        'hide',
      );
      report.status = 'hidden';
    } else if (dto.action === 'delete') {
      await this.moderateContentInternal(
        adminId,
        report.targetType,
        report.targetId.toString(),
        'delete',
      );
      report.status = 'deleted';
    }

    report.resolvedBy = new Types.ObjectId(adminId);
    report.resolvedAt = new Date();
    await report.save();

    await this.logAdminAction(adminId, `RESOLVE_REPORT_${dto.action.toUpperCase()}`, 'report', reportId, {
      targetType: report.targetType,
      targetId: report.targetId.toString(),
    });

    return report;
  }

  async moderateContentInternal(
    adminId: string,
    type: 'post' | 'comment' | 'review' | 'itinerary',
    id: string,
    mode: 'hide' | 'delete',
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid content ID.');
    }

    const collectionMap: Record<string, string> = {
      post: 'blogposts',
      comment: 'comments',
      review: 'reviews',
      itinerary: 'itineraries',
    };

    const collectionName = collectionMap[type];
    if (!collectionName) {
      throw new BadRequestException('Unsupported content type.');
    }

    const objId = new Types.ObjectId(id);
    const coll = this.connection.collection(collectionName);
    const existing = await coll.findOne({ _id: objId });
    if (!existing) {
      throw new NotFoundException(`${type} not found.`);
    }

    if (mode === 'hide') {
      await coll.updateOne({ _id: objId }, { $set: { isHidden: true } });
    } else {
      await coll.deleteOne({ _id: objId });
    }

    await this.logAdminAction(
      adminId,
      mode === 'hide' ? `HIDE_${type.toUpperCase()}` : `DELETE_${type.toUpperCase()}`,
      type,
      id,
    );

    return {
      message: `${type} has been ${mode === 'hide' ? 'hidden' : 'deleted'} by administrator (GEN-10).`,
    };
  }

  async getAuditLogs(page = 1, limit = 10) {
    const [items, total] = await Promise.all([
      this.auditLogModel
        .find()
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.auditLogModel.countDocuments(),
    ]);
    return paginateResult(items, total, page, limit);
  }

  async getAnalytics(startDate?: string, endDate?: string) {
    const dateFilter: any = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const matchStage: any = { status: { $in: ['Confirmed', 'Completed'] } };
    if (Object.keys(dateFilter).length > 0) {
      matchStage.createdAt = dateFilter;
    }

    const flightAgg = await this.connection
      .collection('flightbookings')
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$airlineId',
            bookingCount: { $sum: 1 },
            totalRevenue: { $sum: '$totalAmount' },
          },
        },
      ])
      .toArray();

    const hotelAgg = await this.connection
      .collection('hotelbookings')
      .aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: '$hotelId',
            bookingCount: { $sum: 1 },
            totalRevenue: { $sum: '$totalAmount' },
          },
        },
      ])
      .toArray();

    return {
      airlines: flightAgg,
      hotels: hotelAgg,
    };
  }
}
