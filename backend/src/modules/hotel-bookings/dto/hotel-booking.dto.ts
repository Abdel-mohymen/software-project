import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RoomSelectionDto {
  @ApiProperty({ description: 'Room ObjectId' })
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @ApiProperty({ example: 2, minimum: 0 })
  @IsInt()
  @Min(0)
  adults: number;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  children?: number = 0;
}

export class CreateHotelBookingDto {
  @ApiProperty({ description: 'Hotel ObjectId' })
  @IsString()
  @IsNotEmpty()
  hotelId: string;

  @ApiProperty({ example: '2026-12-15' })
  @IsString()
  @IsNotEmpty()
  checkInDate: string;

  @ApiProperty({ example: '2026-12-18' })
  @IsString()
  @IsNotEmpty()
  checkOutDate: string;

  @ApiProperty({ type: [RoomSelectionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RoomSelectionDto)
  rooms: RoomSelectionDto[];
}

export class CreateReviewDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: 'Wonderful stay and great service!', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class UpdateReviewDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class ReplyToReviewDto {
  @ApiProperty({ example: 'Thank you for staying with us!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reply: string;
}
