import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BookingLifecycleStatus } from '../../../common/enums/role.enum';

export type HotelBookingDocument = HotelBooking & Document;

@Schema({ _id: false })
export class BookedRoomAllocation {
  @Prop({ type: Types.ObjectId, ref: 'Room', required: true })
  roomId: Types.ObjectId;

  @Prop({ required: true })
  roomNumber: string;

  @Prop({ required: true, min: 0 })
  adults: number;

  @Prop({ required: true, min: 0, default: 0 })
  children: number;

  @Prop({ required: true, min: 0.01 })
  pricePerNightAtBooking: number;
}

@Schema({ timestamps: true })
export class HotelBooking {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  bookingReference: string;

  @Prop({ type: Types.ObjectId, ref: 'Hotel', required: true, index: true })
  hotelId: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], ref: 'Room', required: true, index: true })
  roomIds: Types.ObjectId[];

  @Prop({ type: [BookedRoomAllocation], required: true })
  rooms: BookedRoomAllocation[];

  @Prop({ required: true })
  checkInDate: Date;

  @Prop({ required: true })
  checkOutDate: Date;

  @Prop({ required: true, min: 1 })
  nights: number;

  @Prop({ required: true, min: 1 })
  totalGuests: number;

  @Prop({ required: true })
  totalAmount: number;

  @Prop({ default: 'USD' })
  currency: string;

  @Prop({
    type: String,
    enum: BookingLifecycleStatus,
    default: BookingLifecycleStatus.PENDING_PAYMENT,
  })
  status: BookingLifecycleStatus;

  @Prop({ required: true })
  holdExpiresAt: Date;

  @Prop({ default: false })
  policyAccepted: boolean;

  @Prop({ type: Date, default: null })
  policyAcceptedAt: Date | null;

  @Prop({ type: Date, default: null })
  confirmedAt: Date | null;

  @Prop({ type: Date, default: null })
  cancelledAt: Date | null;

  @Prop({ default: 0 })
  refundAmount: number;

  @Prop({ default: 0 })
  refundPercentage: number;
}

export const HotelBookingSchema = SchemaFactory.createForClass(HotelBooking);
