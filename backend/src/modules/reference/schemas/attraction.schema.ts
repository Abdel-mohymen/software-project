import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AttractionDocument = Attraction & Document;

@Schema({ timestamps: true })
export class Attraction {
  @Prop({ required: true, unique: true, trim: true })
  attraction_id: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, lowercase: true, trim: true })
  city_id: string;
}

export const AttractionSchema = SchemaFactory.createForClass(Attraction);
