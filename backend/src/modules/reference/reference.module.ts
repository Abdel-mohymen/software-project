import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Country, CountrySchema } from './schemas/country.schema';
import { City, CitySchema } from './schemas/city.schema';
import { Airport, AirportSchema } from './schemas/airport.schema';
import { Attraction, AttractionSchema } from './schemas/attraction.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ReferenceService } from './reference.service';
import { ReferenceController } from './reference.controller';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Country.name, schema: CountrySchema },
      { name: City.name, schema: CitySchema },
      { name: Airport.name, schema: AirportSchema },
      { name: Attraction.name, schema: AttractionSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ReferenceController],
  providers: [ReferenceService],
  exports: [ReferenceService, MongooseModule],
})
export class ReferenceModule {}
