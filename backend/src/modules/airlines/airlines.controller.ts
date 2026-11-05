import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/enums/role.enum';
import { AirlinesService } from './airlines.service';
import {
  BaggagePolicyDto,
  CreateAirlineDto,
  UpdateAirlineDto,
  UpdateCancellationPolicyDto,
} from './dto/airline.dto';

@ApiTags('Airlines & Policies (FLT-01, FLT-08, FLT-09)')
@Controller('api/airlines')
@UseGuards(RolesGuard)
export class AirlinesController {
  constructor(private readonly airlinesService: AirlinesService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create an airline profile (Admin) (FLT-01)' })
  async createAirline(@Body() dto: CreateAirlineDto) {
    return this.airlinesService.createAirline(dto);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get airline profile and policies (FLT-01)' })
  async getAirline(@Param('id') id: string) {
    return this.airlinesService.getAirlineById(id);
  }

  @Patch(':id')
  @Roles(UserRole.AIRLINE_MODERATOR, UserRole.ADMIN)
  @ApiOperation({ summary: 'Edit assigned airline profile (name, code, logo) (FLT-01)' })
  async updateAirline(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateAirlineDto,
  ) {
    return this.airlinesService.updateAirline(user, id, dto);
  }

  @Put(':id/baggage-policy')
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiOperation({
    summary: 'Define price per extra bag and maximum extra bags per passenger (FLT-08)',
  })
  async updateBaggagePolicy(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: BaggagePolicyDto,
  ) {
    return this.airlinesService.updateBaggagePolicy(user, id, dto);
  }

  @Put(':id/cancellation-policy')
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiOperation({
    summary: 'Define airline cancellation tiers (days before departure -> refund %) (FLT-09)',
  })
  async updateCancellationPolicy(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateCancellationPolicyDto,
  ) {
    return this.airlinesService.updateCancellationPolicy(user, id, dto);
  }
}
