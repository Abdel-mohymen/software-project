import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Airline, AirlineDocument } from './schemas/airline.schema';
import {
  BaggagePolicyDto,
  CreateAirlineDto,
  UpdateAirlineDto,
  UpdateCancellationPolicyDto,
} from './dto/airline.dto';
import { UserRole } from '../../common/enums/role.enum';

@Injectable()
export class AirlinesService {
  constructor(
    @InjectModel(Airline.name) private readonly airlineModel: Model<AirlineDocument>,
  ) {}

  private assertModeratorOwnership(user: any, airlineId: string) {
    if (user.role === UserRole.ADMIN) return;
    if (
      user.role !== UserRole.AIRLINE_MODERATOR ||
      user.assignedProviderType !== 'airline' ||
      user.assignedProviderId?.toString() !== airlineId
    ) {
      throw new ForbiddenException('You may only manage your assigned airline (ACC-11, FLT-01).');
    }
  }

  async createAirline(dto: CreateAirlineDto) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.airlineModel.findOne({ code });
    if (existing) {
      throw new ConflictException(`Airline with code '${code}' already exists.`);
    }
    return this.airlineModel.create({
      name: dto.name.trim(),
      code,
      logo: dto.logo || '',
      isActive: true,
    });
  }

  async getAirlineById(id: string) {
    const airline = await this.airlineModel.findById(id).lean();
    if (!airline) {
      throw new NotFoundException('Airline not found.');
    }
    return airline;
  }

  async updateAirline(user: any, id: string, dto: UpdateAirlineDto) {
    this.assertModeratorOwnership(user, id);
    const airline = await this.airlineModel.findById(id);
    if (!airline) {
      throw new NotFoundException('Airline not found.');
    }

    if (dto.name !== undefined) airline.name = dto.name.trim();
    if (dto.code !== undefined) airline.code = dto.code.trim().toUpperCase();
    if (dto.logo !== undefined) airline.logo = dto.logo.trim();

    await airline.save();
    return airline;
  }

  async updateBaggagePolicy(user: any, id: string, dto: BaggagePolicyDto) {
    this.assertModeratorOwnership(user, id);
    const airline = await this.airlineModel.findById(id);
    if (!airline) {
      throw new NotFoundException('Airline not found.');
    }

    airline.baggagePolicy = {
      extraBagPrice: dto.extraBagPrice,
      maxExtraBagsPerPassenger: dto.maxExtraBagsPerPassenger,
    };
    await airline.save();
    return airline;
  }

  async updateCancellationPolicy(user: any, id: string, dto: UpdateCancellationPolicyDto) {
    this.assertModeratorOwnership(user, id);
    const thresholds = new Set<number>();
    for (const tier of dto.tiers) {
      if (thresholds.has(tier.daysBeforeDeparture)) {
        throw new BadRequestException(
          `Duplicate daysBeforeDeparture threshold: ${tier.daysBeforeDeparture} (FLT-09).`,
        );
      }
      thresholds.add(tier.daysBeforeDeparture);
    }

    const sortedTiers = [...dto.tiers].sort(
      (a, b) => b.daysBeforeDeparture - a.daysBeforeDeparture,
    );

    const airline = await this.airlineModel.findByIdAndUpdate(
      id,
      { $set: { cancellationTiers: sortedTiers } },
      { new: true },
    );

    if (!airline) {
      throw new NotFoundException('Airline not found.');
    }

    return airline;
  }

  computeRefundPercentage(tiers: { daysBeforeDeparture: number; refundPercentage: number }[], departureUtc: Date): number {
    const msRemaining = new Date(departureUtc).getTime() - Date.now();
    const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
    if (daysRemaining < 0) return 0;

    // FLT-09: tier with the highest threshold not exceeding the days remaining
    const sorted = [...(tiers || [])].sort(
      (a, b) => b.daysBeforeDeparture - a.daysBeforeDeparture,
    );
    for (const tier of sorted) {
      if (tier.daysBeforeDeparture <= daysRemaining) {
        return tier.refundPercentage;
      }
    }
    return 0;
  }
}
