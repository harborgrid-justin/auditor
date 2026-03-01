import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('api/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('federal/sf133')
  @ApiOperation({ summary: 'Generate SF-133 Budget Execution Report' })
  async generateSF133(@Body() body: any) {
    return this.reportsService.generateSF133(body);
  }

  @Post('federal/gtas')
  @ApiOperation({ summary: 'Generate GTAS Report' })
  async generateGTAS(@Body() body: any) {
    return this.reportsService.generateGTAS(body);
  }

  @Post('federal/financial-statements')
  @ApiOperation({ summary: 'Generate Federal Financial Statements' })
  async generateFinancialStatements(@Body() body: any) {
    return this.reportsService.generateFederalFinancialStatements(body);
  }

  @Post('federal/audit-opinion')
  @ApiOperation({ summary: 'Generate Federal Audit Opinion' })
  async generateAuditOpinion(@Body() body: any) {
    return this.reportsService.generateFederalAuditOpinion(body);
  }
}
