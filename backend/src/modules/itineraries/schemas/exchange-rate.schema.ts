import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ExchangeRateDocument = ExchangeRate & Document;

@Schema({ timestamps: true })
export class ExchangeRate {
  @Prop({ required: true, uppercase: true })
  baseCurrency: string;

  @Prop({ required: true })
  rateDate: string; // YYYY-MM-DD

  @Prop({ type: Object, required: true })
  rates: Record<string, number>;

  @Prop({ required: true })
  fetchedAt: Date;
}

export const ExchangeRateSchema = SchemaFactory.createForClass(ExchangeRate);
ExchangeRateSchema.index({ baseCurrency: 1, rateDate: 1 }, { unique: true });
