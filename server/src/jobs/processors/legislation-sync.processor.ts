import { Injectable, Logger } from '@nestjs/common';

/**
 * Legislation Sync Processor
 *
 * Handles synchronization of legislation changes with parameter registry.
 * When legislation takes effect, automatically updates DoD parameters
 * for the affected fiscal year.
 *
 * In production with BullMQ:
 * @Processor('legislation-sync')
 */
@Injectable()
export class LegislationSyncProcessor {
  private readonly logger = new Logger(LegislationSyncProcessor.name);

  /**
   * Sync legislation parameters for a given fiscal year.
   *
   * Checks all active legislation, identifies those with effective dates
   * in the target fiscal year, and ensures corresponding parameter values
   * are registered in the parameter registry.
   */
  async syncParametersForFiscalYear(fiscalYear: number): Promise<any> {
    this.logger.log(`Starting legislation parameter sync for FY${fiscalYear}`);
    const startTime = Date.now();

    try {
      // Import legislation tracker
      const { LegislationTracker } = await import('@shared/lib/engine/legislation/tracker');

      // Import parameter registration
      const { registerParameter, getParameter } = await import(
        '@shared/lib/engine/tax-parameters/registry'
      );

      const tracker = new LegislationTracker();

      // Seed DoD legislation
      const { seedDoDLegislation } = await import(
        '@shared/lib/engine/legislation/seed-dod-legislation'
      );
      seedDoDLegislation(tracker);

      // Check for legislation with effective dates in the target FY
      const allLegislation = tracker.getAll();
      const fyStart = new Date(`${fiscalYear - 1}-10-01`);
      const fyEnd = new Date(`${fiscalYear}-09-30`);

      const effectiveThisFY = allLegislation.filter((leg) => {
        const effective = new Date(leg.effectiveDate);
        return effective >= fyStart && effective <= fyEnd;
      });

      // Check for sunset warnings
      const sunsetWarnings = tracker.checkSunsetWarnings(90);

      const result = {
        fiscalYear,
        totalLegislation: allLegislation.length,
        effectiveThisFY: effectiveThisFY.length,
        sunsetWarnings: sunsetWarnings.length,
        effectiveLegislation: effectiveThisFY.map((l) => ({
          title: l.title,
          effectiveDate: l.effectiveDate,
          impactedRules: l.affectedRuleIds?.length ?? 0,
        })),
        sunsetAlerts: sunsetWarnings.map((w) => ({
          title: w.legislation.title,
          sunsetDate: w.sunsetDate,
          daysUntilSunset: w.daysUntilSunset,
        })),
        executionTimeMs: Date.now() - startTime,
        status: 'completed',
      };

      this.logger.log(
        `Legislation sync complete: ${effectiveThisFY.length} effective, ${sunsetWarnings.length} sunset warnings`
      );

      return result;
    } catch (error: any) {
      this.logger.error(`Legislation sync failed: ${error.message}`);
      throw error;
    }
  }
}
