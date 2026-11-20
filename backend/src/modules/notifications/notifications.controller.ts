import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/enums/role.enum';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications & Dev Test Mailbox (GEN-01, GEN-01-B)')
@Controller('api/notifications')
@UseGuards(RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List in-app notifications and unread count (GEN-01)' })
  async getMyNotifications(
    @CurrentUser('id') userId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.notificationsService.getUserNotifications(userId, query.page, query.limit);
  }

  @Get('dev-mailbox')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Inspect simulated test inbox emails (verification links, password reset links, notifications) (Admin) (ACC-02, ACC-07, GEN-01-B)',
  })
  @ApiQuery({ name: 'email', required: false })
  getDevMailbox(@Query('email') email?: string) {
    return this.notificationsService.getDevMailboxMessages(email);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read (GEN-01)' })
  async markAllRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read (GEN-01)' })
  async markRead(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.notificationsService.markAsRead(userId, id);
  }
}
