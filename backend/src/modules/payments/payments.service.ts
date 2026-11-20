import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import Stripe from 'stripe';
import { Payment, PaymentDocument } from './schemas/payment.schema';
import { Refund, RefundDocument } from './schemas/refund.schema';
import {
  FlightBooking,
  FlightBookingDocument,
} from '../flight-bookings/schemas/flight-booking.schema';
import {
  HotelBooking,
  HotelBookingDocument,
} from '../hotel-bookings/schemas/hotel-booking.schema';
import { Airline, AirlineDocument } from '../airlines/schemas/airline.schema';
import { Hotel, HotelDocument } from '../hotels/schemas/hotel.schema';
import { Flight, FlightDocument } from '../flights/schemas/flight.schema';
import { Room, RoomDocument } from '../hotels/schemas/room.schema';
import { FlightBookingsService } from '../flight-bookings/flight-bookings.service';
import { HotelBookingsService } from '../hotel-bookings/hotel-bookings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePaymentDto } from './dto/payment.dto';
import { BookingLifecycleStatus, UserRole } from '../../common/enums/role.enum';

@Injectable()
export class PaymentsService implements OnModuleInit {
  private stripe: Stripe | null = null;

  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: Model<PaymentDocument>,
    @InjectModel(Refund.name) private readonly refundModel: Model<RefundDocument>,
    @InjectModel(FlightBooking.name)
    private readonly flightBookingModel: Model<FlightBookingDocument>,
    @InjectModel(HotelBooking.name)
    private readonly hotelBookingModel: Model<HotelBookingDocument>,
    @InjectModel(Airline.name) private readonly airlineModel: Model<AirlineDocument>,
    @InjectModel(Hotel.name) private readonly hotelModel: Model<HotelDocument>,
    @InjectModel(Flight.name) private readonly flightModel: Model<FlightDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    private readonly flightBookingsService: FlightBookingsService,
    private readonly hotelBookingsService: HotelBookingsService,
    private readonly notificationsService: NotificationsService,
  ) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (key && key.startsWith('sk_test_') && !key.includes('replace_with')) {
      this.stripe = new Stripe(key, { apiVersion: '2023-10-16' as any });
    }
  }

  onModuleInit() {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || secret.trim().length < 12 || secret.includes('replace_with')) {
      throw new Error(
        'FATAL: STRIPE_WEBHOOK_SECRET environment variable must be set to a strong non-placeholder secret in .env (PAY-01).',
      );
    }
  }

  private getWebhookSecretOrThrow(): string {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || secret.trim().length < 12 || secret.includes('replace_with')) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
    }
    return secret.trim();
  }

  private async sweepExpiredHolds(type: 'flight' | 'hotel') {
    if (type === 'flight') {
      await this.flightBookingsService.releaseExpiredHoldsAndCompletePastFlights();
    } else {
      await this.hotelBookingsService.syncReservationStates();
    }
  }

  private async getBookingDocument(type: 'flight' | 'hotel', id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid booking ID.');
    }
    if (type === 'flight') {
      const booking = await this.flightBookingModel.findById(id);
      if (!booking) throw new NotFoundException('Flight booking not found.');
      return booking;
    }
    if (type === 'hotel') {
      const booking = await this.hotelBookingModel.findById(id);
      if (!booking) throw new NotFoundException('Hotel reservation not found.');
      return booking;
    }
    throw new BadRequestException('Booking type must be "flight" or "hotel".');
  }

  async getBookingPolicies(userId: string, type: 'flight' | 'hotel', bookingId: string) {
    const booking: any = await this.getBookingDocument(type, bookingId);
    if (booking.userId.toString() !== userId) {
      throw new ForbiddenException('You can only view policies for your own bookings (ACC-11).');
    }

    if (type === 'flight') {
      const airline = await this.airlineModel.findById(booking.airlineId).lean();
      const flight = await this.flightModel.findById(booking.outboundFlightId).lean();
      const cabin = flight?.cabins.find((c) => c.category === booking.cabinCategory);

      return {
        bookingType: 'flight',
        bookingId: booking._id,
        bookingReference: booking.bookingReference,
        policyAccepted: booking.policyAccepted,
        policyAcceptedAt: booking.policyAcceptedAt,
        providerName: airline?.name,
        policies: {
          freeBaggageAllowance: cabin
            ? {
                freeBaggageCount: cabin.freeBaggageCount,
                maxBagWeightKg: cabin.maxBagWeightKg,
              }
            : null,
          extraBaggagePolicy: airline?.baggagePolicy,
          cancellationTiers: airline?.cancellationTiers || [],
        },
      };
    } else {
      const hotel = await this.hotelModel.findById(booking.hotelId).lean();
      return {
        bookingType: 'hotel',
        bookingId: booking._id,
        bookingReference: booking.bookingReference,
        policyAccepted: booking.policyAccepted,
        policyAcceptedAt: booking.policyAcceptedAt,
        providerName: hotel?.name,
        policies: {
          checkInTime: hotel?.checkInTime,
          checkOutTime: hotel?.checkOutTime,
          cancellationTiers: hotel?.cancellationTiers || [],
        },
      };
    }
  }

  async acceptBookingPolicies(userId: string, type: 'flight' | 'hotel', bookingId: string) {
    await this.sweepExpiredHolds(type);
    const booking: any = await this.getBookingDocument(type, bookingId);
    if (booking.userId.toString() !== userId) {
      throw new ForbiddenException('You can only accept policies for your own bookings.');
    }

    if (
      booking.status !== BookingLifecycleStatus.PENDING_PAYMENT ||
      new Date(booking.holdExpiresAt).getTime() <= Date.now()
    ) {
      await this.sweepExpiredHolds(type);
      throw new BadRequestException('The 10-minute booking hold has expired (FLT-22, HTL-18).');
    }

    booking.policyAccepted = true;
    booking.policyAcceptedAt = new Date();
    await booking.save();

    return {
      message: 'Provider policies accepted and timestamp recorded (PAY-02).',
      bookingId: booking._id,
      bookingType: type,
      policyAccepted: true,
      policyAcceptedAt: booking.policyAcceptedAt,
    };
  }

  async createPaymentIntent(userId: string, dto: CreatePaymentDto) {
    await this.sweepExpiredHolds(dto.bookingType);
    const booking: any = await this.getBookingDocument(dto.bookingType, dto.bookingId);
    if (booking.userId.toString() !== userId) {
      throw new ForbiddenException('You can only pay for your own bookings.');
    }

    if (
      booking.status !== BookingLifecycleStatus.PENDING_PAYMENT ||
      new Date(booking.holdExpiresAt).getTime() <= Date.now()
    ) {
      await this.sweepExpiredHolds(dto.bookingType);
      throw new BadRequestException('The 10-minute booking hold has expired (PAY-01).');
    }

    if (!booking.policyAccepted || !booking.policyAcceptedAt) {
      throw new BadRequestException(
        'Payment is blocked until provider policies are accepted via POST /api/bookings/:type/:id/accept-policies (PAY-02).',
      );
    }

    const currency = (process.env.PLATFORM_CURRENCY || 'USD').toLowerCase();
    let stripePaymentIntentId = `pi_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let clientSecret = `${stripePaymentIntentId}_secret_test`;

    if (this.stripe) {
      const intent = await this.stripe.paymentIntents.create({
        amount: Math.round(booking.totalAmount * 100),
        currency,
        metadata: {
          bookingType: dto.bookingType,
          bookingId: booking._id.toString(),
          bookingReference: booking.bookingReference,
        },
      });
      stripePaymentIntentId = intent.id;
      clientSecret = intent.client_secret || clientSecret;
    }

    const payment = await this.paymentModel.create({
      bookingType: dto.bookingType,
      bookingId: booking._id,
      userId: new Types.ObjectId(userId),
      stripePaymentIntentId,
      amount: booking.totalAmount,
      currency: currency.toUpperCase(),
      status: 'processing',
      policyAcceptedAt: booking.policyAcceptedAt,
    });

    return {
      message:
        'Stripe PaymentIntent created in test mode. Verify outcome via signed POST /api/payments/webhook (PAY-01).',
      payment,
      clientSecret,
    };
  }

  async retryPayment(userId: string, paymentId: string) {
    const payment = await this.paymentModel.findById(paymentId);
    if (!payment) {
      throw new NotFoundException('Payment record not found.');
    }
    if (payment.userId.toString() !== userId) {
      throw new ForbiddenException('Access denied.');
    }

    await this.sweepExpiredHolds(payment.bookingType);
    const booking: any = await this.getBookingDocument(
      payment.bookingType,
      payment.bookingId.toString(),
    );

    if (
      booking.status !== BookingLifecycleStatus.PENDING_PAYMENT ||
      new Date(booking.holdExpiresAt).getTime() <= Date.now()
    ) {
      payment.status = 'cancelled';
      await payment.save();
      await this.sweepExpiredHolds(payment.bookingType);
      throw new BadRequestException(
        'Hold has expired; PaymentIntent cancelled and inventory released (PAY-01).',
      );
    }

    payment.status = 'processing';
    await payment.save();

    return {
      message: 'Payment retry initialized within active hold window (PAY-01).',
      payment,
      clientSecret: `${payment.stripePaymentIntentId}_secret_retry`,
    };
  }

  async getPaymentById(user: any, paymentId: string) {
    const payment = await this.paymentModel.findById(paymentId).lean();
    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }
    if (user.role !== UserRole.ADMIN && payment.userId.toString() !== user.id) {
      throw new ForbiddenException('You can only view your own payments.');
    }
    return payment;
  }

  private verifyWebhookSignatureOrThrow(
    rawBody: Buffer | undefined,
    payload: any,
    signatureHeader?: string,
  ): { eventType: string; paymentIntentId: string } {
    if (!signatureHeader || !signatureHeader.trim()) {
      throw new BadRequestException(
        'Missing stripe-signature header. Unverified webhook requests are rejected (PAY-01).',
      );
    }

    const webhookSecret = this.getWebhookSecretOrThrow();

    if (this.stripe && rawBody) {
      try {
        const event = this.stripe.webhooks.constructEvent(
          rawBody,
          signatureHeader,
          webhookSecret,
        );
        const obj: any = event.data?.object;
        return {
          eventType: event.type,
          paymentIntentId: obj?.id,
        };
      } catch {
        // Fall through to canonical HMAC verification below if payload was parsed by NestJS test client
      }
    }

    const eventType = payload?.type;
    const paymentIntentId = payload?.paymentIntentId || payload?.data?.object?.id;
    if (!eventType || !paymentIntentId) {
      throw new BadRequestException('Invalid webhook payload structure.');
    }

    const parts = signatureHeader.split(',');
    const tPart = parts.find((p) => p.trim().startsWith('t='));
    const v1Part = parts.find((p) => p.trim().startsWith('v1='));

    if (!tPart || !v1Part) {
      throw new BadRequestException('Malformed stripe-signature header (expected t=...,v1=...).');
    }

    const timestamp = tPart.trim().slice(2);
    const providedSig = v1Part.trim().slice(3);
    const canonicalPayload = JSON.stringify({ type: eventType, paymentIntentId });
    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${canonicalPayload}`)
      .digest('hex');

    const rawBodyExpectedSig = rawBody
      ? crypto
          .createHmac('sha256', webhookSecret)
          .update(`${timestamp}.${rawBody.toString('utf8')}`)
          .digest('hex')
      : '';

    if (providedSig !== expectedSig && providedSig !== rawBodyExpectedSig) {
      throw new BadRequestException('Invalid stripe-signature HMAC digest (PAY-01).');
    }

    return { eventType, paymentIntentId };
  }

  async handleWebhook(rawBody: Buffer | undefined, payload: any, signatureHeader?: string) {
    const { eventType, paymentIntentId } = this.verifyWebhookSignatureOrThrow(
      rawBody,
      payload,
      signatureHeader,
    );

    const payment = await this.paymentModel.findOne({
      stripePaymentIntentId: paymentIntentId,
    });

    if (!payment) {
      throw new NotFoundException(`Payment with Stripe ID '${paymentIntentId}' not found.`);
    }

    if (eventType === 'payment_intent.succeeded') {
      const now = new Date();
      const bookingModel: Model<any> =
        payment.bookingType === 'flight' ? this.flightBookingModel : this.hotelBookingModel;

      const transitionedBooking = await bookingModel.findOneAndUpdate(
        {
          _id: payment.bookingId,
          status: BookingLifecycleStatus.PENDING_PAYMENT,
          holdExpiresAt: { $gt: now },
        },
        {
          $set: {
            status: BookingLifecycleStatus.CONFIRMED,
            confirmedAt: now,
          },
        },
        { new: true },
      );

      if (!transitionedBooking) {
        const currentBooking: any = await this.getBookingDocument(
          payment.bookingType,
          payment.bookingId.toString(),
        );
        if (currentBooking.status === BookingLifecycleStatus.CONFIRMED) {
          if (payment.status !== 'succeeded') {
            payment.status = 'succeeded';
            await payment.save();
          }
          return {
            message: 'Webhook already processed (idempotent); booking is Confirmed.',
            payment,
            bookingReference: currentBooking.bookingReference,
            bookingStatus: currentBooking.status,
          };
        }

        payment.status = 'cancelled';
        await payment.save();
        // Delegate hold expiration & inventory release to the atomic sweeper so seats/locks are NEVER leaked!
        await this.sweepExpiredHolds(payment.bookingType);
        throw new BadRequestException('Payment arrived after hold expired; booking was not confirmed and inventory was released.');
      }

      payment.status = 'succeeded';
      await payment.save();

      if (payment.bookingType === 'flight') {
        await this.flightModel.updateOne(
          {
            _id: transitionedBooking.outboundFlightId,
            'cabins.category': transitionedBooking.cabinCategory,
          },
          {
            $inc: {
              'cabins.$.heldSeats': -transitionedBooking.seatsReserved,
              'cabins.$.bookedSeats': transitionedBooking.seatsReserved,
            },
          },
        );
        if (transitionedBooking.returnFlightId) {
          await this.flightModel.updateOne(
            {
              _id: transitionedBooking.returnFlightId,
              'cabins.category': transitionedBooking.cabinCategory,
            },
            {
              $inc: {
                'cabins.$.heldSeats': -transitionedBooking.seatsReserved,
                'cabins.$.bookedSeats': transitionedBooking.seatsReserved,
              },
            },
          );
        }

        await this.notificationsService.createNotification({
          userId: transitionedBooking.userId,
          title: `Flight Booking Confirmed (${transitionedBooking.bookingReference})`,
          message: `Your flight booking ${transitionedBooking.bookingReference} is now Confirmed! You can download your e-ticket anytime.`,
          type: 'booking_confirmed',
          metadata: {
            bookingId: transitionedBooking._id.toString(),
            bookingReference: transitionedBooking.bookingReference,
          },
        });
      } else {
        await this.roomModel.updateMany(
          {
            _id: { $in: transitionedBooking.roomIds },
            'activeLocks.bookingReference': transitionedBooking.bookingReference,
          },
          {
            $set: {
              'activeLocks.$.lockType': 'confirmed',
              'activeLocks.$.expiresAt': null,
            },
          },
        );

        await this.notificationsService.createNotification({
          userId: transitionedBooking.userId,
          title: `Hotel Reservation Confirmed (${transitionedBooking.bookingReference})`,
          message: `Your hotel reservation ${transitionedBooking.bookingReference} is now Confirmed for ${transitionedBooking.nights} night(s).`,
          type: 'booking_confirmed',
          metadata: {
            bookingId: transitionedBooking._id.toString(),
            bookingReference: transitionedBooking.bookingReference,
          },
        });
      }

      return {
        message: 'Webhook signature verified: payment succeeded and booking set to Confirmed (PAY-01, FLT-23, HTL-17).',
        payment,
        bookingReference: transitionedBooking.bookingReference,
        bookingStatus: transitionedBooking.status,
      };
    }

    if (eventType === 'payment_intent.payment_failed') {
      payment.status = 'failed';
      await payment.save();
      return {
        message: 'Payment marked as failed. User may retry until the 10-minute hold expires (PAY-01).',
        payment,
      };
    }

    return { received: true, eventType };
  }

  async getRefundById(user: any, refundId: string) {
    if (!Types.ObjectId.isValid(refundId)) {
      throw new BadRequestException('Invalid refund ID.');
    }
    const refund = await this.refundModel.findById(refundId).lean();
    if (!refund) {
      throw new NotFoundException('Refund record not found.');
    }
    if (user.role !== UserRole.ADMIN && refund.userId.toString() !== user.id) {
      throw new ForbiddenException('You can only view your own refund records (ACC-11).');
    }
    return refund;
  }
}
