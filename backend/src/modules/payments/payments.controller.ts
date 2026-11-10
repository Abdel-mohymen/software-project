import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import {
  AcceptPoliciesDto,
  CreatePaymentDto,
  StripeWebhookPayloadDto,
} from './dto/payment.dto';

@ApiTags('Payments, Policy Acceptance & Refunds (PAY-01..04)')
@Controller('api')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('bookings/:type/:id/policies')
  @ApiOperation({
    summary:
      'Display provider policies (airline baggage/cancellation or hotel check-in/out & cancellation) before payment (PAY-02)',
  })
  async getBookingPolicies(
    @CurrentUser('id') userId: string,
    @Param('type') type: 'flight' | 'hotel',
    @Param('id') id: string,
  ) {
    return this.paymentsService.getBookingPolicies(userId, type, id);
  }

  @Post('bookings/:type/:id/accept-policies')
  @ApiOperation({
    summary: 'Accept provider policies and record acceptance timestamp before payment (PAY-02)',
  })
  async acceptPolicies(
    @CurrentUser('id') userId: string,
    @Param('type') type: 'flight' | 'hotel',
    @Param('id') id: string,
    @Body() _dto: AcceptPoliciesDto,
  ) {
    return this.paymentsService.acceptBookingPolicies(userId, type, id);
  }

  @Post('payments')
  @ApiOperation({
    summary: 'Initiate Stripe test-mode PaymentIntent for a Pending Payment booking (PAY-01)',
  })
  async createPayment(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.createPaymentIntent(userId, dto);
  }

  @Post('payments/:id/retry')
  @ApiOperation({
    summary: 'Retry a failed payment within the 10-minute booking hold window (PAY-01)',
  })
  async retryPayment(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.paymentsService.retryPayment(userId, id);
  }

  @Get('payments/:id')
  @ApiOperation({ summary: 'Inspect payment status (PAY-01)' })
  async getPayment(@CurrentUser() user: any, @Param('id') id: string) {
    return this.paymentsService.getPaymentById(user, id);
  }

  @Public()
  @Post('payments/webhook')
  @ApiOperation({
    summary:
      'Stripe webhook endpoint verifying payment outcome before confirming booking (PAY-01)',
  })
  async stripeWebhook(@Body() payload: StripeWebhookPayloadDto) {
    return this.paymentsService.handleWebhook(payload);
  }

  @Get('refunds/:id')
  @ApiOperation({ summary: 'Inspect refund status (Pending, Refunded, Failed) (PAY-03)' })
  async getRefund(@CurrentUser() user: any, @Param('id') id: string) {
    return this.paymentsService.getRefundById(user, id);
  }
}
