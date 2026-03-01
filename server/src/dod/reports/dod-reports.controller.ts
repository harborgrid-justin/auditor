import {
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { DodReportsService } from './dod-reports.service';

@ApiTags('dod')
@ApiBearerAuth()
@Controller('api/dod/reports')
export class DodReportsController {
  constructor(private readonly dodReportsService: DodReportsService) {}

  @Get('sf133')
  @Roles('admin', 'auditor', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Generate SF-133 Report on Budget Execution and Budgetary Resources' })
  @ApiQuery({ name: 'engagementId', required: true })
  @ApiQuery({ name: 'fiscalYear', required: false })
  @ApiQuery({ name: 'period', required: false, enum: ['Q1', 'Q2', 'Q3', 'Q4', 'annual'] })
  async getSf133(
    @Query('engagementId') engagementId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('period') period?: string,
  ) {
    const parsedFiscalYear = fiscalYear ? parseInt(fiscalYear) : new Date().getFullYear();
    return this.dodReportsService.generateSf133(engagementId, parsedFiscalYear, period);
  }

  @Get('gtas')
  @Roles('admin', 'auditor', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Generate GTAS Adjusted Trial Balance report' })
  @ApiQuery({ name: 'engagementId', required: true })
  @ApiQuery({ name: 'fiscalYear', required: false })
  @ApiQuery({ name: 'period', required: false, enum: ['Q1', 'Q2', 'Q3', 'Q4', 'annual'] })
  async getGtas(
    @Query('engagementId') engagementId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('period') period?: string,
  ) {
    const parsedFiscalYear = fiscalYear ? parseInt(fiscalYear) : new Date().getFullYear();
    return this.dodReportsService.generateGtas(engagementId, parsedFiscalYear, period);
  }
}
