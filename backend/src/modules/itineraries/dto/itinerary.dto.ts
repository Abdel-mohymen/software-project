import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BUDGET_CATEGORIES, BudgetCategoryType } from '../schemas/budget-entry.schema';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateItineraryDto {
  @ApiProperty({ example: 'Winter Escape across Egypt & France', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiProperty({ type: [String], example: ['EG', 'FR'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  countries: string[];

  @ApiProperty({ example: '2026-12-15' })
  @IsString()
  @IsNotEmpty()
  startDate: string;
}

export class UpdateItineraryDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  countries?: string[];

  @ApiPropertyOptional({ example: '2026-12-16' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ enum: ['private', 'public'] })
  @IsOptional()
  @IsEnum(['private', 'public'])
  visibility?: 'private' | 'public';
}

export class AddItineraryDayDto {
  @ApiProperty({ example: 'cairo', description: 'city_id from predefined Cities.csv (ITN-05)' })
  @IsString()
  @IsNotEmpty()
  city_id: string;

  @ApiPropertyOptional({ example: 'Arrival and Old Cairo walk' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateItineraryDayDto {
  @ApiPropertyOptional({ example: 'paris' })
  @IsOptional()
  @IsString()
  city_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReorderDaysDto {
  @ApiProperty({
    description: 'Day ID to move (or pass orderedDayIds array)',
    required: false,
  })
  @IsOptional()
  @IsString()
  dayId?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  newPosition?: number;

  @ApiPropertyOptional({
    type: [String],
    description: 'Alternative: complete ordered list of day ObjectIds',
  })
  @IsOptional()
  @IsArray()
  orderedDayIds?: string[];
}

export class CreateActivityDto {
  @ApiProperty({ example: 'Giza Pyramids Guided Tour' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Morning visit to the Great Pyramid and Sphinx' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @IsString()
  time?: string;

  @ApiPropertyOptional({ example: 45, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number = 0;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string = 'USD';
}

export class UpdateActivityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  time?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;
}

export class CreateBudgetEntryDto {
  @ApiProperty({ enum: BUDGET_CATEGORIES, example: 'food' })
  @IsEnum(BUDGET_CATEGORIES)
  category: BudgetCategoryType;

  @ApiProperty({ example: 60, minimum: 0 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ example: 'EGP' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiPropertyOptional({ example: 'Dinner by the Nile' })
  @IsOptional()
  @IsString()
  note?: string;
}

export class UpdateBudgetEntryDto {
  @ApiPropertyOptional({ enum: BUDGET_CATEGORIES })
  @IsOptional()
  @IsEnum(BUDGET_CATEGORIES)
  category?: BudgetCategoryType;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateTransportCostDto {
  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  dayNumber: number;

  @ApiProperty({ example: 'Flight' })
  @IsString()
  @IsNotEmpty()
  mode: string;

  @ApiProperty({ example: 'cairo' })
  @IsString()
  @IsNotEmpty()
  fromCity: string;

  @ApiProperty({ example: 'paris' })
  @IsString()
  @IsNotEmpty()
  toCity: string;

  @ApiProperty({ example: 280, minimum: 0 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @IsNotEmpty()
  currency: string;
}

export class UpdateTransportCostDto {
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  dayNumber?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fromCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  toCity?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;
}

export class SearchPublicItinerariesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Keyword matching title, country, or city (ITN-21)' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ example: 'EG' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'cairo' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minDays?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDays?: number;
}
