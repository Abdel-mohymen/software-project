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
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AdminService } from './admin.service';
import {
  AccountListQueryDto,
  AdminBookingListQueryDto,
  AdminResetPasswordDto,
  CreateModeratorDto,
  CreateReportDto,
  ResolveReportDto,
} from './dto/admin.dto';

@ApiTags('Administration & Content Moderation (ACC-07a, ACC-13..17, GEN-07, GEN-09, GEN-10)')
@Controller('api')
@UseGuards(RolesGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('admin/moderators')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create an airline or hotel moderator linked to one provider (ACC-13)' })
  async createModerator(
    @CurrentUser('id') adminId: string,
    @Body() dto: CreateModeratorDto,
  ) {
    return this.adminService.createModerator(adminId, dto);
  }

  @Post('admin/users/:id/reset-password')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Admin-assisted password reset to a temporary password (ACC-07a)',
  })
  async resetUserPassword(
    @CurrentUser('id') adminId: string,
    @Param('id') userId: string,
    @Body() dto: AdminResetPasswordDto,
  ) {
    return this.adminService.adminResetPassword(adminId, userId, dto);
  }

  @Get('admin/accounts')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Paginated list of accounts with search and role/status filters (ACC-14)' })
  async listAccounts(@Query() query: AccountListQueryDto) {
    return this.adminService.listAccounts(query);
  }

  @Patch('admin/accounts/:id/suspend')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Suspend a user or moderator account (ACC-15, ACC-16)' })
  async suspendAccount(
    @CurrentUser('id') adminId: string,
    @Param('id') targetId: string,
  ) {
    return this.adminService.setAccountSuspension(adminId, targetId, true);
  }

  @Patch('admin/accounts/:id/reactivate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reactivate a suspended user or moderator account (ACC-15, ACC-16)' })
  async reactivateAccount(
    @CurrentUser('id') adminId: string,
    @Param('id') targetId: string,
  ) {
    return this.adminService.setAccountSuspension(adminId, targetId, false);
  }

  @Patch('admin/providers/:type/:id/deactivate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Deactivate an airline or hotel (hidden from search, existing Confirmed bookings remain valid) (ACC-15)',
  })
  async deactivateProvider(
    @CurrentUser('id') adminId: string,
    @Param('type') type: 'airline' | 'hotel',
    @Param('id') id: string,
  ) {
    return this.adminService.setProviderActivation(adminId, type, id, false);
  }

  @Patch('admin/providers/:type/:id/reactivate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Reactivate an airline or hotel provider (ACC-15)' })
  async reactivateProvider(
    @CurrentUser('id') adminId: string,
    @Param('type') type: 'airline' | 'hotel',
    @Param('id') id: string,
  ) {
    return this.adminService.setProviderActivation(adminId, type, id, true);
  }

  @Get('admin/bookings')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Inspect all platform flight and hotel bookings (ACC-17)' })
  async listAllBookings(@Query() query: AdminBookingListQueryDto) {
    return this.adminService.listAllBookings(query);
  }

  @Post('reports')
  @ApiOperation({
    summary: 'Report a post, comment, review, or itinerary at most once per item (GEN-09)',
  })
  async submitReport(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateReportDto,
  ) {
    return this.adminService.createReport(userId, dto);
  }

  @Get('admin/reports')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List reported content items for moderation (GEN-09, GEN-10)' })
  @ApiQuery({ name: 'status', required: false, example: 'open' })
  async listReports(
    @Query('status') status = 'open',
    @Query() pagination: PaginationQueryDto,
  ) {
    return this.adminService.listReports(status, pagination.page, pagination.limit);
  }

  @Patch('admin/reports/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Resolve a report by dismissing, hiding, or deleting content (GEN-10)' })
  async resolveReport(
    @CurrentUser('id') adminId: string,
    @Param('id') reportId: string,
    @Body() dto: ResolveReportDto,
  ) {
    return this.adminService.resolveReport(adminId, reportId, dto);
  }

  @Delete('admin/content/:type/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Directly hide or delete a post, comment, review, or itinerary (GEN-10)',
  })
  @ApiQuery({ name: 'mode', required: false, enum: ['hide', 'delete'], example: 'delete' })
  async removeOrHideContent(
    @CurrentUser('id') adminId: string,
    @Param('type') type: 'post' | 'comment' | 'review' | 'itinerary',
    @Param('id') id: string,
    @Query('mode') mode: 'hide' | 'delete' = 'delete',
  ) {
    return this.adminService.moderateContentInternal(
      adminId,
      type,
      id,
      mode === 'hide' ? 'hide' : 'delete',
    );
  }

  @Get('admin/audit-logs')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'View paginated administrative audit logs (GEN-07)' })
  async getAuditLogs(@Query() query: PaginationQueryDto) {
    return this.adminService.getAuditLogs(query.page, query.limit);
  }

  @Get('admin/analytics')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin analytics: bookings and revenue per provider (BON-01 Optional)' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.adminService.getAnalytics(startDate, endDate);
  }
}
