import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TransportCostDocument = TransportCost & Document;

@Schema({ timestamps: true })
export class TransportCost {
  @Prop({ type: Types.ObjectId, ref: 'Itinerary', required: true, index: true })
  itineraryId: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  dayNumber: number;

  @Prop({ required: true, trim: true })
  mode: string; // e.g., train, flight, bus, car

  @Prop({ required: true, lowercase: true, trim: true })
  fromCity: string;

  @Prop({ required: true, lowercase: true, trim: true })
  toCity: string;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, uppercase: true, default: 'USD' })
  currency: string;
}

export const TransportCostSchema = SchemaFactory.createForClass(TransportCost);
