import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CABIN_CATEGORIES, CabinCategoryType } from '../../flights/schemas/flight.schema';

export class PassengerInputDto {
  @ApiProperty({ example: 'Abdella Hassan' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ example: '1999-05-14', description: 'YYYY-MM-DD validated against passengerType (FLT-12, FLT-19)' })
  @IsString()
  @IsNotEmpty()
  dateOfBirth: string;

  @ApiProperty({ example: 'A12345678' })
  @IsString()
  @IsNotEmpty()
  passportOrId: string;

  @ApiProperty({ enum: ['adult', 'child', 'infant'], example: 'adult' })
  @IsEnum(['adult', 'child', 'infant'])
  passengerType: 'adult' | 'child' | 'infant';

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  extraBags?: number = 0;

  @ApiPropertyOptional({ example: '12A' })
  @IsOptional()
  @IsString()
  seatNumber?: string;
}

export class CreateFlightBookingDto {
  @ApiProperty({ description: 'Outbound flight ObjectId' })
  @IsString()
  @IsNotEmpty()
  outboundFlightId: string;

  @ApiPropertyOptional({ description: 'Optional return flight ObjectId for round-trip (FLT-12)' })
  @IsOptional()
  @IsString()
  returnFlightId?: string;

  @ApiProperty({ enum: CABIN_CATEGORIES, example: 'Economy' })
  @IsEnum(CABIN_CATEGORIES)
  cabinCategory: CabinCategoryType;

  @ApiProperty({ type: [PassengerInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PassengerInputDto)
  passengers: PassengerInputDto[];
}

export class ChangeFlightDto {
  @ApiProperty({ description: 'New outbound flight ObjectId on the same route and cabin (FLT-27)' })
  @IsString()
  @IsNotEmpty()
  newOutboundFlightId: string;
}

export class SelectSeatDto {
  @ApiProperty({ example: 0, description: 'Index of passenger in booking.passengers array' })
  @IsInt()
  @Min(0)
  passengerIndex: number;

  @ApiProperty({ example: '14C' })
  @IsString()
  @IsNotEmpty()
  seatNumber: string;
}
