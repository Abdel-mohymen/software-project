import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcryptjs';
import { Country, CountryDocument } from './schemas/country.schema';
import { City, CityDocument } from './schemas/city.schema';
import { Airport, AirportDocument } from './schemas/airport.schema';
import { Attraction, AttractionDocument } from './schemas/attraction.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { AccountStatus, UserRole } from '../../common/enums/role.enum';

@Injectable()
export class ReferenceService implements OnModuleInit {
  private readonly logger = new Logger(ReferenceService.name);

  constructor(
    @InjectModel(Country.name) private readonly countryModel: Model<CountryDocument>,
    @InjectModel(City.name) private readonly cityModel: Model<CityDocument>,
    @InjectModel(Airport.name) private readonly airportModel: Model<AirportDocument>,
    @InjectModel(Attraction.name) private readonly attractionModel: Model<AttractionDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async onModuleInit() {
    await this.seedReferenceData();
    await this.seedAdminAccount();
  }

  private parseCsv(fileName: string): Record<string, string>[] {
    const filePath = path.resolve(process.cwd(), 'data', fileName);
    if (!fs.existsSync(filePath)) {
      this.logger.warn(`Reference file not found at ${filePath}`);
      return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8').trim();
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const values = line.split(',').map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = values[i] ?? '';
      });
      return row;
    });
  }

  async seedReferenceData() {
    const countries = this.parseCsv('Countries.csv');
    for (const c of countries) {
      await this.countryModel.updateOne(
        { code: c.code.toUpperCase() },
        { $set: { code: c.code.toUpperCase(), name: c.name, currency: c.currency.toUpperCase() } },
        { upsert: true },
      );
    }

    const cities = this.parseCsv('Cities.csv');
    for (const city of cities) {
      await this.cityModel.updateOne(
        { city_id: city.city_id.toLowerCase() },
        {
          $set: {
            city_id: city.city_id.toLowerCase(),
            name: city.name,
            country_code: city.country_code.toUpperCase(),
          },
        },
        { upsert: true },
      );
    }

    const airports = this.parseCsv('Airports.csv');
    for (const airport of airports) {
      await this.airportModel.updateOne(
        { iata_code: airport.iata_code.toUpperCase() },
        {
          $set: {
            iata_code: airport.iata_code.toUpperCase(),
            name: airport.name,
            city_id: airport.city_id.toLowerCase(),
            country_code: airport.country_code.toUpperCase(),
            time_zone: airport.time_zone,
          },
        },
        { upsert: true },
      );
    }

    const attractions = this.parseCsv('Attractions.csv');
    for (const att of attractions) {
      await this.attractionModel.updateOne(
        { attraction_id: att.attraction_id },
        {
          $set: {
            attraction_id: att.attraction_id,
            name: att.name,
            city_id: att.city_id.toLowerCase(),
          },
        },
        { upsert: true },
      );
    }

    this.logger.log('Reference datasets (Countries, Cities, Airports, Attractions) verified.');
  }

  async seedAdminAccount() {
    const adminEmail = (process.env.ADMIN_SEED_EMAIL || 'admin@giu-travel.com').toLowerCase();
    const existingAdmin = await this.userModel.findOne({ email: adminEmail });
    if (!existingAdmin) {
      const password = process.env.ADMIN_SEED_PASSWORD || 'Admin1234';
      const passwordHash = await bcrypt.hash(password, 10);
      await this.userModel.create({
        name: process.env.ADMIN_SEED_NAME || 'Platform Administrator',
        email: adminEmail,
        passwordHash,
        role: UserRole.ADMIN,
        status: AccountStatus.ACTIVE,
        termsConsent: true,
        isEmailVerified: true,
        preferredCurrency: 'USD',
      });
      this.logger.log(`Seeded default administrator account: ${adminEmail}`);
    }
  }

  async getAirports(query?: string) {
    const filter: any = {};
    if (query) {
      const regex = new RegExp(query.trim(), 'i');
      filter.$or = [{ iata_code: regex }, { name: regex }, { city_id: regex }, { country_code: regex }];
    }
    return this.airportModel.find(filter).sort({ iata_code: 1 }).lean();
  }

  async getAirportByCode(iataCode: string) {
    return this.airportModel.findOne({ iata_code: iataCode.toUpperCase() }).lean();
  }

  async getCountries() {
    return this.countryModel.find().sort({ name: 1 }).lean();
  }

  async getCities(countryCode?: string) {
    const filter = countryCode ? { country_code: countryCode.toUpperCase() } : {};
    return this.cityModel.find(filter).sort({ name: 1 }).lean();
  }

  async getAttractions(cityId?: string) {
    const filter = cityId ? { city_id: cityId.toLowerCase() } : {};
    return this.attractionModel.find(filter).sort({ attraction_id: 1 }).lean();
  }

  async getSupportedCurrencies(): Promise<string[]> {
    const countries = await this.countryModel.find().lean();
    const currencies = new Set<string>(countries.map((c) => c.currency.toUpperCase()));
    return Array.from(currencies);
  }
}
