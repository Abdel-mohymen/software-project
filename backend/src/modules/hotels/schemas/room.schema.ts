import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RoomDocument = Room & Document;

@Schema({ _id: false })
export class DateRangeWindow {
  @Prop({ required: true })
  startDate: Date;

  @Prop({ required: true })
  endDate: Date;

  @Prop({ default: '' })
  reason?: string;
}

@Schema({ _id: false })
export class ActiveRoomLock {
  @Prop({ required: true })
  bookingReference: string;

  @Prop({ required: true })
  checkInDate: Date;

  @Prop({ required: true })
  checkOutDate: Date;

  @Prop({ required: true, enum: ['hold', 'confirmed'] })
  lockType: 'hold' | 'confirmed';

  @Prop({ type: Date, default: null })
  expiresAt: Date | null;
}

@Schema({ timestamps: true })
export class Room {
  @Prop({ type: Types.ObjectId, ref: 'Hotel', required: true, index: true })
  hotelId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  roomNumber: string;

  @Prop({ required: true, trim: true })
  type: string;

  @Prop({ required: true, min: 1 })
  beds: number;

  @Prop({ required: true, min: 1 })
  maxOccupancy: number;

  @Prop({ required: true, min: 0.01 })
  pricePerNight: number;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [DateRangeWindow], default: [] })
  availableRanges: DateRangeWindow[];

  @Prop({ type: [DateRangeWindow], default: [] })
  blockedRanges: DateRangeWindow[];

  @Prop({ type: [ActiveRoomLock], default: [] })
  activeLocks: ActiveRoomLock[];
}

export const RoomSchema = SchemaFactory.createForClass(Room);
RoomSchema.index({ hotelId: 1, roomNumber: 1 }, { unique: true });
