import {
  Controller,
  Get,
  Query,
  Res,
  Header,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiProduces } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from '../../common/decorators/roles.decorator';
import { DodReportsService } from './dod-reports.service';
import { exportToCsv, getCsvContentType, getCsvContentDisposition } from '../../common/export/csv-exporter';
import { exportToPdf, getPdfContentType, getPdfContentDisposition } from '../../common/export/pdf-exporter';

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

  @Get('sf133/export/csv')
  @Roles('admin', 'auditor', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Export SF-133 report as CSV' })
  @ApiProduces('text/csv')
  @ApiQuery({ name: 'engagementId', required: true })
  @ApiQuery({ name: 'fiscalYear', required: false })
  @ApiQuery({ name: 'period', required: false })
  async exportSf133Csv(
    @Query('engagementId') engagementId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('period') period?: string,
    @Res() res?: Response,
  ) {
    const parsedFiscalYear = fiscalYear ? parseInt(fiscalYear) : new Date().getFullYear();
    const report = await this.dodReportsService.generateSf133(engagementId, parsedFiscalYear, period);
    const records = Array.isArray(report.lines) ? report.lines : [report];

    const csv = exportToCsv(records as Record<string, unknown>[]);
    const filename = `sf133_${engagementId}_FY${parsedFiscalYear}.csv`;

    res!.setHeader('Content-Type', getCsvContentType());
    res!.setHeader('Content-Disposition', getCsvContentDisposition(filename));
    res!.send(csv);
  }

  @Get('sf133/export/pdf')
  @Roles('admin', 'auditor', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Export SF-133 report as PDF' })
  @ApiProduces('application/pdf')
  @ApiQuery({ name: 'engagementId', required: true })
  @ApiQuery({ name: 'fiscalYear', required: false })
  @ApiQuery({ name: 'period', required: false })
  async exportSf133Pdf(
    @Query('engagementId') engagementId: string,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('period') period?: string,
    @Res() res?: Response,
  ) {
    const parsedFiscalYear = fiscalYear ? parseInt(fiscalYear) : new Date().getFullYear();
    const report = await this.dodReportsService.generateSf133(engagementId, parsedFiscalYear, period);
    const records = Array.isArray(report.lines) ? report.lines : [report];

    const pdf = exportToPdf(records as Record<string, unknown>[], {
      title: `SF-133 Report on Budget Execution`,
      subtitle: `FY${parsedFiscalYear} - Engagement ${engagementId}`,
      columns: Object.keys(records[0] || {}).map((key) => ({
        header: key,
        key,
        width: 20,
      })),
      classification: 'UNCLASSIFIED',
    });

    const filename = `sf133_${engagementId}_FY${parsedFiscalYear}.pdf`;

    res!.setHeader('Content-Type', getPdfContentType());
    res!.setHeader('Content-Disposition', getPdfContentDisposition(filename));
    res!.send(pdf);
  }
}
