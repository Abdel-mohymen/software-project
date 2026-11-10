import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BookingLifecycleStatus } from '../../../common/enums/role.enum';
import { CABIN_CATEGORIES, CabinCategoryType } from '../../flights/schemas/flight.schema';

export type FlightBookingDocument = FlightBooking & Document;

@Schema({ _id: false })
export class PassengerInfo {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ required: true })
  dateOfBirth: string;

  @Prop({ required: true, trim: true })
  passportOrId: string;

  @Prop({ required: true, enum: ['adult', 'child', 'infant'] })
  passengerType: 'adult' | 'child' | 'infant';

  @Prop({ default: 0, min: 0 })
  extraBags: number;

  @Prop({ default: '' })
  seatNumber: string;
}

@Schema({ timestamps: true })
export class FlightBooking {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  bookingReference: string;

  @Prop({ required: true, enum: ['one-way', 'round-trip'], default: 'one-way' })
  tripType: 'one-way' | 'round-trip';

  @Prop({ type: Types.ObjectId, ref: 'Airline', required: true })
  airlineId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Flight', required: true, index: true })
  outboundFlightId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Flight', default: null })
  returnFlightId: Types.ObjectId | null;

  @Prop({ required: true, enum: CABIN_CATEGORIES })
  cabinCategory: CabinCategoryType;

  @Prop({ required: true, min: 1 })
  seatsReserved: number;

  @Prop({ type: [PassengerInfo], required: true })
  passengers: PassengerInfo[];

  @Prop({ required: true })
  baseFareTotal: number;

  @Prop({ required: true, default: 0 })
  extraBaggageTotal: number;

  @Prop({ required: true })
  totalAmount: number;

  @Prop({ default: 'USD' })
  currency: string;

  @Prop({
    type: String,
    enum: BookingLifecycleStatus,
    default: BookingLifecycleStatus.PENDING_PAYMENT,
  })
  status: BookingLifecycleStatus;

  @Prop({ required: true })
  holdExpiresAt: Date;

  @Prop({ required: true })
  departureTimeUtc: Date;

  @Prop({ default: false })
  policyAccepted: boolean;

  @Prop({ type: Date, default: null })
  policyAcceptedAt: Date | null;

  @Prop({ type: Date, default: null })
  confirmedAt: Date | null;

  @Prop({ type: Date, default: null })
  cancelledAt: Date | null;

  @Prop({ default: 0 })
  refundAmount: number;

  @Prop({ default: 0 })
  refundPercentage: number;
}

export const FlightBookingSchema = SchemaFactory.createForClass(FlightBooking);
