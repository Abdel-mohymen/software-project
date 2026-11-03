import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, trim: true })
  message: string;

  @Prop({
    required: true,
    enum: ['booking_confirmed', 'booking_cancelled', 'refund_update', 'flight_schedule_change', 'account_status', 'provider_status', 'system'],
    default: 'system',
  })
  type: string;

  @Prop({ default: false })
  isRead: boolean;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, any>;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
