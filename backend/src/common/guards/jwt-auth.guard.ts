import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { User, UserDocument } from '../../modules/users/schemas/user.schema';
import { AccountStatus } from '../enums/role.enum';

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes (ACC-06)

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const token = this.extractToken(request);

    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException('Authentication required. Please log in.');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET || 'giu_dev_access_secret',
      });

      const user = await this.userModel.findById(payload.sub);
      if (!user) {
        if (isPublic) return true;
        throw new UnauthorizedException('User account no longer exists.');
      }

      if (user.status === AccountStatus.SUSPENDED) {
        response.clearCookie('access_token');
        response.clearCookie('refresh_token');
        throw new ForbiddenException('Account suspended. Please contact an administrator.');
      }

      if (user.status === AccountStatus.DEACTIVATED) {
        response.clearCookie('access_token');
        response.clearCookie('refresh_token');
        throw new ForbiddenException('Account has been deactivated.');
      }

      // Enforce 30-minute session inactivity timeout (ACC-06)
      if (user.lastActivityAt) {
        const elapsed = Date.now() - new Date(user.lastActivityAt).getTime();
        if (elapsed > INACTIVITY_TIMEOUT_MS) {
          user.refreshTokenHash = null;
          await user.save();
          response.clearCookie('access_token');
          response.clearCookie('refresh_token');
          if (isPublic) return true;
          throw new UnauthorizedException('Session expired due to 30 minutes of inactivity.');
        }
      }

      // Enforce mandatory password change after admin reset or moderator creation (ACC-07a, ACC-13)
      const path: string = request.originalUrl || request.url || '';
      if (
        user.mustChangePassword &&
        !path.includes('/api/auth/change-password') &&
        !path.includes('/api/auth/logout') &&
        !path.includes('/api/auth/me')
      ) {
        throw new ForbiddenException(
          'You must change your temporary password before accessing other endpoints.',
        );
      }

      user.lastActivityAt = new Date();
      await user.save();

      request.user = {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        preferredCurrency: user.preferredCurrency,
        mustChangePassword: user.mustChangePassword,
        assignedProviderType: user.assignedProviderType,
        assignedProviderId: user.assignedProviderId,
      };

      return true;
    } catch (err) {
      if (err instanceof ForbiddenException) {
        throw err;
      }
      if (isPublic) {
        return true;
      }
      throw new UnauthorizedException(
        err instanceof Error ? err.message : 'Invalid or expired authentication token.',
      );
    }
  }

  private extractToken(request: any): string | null {
    if (request.cookies && request.cookies.access_token) {
      return request.cookies.access_token;
    }
    const authHeader = request.headers?.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    return null;
  }
}
