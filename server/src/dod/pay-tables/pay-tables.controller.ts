import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PayTablesService } from './pay-tables.service';
import {
  LookupMilitaryPayDto,
  LookupCivilianPayDto,
  CalculateMilitaryCompensationDto,
  CalculateCivilianCompensationDto,
} from './pay-tables.dto';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/pay-tables')
export class PayTablesController {
  constructor(private readonly payTablesService: PayTablesService) {}

  @Post('military/lookup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Look up military base pay by grade and YOS' })
  async lookupMilitaryPay(@Body() dto: LookupMilitaryPayDto) {
    return this.payTablesService.lookupMilitaryPay(dto);
  }

  @Post('civilian/lookup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Look up civilian GS pay by grade, step, and locality' })
  async lookupCivilianPay(@Body() dto: LookupCivilianPayDto) {
    return this.payTablesService.lookupCivilianPay(dto);
  }

  @Post('military/calculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Calculate full military compensation package' })
  async calculateMilitaryCompensation(@Body() dto: CalculateMilitaryCompensationDto) {
    return this.payTablesService.calculateMilitaryCompensation(dto);
  }

  @Post('civilian/calculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Calculate full civilian compensation package' })
  async calculateCivilianCompensation(@Body() dto: CalculateCivilianCompensationDto) {
    return this.payTablesService.calculateCivilianCompensation(dto);
  }
}
