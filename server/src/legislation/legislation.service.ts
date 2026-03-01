import { Injectable, Logger } from '@nestjs/common';

/**
 * Legislation Service
 *
 * Wraps the shared legislation tracker from src/lib/engine/legislation/tracker.ts
 * and provides it as a NestJS injectable. Handles:
 * - Active legislation lookup by fiscal year
 * - Sunset alerts and compliance results
 * - Legislation-to-parameter synchronization (Phase 2.3)
 */
@Injectable()
export class LegislationService {
  private readonly logger = new Logger(LegislationService.name);

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

  /**
   * Synchronize legislation-driven parameter updates for a fiscal year.
   *
   * Bridges legislation tracking and the DoD parameter registry:
   * 1. Identifies legislation effective in the target fiscal year
   * 2. Cross-references affected rules with parameter codes
   * 3. Verifies parameters have values registered for the fiscal year
   * 4. Reports missing parameter values that need manual registration
   */
  async syncParametersForFiscalYear(fiscalYear: number) {
    this.logger.log(`Syncing legislation parameters for FY${fiscalYear}`);

    const activeLegislation = await this.getActiveLegislation(fiscalYear);
    const { getParameter } = await import('@shared/lib/engine/tax-parameters/registry');

    // Map legislation categories to the parameter codes they affect
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

    this.logger.log(
      `FY${fiscalYear}: ${activeLegislation.length} active legislation, ` +
      `${verifiedCount} verified, ${missingCount} missing, ${sunsetAlerts.length} sunset alerts`
    );

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
}
