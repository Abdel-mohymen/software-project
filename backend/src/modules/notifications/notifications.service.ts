import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification, NotificationDocument } from './schemas/notification.schema';
import { paginateResult } from '../../common/dto/pagination.dto';

export interface DevMailboxMessage {
  id: string;
  to: string;
  subject: string;
  body: string;
  token?: string;
  sentAt: string;
}

@Injectable()
export class NotificationsService {
  private devMailbox: DevMailboxMessage[] = [];

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
  ) {}

  recordDevMailboxEntry(entry: { to: string; subject: string; body: string; token?: string }) {
    // Only record in-memory test mailbox entries in non-production environments; never write tokens to static uploads/
    if (process.env.NODE_ENV === 'production') {
      return null;
    }

    const msg: DevMailboxMessage = {
      id: `mail-${Date.now()}-${Math.round(Math.random() * 1e5)}`,
      to: entry.to,
      subject: entry.subject,
      body: entry.body,
      token: entry.token,
      sentAt: new Date().toISOString(),
    };
    this.devMailbox.unshift(msg);
    if (this.devMailbox.length > 100) {
      this.devMailbox.pop();
    }

    return msg;
  }

  getDevMailboxMessages(email?: string): DevMailboxMessage[] {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Development test mailbox is disabled in production.');
    }
    if (email) {
      return this.devMailbox.filter((m) => m.to.toLowerCase() === email.trim().toLowerCase());
    }
    return this.devMailbox;
  }

  async createNotification(params: {
    userId: string | Types.ObjectId;
    title: string;
    message: string;
    type?: string;
    metadata?: Record<string, any>;
  }) {
    const created = await this.notificationModel.create({
      userId: new Types.ObjectId(params.userId),
      title: params.title,
      message: params.message,
      type: params.type || 'system',
      metadata: params.metadata || {},
      isRead: false,
    });

    this.recordDevMailboxEntry({
      to: params.userId.toString(),
      subject: params.title,
      body: params.message,
    });

    return created;
  }

  async getUserNotifications(userId: string, page = 1, limit = 10) {
    const filter = { userId: new Types.ObjectId(userId) };
    const [items, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.notificationModel.countDocuments(filter),
      this.notificationModel.countDocuments({ ...filter, isRead: false }),
    ]);

    return {
      unreadCount,
      ...paginateResult(items, total, page, limit),
    };
  }

  async markAsRead(userId: string, notificationId: string) {
    const updated = await this.notificationModel.findOneAndUpdate(
      { _id: notificationId, userId: new Types.ObjectId(userId) },
      { $set: { isRead: true } },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('Notification not found.');
    }
    return updated;
  }

  async markAllAsRead(userId: string) {
    await this.notificationModel.updateMany(
      { userId: new Types.ObjectId(userId), isRead: false },
      { $set: { isRead: true } },
    );
    return { message: 'All notifications marked as read.' };
  }
}
