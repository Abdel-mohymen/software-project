import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateHotelDto {
  @ApiProperty({ example: 'Nile Ritz-Carlton Cairo' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '1113 Corniche El Nil, Downtown Cairo' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: 'cairo', description: 'city_id from predefined Cities.csv (GEN-12)' })
  @IsString()
  @IsNotEmpty()
  city_id: string;

  @ApiProperty({ example: 'EG', description: 'country_code from predefined Countries.csv (GEN-12)' })
  @IsString()
  @IsNotEmpty()
  country_code: string;

  @ApiPropertyOptional({ example: 'Five-star luxury hotel overlooking the Nile River.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String], description: 'Up to 5 image URLs (GEN-08)' })
  @IsOptional()
  @IsArray()
  photos?: string[];

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  starClass: number;

  @ApiPropertyOptional({ type: [String], example: ['WiFi', 'Pool', 'Breakfast', 'Gym'] })
  @IsOptional()
  @IsArray()
  amenities?: string[];
}

export class UpdateHotelDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country_code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  photos?: string[];

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  starClass?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  amenities?: string[];
}

export class CreateRoomDto {
  @ApiProperty({ example: '101', description: 'Unique room number/name within the hotel (HTL-03)' })
  @IsString()
  @IsNotEmpty()
  roomNumber: string;

  @ApiProperty({ example: 'Deluxe Nile View' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  beds: number;

  @ApiProperty({ example: 3, minimum: 1 })
  @IsInt()
  @Min(1)
  maxOccupancy: number;

  @ApiProperty({ example: 180, minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  pricePerNight: number;
}

export class UpdateRoomDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  beds?: number;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxOccupancy?: number;

  @ApiPropertyOptional({ minimum: 0.01 })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  pricePerNight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class DateRangeDto {
  @ApiProperty({ example: '2026-12-01' })
  @IsString()
  @IsNotEmpty()
  startDate: string;

  @ApiProperty({ example: '2026-12-31' })
  @IsString()
  @IsNotEmpty()
  endDate: string;

  @ApiPropertyOptional({ example: 'Seasonal availability / maintenance' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class SetRoomAvailabilityDto {
  @ApiProperty({ type: [DateRangeDto], description: 'Non-overlapping bookable date ranges (HTL-04)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DateRangeDto)
  availableRanges: DateRangeDto[];
}

export class UpdateRoomAvailabilityAndBlocksDto {
  @ApiPropertyOptional({ type: [DateRangeDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DateRangeDto)
  availableRanges?: DateRangeDto[];

  @ApiPropertyOptional({ type: [DateRangeDto], description: 'Blocked date ranges for maintenance (HTL-06)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DateRangeDto)
  blockedRanges?: DateRangeDto[];

  @ApiPropertyOptional({ description: 'Deactivate or reactivate room (HTL-06)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class HotelCancellationTierDto {
  @ApiProperty({ example: 5, minimum: 0 })
  @IsInt()
  @Min(0)
  daysBeforeCheckIn: number;

  @ApiProperty({ example: 100, minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  refundPercentage: number;
}

export class UpdateHotelPoliciesDto {
  @ApiProperty({ example: '14:00' })
  @IsString()
  @IsNotEmpty()
  checkInTime: string;

  @ApiProperty({ example: '11:00' })
  @IsString()
  @IsNotEmpty()
  checkOutTime: string;

  @ApiProperty({ type: [HotelCancellationTierDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HotelCancellationTierDto)
  cancellationTiers: HotelCancellationTierDto[];
}

export class SearchHotelsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: 'cairo', description: 'Filter by city_id (HTL-11)' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'EG', description: 'Filter by country_code (HTL-11)' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ example: '2026-12-15' })
  @IsString()
  @IsNotEmpty()
  checkInDate: string;

  @ApiProperty({ example: '2026-12-18' })
  @IsString()
  @IsNotEmpty()
  checkOutDate: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests: number;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rooms?: number = 1;

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

  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ enum: ['price', 'rating'], default: 'price' })
  @IsOptional()
  @IsString()
  sortBy?: 'price' | 'rating' = 'price';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc' = 'asc';
}
