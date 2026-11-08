import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReviewDocument = Review & Document;

@Schema({ timestamps: true })
export class Review {
  @Prop({ type: Types.ObjectId, ref: 'HotelBooking', required: true, unique: true })
  hotelBookingId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Hotel', required: true, index: true })
  hotelId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ default: '', maxlength: 1000 })
  comment: string;

  @Prop({ default: '' })
  moderatorReply: string;

  @Prop({ type: Date, default: null })
  repliedAt: Date | null;

  @Prop({ default: false })
  isHidden: boolean;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);
