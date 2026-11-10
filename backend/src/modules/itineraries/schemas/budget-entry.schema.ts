import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BudgetEntryDocument = BudgetEntry & Document;

export const BUDGET_CATEGORIES = [
  'food',
  'accommodation',
  'local_transportation',
  'activities',
] as const;

export type BudgetCategoryType = (typeof BUDGET_CATEGORIES)[number];

@Schema({ timestamps: true })
export class BudgetEntry {
  @Prop({ type: Types.ObjectId, ref: 'Itinerary', required: true, index: true })
  itineraryId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  dayId: Types.ObjectId;

  @Prop({ required: true, enum: BUDGET_CATEGORIES })
  category: BudgetCategoryType;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true, uppercase: true, default: 'USD' })
  currency: string;

  @Prop({ default: '' })
  note: string;
}

export const BudgetEntrySchema = SchemaFactory.createForClass(BudgetEntry);
