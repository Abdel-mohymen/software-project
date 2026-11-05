import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from '../../auth/dto/auth.dto';
import { AccountStatus, UserRole } from '../../../common/enums/role.enum';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class CreateModeratorDto {
  @ApiProperty({ example: 'EgyptAir Moderator' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'mod.egyptair@giu-travel.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: [UserRole.AIRLINE_MODERATOR, UserRole.HOTEL_MODERATOR] })
  @IsEnum([UserRole.AIRLINE_MODERATOR, UserRole.HOTEL_MODERATOR])
  role: UserRole.AIRLINE_MODERATOR | UserRole.HOTEL_MODERATOR;

  @ApiProperty({ description: 'MongoDB ObjectId of the assigned Airline or Hotel (ACC-13)' })
  @IsString()
  @IsNotEmpty()
  providerId: string;

  @ApiProperty({ example: 'TempMod123' })
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  temporaryPassword: string;
}

export class AdminResetPasswordDto {
  @ApiProperty({ example: 'TempReset123' })
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  temporaryPassword: string;
}

export class AccountListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by name or email (ACC-14)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;
}

export class AdminBookingListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['flight', 'hotel'] })
  @IsOptional()
  @IsString()
  type?: 'flight' | 'hotel';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsString()
  endDate?: string;
}

export class CreateReportDto {
  @ApiProperty({ enum: ['post', 'comment', 'review', 'itinerary'] })
  @IsEnum(['post', 'comment', 'review', 'itinerary'])
  targetType: 'post' | 'comment' | 'review' | 'itinerary';

  @ApiProperty({ description: 'ObjectId of the reported item' })
  @IsString()
  @IsNotEmpty()
  targetId: string;

  @ApiProperty({ example: 'Contains spam or inappropriate language' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class ResolveReportDto {
  @ApiProperty({ enum: ['dismiss', 'hide', 'delete'] })
  @IsEnum(['dismiss', 'hide', 'delete'])
  action: 'dismiss' | 'hide' | 'delete';
}
