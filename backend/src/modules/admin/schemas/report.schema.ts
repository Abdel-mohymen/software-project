import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ReportDocument = Report & Document;

@Schema({ timestamps: true })
export class Report {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  reporterId: Types.ObjectId;

  @Prop({
    required: true,
    enum: ['post', 'comment', 'review', 'itinerary'],
  })
  targetType: 'post' | 'comment' | 'review' | 'itinerary';

  @Prop({ type: Types.ObjectId, required: true })
  targetId: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 500 })
  reason: string;

  @Prop({
    required: true,
    enum: ['open', 'dismissed', 'hidden', 'deleted'],
    default: 'open',
  })
  status: 'open' | 'dismissed' | 'hidden' | 'deleted';

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  resolvedBy: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  resolvedAt: Date | null;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
ReportSchema.index({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true });
