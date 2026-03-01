/**
 * Legislative Change Tracker
 *
 * Monitors enacted legislation for sunset dates, effective dates, and
 * rule-level impacts. Generates alerts when sunset provisions are
 * approaching for a given engagement's tax year, enabling auditors to
 * proactively address compliance changes.
 *
 * Data is pre-seeded from seed-legislation.ts and can be extended at
 * runtime via the public API.
 */

import type {
  Legislation,
  LegislativeAlert,
  LegislativeComplianceResult,
  LegislationRuleLink,
  AlertType,
  AlertSeverity,
} from '@/types/tax-compliance';
import { SEED_LEGISLATION, SEED_RULE_LINKS } from './seed-legislation';

// ---------------------------------------------------------------------------
// Internal state — seeded on module load, extensible at runtime
// ---------------------------------------------------------------------------

const legislationRecords: Legislation[] = [...SEED_LEGISLATION];
const ruleLinkRecords: LegislationRuleLink[] = [...SEED_RULE_LINKS];

// Indexes for fast lookups
const legislationById = new Map<string, Legislation>();
const linksByLegislationId = new Map<string, LegislationRuleLink[]>();
const linksByRuleId = new Map<string, LegislationRuleLink[]>();

function rebuildIndexes(): void {
  legislationById.clear();
  linksByLegislationId.clear();
  linksByRuleId.clear();

  for (const leg of legislationRecords) {
    legislationById.set(leg.id, leg);
  }

  for (const link of ruleLinkRecords) {
    // By legislation
    if (!linksByLegislationId.has(link.legislationId)) {
      linksByLegislationId.set(link.legislationId, []);
    }
    linksByLegislationId.get(link.legislationId)!.push(link);

    // By rule
    if (!linksByRuleId.has(link.ruleId)) {
      linksByRuleId.set(link.ruleId, []);
    }
    linksByRuleId.get(link.ruleId)!.push(link);
  }
}

// Build indexes on module load
rebuildIndexes();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all legislation that is active (i.e. effective and not fully sunset)
 * for the given tax year.
 *
 * A law is considered active for a tax year if:
 *   - Its effectiveDate is on or before the end of the tax year, AND
 *   - It has no sunsetDate, OR its sunsetDate is on or after the start of
 *     the tax year (meaning it was active for at least part of the year).
 */
export function getActiveLegislation(taxYear: number): Legislation[] {
  const yearStart = new Date(`${taxYear}-01-01`);
  const yearEnd = new Date(`${taxYear}-12-31`);

  return legislationRecords.filter((leg) => {
    const effective = new Date(leg.effectiveDate);
    if (effective > yearEnd) return false;

    if (leg.sunsetDate) {
      const sunset = new Date(leg.sunsetDate);
      // The law was active for at least part of the tax year
      if (sunset < yearStart) return false;
    }

    return true;
  });
}

/**
 * Generates alerts for legislation with sunset dates that fall within or are
 * approaching the given tax year. This includes:
 *
 *   - Provisions that sunset during the tax year (critical/high)
 *   - Provisions that sunset in the year immediately following (medium)
 *   - Newly effective legislation for the tax year (info)
 */
export function getSunsetAlerts(taxYear: number): LegislativeAlert[] {
  const alerts: LegislativeAlert[] = [];
  const yearEnd = new Date(`${taxYear}-12-31`);

  for (const leg of legislationRecords) {
    // --- Sunset alerts ---
    if (leg.sunsetDate) {
      const sunset = new Date(leg.sunsetDate);
      const daysRemaining = Math.ceil(
        (sunset.getTime() - yearEnd.getTime()) / (1000 * 60 * 60 * 24)
      );

      const links = linksByLegislationId.get(leg.id) ?? [];
      const affectedRuleIds = links.map((l) => l.ruleId);
      const affectedParameterCodes = links
        .filter((l) => l.parameterCode)
        .map((l) => l.parameterCode!);

      // Sunset is within the tax year or has already passed
      if (sunset.getFullYear() === taxYear) {
        alerts.push({
          legislationName: leg.name,
          shortName: leg.shortName,
          provisionDescription: leg.summary,
          alertType: 'sunset_approaching' as AlertType,
          severity: 'critical' as AlertSeverity,
          message:
            `${leg.shortName} provisions sunset on ${leg.sunsetDate} — ` +
            `within tax year ${taxYear}. ${leg.affectedSections.join(', ')} ` +
            `will no longer be in effect after the sunset date. Verify that ` +
            `all affected computations use the correct rules for periods ` +
            `before and after sunset.`,
          affectedRuleIds,
          affectedParameterCodes,
          sunsetDate: leg.sunsetDate,
          taxYear,
        });
      }
      // Sunset is in the next year — advance warning
      else if (sunset.getFullYear() === taxYear + 1) {
        alerts.push({
          legislationName: leg.name,
          shortName: leg.shortName,
          provisionDescription: leg.summary,
          alertType: 'sunset_approaching' as AlertType,
          severity: 'medium' as AlertSeverity,
          message:
            `${leg.shortName} provisions sunset on ${leg.sunsetDate} — ` +
            `${daysRemaining} day(s) after the end of tax year ${taxYear}. ` +
            `Plan for the impact on ${leg.affectedSections.join(', ')}. ` +
            `Unless Congress extends these provisions, they will expire ` +
            `for tax years beginning after the sunset date.`,
          affectedRuleIds,
          affectedParameterCodes,
          sunsetDate: leg.sunsetDate,
          taxYear,
        });
      }
      // Sunset already passed before this tax year
      else if (sunset < new Date(`${taxYear}-01-01`)) {
        alerts.push({
          legislationName: leg.name,
          shortName: leg.shortName,
          provisionDescription: leg.summary,
          alertType: 'sunset_approaching' as AlertType,
          severity: 'high' as AlertSeverity,
          message:
            `${leg.shortName} provisions sunset on ${leg.sunsetDate}, ` +
            `which is before tax year ${taxYear}. These provisions ` +
            `(${leg.affectedSections.join(', ')}) are no longer in effect. ` +
            `Ensure the return does not claim benefits from expired provisions.`,
          affectedRuleIds,
          affectedParameterCodes,
          sunsetDate: leg.sunsetDate,
          taxYear,
        });
      }
    }

    // --- New law effective alerts ---
    const effective = new Date(leg.effectiveDate);
    if (effective.getFullYear() === taxYear) {
      const links = linksByLegislationId.get(leg.id) ?? [];
      alerts.push({
        legislationName: leg.name,
        shortName: leg.shortName,
        provisionDescription: leg.summary,
        alertType: 'new_law_effective' as AlertType,
        severity: 'info' as AlertSeverity,
        message:
          `${leg.shortName} (${leg.publicLaw ?? 'no P.L.'}) became ` +
          `effective on ${leg.effectiveDate}. New rules apply for tax year ` +
          `${taxYear}. Affected IRC sections: ${leg.affectedSections.join(', ')}.`,
        affectedRuleIds: links.map((l) => l.ruleId),
        affectedParameterCodes: links
          .filter((l) => l.parameterCode)
          .map((l) => l.parameterCode!),
        sunsetDate: leg.sunsetDate,
        taxYear,
      });
    }
  }

  return alerts;
}

/**
 * Returns all rule links (and their impact descriptions) for a given
 * legislation ID.
 */
export function getAffectedRules(legislationId: string): LegislationRuleLink[] {
  return linksByLegislationId.get(legislationId) ?? [];
}

/**
 * Produces a full legislative compliance result for a tax year, combining
 * active legislation, sunset alerts, and sunset-provision detail.
 */
export function getLegislativeComplianceResult(
  taxYear: number
): LegislativeComplianceResult {
  const activeLegislation = getActiveLegislation(taxYear);
  const alerts = getSunsetAlerts(taxYear);

  const sunsetProvisions = activeLegislation
    .filter((leg) => leg.sunsetDate)
    .map((leg) => {
      const sunset = new Date(leg.sunsetDate!);
      const yearEnd = new Date(`${taxYear}-12-31`);
      const daysRemaining = Math.ceil(
        (sunset.getTime() - yearEnd.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        legislation: leg,
        sunsetDate: leg.sunsetDate!,
        daysRemaining,
      };
    })
    .sort((a, b) => a.daysRemaining - b.daysRemaining);

  return {
    taxYear,
    activeLegislation,
    alerts,
    sunsetProvisions,
  };
}

// ---------------------------------------------------------------------------
// Lookup helpers (used by other subsystems)
// ---------------------------------------------------------------------------

/**
 * Look up a single legislation record by its ID.
 */
export function getLegislationById(id: string): Legislation | undefined {
  return legislationById.get(id);
}

/**
 * Get all rule links for a given rule ID, indicating which legislation
 * affects the rule and how.
 */
export function getLegislationForRule(ruleId: string): LegislationRuleLink[] {
  return linksByRuleId.get(ruleId) ?? [];
}

/**
 * Register additional legislation at runtime (e.g., when new laws are
 * enacted and pushed via a data update).
 */
export function registerLegislation(
  legislation: Legislation,
  ruleLinks?: LegislationRuleLink[]
): void {
  legislationRecords.push(legislation);
  if (ruleLinks) {
    ruleLinkRecords.push(...ruleLinks);
  }
  rebuildIndexes();
}
