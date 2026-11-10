import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { HotelBookingsService } from './hotel-bookings.service';
import {
  CreateHotelBookingDto,
  CreateReviewDto,
  ReplyToReviewDto,
  UpdateReviewDto,
} from './dto/hotel-booking.dto';

@ApiTags('Hotel Bookings & Reviews (HTL-16..26)')
@Controller('api')
@UseGuards(RolesGuard)
export class HotelBookingsController {
  constructor(private readonly hotelBookingsService: HotelBookingsService) {}

  @Post('hotel-bookings')
  @ApiOperation({
    summary:
      'Atomically hold one or more rooms in the same hotel for 10 minutes as one reservation (HTL-16, HTL-18)',
  })
  async createHotelBooking(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateHotelBookingDto,
  ) {
    return this.hotelBookingsService.createHotelBookingHold(userId, dto);
  }

  @Get('hotel-bookings')
  @ApiOperation({
    summary: 'List current user hotel reservations grouped as Upcoming, Past, and Cancelled (HTL-20)',
  })
  async listMyHotelBookings(@CurrentUser('id') userId: string) {
    return this.hotelBookingsService.getUserHotelBookings(userId);
  }

  @Get('hotel-bookings/:id')
  @ApiOperation({ summary: 'Get hotel reservation details with ownership check (HTL-20, ACC-11)' })
  async getHotelBooking(@CurrentUser() user: any, @Param('id') id: string) {
    return this.hotelBookingsService.getHotelBookingById(user, id);
  }

  @Post('hotel-bookings/:id/cancel')
  @ApiOperation({
    summary:
      'Cancel own Confirmed reservation as a whole before check-in date and compute tier refund (HTL-21)',
  })
  async cancelHotelBooking(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.hotelBookingsService.cancelHotelBookingByUser(userId, id, true);
  }

  @Get('hotels/:id/reservations')
  @Roles(UserRole.HOTEL_MODERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'View reservations for assigned hotel (Hotel Moderator) (HTL-22)' })
  async getHotelReservations(@CurrentUser() user: any, @Param('id') hotelId: string) {
    return this.hotelBookingsService.getHotelReservationsForModerator(user, hotelId);
  }

  @Post('hotel-bookings/:id/review')
  @ApiOperation({
    summary: 'Submit one rating (1-5) and optional review for a Completed stay (HTL-23)',
  })
  async createReview(
    @CurrentUser('id') userId: string,
    @Param('id') bookingId: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.hotelBookingsService.createReview(userId, bookingId, dto);
  }

  @Patch('reviews/:id')
  @ApiOperation({ summary: 'Edit own hotel review and recalculate average rating (HTL-23)' })
  async updateReview(
    @CurrentUser('id') userId: string,
    @Param('id') reviewId: string,
    @Body() dto: UpdateReviewDto,
  ) {
    return this.hotelBookingsService.updateReview(userId, reviewId, dto);
  }

  @Delete('reviews/:id')
  @ApiOperation({ summary: 'Delete own hotel review and recalculate average rating (HTL-23)' })
  async deleteReview(@CurrentUser('id') userId: string, @Param('id') reviewId: string) {
    return this.hotelBookingsService.deleteReview(userId, reviewId);
  }

  @Public()
  @Get('hotels/:id/reviews')
  @ApiOperation({
    summary: 'View hotel average rating, count, and paginated reviews newest first (HTL-24)',
  })
  async getHotelReviews(
    @Param('id') hotelId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.hotelBookingsService.getHotelReviews(hotelId, query.page, query.limit);
  }

  @Post('reviews/:id/reply')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'Hotel moderator reply to a guest review (HTL-26 Optional)' })
  async replyToReview(
    @CurrentUser() user: any,
    @Param('id') reviewId: string,
    @Body() dto: ReplyToReviewDto,
  ) {
    return this.hotelBookingsService.replyToReview(user, reviewId, dto);
  }
}
