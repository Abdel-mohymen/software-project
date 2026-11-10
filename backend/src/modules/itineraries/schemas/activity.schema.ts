import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ActivityDocument = Activity & Document;

@Schema({ _id: false })
export class MediaAttachment {
  @Prop({ required: true })
  imageId: string;

  @Prop({ required: true })
  url: string;
}

@Schema({ timestamps: true })
export class Activity {
  @Prop({ type: Types.ObjectId, ref: 'Itinerary', required: true, index: true })
  itineraryId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  dayId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: '' })
  time: string;

  @Prop({ default: 0, min: 0 })
  cost: number;

  @Prop({ default: 'USD', uppercase: true })
  currency: string;

  @Prop({ type: [MediaAttachment], default: [] })
  images: MediaAttachment[];
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);
