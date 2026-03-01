/**
 * Appropriation Lifecycle Management Engine
 *
 * Manages the complete lifecycle of a federal appropriation from
 * enactment through cancellation:
 *
 *   Enactment -> Apportionment -> Allotment -> Sub-Allotment
 *     -> Obligation -> Expenditure -> Disbursement
 *     -> Expiration (5-year window) -> Cancellation
 *
 * Key lifecycle concepts:
 *   - Apportionment: OMB distributes budget authority by time period
 *     (Category A) or by project/activity (Category B).
 *   - Allotment: Agency head delegates spending authority to subordinate
 *     organizations.
 *   - Expiration: After the period of availability ends, no new
 *     obligations may be incurred but existing obligations continue
 *     to liquidate for 5 years.
 *   - Cancellation: 5 years after expiration, all remaining balances
 *     are cancelled and returned to Treasury.
 *   - Continuing Resolution (CR): When a full-year appropriation is not
 *     enacted, agencies operate under a CR at pro-rata prior-year levels.
 *
 * References:
 *   - DoD FMR Vol. 3, Ch. 1  (Budget Execution - General)
 *   - DoD FMR Vol. 3, Ch. 4  (Apportionment and Reapportionment)
 *   - DoD FMR Vol. 3, Ch. 6  (Allotments)
 *   - DoD FMR Vol. 14, Ch. 1 (Appropriation Overview)
 *   - 31 U.S.C. ss1341, ss1501-1558 (Budget and Accounting)
 *   - OMB Circular A-11 (Preparation, Submission, and Execution of the Budget)
 */

import type { Appropriation, FundControl } from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';

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

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 86_400_000;
  return Math.floor((b.getTime() - a.getTime()) / msPerDay);
}

/**
 * Computes the cancellation date, which is 5 fiscal years after the
 * expiration date per 31 U.S.C. ss1552(a).
 */
function computeCancellationDate(expirationDate: Date): Date {
  return new Date(
    expirationDate.getFullYear() + 5,
    expirationDate.getMonth(),
    expirationDate.getDate(),
  );
}

/**
 * Derives the effective status of an appropriation based on its type
 * and date parameters, without relying on the stored status field.
 */
function deriveStatus(
  appropriation: Appropriation,
  asOf: Date,
): 'current' | 'expired' | 'cancelled' {
  // No-year appropriations never expire
  if (appropriation.appropriationType === 'no_year') {
    return 'current';
  }

  const expirationDate = appropriation.expirationDate
    ? parseDate(appropriation.expirationDate)
    : parseDate(appropriation.fiscalYearEnd);

  if (asOf <= expirationDate) {
    return 'current';
  }

  const cancellationDate = appropriation.cancellationDate
    ? parseDate(appropriation.cancellationDate)
    : computeCancellationDate(expirationDate);

  if (asOf <= cancellationDate) {
    return 'expired';
  }

  return 'cancelled';
}

// ---------------------------------------------------------------------------
// Core engine functions
// ---------------------------------------------------------------------------

/**
 * Creates a new appropriation record with Treasury Account Symbol,
 * initializing all balance fields to 0.
 *
 * Establishes the initial appropriation. The totalAuthority is set from
 * the input data, and unobligatedBalance starts equal to totalAuthority
 * before any apportionment. All other balance fields (apportioned,
 * allotted, committed, obligated, disbursed) initialize to zero.
 *
 * Ref: DoD FMR Vol. 14, Ch. 1, para 010101
 *
 * @param data - Partial appropriation data. Must include at minimum a
 *               treasuryAccountSymbol. Other fields default to safe values.
 * @returns A fully initialized Appropriation record.
 */
export function createAppropriation(data: Partial<Appropriation>): Appropriation {
  const now = new Date();
  const totalAuthority = data.totalAuthority ?? 0;

  if (totalAuthority < 0) {
    throw new Error('Total authority cannot be negative');
  }

  const tas = data.treasuryAccountSymbol?.trim();
  if (!tas) {
    throw new Error('Treasury Account Symbol (TAS) is required');
  }

  const fyStart = data.fiscalYearStart || now.toISOString();
  const fyEnd = data.fiscalYearEnd || new Date(now.getFullYear() + 1, 8, 30).toISOString();

  // Compute expiration and cancellation dates
  const appropriationType = data.appropriationType || 'one_year';
  let expirationDate: string | undefined = data.expirationDate;
  let cancellationDate: string | undefined = data.cancellationDate;

  if (appropriationType === 'one_year') {
    expirationDate = expirationDate || fyEnd;
    cancellationDate = cancellationDate || computeCancellationDate(parseDate(expirationDate)).toISOString();
  } else if (appropriationType === 'multi_year') {
    expirationDate = expirationDate || fyEnd;
    cancellationDate = cancellationDate || computeCancellationDate(parseDate(expirationDate)).toISOString();
  } else if (appropriationType === 'no_year') {
    expirationDate = undefined;
    cancellationDate = undefined;
  }

  return {
    id: data.id || uuid(),
    engagementId: data.engagementId || '',
    treasuryAccountSymbol: tas,
    appropriationType,
    appropriationTitle: data.appropriationTitle || '',
    budgetCategory: data.budgetCategory || 'other',
    fiscalYearStart: fyStart,
    fiscalYearEnd: fyEnd,
    expirationDate,
    cancellationDate,
    totalAuthority,
    apportioned: 0,
    allotted: 0,
    committed: 0,
    obligated: 0,
    disbursed: 0,
    unobligatedBalance: totalAuthority,
    status: 'current',
    sfisData: data.sfisData,
    createdAt: now.toISOString(),
  };
}

/**
 * Records an OMB apportionment against an appropriation.
 *
 * Apportionments are the first level of fund distribution from OMB:
 *   - Category A: time-based (quarterly or monthly distribution)
 *   - Category B: project/activity-based (lump sum by program)
 *
 * The total apportioned cannot exceed total budget authority.
 * Creates a FundControl record at the apportionment level.
 *
 * Ref: DoD FMR Vol. 3, Ch. 4, para 040201
 * Ref: OMB Circular A-11, Section 120
 *
 * @param appropriation - The appropriation to apportion against.
 * @param amount        - The dollar amount to apportion.
 * @param category      - 'A' (time-based) or 'B' (project-based).
 * @param period        - For Category A, the time period (e.g. 'Q1 FY2026');
 *                        for Category B, the project/activity identifier.
 * @returns An object with the updated appropriation and a new FundControl record.
 */
export function apportionFunds(
  appropriation: Appropriation,
  amount: number,
  category: 'A' | 'B',
  period?: string,
): { appropriation: Appropriation; fundControl: FundControl } {
  if (amount <= 0) {
    throw new Error('Apportionment amount must be positive');
  }

  const newApportioned = appropriation.apportioned + amount;
  if (newApportioned > appropriation.totalAuthority) {
    throw new Error(
      `Apportionment of $${amount.toFixed(2)} would bring total apportioned ` +
      `($${newApportioned.toFixed(2)}) above total authority ` +
      `($${appropriation.totalAuthority.toFixed(2)}). OMB cannot apportion ` +
      `more than available budget authority. (OMB Circular A-11, Section 120.30)`,
    );
  }

  // Verify appropriation can accept new apportionments
  const status = deriveStatus(appropriation, new Date());
  if (status !== 'current' && appropriation.appropriationType !== 'no_year') {
    throw new Error(
      `Cannot apportion funds to ${status} appropriation ` +
      `${appropriation.treasuryAccountSymbol}`,
    );
  }

  const now = new Date().toISOString();

  const updatedAppropriation: Appropriation = {
    ...appropriation,
    apportioned: newApportioned,
  };

  const fundControl: FundControl = {
    id: uuid(),
    appropriationId: appropriation.id,
    controlLevel: 'apportionment',
    amount,
    obligatedAgainst: 0,
    expendedAgainst: 0,
    availableBalance: amount,
    controlledBy: `OMB Apportionment - Category ${category}${period ? ` (${period})` : ''}`,
    effectiveDate: now,
    expirationDate: appropriation.expirationDate,
  };

  return { appropriation: updatedAppropriation, fundControl };
}

/**
 * Records an allotment - the delegation of spending authority from
 * the agency head to a subordinate organizational unit.
 *
 * Allotments are the primary administrative control point for the
 * Anti-Deficiency Act (31 U.S.C. ss1517). Exceeding an allotment
 * is a reportable ADA violation.
 *
 * The total allotted cannot exceed the total apportioned amount.
 * Creates a FundControl record at the allotment level.
 *
 * Ref: DoD FMR Vol. 3, Ch. 6, para 060201
 *
 * @param appropriation       - The appropriation to allot against.
 * @param amount              - The dollar amount to allot.
 * @param organizationCode    - The code of the subordinate org receiving the allotment.
 * @param apportionmentControl - The parent apportionment FundControl (validated against).
 * @returns An object with the updated appropriation and a new allotment FundControl.
 */
export function allotFunds(
  appropriation: Appropriation,
  amount: number,
  organizationCode: string,
  apportionmentControl: FundControl,
): { appropriation: Appropriation; fundControl: FundControl } {
  if (amount <= 0) {
    throw new Error('Allotment amount must be positive');
  }

  if (!organizationCode || organizationCode.trim() === '') {
    throw new Error('Organization code is required for allotment');
  }

  // Allotments cannot exceed apportioned amount
  const newAllotted = appropriation.allotted + amount;
  if (newAllotted > appropriation.apportioned) {
    throw new Error(
      `Allotment of $${amount.toFixed(2)} would bring total allotted ` +
      `($${newAllotted.toFixed(2)}) above total apportioned ` +
      `($${appropriation.apportioned.toFixed(2)}). ` +
      `Allotments cannot exceed OMB apportionment. ` +
      `(DoD FMR Vol. 3, Ch. 6, para 060202)`,
    );
  }

  // Validate against the specific apportionment control
  if (amount > apportionmentControl.availableBalance) {
    throw new Error(
      `Allotment of $${amount.toFixed(2)} exceeds remaining apportionment ` +
      `balance of $${apportionmentControl.availableBalance.toFixed(2)} ` +
      `(${apportionmentControl.controlledBy})`,
    );
  }

  const now = new Date().toISOString();

  const updatedAppropriation: Appropriation = {
    ...appropriation,
    allotted: newAllotted,
  };

  // Reduce the parent apportionment's available balance
  apportionmentControl.availableBalance -= amount;

  const fundControl: FundControl = {
    id: uuid(),
    appropriationId: appropriation.id,
    controlLevel: 'allotment',
    amount,
    obligatedAgainst: 0,
    expendedAgainst: 0,
    availableBalance: amount,
    controlledBy: `Allotment to ${organizationCode}`,
    effectiveDate: now,
    expirationDate: appropriation.expirationDate,
  };

  return { appropriation: updatedAppropriation, fundControl };
}

/**
 * Creates a sub-allotment - further delegation of spending authority
 * from an allottee to a sub-organization.
 *
 * Sub-allotments provide granular fund control below the allotment
 * level. They cannot exceed the parent allotment's available balance.
 *
 * Ref: DoD FMR Vol. 3, Ch. 6, para 060301
 *
 * @param allotmentControl - The parent allotment FundControl.
 * @param amount           - The dollar amount to sub-allot.
 * @param subOrgCode       - The sub-organization code receiving the sub-allotment.
 * @returns A new FundControl at the sub_allotment level.
 */
export function subAllotFunds(
  allotmentControl: FundControl,
  amount: number,
  subOrgCode: string,
): FundControl {
  if (amount <= 0) {
    throw new Error('Sub-allotment amount must be positive');
  }

  if (!subOrgCode || subOrgCode.trim() === '') {
    throw new Error('Sub-organization code is required for sub-allotment');
  }

  if (amount > allotmentControl.availableBalance) {
    throw new Error(
      `Sub-allotment of $${amount.toFixed(2)} exceeds remaining allotment ` +
      `balance of $${allotmentControl.availableBalance.toFixed(2)} ` +
      `(${allotmentControl.controlledBy}). ` +
      `(DoD FMR Vol. 3, Ch. 6, para 060302)`,
    );
  }

  // Reduce the parent allotment's available balance
  allotmentControl.availableBalance -= amount;

  const subAllotment: FundControl = {
    id: uuid(),
    appropriationId: allotmentControl.appropriationId,
    controlLevel: 'sub_allotment',
    amount,
    obligatedAgainst: 0,
    expendedAgainst: 0,
    availableBalance: amount,
    controlledBy: `Sub-allotment to ${subOrgCode} (under ${allotmentControl.controlledBy})`,
    effectiveDate: new Date().toISOString(),
    expirationDate: allotmentControl.expirationDate,
  };

  return subAllotment;
}

/**
 * Handles expiration of an appropriation.
 *
 * When an appropriation expires:
 *   1. No new obligations may be incurred.
 *   2. Existing obligations may continue to liquidate (be paid).
 *   3. Upward adjustments to existing obligations are permitted only
 *      if within scope of the original obligation.
 *   4. Deobligations of expired-year funds do not create new obligating
 *      authority (funds go to the "M" account).
 *
 * Ref: DoD FMR Vol. 3, Ch. 8, para 080701
 * Ref: 31 U.S.C. ss1553
 *
 * @param appropriation - The appropriation to expire.
 * @returns A new Appropriation with status set to 'expired'.
 */
export function expireAppropriation(appropriation: Appropriation): Appropriation {
  if (appropriation.appropriationType === 'no_year') {
    throw new Error(
      `No-year appropriation ${appropriation.treasuryAccountSymbol} does not ` +
      `expire based on time. Requires specific legislative action.`,
    );
  }

  if (appropriation.status === 'expired') {
    throw new Error(
      `Appropriation ${appropriation.treasuryAccountSymbol} is already expired.`,
    );
  }

  if (appropriation.status === 'cancelled') {
    throw new Error(
      `Appropriation ${appropriation.treasuryAccountSymbol} is already cancelled.`,
    );
  }

  return {
    ...appropriation,
    status: 'expired',
  };
}

/**
 * Handles cancellation of an appropriation per the 5-year rule.
 *
 * Cancellation occurs 5 fiscal years after expiration per
 * 31 U.S.C. ss1552(a). At cancellation:
 *   1. All remaining obligated and unobligated balances are cancelled.
 *   2. Unliquidated obligations are returned to Treasury.
 *   3. Any subsequent valid charges must be paid from current-year
 *      funds of the same type.
 *
 * Ref: DoD FMR Vol. 3, Ch. 8, para 080801
 * Ref: 31 U.S.C. ss1552(a)
 *
 * @param appropriation - The appropriation to cancel.
 * @returns A new Appropriation with status set to 'cancelled' and
 *          remaining balances zeroed.
 */
export function cancelAppropriation(appropriation: Appropriation): Appropriation {
  if (appropriation.appropriationType === 'no_year') {
    throw new Error(
      `No-year appropriation ${appropriation.treasuryAccountSymbol} does not ` +
      `cancel based on time. Requires specific legislative action.`,
    );
  }

  if (appropriation.status === 'current') {
    throw new Error(
      `Appropriation ${appropriation.treasuryAccountSymbol} is still current ` +
      `and cannot be cancelled. It must expire first.`,
    );
  }

  if (appropriation.status === 'cancelled') {
    throw new Error(
      `Appropriation ${appropriation.treasuryAccountSymbol} is already cancelled.`,
    );
  }

  return {
    ...appropriation,
    status: 'cancelled',
    unobligatedBalance: 0,
  };
}

/**
 * Computes Continuing Resolution (CR) pro-rata funding levels.
 *
 * Under a CR, agencies are funded at a rate derived from the prior
 * fiscal year's enacted level, prorated for the duration of the CR:
 *
 *   CR Amount = min(prior year rate x pro-rata, new request)
 *
 * The appropriation's totalAuthority is updated to the calculated
 * CR level.
 *
 * Additional restrictions under a CR:
 *   - No new programs or activities not funded in the prior year.
 *   - No rate increases above prior-year levels.
 *   - "Anomalies" may be enacted to adjust specific accounts.
 *
 * Ref: DoD FMR Vol. 3, Ch. 1, para 010502
 * Ref: OMB Circular A-11, Section 123 (Continuing Resolutions)
 *
 * @param appropriation   - The appropriation to compute CR funding for.
 * @param priorYearAmount - The prior fiscal year's enacted amount.
 * @param craProRataDays  - The number of days the CR covers.
 * @param totalDays       - Total days in the full fiscal year (typically 365).
 * @returns A new Appropriation with totalAuthority set to the CR level.
 */
export function handleContinuingResolution(
  appropriation: Appropriation,
  priorYearAmount: number,
  craProRataDays: number,
  totalDays: number,
): Appropriation {
  if (priorYearAmount < 0) {
    throw new Error('Prior year amount cannot be negative');
  }
  if (craProRataDays <= 0) {
    throw new Error('CR pro-rata days must be positive');
  }
  if (totalDays <= 0) {
    throw new Error('Total days must be positive');
  }
  if (craProRataDays > totalDays) {
    throw new Error(
      `CR days (${craProRataDays}) cannot exceed total days (${totalDays})`,
    );
  }

  const proRataRatio = craProRataDays / totalDays;
  const proRataAmount = priorYearAmount * proRataRatio;

  // The CR level is the minimum of the pro-rata calculation and
  // any new request (if a new request was set as totalAuthority)
  const crAuthority = appropriation.totalAuthority > 0
    ? Math.min(proRataAmount, appropriation.totalAuthority)
    : proRataAmount;

  return {
    ...appropriation,
    totalAuthority: crAuthority,
    unobligatedBalance: crAuthority - appropriation.obligated,
  };
}

/**
 * Calculates the available balance breakdown for an appropriation.
 *
 * Returns:
 *   - unobligated: total authority minus obligated (funds available
 *     for new obligations if the appropriation is current).
 *   - unexpended: obligated minus disbursed (funds committed but
 *     not yet paid out).
 *   - total: total budget authority.
 *
 * Ref: DoD FMR Vol. 3, Ch. 8, para 080101
 *
 * @param appropriation - The appropriation to calculate balances for.
 * @returns An object with unobligated, unexpended, and total balances.
 */
export function calculateAvailableBalance(
  appropriation: Appropriation,
): { unobligated: number; unexpended: number; total: number } {
  const unobligated = appropriation.totalAuthority - appropriation.obligated;
  const unexpended = appropriation.obligated - appropriation.disbursed;
  const total = appropriation.totalAuthority;

  return { unobligated, unexpended, total };
}
