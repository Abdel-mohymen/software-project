import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type HotelDocument = Hotel & Document;

@Schema({ _id: false })
export class HotelCancellationTier {
  @Prop({ required: true, min: 0 })
  daysBeforeCheckIn: number;

  @Prop({ required: true, min: 0, max: 100 })
  refundPercentage: number;
}

@Schema({ timestamps: true })
export class Hotel {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  address: string;

  @Prop({ required: true, lowercase: true, trim: true, index: true })
  city_id: string;

  @Prop({ required: true, uppercase: true, trim: true, index: true })
  country_code: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: [String], default: [] })
  photos: string[];

  @Prop({ required: true, min: 1, max: 5, default: 4 })
  starClass: number;

  @Prop({ type: [String], default: [] })
  amenities: string[];

  @Prop({ default: '14:00' })
  checkInTime: string;

  @Prop({ default: '11:00' })
  checkOutTime: string;

  @Prop({
    type: [HotelCancellationTier],
    default: () => [
      { daysBeforeCheckIn: 5, refundPercentage: 100 },
      { daysBeforeCheckIn: 2, refundPercentage: 50 },
      { daysBeforeCheckIn: 0, refundPercentage: 0 },
    ],
  })
  cancellationTiers: HotelCancellationTier[];

  @Prop({ default: 0 })
  averageRating: number;

  @Prop({ default: 0 })
  ratingsCount: number;

  @Prop({ default: true })
  isActive: boolean;
}

export const HotelSchema = SchemaFactory.createForClass(Hotel);
