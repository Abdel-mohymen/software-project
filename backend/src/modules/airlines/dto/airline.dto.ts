import {
  IsArray,
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

export class CreateAirlineDto {
  @ApiProperty({ example: 'EgyptAir' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'MS' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ example: '/uploads/logo-ms.png' })
  @IsOptional()
  @IsString()
  logo?: string;
}

export class UpdateAirlineDto {
  @ApiPropertyOptional({ example: 'EgyptAir Airlines' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'MS' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: '/uploads/logo-ms.png' })
  @IsOptional()
  @IsString()
  logo?: string;
}

export class BaggagePolicyDto {
  @ApiProperty({ example: 40, description: 'Price per extra bag (>0) (FLT-08)' })
  @IsNumber()
  @Min(0.01)
  extraBagPrice: number;

  @ApiProperty({ example: 2, description: 'Maximum extra bags per passenger (>=0) (FLT-08)' })
  @IsInt()
  @Min(0)
  maxExtraBagsPerPassenger: number;
}

export class CancellationTierDto {
  @ApiProperty({ example: 7, description: 'Days before departure threshold (>=0) (FLT-09)' })
  @IsInt()
  @Min(0)
  daysBeforeDeparture: number;

  @ApiProperty({ example: 80, description: 'Refund percentage (0-100) (FLT-09)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  refundPercentage: number;
}

export class UpdateCancellationPolicyDto {
  @ApiProperty({ type: [CancellationTierDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CancellationTierDto)
  tiers: CancellationTierDto[];
}
