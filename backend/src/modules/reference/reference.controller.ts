import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ReferenceService } from './reference.service';

@ApiTags('Reference Data & Airports')
@Controller('api')
export class ReferenceController {
  constructor(private readonly referenceService: ReferenceService) {}

  @Public()
  @Get('airports')
  @ApiOperation({ summary: 'List predefined airports (FLT-02, GEN-12)' })
  @ApiQuery({ name: 'q', required: false, description: 'Search by IATA code, name, or city' })
  async getAirports(@Query('q') q?: string) {
    return this.referenceService.getAirports(q);
  }

  @Public()
  @Get('reference/countries')
  @ApiOperation({ summary: 'List predefined countries and supported currencies (GEN-12)' })
  async getCountries() {
    return this.referenceService.getCountries();
  }

  @Public()
  @Get('reference/cities')
  @ApiOperation({ summary: 'List predefined cities (GEN-12)' })
  @ApiQuery({ name: 'countryCode', required: false })
  async getCities(@Query('countryCode') countryCode?: string) {
    return this.referenceService.getCities(countryCode);
  }

  @Public()
  @Get('reference/attractions')
  @ApiOperation({ summary: 'List predefined attractions (GEN-12)' })
  @ApiQuery({ name: 'cityId', required: false })
  async getAttractions(@Query('cityId') cityId?: string) {
    return this.referenceService.getAttractions(cityId);
  }

  @Public()
  @Get('reference/currencies')
  @ApiOperation({ summary: 'List supported currency codes from Countries.csv (GEN-12)' })
  async getCurrencies() {
    return this.referenceService.getSupportedCurrencies();
  }
}
