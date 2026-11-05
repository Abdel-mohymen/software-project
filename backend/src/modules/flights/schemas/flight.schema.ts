import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FlightDocument = Flight & Document;

export const CABIN_CATEGORIES = [
  'Economy',
  'Premium Economy',
  'Business',
  'First',
] as const;

export type CabinCategoryType = (typeof CABIN_CATEGORIES)[number];

@Schema()
export class CabinInventory {
  _id?: Types.ObjectId;

  @Prop({ required: true, enum: CABIN_CATEGORIES })
  category: CabinCategoryType;

  @Prop({ required: true, min: 1 })
  seatCount: number;

  @Prop({ required: true, min: 0, default: 0 })
  bookedSeats: number;

  @Prop({ required: true, min: 0, default: 0 })
  heldSeats: number;

  @Prop({ required: true, min: 0.01 })
  price: number;

  @Prop({ required: true, min: 0, default: 1 })
  freeBaggageCount: number;

  @Prop({ required: true, min: 1, default: 23 })
  maxBagWeightKg: number;
}

export const CabinInventorySchema = SchemaFactory.createForClass(CabinInventory);

@Schema({ timestamps: true })
export class Flight {
  @Prop({ type: Types.ObjectId, ref: 'Airline', required: true, index: true })
  airlineId: Types.ObjectId;

  @Prop({ required: true, uppercase: true, trim: true })
  flightNumber: string;

  @Prop({ required: true, uppercase: true, trim: true })
  departureAirport: string;

  @Prop({ required: true, uppercase: true, trim: true })
  arrivalAirport: string;

  @Prop({ required: true })
  departureTimeUtc: Date;

  @Prop({ required: true })
  arrivalTimeUtc: Date;

  @Prop({ required: true })
  departureTimeLocal: string;

  @Prop({ required: true })
  arrivalTimeLocal: string;

  @Prop({ required: true })
  departureDateLocal: string;

  @Prop({ required: true })
  departureTimeZone: string;

  @Prop({ required: true })
  arrivalTimeZone: string;

  @Prop({ required: true })
  durationMinutes: number;

  @Prop({
    required: true,
    enum: ['Scheduled', 'Cancelled', 'Departed'],
    default: 'Scheduled',
  })
  status: 'Scheduled' | 'Cancelled' | 'Departed';

  @Prop({ type: [CabinInventorySchema], default: [] })
  cabins: CabinInventory[];
}

export const FlightSchema = SchemaFactory.createForClass(Flight);
FlightSchema.index({ airlineId: 1, flightNumber: 1, departureDateLocal: 1 }, { unique: true });
