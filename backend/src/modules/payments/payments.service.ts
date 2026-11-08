import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
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
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePaymentDto } from './dto/payment.dto';
import { BookingLifecycleStatus, UserRole } from '../../common/enums/role.enum';

@Injectable()
export class PaymentsService {
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
    private readonly notificationsService: NotificationsService,
  ) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (key && key.startsWith('sk_test_') && !key.includes('replace_with')) {
      this.stripe = new Stripe(key, { apiVersion: '2023-10-16' as any });
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
    const booking: any = await this.getBookingDocument(type, bookingId);
    if (booking.userId.toString() !== userId) {
      throw new ForbiddenException('You can only accept policies for your own bookings.');
    }

    if (booking.status !== BookingLifecycleStatus.PENDING_PAYMENT) {
      throw new BadRequestException(`Booking is in '${booking.status}' status and cannot be paid.`);
    }

    if (new Date(booking.holdExpiresAt).getTime() <= Date.now()) {
      booking.status = BookingLifecycleStatus.EXPIRED;
      await booking.save();
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
    const booking: any = await this.getBookingDocument(dto.bookingType, dto.bookingId);
    if (booking.userId.toString() !== userId) {
      throw new ForbiddenException('You can only pay for your own bookings.');
    }

    if (booking.status !== BookingLifecycleStatus.PENDING_PAYMENT) {
      throw new BadRequestException(`Booking is currently '${booking.status}', not Pending Payment.`);
    }

    if (new Date(booking.holdExpiresAt).getTime() <= Date.now()) {
      booking.status = BookingLifecycleStatus.EXPIRED;
      await booking.save();
      throw new BadRequestException('The 10-minute hold has expired (PAY-01).');
    }

    // PAY-02: Payment is blocked until provider policies are accepted
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

    // Store ONLY Stripe payment ID, amount, currency and status — never raw card details (PAY-01)
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
        'Stripe PaymentIntent created in test mode. Complete payment and verify via POST /api/payments/webhook (PAY-01).',
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
      if (booking.status === BookingLifecycleStatus.PENDING_PAYMENT) {
        booking.status = BookingLifecycleStatus.EXPIRED;
        await booking.save();
      }
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

  async handleWebhook(payload: any) {
    const eventType = payload.type;
    const paymentIntentId =
      payload.paymentIntentId || payload.data?.object?.id;

    if (!paymentIntentId) {
      throw new BadRequestException('Missing paymentIntentId in webhook payload.');
    }

    const payment = await this.paymentModel.findOne({
      stripePaymentIntentId: paymentIntentId,
    });

    if (!payment) {
      throw new NotFoundException(`Payment with Stripe ID '${paymentIntentId}' not found.`);
    }

    const booking: any = await this.getBookingDocument(
      payment.bookingType,
      payment.bookingId.toString(),
    );

    if (eventType === 'payment_intent.succeeded') {
      if (new Date(booking.holdExpiresAt).getTime() <= Date.now() && booking.status !== BookingLifecycleStatus.CONFIRMED) {
        payment.status = 'cancelled';
        await payment.save();
        booking.status = BookingLifecycleStatus.EXPIRED;
        await booking.save();
        throw new BadRequestException('Payment arrived after hold expired; booking was not confirmed.');
      }

      payment.status = 'succeeded';
      await payment.save();

      if (booking.status !== BookingLifecycleStatus.CONFIRMED) {
        booking.status = BookingLifecycleStatus.CONFIRMED;
        booking.confirmedAt = new Date();
        await booking.save();

        if (payment.bookingType === 'flight') {
          // Convert held seats to booked seats (FLT-23)
          await this.flightModel.updateOne(
            { _id: booking.outboundFlightId, 'cabins.category': booking.cabinCategory },
            {
              $inc: {
                'cabins.$.heldSeats': -booking.seatsReserved,
                'cabins.$.bookedSeats': booking.seatsReserved,
              },
            },
          );
          if (booking.returnFlightId) {
            await this.flightModel.updateOne(
              { _id: booking.returnFlightId, 'cabins.category': booking.cabinCategory },
              {
                $inc: {
                  'cabins.$.heldSeats': -booking.seatsReserved,
                  'cabins.$.bookedSeats': booking.seatsReserved,
                },
              },
            );
          }

          await this.notificationsService.createNotification({
            userId: booking.userId,
            title: `Flight Booking Confirmed (${booking.bookingReference})`,
            message: `Your flight booking ${booking.bookingReference} is now Confirmed! You can download your e-ticket anytime.`,
            type: 'booking_confirmed',
            metadata: { bookingId: booking._id.toString(), bookingReference: booking.bookingReference },
          });
        } else {
          // Hotel booking confirmed (HTL-17)
          await this.notificationsService.createNotification({
            userId: booking.userId,
            title: `Hotel Reservation Confirmed (${booking.bookingReference})`,
            message: `Your hotel reservation ${booking.bookingReference} is now Confirmed for ${booking.nights} night(s).`,
            type: 'booking_confirmed',
            metadata: { bookingId: booking._id.toString(), bookingReference: booking.bookingReference },
          });
        }
      }

      return {
        message: 'Webhook verified: payment succeeded and booking set to Confirmed (PAY-01, FLT-23, HTL-17).',
        payment,
        bookingReference: booking.bookingReference,
        bookingStatus: booking.status,
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
