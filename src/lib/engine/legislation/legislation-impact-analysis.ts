/**
 * Legislation Impact Analysis Engine
 *
 * Provides "what-if" preview capability before activating new legislation.
 * Shows exactly what would change: affected rules, parameter values, and
 * how existing audit findings would be impacted.
 *
 * This is the preview/dry-run complement to the legislation-parameter-sync
 * module. While sync applies changes, this module shows the impact without
 * making any modifications.
 *
 * Use cases:
 *   - Preview impact of a new NDAA before fiscal year activation
 *   - Assess impact of mid-year executive orders on parameters
 *   - Compare current vs. proposed rule behavior
 *   - Generate compliance gap reports for new FASAB standards
 *
 * References:
 *   - DoD FMR Vol. 1: Policy Update Process
 *   - FASAB Handbook: Standard Implementation Guidance
 */

import type { Legislation, LegislationRuleLink } from '@/types/tax-compliance';
import type { AuditRule } from '@/types/findings';
import { getParameterRecord } from '../tax-parameters/registry';
import { getActiveLegislation, getAffectedRules } from './tracker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LegislationImpactPreview {
  /** The legislation being previewed */
  legislation: {
    id: string;
    name: string;
    shortName: string;
    effectiveDate: string;
  };
  /** Fiscal year context for the analysis */
  fiscalYear: number;
  /** Parameters that would be affected */
  parameterImpacts: ParameterImpact[];
  /** Rules that would be activated, modified, or deactivated */
  ruleImpacts: RuleImpact[];
  /** Summary statistics */
  summary: {
    totalParametersAffected: number;
    parametersWithValueChanges: number;
    newParametersNeeded: number;
    rulesActivated: number;
    rulesModified: number;
    rulesDeactivated: number;
  };
  /** Warnings about potential issues */
  warnings: string[];
  /** Generated timestamp */
  generatedAt: string;
}

export interface ParameterImpact {
  parameterCode: string;
  currentValue: number | null;
  projectedValue: number | null;
  changeType: 'new' | 'modified' | 'removed' | 'unchanged';
  impactDescription: string;
  legislationReference: string;
}

export interface RuleImpact {
  ruleId: string;
  ruleName: string;
  currentStatus: 'active' | 'inactive' | 'not_found';
  projectedStatus: 'active' | 'inactive' | 'modified';
  changeType: 'activated' | 'deactivated' | 'modified' | 'unchanged';
  impactDescription: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Preview the impact of activating a piece of legislation.
 *
 * Performs a dry-run analysis showing:
 *   1. Which parameters would be affected and their projected new values
 *   2. Which rules would be activated, modified, or deactivated
 *   3. Warnings about missing parameters or conflicting rules
 *
 * This function makes NO changes to the system — it is purely analytical.
 *
 * @param legislation - The legislation to preview
 * @param ruleLinks - Rule links defining the legislation's impact
 * @param fiscalYear - The target fiscal year
 * @param existingRules - Current active rules for comparison
 * @param entityType - Optional entity type for parameter lookup
 * @returns Impact preview
 */
export function previewLegislationImpact(
  legislation: { id: string; name: string; shortName: string; effectiveDate: string; sunsetDate?: string },
  ruleLinks: LegislationRuleLink[],
  fiscalYear: number,
  existingRules: AuditRule[] = [],
  entityType?: string,
): LegislationImpactPreview {
  const warnings: string[] = [];
  const parameterImpacts: ParameterImpact[] = [];
  const ruleImpacts: RuleImpact[] = [];

  const ruleMap = new Map(existingRules.map(r => [r.id, r]));

  // Analyze parameter impacts
  const parameterCodes = new Set<string>();
  for (const link of ruleLinks) {
    if (link.parameterCode) {
      parameterCodes.add(link.parameterCode);
    }
  }

  for (const code of Array.from(parameterCodes)) {
    const currentRecord = getParameterRecord(code, fiscalYear, entityType);
    const relatedLinks = ruleLinks.filter(l => l.parameterCode === code);

    if (currentRecord) {
      // Parameter exists — check if legislation would change it
      parameterImpacts.push({
        parameterCode: code,
        currentValue: currentRecord.value,
        projectedValue: null, // Would need the new value from the legislation
        changeType: 'modified',
        impactDescription: relatedLinks.map(l => l.impactDescription).join('; '),
        legislationReference: legislation.shortName,
      });
    } else {
      // Parameter doesn't exist — new parameter needed
      parameterImpacts.push({
        parameterCode: code,
        currentValue: null,
        projectedValue: null,
        changeType: 'new',
        impactDescription: relatedLinks.map(l => l.impactDescription).join('; '),
        legislationReference: legislation.shortName,
      });
      warnings.push(
        `Parameter '${code}' required by ${legislation.shortName} does not exist ` +
        `for FY${fiscalYear}. A new parameter entry must be created before activation.`,
      );
    }
  }

  // Analyze rule impacts
  const processedRuleIds = new Set<string>();
  for (const link of ruleLinks) {
    if (processedRuleIds.has(link.ruleId)) continue;
    processedRuleIds.add(link.ruleId);

    const existingRule = ruleMap.get(link.ruleId);

    if (existingRule) {
      // Check if the legislation's effective date would change rule applicability
      const effectiveDate = new Date(legislation.effectiveDate);
      const fyEnd = new Date(`${fiscalYear}-09-30`);

      if (effectiveDate <= fyEnd) {
        ruleImpacts.push({
          ruleId: link.ruleId,
          ruleName: existingRule.name || link.ruleId,
          currentStatus: 'active',
          projectedStatus: 'modified',
          changeType: 'modified',
          impactDescription: link.impactDescription,
        });
      } else {
        ruleImpacts.push({
          ruleId: link.ruleId,
          ruleName: existingRule.name || link.ruleId,
          currentStatus: 'active',
          projectedStatus: 'active',
          changeType: 'unchanged',
          impactDescription: `Rule effective date (${legislation.effectiveDate}) is after FY${fiscalYear} end.`,
        });
      }
    } else {
      ruleImpacts.push({
        ruleId: link.ruleId,
        ruleName: link.ruleId,
        currentStatus: 'not_found',
        projectedStatus: 'active',
        changeType: 'activated',
        impactDescription: link.impactDescription,
      });
    }
  }

  // Check for sunset impacts on existing legislation
  if (legislation.sunsetDate) {
    const sunsetDate = new Date(legislation.sunsetDate);
    const fyStart = new Date(`${fiscalYear - 1}-10-01`);

    if (sunsetDate < fyStart) {
      warnings.push(
        `${legislation.shortName} sunsets on ${legislation.sunsetDate}, which is before ` +
        `FY${fiscalYear}. All affected rules and parameters will be inactive.`,
      );
    }
  }

  // Check for conflicts with existing active legislation
  const activeLeg = getActiveLegislation(fiscalYear);
  for (const active of activeLeg) {
    const activeLinks = getAffectedRules(active.id);
    const activeRuleIds = new Set(activeLinks.map(l => l.ruleId));

    for (const link of ruleLinks) {
      if (activeRuleIds.has(link.ruleId) && active.id !== legislation.id) {
        warnings.push(
          `Rule ${link.ruleId} is also affected by ${active.shortName} ` +
          `(${active.id}). Review for potential conflicts.`,
        );
      }
    }
  }

  // Summary statistics
  const summary = {
    totalParametersAffected: parameterImpacts.length,
    parametersWithValueChanges: parameterImpacts.filter(p => p.changeType === 'modified').length,
    newParametersNeeded: parameterImpacts.filter(p => p.changeType === 'new').length,
    rulesActivated: ruleImpacts.filter(r => r.changeType === 'activated').length,
    rulesModified: ruleImpacts.filter(r => r.changeType === 'modified').length,
    rulesDeactivated: ruleImpacts.filter(r => r.changeType === 'deactivated').length,
  };

  return {
    legislation: {
      id: legislation.id,
      name: legislation.name,
      shortName: legislation.shortName,
      effectiveDate: legislation.effectiveDate,
    },
    fiscalYear,
    parameterImpacts,
    ruleImpacts,
    summary,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Compare the compliance landscape between two fiscal years.
 *
 * Shows what changed between FY1 and FY2: new legislation in effect,
 * expired legislation, parameter changes, etc.
 *
 * @param fromFiscalYear - Starting fiscal year
 * @param toFiscalYear - Target fiscal year
 * @returns Comparison of active legislation between the two years
 */
export function compareFiscalYears(
  fromFiscalYear: number,
  toFiscalYear: number,
): {
  newlyActive: Legislation[];
  expired: Legislation[];
  continuingActive: Legislation[];
} {
  const fromActive = getActiveLegislation(fromFiscalYear);
  const toActive = getActiveLegislation(toFiscalYear);

  const fromIds = new Set(fromActive.map(l => l.id));
  const toIds = new Set(toActive.map(l => l.id));

  return {
    newlyActive: toActive.filter(l => !fromIds.has(l.id)),
    expired: fromActive.filter(l => !toIds.has(l.id)),
    continuingActive: toActive.filter(l => fromIds.has(l.id)),
  };
}
