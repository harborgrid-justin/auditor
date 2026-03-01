import { Injectable, Logger } from '@nestjs/common';
import * as ruleRegistry from '../../../src/lib/engine/legislation/rule-version-registry';
import * as ndaaProcessor from '../../../src/lib/engine/legislation/ndaa-change-processor';
import * as escalationEngine from '../../../src/lib/engine/legislation/threshold-escalation';
import * as fmrTracker from '../../../src/lib/engine/legislation/fmr-revision-tracker';
import * as rolloverEngine from '../../../src/lib/engine/federal-accounting/fiscal-year-rollover';
import type {
  RegisterRuleVersionDto,
  ProcessNDAAPackageDto,
  RegisterEscalationRuleDto,
  LoadIndexDataDto,
  EscalateParameterDto,
  PerformRolloverDto,
} from './legislation.dto';

@Injectable()
export class LegislationService {
  private readonly logger = new Logger(LegislationService.name);

  // --- Legacy methods (existing) ---

  async getActiveLegislation(fiscalYear: number) {
    const { getActiveLegislation } = await import('@shared/lib/engine/legislation/tracker');
    return getActiveLegislation(fiscalYear);
  }

  async getSunsetAlerts(fiscalYear: number) {
    const { getSunsetAlerts } = await import('@shared/lib/engine/legislation/tracker');
    return getSunsetAlerts(fiscalYear);
  }

  async getComplianceResult(fiscalYear: number) {
    const { getLegislativeComplianceResult } = await import('@shared/lib/engine/legislation/tracker');
    return getLegislativeComplianceResult(fiscalYear);
  }

  async getAffectedRules(legislationId: string) {
    const { getAffectedRules } = await import('@shared/lib/engine/legislation/tracker');
    return getAffectedRules(legislationId);
  }

  async syncParametersForFiscalYear(fiscalYear: number) {
    this.logger.log(`Syncing legislation parameters for FY${fiscalYear}`);

    const activeLegislation = await this.getActiveLegislation(fiscalYear);
    const { getParameter } = await import('@shared/lib/engine/tax-parameters/registry');

    const LEGISLATION_PARAMETER_MAP: Record<string, string[]> = {
      'NDAA': [
        'DOD_MILPAY_RAISE_PCT', 'DOD_CIVPAY_RAISE_PCT',
        'DOD_TSP_MATCH_MAX_PCT', 'DOD_PROGRESS_PAY_LB_PCT', 'DOD_PROGRESS_PAY_SB_PCT',
      ],
      'DoD Appropriations Act': [
        'DOD_EXPENSE_INVESTMENT_THRESHOLD', 'DOD_DCAA_AUDIT_THRESHOLD',
      ],
      'OMB': [
        'DOD_PROMPT_PAY_NET_DAYS', 'DOD_PROMPT_PAY_ANNUAL_RATE', 'DOD_EFT_COMPLIANCE_THRESHOLD',
      ],
      'GSA': [
        'DOD_CONUS_PER_DIEM', 'DOD_CONUS_LODGING', 'DOD_OCONUS_PER_DIEM', 'DOD_OCONUS_LODGING',
      ],
    };

    const updates: Array<{
      parameterCode: string;
      fiscalYear: number;
      currentValue: number;
      source: string;
      status: 'verified' | 'missing';
    }> = [];

    for (const leg of activeLegislation) {
      const matchingKeys = Object.keys(LEGISLATION_PARAMETER_MAP).filter((key) =>
        leg.title.includes(key)
      );
      for (const key of matchingKeys) {
        for (const code of LEGISLATION_PARAMETER_MAP[key]) {
          const value = getParameter(code, fiscalYear, undefined, -1);
          updates.push({
            parameterCode: code,
            fiscalYear,
            currentValue: value,
            source: leg.title,
            status: value === -1 ? 'missing' : 'verified',
          });
        }
      }
    }

    const sunsetAlerts = await this.getSunsetAlerts(fiscalYear);
    const missingCount = updates.filter((u) => u.status === 'missing').length;
    const verifiedCount = updates.filter((u) => u.status === 'verified').length;

    if (missingCount > 0) {
      this.logger.warn(`FY${fiscalYear}: ${missingCount} parameters missing values`);
    }

    return {
      fiscalYear,
      activeLegislationCount: activeLegislation.length,
      parameterUpdates: updates,
      verifiedCount,
      missingCount,
      sunsetAlerts: sunsetAlerts.map((a: any) => ({
        title: a.title,
        severity: a.severity,
        message: a.message,
      })),
    };
  }

  // --- Rule Version Registry (new) ---

  listRuleIds() {
    return { ruleIds: ruleRegistry.getAllRuleIds() };
  }

  getRuleHistory(ruleId: string, asOfDate?: string) {
    return ruleRegistry.getRuleVersionHistory(ruleId, asOfDate);
  }

  getActiveRuleVersion(ruleId: string, asOfDate: string) {
    const version = ruleRegistry.getActiveRule(ruleId, asOfDate);
    return { ruleId, asOfDate, activeVersion: version };
  }

  getUpcomingChanges(ruleId: string) {
    return { ruleId, upcoming: ruleRegistry.getUpcomingChanges(ruleId) };
  }

  registerRuleVersion(dto: RegisterRuleVersionDto) {
    return ruleRegistry.registerRuleVersion(dto);
  }

  getUpcomingAlerts(daysAhead: number) {
    return { alerts: ruleRegistry.generateUpcomingChangeAlerts(daysAhead) };
  }

  getRegistryStats() {
    return ruleRegistry.getRegistryStats();
  }

  // --- NDAA Change Processing (new) ---

  processNDAAPackage(dto: ProcessNDAAPackageDto) {
    return ndaaProcessor.processNDAAChangePackage(
      {
        fiscalYear: dto.fiscalYear,
        publicLawNumber: dto.publicLawNumber,
        enactmentDate: dto.enactmentDate,
        sections: dto.sections,
      },
      dto.processedBy,
    );
  }

  getNDAAHistory() {
    return { packages: ndaaProcessor.getProcessedPackages() };
  }

  getNDAAByFY(fiscalYear: number) {
    const result = ndaaProcessor.getProcessingResultForFY(fiscalYear);
    return result || { error: `No NDAA processing found for FY${fiscalYear}` };
  }

  // --- Threshold Escalation (new) ---

  registerEscalationRule(dto: RegisterEscalationRuleDto) {
    return escalationEngine.registerEscalationRule(dto);
  }

  listEscalationRules() {
    return { rules: escalationEngine.getAllEscalationRules() };
  }

  loadIndexData(dto: LoadIndexDataDto) {
    escalationEngine.loadIndexData(dto.dataPoints);
    return { loaded: dto.dataPoints.length };
  }

  escalateParameter(dto: EscalateParameterDto) {
    const result = escalationEngine.escalateParameter(
      dto.parameterCode,
      dto.baseValue,
      dto.baseFiscalYear,
      dto.targetFiscalYear,
    );
    return result || { error: `No escalation rule found for ${dto.parameterCode}` };
  }

  projectPayAdjustments(currentFY: number, targetFY: number) {
    return { adjustments: escalationEngine.projectPayTableAdjustments(currentFY, targetFY) };
  }

  // --- Fiscal Year Rollover (new) ---

  performRollover(dto: PerformRolloverDto) {
    return rolloverEngine.performFiscalYearRollover(
      dto.engagementData,
      dto.closingFiscalYear,
      dto.performedBy,
    );
  }

  // --- FMR Revision Tracking (new) ---

  getFMRRevisions() {
    return { revisions: fmrTracker.getAllRevisions() };
  }

  getFMRAlerts(sinceDate: string) {
    return { alerts: fmrTracker.generateRevisionAlerts(sinceDate) };
  }
}
