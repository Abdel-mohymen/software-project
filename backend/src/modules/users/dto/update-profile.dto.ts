import { IsOptional, IsString, MaxLength, MinLength, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Abdelmohymen Mohamed' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional({ example: '+201001234567' })
  @IsOptional()
  @IsString()
  @Matches(/^[+0-9\s-]{7,20}$/, { message: 'Phone number must be a valid format.' })
  phone?: string;

  @ApiPropertyOptional({ example: 'EGP' })
  @IsOptional()
  @IsString()
  preferredCurrency?: string;
}
