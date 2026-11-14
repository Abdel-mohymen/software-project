import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HotelBooking, HotelBookingSchema } from './schemas/hotel-booking.schema';
import { Review, ReviewSchema } from './schemas/review.schema';
import { Hotel, HotelSchema } from '../hotels/schemas/hotel.schema';
import { Room, RoomSchema } from '../hotels/schemas/room.schema';
import { Refund, RefundSchema } from '../payments/schemas/refund.schema';
import { Payment, PaymentSchema } from '../payments/schemas/payment.schema';
import { HotelsModule } from '../hotels/hotels.module';
import { HotelBookingsService } from './hotel-bookings.service';
import { HotelBookingsController } from './hotel-bookings.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HotelBooking.name, schema: HotelBookingSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Hotel.name, schema: HotelSchema },
      { name: Room.name, schema: RoomSchema },
      { name: Refund.name, schema: RefundSchema },
      { name: Payment.name, schema: PaymentSchema },
    ]),
    HotelsModule,
  ],
  controllers: [HotelBookingsController],
  providers: [HotelBookingsService],
  exports: [HotelBookingsService, MongooseModule],
})
export class HotelBookingsModule {}
