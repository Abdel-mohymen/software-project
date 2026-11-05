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
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('Users, Profile & Favourites (ACC-09, ACC-11, ACC-12, BON-02)')
@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile (ACC-11)' })
  async getMe(@CurrentUser('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Edit name, phone number, and preferred currency (ACC-09)' })
  async updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Delete('me')
  @ApiOperation({
    summary:
      'Deactivate own account after confirmation; blocked if upcoming Confirmed bookings exist (ACC-12)',
  })
  @ApiQuery({ name: 'confirm', required: false, type: Boolean, example: true })
  async deactivateMe(
    @CurrentUser('id') userId: string,
    @Query('confirm') confirm: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const isConfirmed = confirm === 'true' || confirm === '1' || confirm === undefined;
    const result = await this.usersService.deactivateOwnAccount(userId, isConfirmed);
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    return result;
  }

  @Get('me/favourites')
  @ApiOperation({ summary: 'List saved favourite hotels and public itineraries (BON-02 Optional)' })
  async getFavourites(@CurrentUser('id') userId: string) {
    return this.usersService.listFavourites(userId);
  }

  @Post('me/favourites')
  @ApiOperation({ summary: 'Save a hotel or public itinerary to favourites (BON-02 Optional)' })
  async addFavourite(
    @CurrentUser('id') userId: string,
    @Body() body: { targetType: 'hotel' | 'itinerary'; targetId: string },
  ) {
    return this.usersService.addFavourite(userId, body.targetType, body.targetId);
  }

  @Delete('me/favourites/:id')
  @ApiOperation({ summary: 'Remove an item from favourites (BON-02 Optional)' })
  async removeFavourite(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.usersService.removeFavourite(userId, id);
  }
}
