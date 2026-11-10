import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ItinerariesService } from './itineraries.service';
import {
  AddItineraryDayDto,
  CreateActivityDto,
  CreateBudgetEntryDto,
  CreateItineraryDto,
  CreateTransportCostDto,
  ReorderDaysDto,
  SearchPublicItinerariesQueryDto,
  UpdateActivityDto,
  UpdateBudgetEntryDto,
  UpdateItineraryDayDto,
  UpdateItineraryDto,
  UpdateTransportCostDto,
} from './dto/itinerary.dto';

@ApiTags('Itineraries & FXRatesAPI Budgeting (ITN-01..28)')
@Controller('api')
export class ItinerariesController {
  constructor(private readonly itinerariesService: ItinerariesService) {}

  @Post('itineraries')
  @ApiOperation({ summary: 'Create a private itinerary with title, countries, and startDate (ITN-01)' })
  async createItinerary(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateItineraryDto,
  ) {
    return this.itinerariesService.createItinerary(userId, dto);
  }

  @Get('itineraries')
  @ApiOperation({ summary: 'List current user itineraries ordered by most recently updated (ITN-03)' })
  async listMyItineraries(@CurrentUser('id') userId: string) {
    return this.itinerariesService.listMyItineraries(userId);
  }

  @Public()
  @Get('itineraries/public/search')
  @ApiOperation({
    summary: 'Search public itineraries by keyword, country, city, and duration (ITN-20, ITN-21)',
  })
  async searchPublic(@Query() query: SearchPublicItinerariesQueryDto) {
    return this.itinerariesService.searchPublicItineraries(query);
  }

  @Public()
  @Get('itineraries/public/:id')
  @ApiOperation({ summary: 'View a public itinerary read-only (ITN-21)' })
  async getPublicItinerary(
    @Param('id') id: string,
    @Query('currency') currency?: string,
  ) {
    return this.itinerariesService.getPublicItineraryById(id, currency);
  }

  @Get('itineraries/:id')
  @ApiOperation({
    summary: 'Get itinerary full details, consecutive city groups, and budget summary (ITN-03, ITN-09)',
  })
  @ApiQuery({ name: 'currency', required: false })
  async getItinerary(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('currency') currency?: string,
  ) {
    return this.itinerariesService.getItineraryById(user, id, currency);
  }

  @Patch('itineraries/:id')
  @ApiOperation({ summary: 'Update itinerary title, countries, startDate, or visibility (ITN-01, ITN-20)' })
  async updateItinerary(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateItineraryDto,
  ) {
    return this.itinerariesService.updateItinerary(userId, id, dto);
  }

  @Delete('itineraries/:id')
  @ApiOperation({ summary: 'Delete an itinerary after confirmation (ITN-01)' })
  async deleteItinerary(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.itinerariesService.deleteItinerary(userId, id, true);
  }

  @Post('itineraries/:id/days')
  @ApiOperation({ summary: 'Add a day to an itinerary (max 60 days) (ITN-05)' })
  async addDay(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Body() dto: AddItineraryDayDto,
  ) {
    return this.itinerariesService.addDay(userId, itineraryId, dto);
  }

  @Patch('itineraries/:id/days/reorder')
  @ApiOperation({
    summary: 'Reorder itinerary days and recalculate dates and city groupings (ITN-08)',
  })
  async reorderDays(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Body() dto: ReorderDaysDto,
  ) {
    return this.itinerariesService.reorderDays(userId, itineraryId, dto);
  }

  @Patch('itineraries/:id/days/:dayId')
  @ApiOperation({ summary: 'Edit an itinerary day city and notes (ITN-05)' })
  async updateDay(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Param('dayId') dayId: string,
    @Body() dto: UpdateItineraryDayDto,
  ) {
    return this.itinerariesService.updateDay(userId, itineraryId, dayId, dto);
  }

  @Delete('itineraries/:id/days/:dayId')
  @ApiOperation({ summary: 'Delete a day and renumber remaining days and dates (ITN-07)' })
  async deleteDay(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Param('dayId') dayId: string,
  ) {
    return this.itinerariesService.deleteDay(userId, itineraryId, dayId);
  }

  @Post('itineraries/:id/days/:dayId/activities')
  @ApiOperation({ summary: 'Add an activity to an itinerary day (ITN-10)' })
  async addActivity(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Param('dayId') dayId: string,
    @Body() dto: CreateActivityDto,
  ) {
    return this.itinerariesService.addActivity(userId, itineraryId, dayId, dto);
  }

  @Patch('activities/:id')
  @ApiOperation({ summary: 'Edit an itinerary activity (ITN-10)' })
  async updateActivity(
    @CurrentUser('id') userId: string,
    @Param('id') activityId: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return this.itinerariesService.updateActivity(userId, activityId, dto);
  }

  @Delete('activities/:id')
  @ApiOperation({ summary: 'Delete an itinerary activity (ITN-10)' })
  async deleteActivity(
    @CurrentUser('id') userId: string,
    @Param('id') activityId: string,
  ) {
    return this.itinerariesService.deleteActivity(userId, activityId);
  }

  @Post('activities/:id/images')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Attach an image (JPG/PNG <=5MB, max 5) to an activity (ITN-12, GEN-08)' })
  async addActivityImage(
    @CurrentUser('id') userId: string,
    @Param('id') activityId: string,
    @UploadedFile() file?: Express.Multer.File,
    @Body('url') imageUrl?: string,
  ) {
    return this.itinerariesService.addActivityImage(userId, activityId, file, imageUrl);
  }

  @Delete('activities/:id/images/:imageId')
  @ApiOperation({ summary: 'Remove an image from an activity (ITN-12)' })
  async removeActivityImage(
    @CurrentUser('id') userId: string,
    @Param('id') activityId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.itinerariesService.removeActivityImage(userId, activityId, imageId);
  }

  @Post('itineraries/:id/days/:dayId/budgets')
  @ApiOperation({ summary: 'Add a daily budget entry (food, accommodation, local_transportation, activities) (ITN-14)' })
  async addBudgetEntry(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Param('dayId') dayId: string,
    @Body() dto: CreateBudgetEntryDto,
  ) {
    return this.itinerariesService.addBudgetEntry(userId, itineraryId, dayId, dto);
  }

  @Patch('budgets/:id')
  @ApiOperation({ summary: 'Edit a budget entry (ITN-14)' })
  async updateBudgetEntry(
    @CurrentUser('id') userId: string,
    @Param('id') budgetId: string,
    @Body() dto: UpdateBudgetEntryDto,
  ) {
    return this.itinerariesService.updateBudgetEntry(userId, budgetId, dto);
  }

  @Delete('budgets/:id')
  @ApiOperation({ summary: 'Delete a budget entry (ITN-14)' })
  async deleteBudgetEntry(
    @CurrentUser('id') userId: string,
    @Param('id') budgetId: string,
  ) {
    return this.itinerariesService.deleteBudgetEntry(userId, budgetId);
  }

  @Post('itineraries/:id/transport-costs')
  @ApiOperation({ summary: 'Add an intercity transport cost entry (ITN-16)' })
  async addTransportCost(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Body() dto: CreateTransportCostDto,
  ) {
    return this.itinerariesService.addTransportCost(userId, itineraryId, dto);
  }

  @Patch('transport-costs/:id')
  @ApiOperation({ summary: 'Edit an intercity transport cost entry (ITN-16)' })
  async updateTransportCost(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTransportCostDto,
  ) {
    return this.itinerariesService.updateTransportCost(userId, id, dto);
  }

  @Delete('transport-costs/:id')
  @ApiOperation({ summary: 'Delete an intercity transport cost entry (ITN-16)' })
  async deleteTransportCost(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.itinerariesService.deleteTransportCost(userId, id);
  }

  @Get('itineraries/:id/budget-summary')
  @ApiOperation({
    summary:
      'Calculate total itinerary budget by category and day converted via FXRatesAPI (ITN-14, ITN-18)',
  })
  @ApiQuery({ name: 'currency', required: false, example: 'EUR' })
  async getBudgetSummary(
    @CurrentUser() user: any,
    @Param('id') itineraryId: string,
    @Query('currency') currency?: string,
  ) {
    return this.itinerariesService.getBudgetSummary(user, itineraryId, currency);
  }

  @Post('itineraries/:id/clone')
  @ApiOperation({
    summary:
      'Clone a public itinerary into an independent private copy preserving author attribution (ITN-21)',
  })
  async cloneItinerary(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
  ) {
    return this.itinerariesService.clonePublicItinerary(userId, itineraryId);
  }

  @Get('itineraries/:id/hotels')
  @ApiOperation({
    summary: 'Search available hotels for a city group in the itinerary (ITN-25)',
  })
  @ApiQuery({ name: 'groupIndex', required: false, example: 0 })
  @ApiQuery({ name: 'guests', required: false, example: 2 })
  @ApiQuery({ name: 'rooms', required: false, example: 1 })
  async getHotelsForItinerary(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Query('groupIndex') groupIndex = '0',
    @Query('guests') guests = '2',
    @Query('rooms') rooms = '1',
  ) {
    return this.itinerariesService.searchHotelsForItineraryCityGroup(
      userId,
      itineraryId,
      Number(groupIndex) || 0,
      Number(guests) || 2,
      Number(rooms) || 1,
    );
  }

  @Get('itineraries/:id/flights')
  @ApiOperation({
    summary: 'Search flights from origin airport to first-day city of itinerary (ITN-26)',
  })
  @ApiQuery({ name: 'originAirport', required: true, example: 'CAI' })
  @ApiQuery({ name: 'roundTrip', required: false, example: false })
  @ApiQuery({ name: 'adults', required: false, example: 1 })
  async getFlightsForItinerary(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Query('originAirport') originAirport: string,
    @Query('roundTrip') roundTrip?: string,
    @Query('adults') adults = '1',
  ) {
    return this.itinerariesService.searchFlightsForItinerary(
      userId,
      itineraryId,
      originAirport || 'CAI',
      roundTrip === 'true',
      Number(adults) || 1,
    );
  }

  @Post('itineraries/:id/bookings')
  @ApiOperation({ summary: 'Attach a confirmed booking to an itinerary (ITN-27 Optional)' })
  async attachBooking(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Body() body: any,
  ) {
    return this.itinerariesService.attachBookingToItinerary(userId, itineraryId, body);
  }

  @Get('itineraries/:id/pdf')
  @ApiOperation({ summary: 'Export itinerary as PDF document (ITN-28 Optional)' })
  async exportItineraryPdf(
    @CurrentUser() user: any,
    @Param('id') itineraryId: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.itinerariesService.exportItineraryPdf(user, itineraryId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="itinerary-${itineraryId}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }
}
