import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { LegislationService } from './legislation.service';
import {
  RegisterRuleVersionDto,
  ProcessNDAAPackageDto,
  RegisterEscalationRuleDto,
  LoadIndexDataDto,
  EscalateParameterDto,
  PerformRolloverDto,
} from './legislation.dto';

@ApiTags('legislation')
@ApiBearerAuth()
@Controller('api/legislation')
export class LegislationController {
  constructor(private readonly legislationService: LegislationService) {}

  // --- Legacy endpoints (existing) ---

  @Get('active')
  @ApiOperation({ summary: 'Get active legislation for a fiscal year' })
  @ApiQuery({ name: 'fiscalYear', required: true, type: Number })
  async getActive(@Query('fiscalYear') fiscalYear: number) {
    const legislation = await this.legislationService.getActiveLegislation(fiscalYear);
    return { fiscalYear, legislation };
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

  // --- Rule Version Registry (new) ---

  @Get('rule-versions')
  @ApiOperation({ summary: 'List all registered rule IDs' })
  async listRuleIds() {
    return this.legislationService.listRuleIds();
  }

  @Get('rule-versions/:ruleId')
  @ApiOperation({ summary: 'Get version history for a rule' })
  @ApiQuery({ name: 'asOfDate', required: false })
  async getRuleHistory(
    @Param('ruleId') ruleId: string,
    @Query('asOfDate') asOfDate?: string,
  ) {
    return this.legislationService.getRuleHistory(ruleId, asOfDate);
  }

  @Get('rule-versions/:ruleId/active')
  @ApiOperation({ summary: 'Get the active rule version for a given date' })
  @ApiQuery({ name: 'asOfDate', required: true })
  async getActiveRule(
    @Param('ruleId') ruleId: string,
    @Query('asOfDate') asOfDate: string,
  ) {
    return this.legislationService.getActiveRuleVersion(ruleId, asOfDate);
  }

  @Get('rule-versions/:ruleId/upcoming')
  @ApiOperation({ summary: 'Get upcoming rule version changes' })
  async getUpcomingChanges(@Param('ruleId') ruleId: string) {
    return this.legislationService.getUpcomingChanges(ruleId);
  }

  @Post('rule-versions')
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller')
  @ApiOperation({ summary: 'Register a new rule version' })
  async registerRuleVersion(@Body() dto: RegisterRuleVersionDto) {
    return this.legislationService.registerRuleVersion(dto);
  }

  @Get('alerts/upcoming')
  @ApiOperation({ summary: 'Get upcoming change alerts within a horizon' })
  @ApiQuery({ name: 'daysAhead', required: false })
  async getUpcomingAlerts(@Query('daysAhead') daysAhead?: string) {
    return this.legislationService.getUpcomingAlerts(
      daysAhead ? parseInt(daysAhead, 10) : 90,
    );
  }

  @Get('registry/stats')
  @ApiOperation({ summary: 'Get registry-wide statistics' })
  async getStats() {
    return this.legislationService.getRegistryStats();
  }

  // --- NDAA Change Processing (new) ---

  @Post('ndaa/process')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller')
  @ApiOperation({ summary: 'Process an NDAA change package' })
  async processNDAAPackage(@Body() dto: ProcessNDAAPackageDto) {
    return this.legislationService.processNDAAPackage(dto);
  }

  @Get('ndaa/history')
  @ApiOperation({ summary: 'Get all processed NDAA packages' })
  async getNDAAHistory() {
    return this.legislationService.getNDAAHistory();
  }

  @Get('ndaa/:fiscalYear')
  @ApiOperation({ summary: 'Get processing result for a specific fiscal year' })
  async getNDAAByFY(@Param('fiscalYear') fiscalYear: string) {
    return this.legislationService.getNDAAByFY(parseInt(fiscalYear, 10));
  }

  // --- Threshold Escalation (new) ---

  @Post('escalation/rules')
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'comptroller')
  @ApiOperation({ summary: 'Register an escalation rule' })
  async registerEscalationRule(@Body() dto: RegisterEscalationRuleDto) {
    return this.legislationService.registerEscalationRule(dto);
  }

  @Get('escalation/rules')
  @ApiOperation({ summary: 'List all active escalation rules' })
  async listEscalationRules() {
    return this.legislationService.listEscalationRules();
  }

  @Post('escalation/index-data')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller')
  @ApiOperation({ summary: 'Load economic index data points' })
  async loadIndexData(@Body() dto: LoadIndexDataDto) {
    return this.legislationService.loadIndexData(dto);
  }

  @Post('escalation/escalate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Escalate a parameter to a target fiscal year' })
  async escalateParameter(@Body() dto: EscalateParameterDto) {
    return this.legislationService.escalateParameter(dto);
  }

  @Get('escalation/pay-projections/:targetFY')
  @ApiOperation({ summary: 'Project pay table adjustments for a fiscal year' })
  @ApiQuery({ name: 'currentFY', required: true })
  async projectPayAdjustments(
    @Param('targetFY') targetFY: string,
    @Query('currentFY') currentFY: string,
  ) {
    return this.legislationService.projectPayAdjustments(
      parseInt(currentFY, 10),
      parseInt(targetFY, 10),
    );
  }

  // --- Fiscal Year Rollover (new) ---

  @Post('rollover')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'comptroller', 'financial_manager')
  @ApiOperation({ summary: 'Perform fiscal year rollover for an engagement' })
  async performRollover(@Body() dto: PerformRolloverDto) {
    return this.legislationService.performRollover(dto);
  }

  // --- FMR Revision Tracking (new) ---

  @Get('fmr-revisions')
  @ApiOperation({ summary: 'Get all tracked FMR revisions' })
  async getFMRRevisions() {
    return this.legislationService.getFMRRevisions();
  }

  @Get('fmr-revisions/alerts')
  @ApiOperation({ summary: 'Get FMR revision alerts since a date' })
  @ApiQuery({ name: 'sinceDate', required: true })
  async getFMRAlerts(@Query('sinceDate') sinceDate: string) {
    return this.legislationService.getFMRAlerts(sinceDate);
  }
}
