import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FlightBooking, FlightBookingSchema } from './schemas/flight-booking.schema';
import { Flight, FlightSchema } from '../flights/schemas/flight.schema';
import { Airline, AirlineSchema } from '../airlines/schemas/airline.schema';
import { Refund, RefundSchema } from '../payments/schemas/refund.schema';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { AirlinesModule } from '../airlines/airlines.module';
import { FlightBookingsService } from './flight-bookings.service';
import { FlightBookingsController } from './flight-bookings.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FlightBooking.name, schema: FlightBookingSchema },
      { name: Flight.name, schema: FlightSchema },
      { name: Airline.name, schema: AirlineSchema },
      { name: Refund.name, schema: RefundSchema },
      { name: Payment.name, schema: PaymentSchema },
    ]),
    AirlinesModule,
  ],
  controllers: [FlightBookingsController],
  providers: [FlightBookingsService],
  exports: [FlightBookingsService, MongooseModule],
})
export class FlightBookingsModule {}
