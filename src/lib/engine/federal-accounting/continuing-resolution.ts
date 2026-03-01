/**
 * Continuing Resolution (CR) Engine
 *
 * Handles automatic constraint of apportionment levels during periods
 * when a full-year appropriation has not been enacted. Most fiscal years
 * begin under a CR, making this engine critical for accurate fund control.
 *
 * CR mechanics (DoD FMR Vol. 3, Ch. 1-2; OMB Circular A-11, Sec. 123):
 *   - Default rate: agencies are funded at the prior-year rate (annualized)
 *   - Prorated: the CR rate is prorated for the period of the CR
 *   - Anomalies: specific items may receive different treatment
 *   - New starts: generally prohibited under a CR
 *   - Long-lead procurement: may be permitted with specific language
 *
 * Apportionment under a CR (OMB Bulletin):
 *   - OMB issues an automatic apportionment at the CR rate
 *   - Agencies may not exceed the prorated amount
 *   - Exceeding the CR apportionment = ADA violation under 31 U.S.C. §1517
 *
 * References:
 *   - DoD FMR Vol. 3, Ch. 1-2: Budget Execution under CRs
 *   - OMB Circular A-11, Section 123: CRs and Apportionment
 *   - 31 U.S.C. §1515: CR Authority
 *   - GAO Red Book, Ch. 8: Continuing Resolutions
 */

import type {
  Appropriation,
  ContinuingResolution,
  CRConstraintResult,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  CRAnomaly,
} from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  return Math.floor((b.getTime() - a.getTime()) / msPerDay);
}

function parseDate(dateStr: string): Date {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return d;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate the CR rate (annualized) for an appropriation.
 *
 * Per OMB Circular A-11, Section 123: Under a standard CR, the rate of
 * operations is the lower of:
 *   - The prior fiscal year enacted level
 *   - The current-year President's Budget request
 *   - The House-passed or Senate-passed amount
 *
 * For simplicity, this engine uses the 'prior_year_rate' formula by default,
 * which is the most common CR formulation.
 *
 * @param cr - The Continuing Resolution parameters
 * @param priorYearAmount - The prior fiscal year enacted amount
 * @param currentRequest - Optional: the President's Budget request
 * @returns The annualized CR rate
 */
export function calculateCRRate(
  cr: ContinuingResolution,
  priorYearAmount: number,
  currentRequest?: number,
): number {
  switch (cr.rateFormula) {
    case 'prior_year_rate':
      return priorYearAmount;

    case 'lowest_of_house_senate_prior':
      // In practice, use the lowest of available amounts
      if (currentRequest !== undefined) {
        return Math.min(priorYearAmount, currentRequest);
      }
      return priorYearAmount;

    case 'custom':
      if (cr.customRatePct !== undefined) {
        return round2(priorYearAmount * (cr.customRatePct / 100));
      }
      return priorYearAmount;

    default:
      return priorYearAmount;
  }
}

/**
 * Apply CR constraints to an appropriation's apportionment.
 *
 * Per OMB Bulletin on CR apportionment: The apportionment under a CR
 * is prorated based on the number of days the CR is in effect relative
 * to the full fiscal year (365 days). Anomalies may override the
 * standard rate for specific appropriations.
 *
 * @param appropriation - The Appropriation to constrain
 * @param cr - The active Continuing Resolution
 * @param priorYearAmount - Prior year enacted amount for this TAS
 * @param asOfDate - The date to calculate prorated amount for
 * @returns CRConstraintResult with constrained amounts
 */
export function applyCRConstraints(
  appropriation: Appropriation,
  cr: ContinuingResolution,
  priorYearAmount: number,
  asOfDate: string,
): CRConstraintResult {
  // Check if CR is active for this date
  const checkDate = parseDate(asOfDate);
  const crStart = parseDate(cr.startDate);
  const crEnd = parseDate(cr.endDate);

  if (checkDate < crStart || checkDate > crEnd) {
    return {
      crActive: false,
      constrainedAmount: appropriation.apportioned,
      originalApportionment: appropriation.apportioned,
      crRateApplied: 0,
      priorYearAmount,
      anomalyApplied: false,
      violation: false,
    };
  }

  // Calculate annualized CR rate
  const annualizedRate = calculateCRRate(cr, priorYearAmount);

  // Check for anomalies specific to this appropriation
  const anomaly = cr.anomalies.find(
    a => a.appropriationId === appropriation.id,
  );

  let effectiveRate: number;
  let anomalyApplied = false;
  let anomalyDescription: string | undefined;

  if (anomaly) {
    effectiveRate = anomaly.adjustedRate;
    anomalyApplied = true;
    anomalyDescription = anomaly.description;
  } else {
    effectiveRate = annualizedRate;
  }

  // Prorate for the period of the CR
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const fyStart = new Date(`${cr.fiscalYear - 1}-10-01`);
  const totalFYDays = 365;
  const crDays = daysBetween(crStart, checkDate) + 1;
  const prorationFactor = Math.min(crDays / totalFYDays, 1.0);

  const constrainedAmount = round2(effectiveRate * prorationFactor);

  // Check if current obligations exceed the CR constraint
  const violation = appropriation.obligated > constrainedAmount;
  const violationAmount = violation
    ? round2(appropriation.obligated - constrainedAmount)
    : undefined;

  return {
    crActive: true,
    constrainedAmount,
    originalApportionment: appropriation.apportioned,
    crRateApplied: effectiveRate,
    priorYearAmount,
    anomalyApplied,
    anomalyDescription,
    violation: violation,
    violationAmount,
  };
}

/**
 * Detect CR violations across all appropriations.
 *
 * Per 31 U.S.C. §1517: Obligations that exceed the prorated CR amount
 * at the apportionment level constitute an ADA violation. This function
 * checks all appropriations against their CR-constrained levels.
 *
 * @param appropriations - All Appropriation records
 * @param cr - The active Continuing Resolution
 * @param priorYearAmounts - Map of appropriation ID -> prior year amount
 * @param asOfDate - The date to check
 * @returns Array of constraint results, with violations flagged
 */
export function detectCRViolations(
  appropriations: Appropriation[],
  cr: ContinuingResolution,
  priorYearAmounts: Map<string, number>,
  asOfDate: string,
): CRConstraintResult[] {
  return appropriations.map(approp => {
    const priorYear = priorYearAmounts.get(approp.id) || approp.totalAuthority;
    return applyCRConstraints(approp, cr, priorYear, asOfDate);
  });
}

/**
 * Determines whether new obligations are permitted under a CR.
 *
 * Per OMB Circular A-11, Section 123 and GAO Red Book, Ch. 8:
 *   - New starts are generally prohibited unless the CR includes
 *     specific language permitting them
 *   - Continuing activities at the prior-year rate is permitted
 *   - Long-lead procurement may be permitted with specific authority
 *
 * @param cr - The active Continuing Resolution
 * @param isNewStart - Whether this is a new program/project/activity
 * @param appropriation - The appropriation being obligated
 * @returns Whether the obligation is permitted and the reason
 */
export function isObligationPermittedUnderCR(
  cr: ContinuingResolution,
  isNewStart: boolean,
  appropriation: Appropriation,
): { permitted: boolean; reason: string } {
  // Check if CR is active
  if (cr.status !== 'active') {
    return {
      permitted: true,
      reason: 'CR is not active; full-year appropriation in effect.',
    };
  }

  // New starts are generally prohibited under a CR
  if (isNewStart) {
    // Check if there's an anomaly permitting this new start
    const anomaly = cr.anomalies.find(
      a => a.appropriationId === appropriation.id,
    );
    if (anomaly) {
      return {
        permitted: true,
        reason: `New start permitted by CR anomaly: ${anomaly.description}. ` +
                `Authority: ${anomaly.authority}.`,
      };
    }
    return {
      permitted: false,
      reason: 'New starts are prohibited under continuing resolutions ' +
              'unless specifically authorized by anomaly language. ' +
              'Ref: GAO Red Book, Ch. 8; OMB A-11, Sec. 123.',
    };
  }

  return {
    permitted: true,
    reason: 'Continuing activities at the prior-year rate are permitted under the CR.',
  };
}
