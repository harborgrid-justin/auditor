/**
 * Legislation-Parameter Synchronization Engine
 *
 * Bridges the gap between the legislation tracker and the parameter registry.
 * On engagement load, validates that all parameters referenced by active
 * legislation have values for the engagement's fiscal year, and generates
 * warnings for missing or placeholder parameters.
 *
 * This ensures that when new legislation takes effect (e.g., a new NDAA
 * changes acquisition thresholds or military pay rates), the system
 * detects whether the parameter registry has been updated to reflect
 * those changes.
 */

import type { Legislation, LegislationRuleLink } from '@/types/tax-compliance';
import { getActiveLegislation, getSunsetAlerts } from './tracker';
import { getParameterRecord } from '../tax-parameters/registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParameterCoverageWarning {
  parameterCode: string;
  legislationId: string;
  legislationName: string;
  fiscalYear: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface ParameterUpdate {
  parameterCode: string;
  legislationId: string;
  legislationShortName: string;
  impactDescription: string;
  currentValue: number | null;
  fiscalYear: number;
}

export interface LegislationParameterSyncResult {
  fiscalYear: number;
  activeLegislationCount: number;
  linkedParameterCodes: string[];
  coveredParameterCodes: string[];
  missingParameterCodes: string[];
  warnings: ParameterCoverageWarning[];
  parameterUpdates: ParameterUpdate[];
  syncedAt: string;
}

// ---------------------------------------------------------------------------
// Internal — resolve links from active legislation
// ---------------------------------------------------------------------------

/**
 * Gather all rule links that reference a parameterCode from the active
 * legislation set for the given fiscal year.
 */
function getParameterLinksForYear(
  fiscalYear: number,
  allLinks: LegislationRuleLink[],
  activeLegislation: Legislation[]
): LegislationRuleLink[] {
  const activeIds = new Set(activeLegislation.map(l => l.id));
  return allLinks.filter(
    link => link.parameterCode && activeIds.has(link.legislationId)
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates parameter coverage for a fiscal year.
 *
 * For every piece of active legislation that references a parameter code via
 * its rule links, this function checks whether the parameter registry
 * contains a value for that code and fiscal year. Missing parameters are
 * flagged as warnings.
 *
 * @param fiscalYear - The engagement fiscal year
 * @param allLinks  - All legislation-to-rule link records (from seed + runtime)
 * @param entityType - Optional entity type for entity-specific parameter lookups
 */
export function syncLegislationParameters(
  fiscalYear: number,
  allLinks: LegislationRuleLink[],
  entityType?: string
): LegislationParameterSyncResult {
  const activeLegislation = getActiveLegislation(fiscalYear);
  const paramLinks = getParameterLinksForYear(fiscalYear, allLinks, activeLegislation);

  // Deduplicate parameter codes
  const codeSet = new Set(paramLinks.map(l => l.parameterCode!));
  const uniqueCodes = Array.from(codeSet);
  const coveredCodes: string[] = [];
  const missingCodes: string[] = [];
  const warnings: ParameterCoverageWarning[] = [];
  const parameterUpdates: ParameterUpdate[] = [];

  const legislationById = new Map(activeLegislation.map(l => [l.id, l]));

  for (const code of uniqueCodes) {
    const record = getParameterRecord(code, fiscalYear, entityType);
    const relatedLinks = paramLinks.filter(l => l.parameterCode === code);

    if (record) {
      coveredCodes.push(code);

      // Check if the value comes from a carry-forward (closest earlier year)
      // rather than an explicit entry for this FY
      if (record.taxYear !== fiscalYear) {
        for (const link of relatedLinks) {
          const leg = legislationById.get(link.legislationId);
          warnings.push({
            parameterCode: code,
            legislationId: link.legislationId,
            legislationName: leg?.name ?? link.legislationId,
            fiscalYear,
            severity: 'warning',
            message:
              `Parameter '${code}' for FY${fiscalYear} is using a carry-forward value ` +
              `from FY${record.taxYear}. Verify this value is still correct per ` +
              `${leg?.shortName ?? link.legislationId}.`,
          });
        }
      }

      // Populate parameter updates from legislation links
      for (const link of relatedLinks) {
        const leg = legislationById.get(link.legislationId);
        parameterUpdates.push({
          parameterCode: code,
          legislationId: link.legislationId,
          legislationShortName: leg?.shortName ?? link.legislationId,
          impactDescription: link.impactDescription,
          currentValue: record.value,
          fiscalYear,
        });
      }
    } else {
      missingCodes.push(code);

      for (const link of relatedLinks) {
        const leg = legislationById.get(link.legislationId);
        warnings.push({
          parameterCode: code,
          legislationId: link.legislationId,
          legislationName: leg?.name ?? link.legislationId,
          fiscalYear,
          severity: 'error',
          message:
            `Parameter '${code}' required by ${leg?.shortName ?? link.legislationId} ` +
            `has no value for FY${fiscalYear}. This may cause incorrect rule ` +
            `execution. Add a parameter entry for this code and fiscal year.`,
        });
      }
    }
  }

  // Also include sunset alerts as informational warnings
  const sunsetAlerts = getSunsetAlerts(fiscalYear);
  for (const alert of sunsetAlerts) {
    for (const code of alert.affectedParameterCodes) {
      if (!warnings.some(w => w.parameterCode === code && w.severity === 'info')) {
        warnings.push({
          parameterCode: code,
          legislationId: '',
          legislationName: alert.legislationName,
          fiscalYear,
          severity: 'info',
          message: alert.message,
        });
      }
    }
  }

  return {
    fiscalYear,
    activeLegislationCount: activeLegislation.length,
    linkedParameterCodes: uniqueCodes,
    coveredParameterCodes: coveredCodes,
    missingParameterCodes: missingCodes,
    warnings,
    parameterUpdates,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * Returns parameter update records for a given fiscal year — i.e. which
 * parameters are affected by active legislation and what their current
 * values are. This is a lighter-weight query than the full sync.
 */
export function getParameterUpdatesForYear(
  fiscalYear: number,
  allLinks: LegislationRuleLink[],
  entityType?: string
): ParameterUpdate[] {
  const activeLegislation = getActiveLegislation(fiscalYear);
  const paramLinks = getParameterLinksForYear(fiscalYear, allLinks, activeLegislation);
  const legislationById = new Map(activeLegislation.map(l => [l.id, l]));

  const updates: ParameterUpdate[] = [];

  for (const link of paramLinks) {
    const leg = legislationById.get(link.legislationId);
    const record = getParameterRecord(link.parameterCode!, fiscalYear, entityType);

    updates.push({
      parameterCode: link.parameterCode!,
      legislationId: link.legislationId,
      legislationShortName: leg?.shortName ?? link.legislationId,
      impactDescription: link.impactDescription,
      currentValue: record?.value ?? null,
      fiscalYear,
    });
  }

  return updates;
}

/**
 * Validates that the parameter registry is complete for a fiscal year.
 * Returns true if all linked parameters have values; false otherwise.
 */
export function validateParameterCoverage(
  fiscalYear: number,
  allLinks: LegislationRuleLink[],
  entityType?: string
): { complete: boolean; missingCodes: string[] } {
  const result = syncLegislationParameters(fiscalYear, allLinks, entityType);
  return {
    complete: result.missingParameterCodes.length === 0,
    missingCodes: result.missingParameterCodes,
  };
}
