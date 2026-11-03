import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FavouriteDocument = Favourite & Document;

@Schema({ timestamps: true })
export class Favourite {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: ['hotel', 'itinerary'] })
  targetType: 'hotel' | 'itinerary';

  @Prop({ type: Types.ObjectId, required: true })
  targetId: Types.ObjectId;
}

export const FavouriteSchema = SchemaFactory.createForClass(Favourite);
FavouriteSchema.index({ userId: 1, targetType: 1, targetId: 1 }, { unique: true });
