import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { AccountStatus, UserRole } from '../../../common/enums/role.enum';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.REGISTERED_USER })
  role: UserRole;

  @Prop({ type: String, enum: AccountStatus, default: AccountStatus.ACTIVE })
  status: AccountStatus;

  @Prop({ default: '' })
  phone: string;

  @Prop({ default: 'USD', uppercase: true })
  preferredCurrency: string;

  @Prop({ default: true })
  termsConsent: boolean;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ type: String, default: null })
  emailVerificationToken: string | null;

  @Prop({ default: 0 })
  failedLoginAttempts: number;

  @Prop({ type: Date, default: null })
  lockUntil: Date | null;

  @Prop({ type: Date, default: null })
  lastActivityAt: Date | null;

  @Prop({ type: String, default: null })
  refreshTokenHash: string | null;

  @Prop({ default: false })
  mustChangePassword: boolean;

  @Prop({ type: String, default: null })
  passwordResetTokenHash: string | null;

  @Prop({ type: Date, default: null })
  passwordResetExpiresAt: Date | null;

  // Moderator provider assignment (ACC-13: linked to exactly one hotel or airline)
  @Prop({ type: String, enum: ['airline', 'hotel', null], default: null })
  assignedProviderType: 'airline' | 'hotel' | null;

  @Prop({ type: Types.ObjectId, default: null })
  assignedProviderId: Types.ObjectId | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
