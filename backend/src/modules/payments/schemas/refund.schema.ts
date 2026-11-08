import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RefundDocument = Refund & Document;

@Schema({ timestamps: true })
export class Refund {
  @Prop({ required: true, enum: ['flight', 'hotel'] })
  bookingType: 'flight' | 'hotel';

  @Prop({ type: Types.ObjectId, required: true, index: true })
  bookingId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, default: 'USD', uppercase: true })
  currency: string;

  @Prop({ required: true, min: 0, max: 100 })
  refundPercentage: number;

  @Prop({ required: true })
  stripeRefundId: string;

  @Prop({
    required: true,
    enum: ['Pending', 'Refunded', 'Failed'],
    default: 'Refunded',
  })
  status: 'Pending' | 'Refunded' | 'Failed';

  @Prop({ default: '' })
  reason: string;
}

export const RefundSchema = SchemaFactory.createForClass(Refund);
