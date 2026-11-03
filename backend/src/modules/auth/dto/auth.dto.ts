import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
  Equals,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
export const PASSWORD_MESSAGE =
  'Password must be at least 8 characters long and include at least one letter and one digit (ACC-01).';

export class RegisterDto {
  @ApiProperty({ example: 'Abdelmohymen Mohamed' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'traveler@giu-travel.com' })
  @IsEmail({}, { message: 'Please provide a valid email address.' })
  email: string;

  @ApiProperty({ example: 'Traveler123' })
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  password: string;

  @ApiProperty({ example: true, description: 'Mandatory terms and privacy consent (ACC-01)' })
  @IsBoolean()
  @Equals(true, { message: 'You must accept the terms and privacy policy to register.' })
  termsConsent: boolean;
}

export class LoginDto {
  @ApiProperty({ example: 'traveler@giu-travel.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Traveler123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPass123' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ example: 'NewPass456' })
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  newPassword: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'traveler@giu-travel.com' })
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'ResetPass789' })
  @IsString()
  @MinLength(8)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE })
  newPassword: string;
}
