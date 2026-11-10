import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ItineraryDocument = Itinerary & Document;

@Schema()
export class ItineraryDay {
  _id?: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 60 })
  dayNumber: number;

  @Prop({ required: true })
  date: string; // Derived YYYY-MM-DD from itinerary startDate + (dayNumber - 1)

  @Prop({ required: true, lowercase: true, trim: true })
  city_id: string;

  @Prop({ default: '' })
  notes: string;
}

export const ItineraryDaySchema = SchemaFactory.createForClass(ItineraryDay);

@Schema({ timestamps: true })
export class Itinerary {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  ownerId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 100 })
  title: string;

  @Prop({ type: [String], required: true })
  countries: string[];

  @Prop({ required: true })
  startDate: string; // YYYY-MM-DD

  @Prop({
    required: true,
    enum: ['private', 'public'],
    default: 'private',
  })
  visibility: 'private' | 'public';

  @Prop({ type: [ItineraryDaySchema], default: [] })
  days: ItineraryDay[];

  @Prop({ type: Types.ObjectId, ref: 'Itinerary', default: null })
  clonedFromItineraryId: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  originalAuthorId: Types.ObjectId | null;

  @Prop({ default: '' })
  originalAuthorName: string;

  @Prop({ type: [Object], default: [] })
  attachedBookings: Record<string, any>[];

  @Prop({ default: false })
  isHidden: boolean;
}

export const ItinerarySchema = SchemaFactory.createForClass(Itinerary);
