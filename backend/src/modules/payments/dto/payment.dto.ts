import { Equals, IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AcceptPoliciesDto {
  @ApiProperty({ example: true, description: 'Mandatory policy acceptance checkbox (PAY-02)' })
  @IsBoolean()
  @Equals(true, { message: 'You must accept the provider policies before proceeding to payment.' })
  accepted: boolean;
}

export class CreatePaymentDto {
  @ApiProperty({ enum: ['flight', 'hotel'], example: 'flight' })
  @IsEnum(['flight', 'hotel'])
  bookingType: 'flight' | 'hotel';

  @ApiProperty({ description: 'FlightBooking or HotelBooking ObjectId' })
  @IsString()
  @IsNotEmpty()
  bookingId: string;
}

export class StripeWebhookPayloadDto {
  @ApiProperty({ example: 'payment_intent.succeeded', enum: ['payment_intent.succeeded', 'payment_intent.payment_failed'] })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ description: 'Stripe PaymentIntent ID (e.g. pi_...)' })
  @IsOptional()
  @IsString()
  paymentIntentId?: string;

  @ApiPropertyOptional({ description: 'Standard Stripe event data.object wrapper' })
  @IsOptional()
  data?: {
    object?: {
      id?: string;
      metadata?: Record<string, any>;
    };
  };
}
