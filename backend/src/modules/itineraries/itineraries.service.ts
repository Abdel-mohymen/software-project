import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as PDFDocument from 'pdfkit';
import { Itinerary, ItineraryDocument } from './schemas/itinerary.schema';
import { Activity, ActivityDocument } from './schemas/activity.schema';
import { BudgetEntry, BudgetEntryDocument } from './schemas/budget-entry.schema';
import { TransportCost, TransportCostDocument } from './schemas/transport-cost.schema';
import { ExchangeRate, ExchangeRateDocument } from './schemas/exchange-rate.schema';
import { ReferenceService } from '../reference/reference.service';
import { UploadsService } from '../uploads/uploads.service';
import { HotelsService } from '../hotels/hotels.service';
import { FlightsService } from '../flights/flights.service';
import {
  AddItineraryDayDto,
  CreateActivityDto,
  CreateBudgetEntryDto,
  CreateItineraryDto,
  CreateTransportCostDto,
  ReorderDaysDto,
  SearchPublicItinerariesQueryDto,
  UpdateActivityDto,
  UpdateBudgetEntryDto,
  UpdateItineraryDayDto,
  UpdateItineraryDto,
  UpdateTransportCostDto,
} from './dto/itinerary.dto';
import { UserRole } from '../../common/enums/role.enum';
import { paginateResult } from '../../common/dto/pagination.dto';

const FALLBACK_USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  EGP: 49.25,
  AED: 3.67,
  JPY: 153.4,
  SAR: 3.75,
};

@Injectable()
export class ItinerariesService {
  private readonly logger = new Logger(ItinerariesService.name);

  constructor(
    @InjectModel(Itinerary.name) private readonly itineraryModel: Model<ItineraryDocument>,
    @InjectModel(Activity.name) private readonly activityModel: Model<ActivityDocument>,
    @InjectModel(BudgetEntry.name) private readonly budgetEntryModel: Model<BudgetEntryDocument>,
    @InjectModel(TransportCost.name)
    private readonly transportCostModel: Model<TransportCostDocument>,
    @InjectModel(ExchangeRate.name)
    private readonly exchangeRateModel: Model<ExchangeRateDocument>,
    private readonly referenceService: ReferenceService,
    private readonly uploadsService: UploadsService,
    private readonly hotelsService: HotelsService,
    private readonly flightsService: FlightsService,
  ) {}

  private deriveDayDate(startDateStr: string, dayNumber: number): string {
    const start = new Date(startDateStr);
    const derived = new Date(start.getTime() + (dayNumber - 1) * 24 * 60 * 60 * 1000);
    return derived.toISOString().slice(0, 10);
  }

  private recalculateDayNumbersAndDates(itinerary: ItineraryDocument) {
    itinerary.days.forEach((day, idx) => {
      day.dayNumber = idx + 1;
      day.date = this.deriveDayDate(itinerary.startDate, idx + 1);
    });
  }

  private assertOwner(itinerary: any, userId: string) {
    if (itinerary.ownerId.toString() !== userId) {
      throw new ForbiddenException('You do not have permission to access or modify this private itinerary (ACC-11).');
    }
  }

  async getOrFetchExchangeRates(baseCurrency = 'USD') {
    const today = new Date().toISOString().slice(0, 10);
    const cachedToday = await this.exchangeRateModel
      .findOne({ baseCurrency: 'USD', rateDate: today })
      .lean();

    if (cachedToday) {
      return cachedToday;
    }

    // Attempt live FXRatesAPI fetch once per day (ITN-18)
    try {
      const apiUrl = process.env.FXRATES_API_URL || 'https://api.fxratesapi.com/latest';
      const url = `${apiUrl}?base=USD`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        const data: any = await response.json();
        if (data && data.rates) {
          const saved = await this.exchangeRateModel.findOneAndUpdate(
            { baseCurrency: 'USD', rateDate: today },
            {
              $set: {
                baseCurrency: 'USD',
                rateDate: today,
                rates: { ...FALLBACK_USD_RATES, ...data.rates, USD: 1 },
                fetchedAt: new Date(),
              },
            },
            { upsert: true, new: true },
          );
          return saved.toObject();
        }
      }
    } catch (err) {
      this.logger.warn('FXRatesAPI unreachable or offline; using cached/fallback exchange rates (ITN-18).');
    }

    // Fallback to most recent cached rate in DB or built-in rates (ITN-18)
    const lastCached = await this.exchangeRateModel
      .findOne({ baseCurrency: 'USD' })
      .sort({ rateDate: -1 })
      .lean();

    if (lastCached) {
      return lastCached;
    }

    const seeded = await this.exchangeRateModel.findOneAndUpdate(
      { baseCurrency: 'USD', rateDate: today },
      {
        $set: {
          baseCurrency: 'USD',
          rateDate: today,
          rates: FALLBACK_USD_RATES,
          fetchedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );
    return seeded.toObject();
  }

  private convertCurrency(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    usdRates: Record<string, number>,
  ): number {
    const from = (fromCurrency || 'USD').toUpperCase();
    const to = (toCurrency || 'USD').toUpperCase();
    if (from === to) return Math.round(amount * 100) / 100;

    const fromRate = usdRates[from];
    const toRate = usdRates[to];
    if (!fromRate || !toRate) {
      throw new BadRequestException(`Unavailable exchange rate for currency conversion (${from} -> ${to}).`);
    }

    const inUsd = amount / fromRate;
    return Math.round(inUsd * toRate * 100) / 100;
  }

  async createItinerary(userId: string, dto: CreateItineraryDto) {
    const validCountries = await this.referenceService.getCountries();
    const validCodes = new Set(validCountries.map((c) => c.code.toUpperCase()));

    const normalizedCountries = dto.countries.map((c) => c.trim().toUpperCase());
    for (const code of normalizedCountries) {
      if (!validCodes.has(code)) {
        throw new BadRequestException(`Country '${code}' is not in the predefined country list (ITN-01, GEN-12).`);
      }
    }

    if (isNaN(new Date(dto.startDate).getTime())) {
      throw new BadRequestException('Invalid startDate.');
    }

    return this.itineraryModel.create({
      ownerId: new Types.ObjectId(userId),
      title: dto.title.trim(),
      countries: normalizedCountries,
      startDate: dto.startDate.slice(0, 10),
      visibility: 'private',
      days: [],
    });
  }

  async listMyItineraries(userId: string) {
    return this.itineraryModel
      .find({ ownerId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .lean();
  }

  private buildCityGroups(days: any[], daySubtotals: Record<string, number>) {
    // ITN-09: display consecutive days in the same city as a group, with the group's day count and budget subtotal
    const groups: any[] = [];
    for (const day of days) {
      const daySubtotal = daySubtotals[day._id.toString()] || 0;
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.city_id === day.city_id) {
        lastGroup.dayCount += 1;
        lastGroup.endDate = day.date;
        lastGroup.endDayNumber = day.dayNumber;
        lastGroup.budgetSubtotal = Math.round((lastGroup.budgetSubtotal + daySubtotal) * 100) / 100;
        lastGroup.days.push(day);
      } else {
        groups.push({
          groupIndex: groups.length,
          city_id: day.city_id,
          startDayNumber: day.dayNumber,
          endDayNumber: day.dayNumber,
          startDate: day.date,
          endDate: day.date,
          dayCount: 1,
          budgetSubtotal: Math.round(daySubtotal * 100) / 100,
          days: [day],
        });
      }
    }
    return groups;
  }

  async getItineraryById(user: any, itineraryId: string, displayCurrency?: string) {
    if (!Types.ObjectId.isValid(itineraryId)) {
      throw new BadRequestException('Invalid itinerary ID.');
    }
    const itinerary = await this.itineraryModel.findById(itineraryId).lean();
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found.');
    }

    const isOwner = user && itinerary.ownerId.toString() === user.id;
    const isAdmin = user && user.role === UserRole.ADMIN;

    if (itinerary.visibility === 'private' && !isOwner && !isAdmin) {
      throw new ForbiddenException('Private itineraries are accessible only to their owners (ACC-11, ITN-20).');
    }

    const targetCurrency = (displayCurrency || user?.preferredCurrency || 'USD').toUpperCase();
    const budgetSummary = await this.getBudgetSummary(user, itineraryId, targetCurrency);

    const [activities, budgetEntries, transportCosts] = await Promise.all([
      this.activityModel.find({ itineraryId: itinerary._id }).lean(),
      this.budgetEntryModel.find({ itineraryId: itinerary._id }).lean(),
      this.transportCostModel.find({ itineraryId: itinerary._id }).lean(),
    ]);

    const daySubtotals: Record<string, number> = {};
    for (const d of budgetSummary.byDay) {
      daySubtotals[d.dayId] = d.totalInDisplayCurrency;
    }

    const cityGroups = this.buildCityGroups(itinerary.days, daySubtotals);

    return {
      ...itinerary,
      cityGroups,
      activities,
      budgetEntries,
      transportCosts,
      budgetSummary,
    };
  }

  async updateItinerary(userId: string, itineraryId: string, dto: UpdateItineraryDto) {
    const itinerary = await this.itineraryModel.findById(itineraryId);
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found.');
    }
    this.assertOwner(itinerary, userId);

    if (dto.title !== undefined) {
      itinerary.title = dto.title.trim();
    }
    if (dto.countries !== undefined) {
      const validCountries = await this.referenceService.getCountries();
      const validCodes = new Set(validCountries.map((c) => c.code.toUpperCase()));
      const normalized = dto.countries.map((c) => c.trim().toUpperCase());
      for (const code of normalized) {
        if (!validCodes.has(code)) {
          throw new BadRequestException(`Country '${code}' is not in the predefined list.`);
        }
      }
      itinerary.countries = normalized;
    }
    if (dto.startDate !== undefined) {
      if (isNaN(new Date(dto.startDate).getTime())) {
        throw new BadRequestException('Invalid startDate.');
      }
      itinerary.startDate = dto.startDate.slice(0, 10);
      this.recalculateDayNumbersAndDates(itinerary);
    }
    if (dto.visibility !== undefined) {
      itinerary.visibility = dto.visibility;
    }

    await itinerary.save();
    return itinerary;
  }

  async deleteItinerary(userId: string, itineraryId: string, confirmed = true) {
    if (!confirmed) {
      throw new BadRequestException('Confirmation is required to delete an itinerary (ITN-01, GEN-03).');
    }
    const itinerary = await this.itineraryModel.findById(itineraryId);
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found.');
    }
    this.assertOwner(itinerary, userId);

    await Promise.all([
      this.activityModel.deleteMany({ itineraryId: itinerary._id }),
      this.budgetEntryModel.deleteMany({ itineraryId: itinerary._id }),
      this.transportCostModel.deleteMany({ itineraryId: itinerary._id }),
      this.itineraryModel.deleteOne({ _id: itinerary._id }),
    ]);

    return {
      message:
        'Itinerary deleted. Clones previously created by other users remain unaffected (ITN-01).',
    };
  }

  async addDay(userId: string, itineraryId: string, dto: AddItineraryDayDto) {
    const itinerary = await this.itineraryModel.findById(itineraryId);
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found.');
    }
    this.assertOwner(itinerary, userId);

    if (itinerary.days.length >= 60) {
      throw new BadRequestException('An itinerary can have at most 60 days (ITN-05).');
    }

    const cities = await this.referenceService.getCities();
    const cityObj = cities.find((c) => c.city_id === dto.city_id.trim().toLowerCase());
    if (!cityObj) {
      throw new BadRequestException(`City '${dto.city_id}' is not in the predefined city list (ITN-05, GEN-12).`);
    }

    const nextDayNumber = itinerary.days.length + 1;
    itinerary.days.push({
      dayNumber: nextDayNumber,
      date: this.deriveDayDate(itinerary.startDate, nextDayNumber),
      city_id: cityObj.city_id,
      notes: dto.notes || '',
    });

    await itinerary.save();
    return itinerary;
  }

  async updateDay(
    userId: string,
    itineraryId: string,
    dayId: string,
    dto: UpdateItineraryDayDto,
  ) {
    const itinerary = await this.itineraryModel.findById(itineraryId);
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found.');
    }
    this.assertOwner(itinerary, userId);

    const day = itinerary.days.find((d) => d._id?.toString() === dayId);
    if (!day) {
      throw new NotFoundException('Itinerary day not found.');
    }

    if (dto.city_id !== undefined) {
      const cities = await this.referenceService.getCities();
      const cityObj = cities.find((c) => c.city_id === dto.city_id.trim().toLowerCase());
      if (!cityObj) {
        throw new BadRequestException(`City '${dto.city_id}' is not in the predefined city list.`);
      }
      day.city_id = cityObj.city_id;
    }

    if (dto.notes !== undefined) {
      day.notes = dto.notes;
    }

    await itinerary.save();
    return itinerary;
  }

  async deleteDay(userId: string, itineraryId: string, dayId: string) {
    const itinerary = await this.itineraryModel.findById(itineraryId);
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found.');
    }
    this.assertOwner(itinerary, userId);

    const idx = itinerary.days.findIndex((d) => d._id?.toString() === dayId);
    if (idx === -1) {
      throw new NotFoundException('Itinerary day not found.');
    }

    const removedDay = itinerary.days[idx];
    itinerary.days.splice(idx, 1);
    this.recalculateDayNumbersAndDates(itinerary);
    await itinerary.save();

    await Promise.all([
      this.activityModel.deleteMany({ itineraryId: itinerary._id, dayId: removedDay._id }),
      this.budgetEntryModel.deleteMany({ itineraryId: itinerary._id, dayId: removedDay._id }),
    ]);

    return itinerary;
  }

  async reorderDays(userId: string, itineraryId: string, dto: ReorderDaysDto) {
    const itinerary = await this.itineraryModel.findById(itineraryId);
    if (!itinerary) {
      throw new NotFoundException('Itinerary not found.');
    }
    this.assertOwner(itinerary, userId);

    if (dto.orderedDayIds && dto.orderedDayIds.length === itinerary.days.length) {
      const dayMap = new Map(itinerary.days.map((d) => [d._id.toString(), d]));
      const reordered = dto.orderedDayIds.map((id) => {
        const d = dayMap.get(id);
        if (!d) throw new BadRequestException(`Day ID ${id} does not belong to this itinerary.`);
        return d;
      });
      itinerary.days = reordered;
    } else if (dto.dayId && dto.newPosition !== undefined) {
      const currentIdx = itinerary.days.findIndex((d) => d._id?.toString() === dto.dayId);
      if (currentIdx === -1) {
        throw new NotFoundException('Day to move not found.');
      }
      const targetIdx = Math.max(0, Math.min(itinerary.days.length - 1, dto.newPosition - 1));
      const [moved] = itinerary.days.splice(currentIdx, 1);
      itinerary.days.splice(targetIdx, 0, moved);
    } else {
      throw new BadRequestException(
        'Provide either (dayId and newPosition) or orderedDayIds array (ITN-08).',
      );
    }

    this.recalculateDayNumbersAndDates(itinerary);
    await itinerary.save();
    return itinerary;
  }

  async addActivity(
    userId: string,
    itineraryId: string,
    dayId: string,
    dto: CreateActivityDto,
  ) {
    const itinerary = await this.itineraryModel.findById(itineraryId);
    if (!itinerary) throw new NotFoundException('Itinerary not found.');
    this.assertOwner(itinerary, userId);

    const day = itinerary.days.find((d) => d._id?.toString() === dayId);
    if (!day) throw new NotFoundException('Day not found in this itinerary.');

    return this.activityModel.create({
      itineraryId: itinerary._id,
      dayId: day._id,
      name: dto.name.trim(),
      description: dto.description || '',
      time: dto.time || '',
      cost: dto.cost || 0,
      currency: (dto.currency || 'USD').toUpperCase(),
      images: [],
    });
  }

  async updateActivity(userId: string, activityId: string, dto: UpdateActivityDto) {
    const activity = await this.activityModel.findById(activityId);
    if (!activity) throw new NotFoundException('Activity not found.');

    const itinerary = await this.itineraryModel.findById(activity.itineraryId);
    this.assertOwner(itinerary, userId);

    if (dto.name !== undefined) activity.name = dto.name.trim();
    if (dto.description !== undefined) activity.description = dto.description;
    if (dto.time !== undefined) activity.time = dto.time;
    if (dto.cost !== undefined) activity.cost = dto.cost;
    if (dto.currency !== undefined) activity.currency = dto.currency.toUpperCase();

    await activity.save();
    return activity;
  }

  async deleteActivity(userId: string, activityId: string) {
    const activity = await this.activityModel.findById(activityId);
    if (!activity) throw new NotFoundException('Activity not found.');

    const itinerary = await this.itineraryModel.findById(activity.itineraryId);
    this.assertOwner(itinerary, userId);

    await this.activityModel.deleteOne({ _id: activity._id });
    return { message: 'Activity deleted.' };
  }

  async addActivityImage(
    userId: string,
    activityId: string,
    file?: Express.Multer.File,
    imageUrl?: string,
  ) {
    const activity = await this.activityModel.findById(activityId);
    if (!activity) throw new NotFoundException('Activity not found.');

    const itinerary = await this.itineraryModel.findById(activity.itineraryId);
    this.assertOwner(itinerary, userId);

    if (activity.images.length >= 5) {
      throw new BadRequestException('An activity can have at most 5 images (GEN-08, ITN-12).');
    }

    const media = file
      ? this.uploadsService.validateAndSaveImage(file, 'activity')
      : {
          imageId: `act-${Date.now()}`,
          url: imageUrl || '/uploads/sample-activity.jpg',
        };

    activity.images.push(media);
    await activity.save();
    return activity;
  }

  async removeActivityImage(userId: string, activityId: string, imageId: string) {
    const activity = await this.activityModel.findById(activityId);
    if (!activity) throw new NotFoundException('Activity not found.');

    const itinerary = await this.itineraryModel.findById(activity.itineraryId);
    this.assertOwner(itinerary, userId);

    activity.images = activity.images.filter((img) => img.imageId !== imageId);
    await activity.save();
    return activity;
  }

  async addBudgetEntry(
    userId: string,
    itineraryId: string,
    dayId: string,
    dto: CreateBudgetEntryDto,
  ) {
    const itinerary = await this.itineraryModel.findById(itineraryId);
    if (!itinerary) throw new NotFoundException('Itinerary not found.');
    this.assertOwner(itinerary, userId);

    const day = itinerary.days.find((d) => d._id?.toString() === dayId);
    if (!day) throw new NotFoundException('Day not found in itinerary.');

    const supported = await this.referenceService.getSupportedCurrencies();
    const currency = dto.currency.trim().toUpperCase();
    if (!supported.includes(currency)) {
      throw new BadRequestException(`Unsupported currency code '${currency}' (ITN-18).`);
    }

    return this.budgetEntryModel.create({
      itineraryId: itinerary._id,
      dayId: day._id,
      category: dto.category,
      amount: dto.amount,
      currency,
      note: dto.note || '',
    });
  }

  async updateBudgetEntry(userId: string, budgetId: string, dto: UpdateBudgetEntryDto) {
    const entry = await this.budgetEntryModel.findById(budgetId);
    if (!entry) throw new NotFoundException('Budget entry not found.');

    const itinerary = await this.itineraryModel.findById(entry.itineraryId);
    this.assertOwner(itinerary, userId);

    if (dto.currency !== undefined) {
      const supported = await this.referenceService.getSupportedCurrencies();
      const currency = dto.currency.trim().toUpperCase();
      if (!supported.includes(currency)) {
        throw new BadRequestException(`Unsupported currency code '${currency}'.`);
      }
      entry.currency = currency;
    }
    if (dto.category !== undefined) entry.category = dto.category;
    if (dto.amount !== undefined) entry.amount = dto.amount;
    if (dto.note !== undefined) entry.note = dto.note;

    await entry.save();
    return entry;
  }

  async deleteBudgetEntry(userId: string, budgetId: string) {
    const entry = await this.budgetEntryModel.findById(budgetId);
    if (!entry) throw new NotFoundException('Budget entry not found.');

    const itinerary = await this.itineraryModel.findById(entry.itineraryId);
    this.assertOwner(itinerary, userId);

    await this.budgetEntryModel.deleteOne({ _id: entry._id });
    return { message: 'Budget entry deleted.' };
  }

  async addTransportCost(
    userId: string,
    itineraryId: string,
    dto: CreateTransportCostDto,
  ) {
    const itinerary = await this.itineraryModel.findById(itineraryId);
    if (!itinerary) throw new NotFoundException('Itinerary not found.');
    this.assertOwner(itinerary, userId);

    const supported = await this.referenceService.getSupportedCurrencies();
    const currency = dto.currency.trim().toUpperCase();
    if (!supported.includes(currency)) {
      throw new BadRequestException(`Unsupported currency code '${currency}'.`);
    }

    return this.transportCostModel.create({
      itineraryId: itinerary._id,
      dayNumber: dto.dayNumber,
      mode: dto.mode.trim(),
      fromCity: dto.fromCity.trim().toLowerCase(),
      toCity: dto.toCity.trim().toLowerCase(),
      amount: dto.amount,
      currency,
    });
  }

  async updateTransportCost(userId: string, id: string, dto: UpdateTransportCostDto) {
    const tc = await this.transportCostModel.findById(id);
    if (!tc) throw new NotFoundException('Transport cost entry not found.');

    const itinerary = await this.itineraryModel.findById(tc.itineraryId);
    this.assertOwner(itinerary, userId);

    if (dto.dayNumber !== undefined) tc.dayNumber = dto.dayNumber;
    if (dto.mode !== undefined) tc.mode = dto.mode.trim();
    if (dto.fromCity !== undefined) tc.fromCity = dto.fromCity.trim().toLowerCase();
    if (dto.toCity !== undefined) tc.toCity = dto.toCity.trim().toLowerCase();
    if (dto.amount !== undefined) tc.amount = dto.amount;
    if (dto.currency !== undefined) tc.currency = dto.currency.trim().toUpperCase();

    await tc.save();
    return tc;
  }

  async deleteTransportCost(userId: string, id: string) {
    const tc = await this.transportCostModel.findById(id);
    if (!tc) throw new NotFoundException('Transport cost entry not found.');

    const itinerary = await this.itineraryModel.findById(tc.itineraryId);
    this.assertOwner(itinerary, userId);

    await this.transportCostModel.deleteOne({ _id: tc._id });
    return { message: 'Transport cost entry deleted.' };
  }

  async getBudgetSummary(user: any, itineraryId: string, currencyQuery?: string) {
    const itinerary = await this.itineraryModel.findById(itineraryId).lean();
    if (!itinerary) throw new NotFoundException('Itinerary not found.');

    if (
      itinerary.visibility === 'private' &&
      (!user || (itinerary.ownerId.toString() !== user.id && user.role !== UserRole.ADMIN))
    ) {
      throw new ForbiddenException('Access denied to private itinerary budget.');
    }

    const displayCurrency = (currencyQuery || user?.preferredCurrency || 'USD').toUpperCase();
    const supported = await this.referenceService.getSupportedCurrencies();
    if (!supported.includes(displayCurrency)) {
      throw new BadRequestException(
        `Invalid display currency '${displayCurrency}'. Supported currencies: ${supported.join(', ')} (ITN-18).`,
      );
    }

    const rateRecord = await this.getOrFetchExchangeRates('USD');
    const rates = rateRecord.rates;

    const [budgetEntries, activities, transportCosts] = await Promise.all([
      this.budgetEntryModel.find({ itineraryId: itinerary._id }).lean(),
      this.activityModel.find({ itineraryId: itinerary._id }).lean(),
      this.transportCostModel.find({ itineraryId: itinerary._id }).lean(),
    ]);

    const byCategory: Record<string, number> = {
      food: 0,
      accommodation: 0,
      local_transportation: 0,
      activities: 0,
      intercity_transportation: 0,
    };

    const byDayMap = new Map<string, number>();
    for (const day of itinerary.days) {
      byDayMap.set(day._id.toString(), 0);
    }

    for (const entry of budgetEntries) {
      const converted = this.convertCurrency(entry.amount, entry.currency, displayCurrency, rates);
      byCategory[entry.category] = Math.round(((byCategory[entry.category] || 0) + converted) * 100) / 100;
      const dayKey = entry.dayId.toString();
      byDayMap.set(dayKey, Math.round(((byDayMap.get(dayKey) || 0) + converted) * 100) / 100);
    }

    // ITN-14: Totals include activity costs from ITN-10 (counted under Activities)
    for (const act of activities) {
      if (act.cost && act.cost > 0) {
        const converted = this.convertCurrency(act.cost, act.currency || 'USD', displayCurrency, rates);
        byCategory.activities = Math.round((byCategory.activities + converted) * 100) / 100;
        const dayKey = act.dayId.toString();
        byDayMap.set(dayKey, Math.round(((byDayMap.get(dayKey) || 0) + converted) * 100) / 100);
      }
    }

    // ITN-14 & ITN-16: intercity transport entries
    for (const tc of transportCosts) {
      const converted = this.convertCurrency(tc.amount, tc.currency, displayCurrency, rates);
      byCategory.intercity_transportation =
        Math.round((byCategory.intercity_transportation + converted) * 100) / 100;
      const matchingDay = itinerary.days.find((d) => d.dayNumber === tc.dayNumber);
      if (matchingDay) {
        const dayKey = matchingDay._id.toString();
        byDayMap.set(dayKey, Math.round(((byDayMap.get(dayKey) || 0) + converted) * 100) / 100);
      }
    }

    const byDay = itinerary.days.map((d) => ({
      dayId: d._id.toString(),
      dayNumber: d.dayNumber,
      date: d.date,
      city_id: d.city_id,
      totalInDisplayCurrency: byDayMap.get(d._id.toString()) || 0,
    }));

    const grandTotal =
      Math.round(
        Object.values(byCategory).reduce((sum, val) => sum + val, 0) * 100,
      ) / 100;

    return {
      itineraryId: itinerary._id,
      displayCurrency,
      exchangeRateDate: rateRecord.rateDate,
      byCategory,
      byDay,
      grandTotal,
    };
  }

  async searchPublicItineraries(query: SearchPublicItinerariesQueryDto) {
    const filter: any = { visibility: 'public', isHidden: { $ne: true } };

    if (query.country) {
      filter.countries = query.country.trim().toUpperCase();
    }
    if (query.city) {
      filter['days.city_id'] = query.city.trim().toLowerCase();
    }
    if (query.keyword) {
      const regex = new RegExp(query.keyword.trim(), 'i');
      filter.$or = [
        { title: regex },
        { countries: regex },
        { 'days.city_id': regex },
      ];
    }

    const itineraries = await this.itineraryModel
      .find(filter)
      .populate('ownerId', 'name')
      .sort({ updatedAt: -1 })
      .lean();

    const filteredByDuration = itineraries.filter((itn) => {
      const duration = (itn.days || []).length;
      if (query.minDays !== undefined && duration < query.minDays) return false;
      if (query.maxDays !== undefined && duration > query.maxDays) return false;
      return true;
    });

    const page = query.page || 1;
    const limit = query.limit || 10;
    const paged = filteredByDuration.slice((page - 1) * limit, page * limit);

    return paginateResult(paged, filteredByDuration.length, page, limit);
  }

  async getPublicItineraryById(itineraryId: string, currency?: string) {
    const itinerary = await this.itineraryModel
      .findOne({ _id: itineraryId, visibility: 'public', isHidden: { $ne: true } })
      .populate('ownerId', 'name')
      .lean();

    if (!itinerary) {
      throw new NotFoundException('Public itinerary not found.');
    }

    return this.getItineraryById(
      { id: itinerary.ownerId?._id?.toString() || itinerary.ownerId?.toString(), role: UserRole.ADMIN },
      itineraryId,
      currency || 'USD',
    );
  }

  async clonePublicItinerary(userId: string, itineraryId: string) {
    const source = await this.itineraryModel
      .findOne({ _id: itineraryId, visibility: 'public', isHidden: { $ne: true } })
      .populate('ownerId', 'name')
      .lean();

    if (!source) {
      throw new NotFoundException('Public itinerary not found for cloning (ITN-21).');
    }

    const oldToNewDayId = new Map<string, Types.ObjectId>();
    const clonedDays = (source.days || []).map((d) => {
      const newDayId = new Types.ObjectId();
      oldToNewDayId.set(d._id.toString(), newDayId);
      return {
        _id: newDayId,
        dayNumber: d.dayNumber,
        date: d.date,
        city_id: d.city_id,
        notes: d.notes,
      };
    });

    const authorObj: any = source.ownerId;
    const clone = await this.itineraryModel.create({
      ownerId: new Types.ObjectId(userId),
      title: `${source.title} (Copy)`,
      countries: source.countries,
      startDate: source.startDate,
      visibility: 'private',
      days: clonedDays,
      clonedFromItineraryId: source._id,
      originalAuthorId: authorObj?._id || source.ownerId,
      originalAuthorName: authorObj?.name || 'Traveler',
    });

    const [activities, budgets, transports] = await Promise.all([
      this.activityModel.find({ itineraryId: source._id }).lean(),
      this.budgetEntryModel.find({ itineraryId: source._id }).lean(),
      this.transportCostModel.find({ itineraryId: source._id }).lean(),
    ]);

    for (const act of activities) {
      const mappedDayId = oldToNewDayId.get(act.dayId.toString());
      if (mappedDayId) {
        await this.activityModel.create({
          itineraryId: clone._id,
          dayId: mappedDayId,
          name: act.name,
          description: act.description,
          time: act.time,
          cost: act.cost,
          currency: act.currency,
          images: act.images || [],
        });
      }
    }

    for (const b of budgets) {
      const mappedDayId = oldToNewDayId.get(b.dayId.toString());
      if (mappedDayId) {
        await this.budgetEntryModel.create({
          itineraryId: clone._id,
          dayId: mappedDayId,
          category: b.category,
          amount: b.amount,
          currency: b.currency,
          note: b.note,
        });
      }
    }

    for (const tc of transports) {
      await this.transportCostModel.create({
        itineraryId: clone._id,
        dayNumber: tc.dayNumber,
        mode: tc.mode,
        fromCity: tc.fromCity,
        toCity: tc.toCity,
        amount: tc.amount,
        currency: tc.currency,
      });
    }

    return {
      message:
        'Public itinerary cloned into an independent private copy with original author attribution (ITN-21).',
      itinerary: clone,
    };
  }

  async searchHotelsForItineraryCityGroup(
    userId: string,
    itineraryId: string,
    groupIndex = 0,
    guests = 2,
    rooms = 1,
  ) {
    const detailed = await this.getItineraryById({ id: userId, role: UserRole.REGISTERED_USER }, itineraryId);
    const group = detailed.cityGroups[groupIndex] || detailed.cityGroups[0];
    if (!group) {
      throw new BadRequestException('Itinerary has no city groups yet. Add days first (ITN-25).');
    }

    // ITN-25: check-in = date of group's first day, check-out = day after its last day
    const lastDayDate = new Date(group.endDate);
    const checkOutDate = new Date(lastDayDate.getTime() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    return this.hotelsService.searchHotels({
      city: group.city_id,
      checkInDate: group.startDate,
      checkOutDate,
      guests,
      rooms,
    });
  }

  async searchFlightsForItinerary(
    userId: string,
    itineraryId: string,
    originAirport: string,
    roundTrip = false,
    adults = 1,
  ) {
    const itinerary = await this.itineraryModel.findById(itineraryId).lean();
    if (!itinerary) throw new NotFoundException('Itinerary not found.');
    this.assertOwner(itinerary, userId);

    if (!itinerary.days || itinerary.days.length === 0) {
      throw new BadRequestException('Add at least one day to the itinerary to search flights (ITN-26).');
    }

    const firstDay = itinerary.days[0];
    const lastDay = itinerary.days[itinerary.days.length - 1];

    const airports = await this.referenceService.getAirports();
    const destinationAirport = airports.find((a) => a.city_id === firstDay.city_id);
    if (!destinationAirport) {
      throw new NotFoundException(`No airport found for city '${firstDay.city_id}'.`);
    }

    return this.flightsService.searchFlights({
      departureAirport: originAirport.toUpperCase(),
      arrivalAirport: destinationAirport.iata_code,
      departureDate: itinerary.startDate,
      returnDate: roundTrip ? lastDay.date : undefined,
      adults,
    });
  }

  async attachBookingToItinerary(userId: string, itineraryId: string, body: any) {
    const itinerary = await this.itineraryModel.findById(itineraryId);
    if (!itinerary) throw new NotFoundException('Itinerary not found.');
    this.assertOwner(itinerary, userId);

    itinerary.attachedBookings.push({
      bookingType: body.bookingType,
      bookingId: body.bookingId,
      attachedAt: new Date(),
    });
    await itinerary.save();
    return itinerary;
  }

  async exportItineraryPdf(user: any, itineraryId: string): Promise<Buffer> {
    const data = await this.getItineraryById(user, itineraryId);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text(`ITINERARY: ${data.title}`, { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Countries: ${(data.countries || []).join(', ')}`);
      doc.text(`Start Date: ${data.startDate}`);
      doc.text(
        `Total Budget (${data.budgetSummary.displayCurrency}): ${data.budgetSummary.grandTotal}`,
      );
      doc.moveDown();

      for (const day of data.days || []) {
        doc
          .fontSize(13)
          .text(`Day ${day.dayNumber} (${day.date}) — City: ${day.city_id.toUpperCase()}`);
        if (day.notes) {
          doc.fontSize(10).text(`Notes: ${day.notes}`);
        }
        doc.moveDown(0.5);
      }

      doc.end();
    });
  }
}
