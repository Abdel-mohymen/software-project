import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { ReferenceModule } from './modules/reference/reference.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { AdminModule } from './modules/admin/admin.module';
import { AirlinesModule } from './modules/airlines/airlines.module';
import { FlightsModule } from './modules/flights/flights.module';
import { FlightBookingsModule } from './modules/flight-bookings/flight-bookings.module';
import { HotelsModule } from './modules/hotels/hotels.module';
import { HotelBookingsModule } from './modules/hotel-bookings/hotel-bookings.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ItinerariesModule } from './modules/itineraries/itineraries.module';
import { BlogModule } from './modules/blog/blog.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/giu_travel_platform',
    ),
    ScheduleModule.forRoot(),
    ReferenceModule,
    NotificationsModule,
    UploadsModule,
    UsersModule,
    AuthModule,
    AdminModule,
    AirlinesModule,
    FlightsModule,
    FlightBookingsModule,
    HotelsModule,
    HotelBookingsModule,
    PaymentsModule,
    ItinerariesModule,
    BlogModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
