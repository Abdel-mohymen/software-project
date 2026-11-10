import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { HotelsService } from './hotels.service';
import {
  CreateHotelDto,
  CreateRoomDto,
  SearchHotelsQueryDto,
  SetRoomAvailabilityDto,
  UpdateHotelDto,
  UpdateHotelPoliciesDto,
  UpdateRoomAvailabilityAndBlocksDto,
  UpdateRoomDto,
} from './dto/hotel.dto';

@ApiTags('Hotels & Rooms (HTL-01..15)')
@Controller('api/hotels')
@UseGuards(RolesGuard)
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a hotel profile (Admin) (HTL-01)' })
  async createHotel(@Body() dto: CreateHotelDto) {
    return this.hotelsService.createHotel(dto);
  }

  @Public()
  @Get('search')
  @ApiOperation({
    summary:
      'Search active hotels by city/country, dates, guests, rooms, price & rating filters (HTL-11, HTL-12)',
  })
  async searchHotels(@Query() query: SearchHotelsQueryDto) {
    return this.hotelsService.searchHotels(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get hotel details, policies, ratings, and available rooms (HTL-02)' })
  @ApiQuery({ name: 'checkInDate', required: false })
  @ApiQuery({ name: 'checkOutDate', required: false })
  async getHotel(
    @Param('id') id: string,
    @Query('checkInDate') checkInDate?: string,
    @Query('checkOutDate') checkOutDate?: string,
  ) {
    return this.hotelsService.getHotelDetails(id, checkInDate, checkOutDate);
  }

  @Patch(':id')
  @Roles(UserRole.HOTEL_MODERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Edit assigned hotel profile (HTL-01)' })
  async updateHotel(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateHotelDto,
  ) {
    return this.hotelsService.updateHotel(user, id, dto);
  }

  @Post(':id/rooms')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'Add an individually bookable room to assigned hotel (HTL-03)' })
  async addRoom(
    @CurrentUser() user: any,
    @Param('id') hotelId: string,
    @Body() dto: CreateRoomDto,
  ) {
    return this.hotelsService.addRoom(user, hotelId, dto);
  }

  @Patch(':id/rooms/:roomId')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'Edit room beds, occupancy, price, or active status (HTL-05, HTL-06)' })
  async updateRoom(
    @CurrentUser() user: any,
    @Param('id') hotelId: string,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.hotelsService.updateRoom(user, hotelId, roomId, dto);
  }

  @Delete(':id/rooms/:roomId')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({
    summary: 'Delete a room (allowed only if never reserved) (HTL-06)',
  })
  async deleteRoom(
    @CurrentUser() user: any,
    @Param('id') hotelId: string,
    @Param('roomId') roomId: string,
  ) {
    return this.hotelsService.deleteRoom(user, hotelId, roomId);
  }

  @Public()
  @Get(':id/rooms/available')
  @ApiOperation({
    summary: 'List all rooms free for the searched dates with stay pricing (HTL-15)',
  })
  async getAvailableRooms(
    @Param('id') hotelId: string,
    @Query('checkInDate') checkInDate: string,
    @Query('checkOutDate') checkOutDate: string,
  ) {
    return this.hotelsService.getAvailableRoomsForHotel(hotelId, checkInDate, checkOutDate);
  }

  @Post(':id/rooms/:roomId/availability')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'Define non-overlapping bookable date ranges for a room (HTL-04)' })
  async setAvailability(
    @CurrentUser() user: any,
    @Param('id') hotelId: string,
    @Param('roomId') roomId: string,
    @Body() dto: SetRoomAvailabilityDto,
  ) {
    return this.hotelsService.setRoomAvailability(user, hotelId, roomId, dto);
  }

  @Patch(':id/rooms/:roomId/availability')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({
    summary: 'Update room bookable ranges, blocked dates, or active status (HTL-05, HTL-06)',
  })
  async updateAvailabilityAndBlocks(
    @CurrentUser() user: any,
    @Param('id') hotelId: string,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateRoomAvailabilityAndBlocksDto,
  ) {
    return this.hotelsService.updateRoomAvailabilityAndBlocks(user, hotelId, roomId, dto);
  }

  @Get(':id/availability')
  @Roles(UserRole.HOTEL_MODERATOR, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'View each room status (Available, Booked with reference, or Blocked) for a date range (HTL-08)',
  })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getHotelAvailability(
    @CurrentUser() user: any,
    @Param('id') hotelId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.hotelsService.getHotelAvailabilityMatrixForModerator(
      user,
      hotelId,
      startDate,
      endDate,
    );
  }

  @Put(':id/policies')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({
    summary: 'Set hotel check-in/check-out times and cancellation tiers (HTL-09, HTL-10)',
  })
  async updatePolicies(
    @CurrentUser() user: any,
    @Param('id') hotelId: string,
    @Body() dto: UpdateHotelPoliciesDto,
  ) {
    return this.hotelsService.updatePolicies(user, hotelId, dto);
  }
}
