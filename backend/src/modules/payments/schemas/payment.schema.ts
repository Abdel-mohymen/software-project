import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PaymentDocument = Payment & Document;

@Schema({ timestamps: true })
export class Payment {
  @Prop({ required: true, enum: ['flight', 'hotel'] })
  bookingType: 'flight' | 'hotel';

  @Prop({ type: Types.ObjectId, required: true, index: true })
  bookingId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  stripePaymentIntentId: string;

  @Prop({ required: true, min: 0.01 })
  amount: number;

  @Prop({ required: true, default: 'USD', uppercase: true })
  currency: string;

  @Prop({
    required: true,
    enum: ['requires_payment_method', 'processing', 'succeeded', 'failed', 'cancelled'],
    default: 'requires_payment_method',
  })
  status: string;

  @Prop({ required: true })
  policyAcceptedAt: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
