import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { AccountStatus, UserRole } from '../../common/enums/role.enum';

const MAX_FAILED_ATTEMPTS = 5; // ACC-05
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes (ACC-05)

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.userModel.findOne({ email });
    if (existing) {
      throw new ConflictException('An account with this email address is already registered.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const verificationToken = crypto.randomBytes(24).toString('hex');

    const user = await this.userModel.create({
      name: dto.name.trim(),
      email,
      passwordHash,
      role: UserRole.REGISTERED_USER,
      status: AccountStatus.ACTIVE,
      termsConsent: dto.termsConsent,
      isEmailVerified: false,
      emailVerificationToken: verificationToken,
      preferredCurrency: 'USD',
    });

    return {
      message: 'Registration successful.',
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        preferredCurrency: user.preferredCurrency,
      },
      // Included in dev response to allow testing optional ACC-02 via Swagger
      verificationToken,
    };
  }

  async verifyEmail(token: string) {
    if (!token) {
      throw new BadRequestException('Verification token is required.');
    }
    const user = await this.userModel.findOne({ emailVerificationToken: token });
    if (!user) {
      throw new BadRequestException('Invalid or expired email verification token.');
    }
    user.isEmailVerified = true;
    user.emailVerificationToken = null;
    await user.save();
    return { message: 'Email verified successfully.' };
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.userModel.findOne({ email });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status === AccountStatus.SUSPENDED) {
      throw new ForbiddenException('Account suspended');
    }

    if (user.status === AccountStatus.DEACTIVATED) {
      throw new ForbiddenException('This account has been deactivated.');
    }

    // Check account lockout (ACC-05)
    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(
        `Account locked due to 5 consecutive failed login attempts. Try again in ${minutesLeft} minute(s).`,
      );
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        await user.save();
        throw new ForbiddenException(
          'Account locked for 15 minutes after 5 consecutive failed login attempts.',
        );
      }
      await user.save();
      throw new UnauthorizedException('Invalid email or password');
    }

    // Successful login resets failed login counter (ACC-05)
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.lastActivityAt = new Date();

    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET || 'giu_dev_access_secret',
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '30m',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET || 'giu_dev_refresh_secret',
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    });

    user.refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await user.save();

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        preferredCurrency: user.preferredCurrency,
        mustChangePassword: user.mustChangePassword,
        assignedProviderType: user.assignedProviderType,
        assignedProviderId: user.assignedProviderId,
      },
    };
  }

  async logout(userId: string) {
    if (userId) {
      await this.userModel.findByIdAndUpdate(userId, {
        $set: { refreshTokenHash: null, lastActivityAt: null },
      });
    }
    return { message: 'Logged out successfully.' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!matches) {
      throw new BadRequestException('Current password is incorrect.');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from your current password.');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    user.mustChangePassword = false;
    await user.save();

    return { message: 'Password updated successfully.' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.userModel.findOne({ email });
    let debugResetToken: string | undefined;

    if (user && user.status === AccountStatus.ACTIVE) {
      const rawToken = crypto.randomBytes(24).toString('hex');
      user.passwordResetTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes (ACC-07)
      await user.save();
      if (process.env.NODE_ENV !== 'production') {
        debugResetToken = rawToken;
      }
    }

    // Do not reveal whether the email exists (ACC-07)
    return {
      message: 'If an account with that email exists, a password reset link has been sent.',
      ...(debugResetToken ? { debugResetToken } : {}),
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');
    const user = await this.userModel.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired password reset token.');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    user.mustChangePassword = false;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    return { message: 'Password has been reset successfully. You can now log in.' };
  }
}
