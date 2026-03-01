import { Controller, Get, Post, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LegislationService } from './legislation.service';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/legislation')
export class LegislationController {
  constructor(private readonly legislationService: LegislationService) {}

  @Get('active')
  @ApiOperation({ summary: 'Get active legislation for a fiscal year' })
  @ApiQuery({ name: 'fiscalYear', required: true, type: Number })
  async getActive(@Query('fiscalYear') fiscalYear: number) {
    const legislation = await this.legislationService.getActiveLegislation(fiscalYear);
    return { fiscalYear, legislation };
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get sunset alerts and new law notifications for a fiscal year' })
  @ApiQuery({ name: 'fiscalYear', required: true, type: Number })
  async getAlerts(@Query('fiscalYear') fiscalYear: number) {
    const alerts = await this.legislationService.getSunsetAlerts(fiscalYear);
    return { fiscalYear, alerts };
  }

  @Get('compliance')
  @ApiOperation({ summary: 'Get full legislative compliance result for a fiscal year' })
  @ApiQuery({ name: 'fiscalYear', required: true, type: Number })
  async getCompliance(@Query('fiscalYear') fiscalYear: number) {
    return this.legislationService.getComplianceResult(fiscalYear);
  }

  @Get(':legislationId/rules')
  @ApiOperation({ summary: 'Get rules affected by specific legislation' })
  async getAffectedRules(@Param('legislationId') legislationId: string) {
    const rules = await this.legislationService.getAffectedRules(legislationId);
    return { legislationId, rules };
  }

  @Post('parameters/sync')
  @ApiOperation({ summary: 'Synchronize legislation-driven parameter updates for a fiscal year' })
  @ApiQuery({ name: 'fiscalYear', required: true, type: Number })
  async syncParameters(@Query('fiscalYear') fiscalYear: number) {
    return this.legislationService.syncParametersForFiscalYear(fiscalYear);
  }
}
