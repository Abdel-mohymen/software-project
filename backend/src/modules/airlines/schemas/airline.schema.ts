import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AirlineDocument = Airline & Document;

@Schema({ _id: false })
export class BaggagePolicy {
  @Prop({ required: true, min: 0.01, default: 35 })
  extraBagPrice: number;

  @Prop({ required: true, min: 0, default: 2 })
  maxExtraBagsPerPassenger: number;
}

@Schema({ _id: false })
export class CancellationTier {
  @Prop({ required: true, min: 0 })
  daysBeforeDeparture: number;

  @Prop({ required: true, min: 0, max: 100 })
  refundPercentage: number;
}

@Schema({ timestamps: true })
export class Airline {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code: string;

  @Prop({ default: '' })
  logo: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({
    type: BaggagePolicy,
    default: () => ({ extraBagPrice: 35, maxExtraBagsPerPassenger: 2 }),
  })
  baggagePolicy: BaggagePolicy;

  @Prop({
    type: [CancellationTier],
    default: () => [
      { daysBeforeDeparture: 7, refundPercentage: 80 },
      { daysBeforeDeparture: 2, refundPercentage: 50 },
      { daysBeforeDeparture: 0, refundPercentage: 0 },
    ],
  })
  cancellationTiers: CancellationTier[];
}

export const AirlineSchema = SchemaFactory.createForClass(Airline);
