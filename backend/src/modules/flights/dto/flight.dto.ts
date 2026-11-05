import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CABIN_CATEGORIES, CabinCategoryType } from '../schemas/flight.schema';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateFlightDto {
  @ApiProperty({ example: 'MS800' })
  @IsString()
  @IsNotEmpty()
  flightNumber: string;

  @ApiProperty({ example: 'CAI', description: 'IATA code from predefined Airports.csv (FLT-02)' })
  @IsString()
  @IsNotEmpty()
  departureAirport: string;

  @ApiProperty({ example: 'CDG', description: 'IATA code from predefined Airports.csv (FLT-02)' })
  @IsString()
  @IsNotEmpty()
  arrivalAirport: string;

  @ApiProperty({
    example: '2026-12-15T09:30',
    description: 'Local date-time at departure airport (FLT-03, GEN-06)',
  })
  @IsString()
  @IsNotEmpty()
  departureTimeLocal: string;

  @ApiProperty({
    example: '2026-12-15T13:15',
    description: 'Local date-time at arrival airport (FLT-03, GEN-06)',
  })
  @IsString()
  @IsNotEmpty()
  arrivalTimeLocal: string;
}

export class UpdateFlightDto {
  @ApiPropertyOptional({ example: '2026-12-15T10:00' })
  @IsOptional()
  @IsString()
  departureTimeLocal?: string;

  @ApiPropertyOptional({ example: '2026-12-15T13:45' })
  @IsOptional()
  @IsString()
  arrivalTimeLocal?: string;

  @ApiPropertyOptional({ example: 'CAI' })
  @IsOptional()
  @IsString()
  departureAirport?: string;

  @ApiPropertyOptional({ example: 'CDG' })
  @IsOptional()
  @IsString()
  arrivalAirport?: string;
}

export class CreateCabinDto {
  @ApiProperty({ enum: CABIN_CATEGORIES, example: 'Economy' })
  @IsEnum(CABIN_CATEGORIES)
  category: CabinCategoryType;

  @ApiProperty({ example: 150, minimum: 1 })
  @IsInt()
  @Min(1)
  seatCount: number;

  @ApiProperty({ example: 320, minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  price: number;

  @ApiProperty({ example: 1, minimum: 0 })
  @IsInt()
  @Min(0)
  freeBaggageCount: number;

  @ApiProperty({ example: 23, minimum: 1 })
  @IsNumber()
  @Min(1)
  maxBagWeightKg: number;
}

export class UpdateCabinDto {
  @ApiPropertyOptional({ example: 160, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  seatCount?: number;

  @ApiPropertyOptional({ example: 345, minimum: 0.01 })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  price?: number;

  @ApiPropertyOptional({ example: 2, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  freeBaggageCount?: number;

  @ApiPropertyOptional({ example: 23, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxBagWeightKg?: number;
}

export class SearchFlightsQueryDto extends PaginationQueryDto {
  @ApiProperty({ example: 'CAI' })
  @IsString()
  @IsNotEmpty()
  departureAirport: string;

  @ApiProperty({ example: 'DXB' })
  @IsString()
  @IsNotEmpty()
  arrivalAirport: string;

  @ApiProperty({ example: '2026-12-15', description: 'Local departure date YYYY-MM-DD' })
  @IsString()
  @IsNotEmpty()
  departureDate: string;

  @ApiPropertyOptional({
    example: '2026-12-22',
    description: 'Optional return date for round-trip search (FLT-12)',
  })
  @IsOptional()
  @IsString()
  returnDate?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  adults?: number = 1;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  children?: number = 0;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  infants?: number = 0;

  @ApiPropertyOptional({ enum: CABIN_CATEGORIES })
  @IsOptional()
  @IsEnum(CABIN_CATEGORIES)
  cabinClass?: CabinCategoryType;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ enum: ['price', 'duration', 'departureTime'], default: 'departureTime' })
  @IsOptional()
  @IsEnum(['price', 'duration', 'departureTime'])
  sortBy?: 'price' | 'duration' | 'departureTime' = 'departureTime';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'asc';
}
