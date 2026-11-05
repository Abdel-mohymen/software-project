import {
  Body,
  Controller,
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
import { FlightsService } from './flights.service';
import {
  CreateCabinDto,
  CreateFlightDto,
  SearchFlightsQueryDto,
  UpdateCabinDto,
  UpdateFlightDto,
} from './dto/flight.dto';

@ApiTags('Flights & Cabin Inventory (FLT-03..17, FLT-30)')
@Controller('api/flights')
@UseGuards(RolesGuard)
export class FlightsController {
  constructor(private readonly flightsService: FlightsService) {}

  @Post()
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiOperation({
    summary:
      'Create a flight in local airport timezones converted to UTC (Airline Moderator) (FLT-03)',
  })
  async createFlight(@CurrentUser() user: any, @Body() dto: CreateFlightDto) {
    return this.flightsService.createFlight(user, dto);
  }

  @Public()
  @Get('search')
  @ApiOperation({
    summary:
      'Search one-way or round-trip Scheduled flights with cabin, passenger, price filter & sort (FLT-11, FLT-12, FLT-15)',
  })
  async searchFlights(@Query() query: SearchFlightsQueryDto) {
    return this.flightsService.searchFlights(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get flight details, cabin availability, and airline policies (FLT-17)' })
  async getFlight(@Param('id') id: string) {
    return this.flightsService.getFlightDetails(id);
  }

  @Patch(':id')
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiOperation({
    summary: 'Update flight schedule; notifies confirmed passengers on time change (FLT-05)',
  })
  async updateFlight(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateFlightDto,
  ) {
    return this.flightsService.updateFlight(user, id, dto);
  }

  @Post(':id/cancel')
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiOperation({
    summary:
      'Cancel a Scheduled flight; cancels Confirmed bookings with 100% refund and notifies passengers (FLT-06)',
  })
  async cancelFlight(@CurrentUser() user: any, @Param('id') id: string) {
    return this.flightsService.cancelFlightByModerator(user, id, true);
  }

  @Post(':id/cabins')
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiOperation({ summary: 'Define a cabin category on a flight (FLT-04)' })
  async addCabin(
    @CurrentUser() user: any,
    @Param('id') flightId: string,
    @Body() dto: CreateCabinDto,
  ) {
    return this.flightsService.addCabin(user, flightId, dto);
  }

  @Patch(':id/cabins/:cabinId')
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiOperation({ summary: 'Edit cabin seat count, price, and baggage allowance (FLT-04, FLT-05)' })
  async updateCabin(
    @CurrentUser() user: any,
    @Param('id') flightId: string,
    @Param('cabinId') cabinId: string,
    @Body() dto: UpdateCabinDto,
  ) {
    return this.flightsService.updateCabin(user, flightId, cabinId, dto);
  }
}
