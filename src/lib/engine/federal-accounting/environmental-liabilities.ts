/**
 * Environmental Liabilities Validation Engine
 *
 * Validates the recognition, measurement, and disclosure of environmental
 * cleanup liabilities for DoD components. Federal agencies are required to
 * recognize environmental liabilities for cleanup costs associated with:
 *
 *   - Base Realignment and Closure (BRAC) sites
 *   - Formerly Used Defense Sites (FUDS)
 *   - Active installations with contamination
 *   - Operational ranges requiring restoration
 *   - Disposal of defense systems and materials
 *
 * Environmental liabilities must be estimated using the best available
 * information and updated at least every two years. Estimates should
 * reflect the full cost of cleanup using an appropriate methodology
 * (e.g., engineering cost estimates, probabilistic analysis).
 *
 * References:
 *   - DoD FMR Vol. 4, Ch. 13 (Environmental Liabilities)
 *   - SFFAS 5 paras 36-48 (Liabilities: Recognition and Measurement)
 *   - SFFAS 6 paras 96-107 (Environmental Cleanup Costs)
 *   - DERP (Defense Environmental Restoration Program) guidance
 *   - 10 U.S.C. ss2700-2710 (Environmental Restoration)
 *   - CERCLA ss120 (Federal Facility Compliance)
 */

import type { EngagementData } from '@/types/findings';
import type { EnvironmentalLiability, CleanupEstimate } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnvironmentalValidationResult {
  fiscalYear: number;
  totalSites: number;
  totalEstimatedCost: number;
  totalRecordedLiability: number;
  understatement: number;
  overstatement: number;
  findings: EnvironmentalFinding[];
  siteTypeSummary: Record<string, { count: number; estimatedCost: number; recordedLiability: number }>;
}

export interface EnvironmentalFinding {
  siteId: string;
  siteName: string;
  findingType: 'understatement' | 'overstatement' | 'stale_estimate' | 'missing_liability' | 'missing_estimate' | 'brac_compliance';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  amountImpact: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Tolerance for acceptable variance between recorded liability and
 * estimated cost. Per SFFAS 6 para 100, recorded amounts should
 * reasonably approximate the estimated cleanup cost.
 */
const ESTIMATE_TOLERANCE_PCT = 0.10;

/**
 * Maximum age (in years) for a cleanup cost estimate before it is
 * considered stale. DoD FMR Vol. 4, Ch. 13 requires that estimates
 * be updated at least every two years.
 */
const MAX_ESTIMATE_AGE_YEARS = 2;

/**
 * Threshold for considering an estimate range unreasonable. If the
 * high estimate exceeds the low estimate by more than this factor,
 * the range is flagged for review.
 */
const ESTIMATE_RANGE_REASONABLENESS_FACTOR = 5;

/**
 * Minimum recorded liability for BRAC sites that have not completed
 * cleanup. BRAC sites with active restoration should carry a non-zero
 * liability per SFFAS 5 para 39.
 */
const BRAC_MINIMUM_LIABILITY = 0;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseDate(dateStr: string): Date {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return d;
}

/**
 * Returns the number of full years between two dates.
 */
function yearsBetween(earlier: Date, later: Date): number {
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  return (later.getTime() - earlier.getTime()) / msPerYear;
}

/**
 * Computes the absolute difference and percentage difference between
 * the recorded liability and the estimated cost.
 */
function computeVariance(recorded: number, estimated: number): { diff: number; pct: number } {
  const diff = recorded - estimated;
  const pct = estimated !== 0 ? Math.abs(diff) / Math.abs(estimated) : (recorded !== 0 ? 1 : 0);
  return { diff, pct };
}

/**
 * Returns an empty EnvironmentalValidationResult for the given fiscal year.
 */
function emptyResult(fiscalYear: number): EnvironmentalValidationResult {
  return {
    fiscalYear,
    totalSites: 0,
    totalEstimatedCost: 0,
    totalRecordedLiability: 0,
    understatement: 0,
    overstatement: 0,
    findings: [],
    siteTypeSummary: {},
  };
}

// ---------------------------------------------------------------------------
// Core validation
// ---------------------------------------------------------------------------

/**
 * Validate environmental liabilities for a DoD engagement.
 *
 * For each environmental liability in the engagement data, performs the
 * following checks:
 *
 *   1. Recorded liability matches estimated cost within 10% tolerance
 *      (flags understatement or overstatement per SFFAS 6 paras 96-107)
 *   2. Estimate is not stale (lastEstimateUpdate within 2 years per
 *      DoD FMR Vol. 4, Ch. 13)
 *   3. BRAC sites carry proper restoration balances (SFFAS 5 paras 36-48)
 *   4. FUDS liabilities are tracked with non-zero recorded amounts
 *   5. Disposal liabilities for defense systems are recognized
 *
 * @param data - The full engagement data including dodData.environmentalLiabilities.
 * @returns A comprehensive validation result with findings and site-type summary.
 */
export function validateEnvironmentalLiabilities(
  data: EngagementData,
): EnvironmentalValidationResult {
  const fiscalYear = data.dodData?.fiscalYear ?? new Date().getFullYear();

  if (!data.dodData?.environmentalLiabilities) {
    return emptyResult(fiscalYear);
  }

  const liabilities = data.dodData.environmentalLiabilities;
  const findings: EnvironmentalFinding[] = [];
  const now = new Date();

  let totalEstimatedCost = 0;
  let totalRecordedLiability = 0;
  let understatement = 0;
  let overstatement = 0;

  for (const liability of liabilities) {
    totalEstimatedCost += liability.estimatedCost;
    totalRecordedLiability += liability.recordedLiability;

    // ------------------------------------------------------------------
    // 1. Verify recorded liability matches estimated cost (10% tolerance)
    //    Ref: SFFAS 6 paras 96-107
    // ------------------------------------------------------------------
    const { diff, pct } = computeVariance(liability.recordedLiability, liability.estimatedCost);

    if (pct > ESTIMATE_TOLERANCE_PCT) {
      if (diff < 0) {
        // Recorded liability is less than estimated cost (understatement)
        const gap = Math.abs(diff);
        understatement += gap;
        findings.push({
          siteId: liability.id,
          siteName: liability.siteName,
          findingType: 'understatement',
          severity: gap > 10_000_000 ? 'critical' : gap > 1_000_000 ? 'high' : 'medium',
          description:
            `Recorded liability ($${liability.recordedLiability.toLocaleString()}) is ` +
            `${(pct * 100).toFixed(1)}% below estimated cost ` +
            `($${liability.estimatedCost.toLocaleString()}) for site "${liability.siteName}". ` +
            `Understatement of $${gap.toLocaleString()} exceeds the 10% tolerance. ` +
            `Ref: SFFAS 6 paras 96-107.`,
          amountImpact: gap,
        });
      } else {
        // Recorded liability exceeds estimated cost (overstatement)
        const excess = Math.abs(diff);
        overstatement += excess;
        findings.push({
          siteId: liability.id,
          siteName: liability.siteName,
          findingType: 'overstatement',
          severity: excess > 10_000_000 ? 'critical' : excess > 1_000_000 ? 'high' : 'medium',
          description:
            `Recorded liability ($${liability.recordedLiability.toLocaleString()}) exceeds ` +
            `estimated cost ($${liability.estimatedCost.toLocaleString()}) by ` +
            `${(pct * 100).toFixed(1)}% for site "${liability.siteName}". ` +
            `Overstatement of $${excess.toLocaleString()} exceeds the 10% tolerance. ` +
            `Ref: SFFAS 6 paras 96-107.`,
          amountImpact: excess,
        });
      }
    }

    // ------------------------------------------------------------------
    // 2. Flag stale estimates (lastEstimateUpdate > 2 years)
    //    Ref: DoD FMR Vol. 4, Ch. 13
    // ------------------------------------------------------------------
    if (liability.lastEstimateUpdate) {
      const estimateDate = parseDate(liability.lastEstimateUpdate);
      const ageYears = yearsBetween(estimateDate, now);

      if (ageYears > MAX_ESTIMATE_AGE_YEARS) {
        findings.push({
          siteId: liability.id,
          siteName: liability.siteName,
          findingType: 'stale_estimate',
          severity: ageYears > 5 ? 'high' : 'medium',
          description:
            `Cleanup cost estimate for site "${liability.siteName}" was last updated on ` +
            `${liability.lastEstimateUpdate} (${ageYears.toFixed(1)} years ago). ` +
            `DoD FMR Vol. 4, Ch. 13 requires estimates be updated at least every ` +
            `${MAX_ESTIMATE_AGE_YEARS} years. Stale estimates may not reflect current ` +
            `regulatory requirements or site conditions.`,
          amountImpact: liability.estimatedCost,
        });
      }
    }

    // ------------------------------------------------------------------
    // 3. Verify BRAC sites have proper restoration balances
    //    Ref: SFFAS 5 paras 36-48, 10 U.S.C. ss2687
    // ------------------------------------------------------------------
    if (liability.siteType === 'brac') {
      if (liability.recordedLiability <= BRAC_MINIMUM_LIABILITY && liability.estimatedCost > 0) {
        findings.push({
          siteId: liability.id,
          siteName: liability.siteName,
          findingType: 'brac_compliance',
          severity: 'high',
          description:
            `BRAC site "${liability.siteName}" has estimated cleanup cost of ` +
            `$${liability.estimatedCost.toLocaleString()} but recorded liability is ` +
            `$${liability.recordedLiability.toLocaleString()}. BRAC sites with pending ` +
            `environmental restoration must carry an adequate liability balance per ` +
            `SFFAS 5 paras 36-48 and DoD FMR Vol. 4, Ch. 13.`,
          amountImpact: liability.estimatedCost,
        });
      }

      // BRAC sites should have an estimated completion date
      if (!liability.estimatedCompletionDate) {
        findings.push({
          siteId: liability.id,
          siteName: liability.siteName,
          findingType: 'brac_compliance',
          severity: 'medium',
          description:
            `BRAC site "${liability.siteName}" does not have an estimated completion ` +
            `date for environmental restoration. BRAC cleanup milestones must be ` +
            `tracked and disclosed per DoD FMR Vol. 4, Ch. 13.`,
          amountImpact: 0,
        });
      }
    }

    // ------------------------------------------------------------------
    // 4. Check FUDS liabilities are tracked
    //    Ref: 10 U.S.C. ss2700-2710 (DERP)
    // ------------------------------------------------------------------
    if (liability.siteType === 'fuds') {
      if (liability.estimatedCost > 0 && liability.recordedLiability <= 0) {
        findings.push({
          siteId: liability.id,
          siteName: liability.siteName,
          findingType: 'missing_liability',
          severity: 'high',
          description:
            `Formerly Used Defense Site "${liability.siteName}" has estimated cleanup ` +
            `cost of $${liability.estimatedCost.toLocaleString()} but no recorded ` +
            `liability. FUDS liabilities must be recognized under the Defense ` +
            `Environmental Restoration Program per 10 U.S.C. ss2700-2710 and ` +
            `SFFAS 5 paras 36-48.`,
          amountImpact: liability.estimatedCost,
        });
      }
    }

    // ------------------------------------------------------------------
    // 5. Validate disposal liabilities for defense systems
    //    Ref: SFFAS 6 paras 96-107
    // ------------------------------------------------------------------
    if (liability.siteType === 'disposal') {
      if (liability.estimatedCost > 0 && liability.recordedLiability <= 0) {
        findings.push({
          siteId: liability.id,
          siteName: liability.siteName,
          findingType: 'missing_liability',
          severity: 'high',
          description:
            `Disposal site "${liability.siteName}" for defense systems has estimated ` +
            `cleanup cost of $${liability.estimatedCost.toLocaleString()} but no ` +
            `recorded liability. Disposal costs for defense systems must be ` +
            `recognized as environmental liabilities per SFFAS 6 paras 96-107.`,
          amountImpact: liability.estimatedCost,
        });
      }

      // Disposal sites should have a cleanup methodology documented
      if (!liability.estimateMethodology || liability.estimateMethodology.trim() === '') {
        findings.push({
          siteId: liability.id,
          siteName: liability.siteName,
          findingType: 'missing_estimate',
          severity: 'medium',
          description:
            `Disposal site "${liability.siteName}" lacks a documented estimate ` +
            `methodology. All environmental liability estimates must include the ` +
            `methodology used per DoD FMR Vol. 4, Ch. 13 and SFFAS 6 para 100.`,
          amountImpact: 0,
        });
      }
    }
  }

  const siteTypeSummary = getEnvironmentalLiabilitySummary(liabilities);

  return {
    fiscalYear,
    totalSites: liabilities.length,
    totalEstimatedCost,
    totalRecordedLiability,
    understatement,
    overstatement,
    findings,
    siteTypeSummary,
  };
}

// ---------------------------------------------------------------------------
// Cleanup estimate assessment
// ---------------------------------------------------------------------------

/**
 * Assess an individual cleanup cost estimate for reasonableness and
 * methodological adequacy.
 *
 * Validates:
 *   - Estimate methodology is documented (SFFAS 6 para 100)
 *   - Selected estimate falls within the low-high range
 *   - Estimate range is reasonable (high/low ratio check)
 *   - Recorded liability aligns with the selected estimate
 *
 * @param liability - The environmental liability record.
 * @param estimate  - The optional cleanup estimate details.
 * @returns A finding if the estimate is deficient, or null if acceptable.
 */
export function assessCleanupEstimate(
  liability: EnvironmentalLiability,
  estimate?: CleanupEstimate,
): EnvironmentalFinding | null {
  // If no estimate exists, that itself is a finding
  if (!estimate) {
    if (liability.estimatedCost > 0) {
      return {
        siteId: liability.id,
        siteName: liability.siteName,
        findingType: 'missing_estimate',
        severity: liability.estimatedCost > 5_000_000 ? 'high' : 'medium',
        description:
          `Site "${liability.siteName}" carries an estimated cost of ` +
          `$${liability.estimatedCost.toLocaleString()} but has no detailed cleanup ` +
          `estimate on file. A documented estimate with methodology, range analysis, ` +
          `and supporting assumptions is required per SFFAS 6 para 100 and ` +
          `DoD FMR Vol. 4, Ch. 13.`,
        amountImpact: liability.estimatedCost,
      };
    }
    return null;
  }

  // Validate estimate methodology is documented
  if (!estimate.methodology || estimate.methodology.trim() === '') {
    return {
      siteId: liability.id,
      siteName: liability.siteName,
      findingType: 'missing_estimate',
      severity: 'medium',
      description:
        `Cleanup estimate for site "${liability.siteName}" lacks a documented ` +
        `methodology. SFFAS 6 para 100 requires disclosure of the estimation ` +
        `technique used (e.g., engineering cost estimate, probabilistic analysis).`,
      amountImpact: 0,
    };
  }

  // Validate selected estimate falls within the low-high range
  if (estimate.selectedEstimate < estimate.lowEstimate || estimate.selectedEstimate > estimate.highEstimate) {
    const deviation = estimate.selectedEstimate < estimate.lowEstimate
      ? estimate.lowEstimate - estimate.selectedEstimate
      : estimate.selectedEstimate - estimate.highEstimate;

    return {
      siteId: liability.id,
      siteName: liability.siteName,
      findingType: 'overstatement',
      severity: 'high',
      description:
        `Selected cleanup estimate of $${estimate.selectedEstimate.toLocaleString()} for ` +
        `site "${liability.siteName}" falls outside the estimated range ` +
        `($${estimate.lowEstimate.toLocaleString()} - $${estimate.highEstimate.toLocaleString()}). ` +
        `The selected estimate must be within the supportable range per SFFAS 6 paras 96-107.`,
      amountImpact: deviation,
    };
  }

  // Validate estimate range reasonableness
  if (estimate.lowEstimate > 0 && estimate.highEstimate / estimate.lowEstimate > ESTIMATE_RANGE_REASONABLENESS_FACTOR) {
    return {
      siteId: liability.id,
      siteName: liability.siteName,
      findingType: 'missing_estimate',
      severity: 'medium',
      description:
        `Cleanup estimate range for site "${liability.siteName}" is unreasonably wide: ` +
        `low $${estimate.lowEstimate.toLocaleString()} to high ` +
        `$${estimate.highEstimate.toLocaleString()} (${(estimate.highEstimate / estimate.lowEstimate).toFixed(1)}x ratio). ` +
        `A range exceeding ${ESTIMATE_RANGE_REASONABLENESS_FACTOR}x suggests insufficient ` +
        `site characterization or estimation uncertainty that should be resolved ` +
        `through additional investigation per DoD FMR Vol. 4, Ch. 13.`,
      amountImpact: estimate.highEstimate - estimate.lowEstimate,
    };
  }

  // Validate recorded liability aligns with selected estimate
  const { pct } = computeVariance(liability.recordedLiability, estimate.selectedEstimate);
  if (pct > ESTIMATE_TOLERANCE_PCT) {
    const diff = liability.recordedLiability - estimate.selectedEstimate;
    const findingType = diff < 0 ? 'understatement' : 'overstatement';
    return {
      siteId: liability.id,
      siteName: liability.siteName,
      findingType,
      severity: Math.abs(diff) > 5_000_000 ? 'high' : 'medium',
      description:
        `Recorded liability ($${liability.recordedLiability.toLocaleString()}) for ` +
        `site "${liability.siteName}" deviates from the selected cleanup estimate ` +
        `($${estimate.selectedEstimate.toLocaleString()}) by ${(pct * 100).toFixed(1)}%. ` +
        `The recorded amount should reflect the best estimate per SFFAS 6 paras 96-107.`,
      amountImpact: Math.abs(diff),
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

/**
 * Summarize environmental liabilities by site type.
 *
 * Aggregates the count, total estimated cost, and total recorded liability
 * for each site type (BRAC, FUDS, active installation, operational range,
 * disposal) to support note disclosures per SFFAS 6 para 107.
 *
 * @param liabilities - Array of environmental liability records.
 * @returns A record keyed by site type with aggregated financial data.
 */
export function getEnvironmentalLiabilitySummary(
  liabilities: EnvironmentalLiability[],
): EnvironmentalValidationResult['siteTypeSummary'] {
  const summary: Record<string, { count: number; estimatedCost: number; recordedLiability: number }> = {};

  for (const liability of liabilities) {
    const key = liability.siteType;

    if (!summary[key]) {
      summary[key] = { count: 0, estimatedCost: 0, recordedLiability: 0 };
    }

    summary[key].count += 1;
    summary[key].estimatedCost += liability.estimatedCost;
    summary[key].recordedLiability += liability.recordedLiability;
  }

  return summary;
}
