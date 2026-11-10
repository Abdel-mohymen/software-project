import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Itinerary, ItinerarySchema } from './schemas/itinerary.schema';
import { Activity, ActivitySchema } from './schemas/activity.schema';
import { BudgetEntry, BudgetEntrySchema } from './schemas/budget-entry.schema';
import { TransportCost, TransportCostSchema } from './schemas/transport-cost.schema';
import { ExchangeRate, ExchangeRateSchema } from './schemas/exchange-rate.schema';
import { HotelsModule } from '../hotels/hotels.module';
import { FlightsModule } from '../flights/flights.module';
import { ItinerariesService } from './itineraries.service';
import { ItinerariesController } from './itineraries.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Itinerary.name, schema: ItinerarySchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: BudgetEntry.name, schema: BudgetEntrySchema },
      { name: TransportCost.name, schema: TransportCostSchema },
      { name: ExchangeRate.name, schema: ExchangeRateSchema },
    ]),
    HotelsModule,
    FlightsModule,
  ],
  controllers: [ItinerariesController],
  providers: [ItinerariesService],
  exports: [ItinerariesService, MongooseModule],
})
export class ItinerariesModule {}
