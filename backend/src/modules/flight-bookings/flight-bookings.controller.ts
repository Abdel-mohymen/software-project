import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { FlightBookingsService } from './flight-bookings.service';
import {
  ChangeFlightDto,
  CreateFlightBookingDto,
  SelectSeatDto,
} from './dto/flight-booking.dto';

@ApiTags('Flight Bookings, Seat Holds & E-Tickets (FLT-19..29)')
@Controller('api')
@UseGuards(RolesGuard)
export class FlightBookingsController {
  constructor(private readonly flightBookingsService: FlightBookingsService) {}

  @Post('flight-bookings/hold')
  @ApiOperation({
    summary:
      'Atomically hold flight seats for 10 minutes in Pending Payment status (FLT-22)',
  })
  async holdSeats(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateFlightBookingDto,
  ) {
    return this.flightBookingsService.createHoldBooking(userId, dto);
  }

  @Post('flight-bookings')
  @ApiOperation({
    summary:
      'Create a flight booking with passenger & baggage details and 10-minute seat hold (FLT-19, FLT-21, FLT-22)',
  })
  async createBooking(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateFlightBookingDto,
  ) {
    return this.flightBookingsService.createHoldBooking(userId, dto);
  }

  @Get('flight-bookings')
  @ApiOperation({
    summary: 'List current user flight bookings grouped as Upcoming, Past, and Cancelled (FLT-25)',
  })
  async listMyBookings(@CurrentUser('id') userId: string) {
    return this.flightBookingsService.getUserFlightBookings(userId);
  }

  @Get('flight-bookings/:id')
  @ApiOperation({ summary: 'Get flight booking details with ownership check (FLT-25, ACC-11)' })
  async getBookingDetails(@CurrentUser() user: any, @Param('id') id: string) {
    return this.flightBookingsService.getFlightBookingById(user, id);
  }

  @Post('flight-bookings/:id/cancel')
  @ApiOperation({
    summary:
      'Cancel own Confirmed flight booking before departure and compute tier refund (FLT-26)',
  })
  async cancelBooking(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.flightBookingsService.cancelFlightBookingByUser(userId, id, true);
  }

  @Patch('flight-bookings/:id/change-flight')
  @ApiOperation({ summary: 'Change flight date/flight on same route and cabin (FLT-27 Optional)' })
  async changeFlight(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ChangeFlightDto,
  ) {
    return this.flightBookingsService.changeFlight(userId, id, dto);
  }

  @Get('flight-bookings/:id/e-ticket')
  @ApiOperation({ summary: 'Download PDF e-ticket for a Confirmed flight booking (FLT-23)' })
  async downloadETicket(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.flightBookingsService.generateETicketPdf(user, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="e-ticket-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Patch('flight-bookings/:id/seat')
  @ApiOperation({ summary: 'Select passenger seat on flight booking (FLT-28 Optional)' })
  async selectSeat(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: SelectSeatDto,
  ) {
    return this.flightBookingsService.selectSeat(userId, id, dto);
  }

  @Get('flights/:id/bookings')
  @Roles(UserRole.AIRLINE_MODERATOR, UserRole.ADMIN)
  @ApiOperation({
    summary: 'View bookings and remaining seats per cabin for a flight (Airline Moderator) (FLT-29)',
  })
  async getFlightBookings(@CurrentUser() user: any, @Param('id') flightId: string) {
    return this.flightBookingsService.getFlightBookingsForModerator(user, flightId);
  }

  @Get('flights/:id/passengers/export')
  @Roles(UserRole.AIRLINE_MODERATOR, UserRole.ADMIN)
  @Header('Content-Type', 'text/csv')
  @ApiOperation({
    summary: 'Export flight passenger manifest as CSV (Airline Moderator) (FLT-29)',
  })
  async exportPassengersCsv(
    @CurrentUser() user: any,
    @Param('id') flightId: string,
    @Res() res: Response,
  ) {
    const csv = await this.flightBookingsService.exportPassengersCsv(user, flightId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="flight-${flightId}-passengers.csv"`);
    res.send(csv);
  }
}
