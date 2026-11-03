import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AirportDocument = Airport & Document;

@Schema({ timestamps: true })
export class Airport {
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  iata_code: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, lowercase: true, trim: true })
  city_id: string;

  @Prop({ required: true, uppercase: true, trim: true })
  country_code: string;

  @Prop({ required: true, trim: true })
  time_zone: string;
}

export const AirportSchema = SchemaFactory.createForClass(Airport);
