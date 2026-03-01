/**
 * SF-133 Report on Budget Execution and Budgetary Resources Generator
 *
 * Generates the Standard Form 133, the primary budget execution report
 * submitted to OMB and Treasury. The SF-133 reports the status of budgetary
 * resources by Treasury Account Symbol (TAS) for each reporting period.
 *
 * The report has three major sections:
 *   Section A: Budgetary Resources
 *   Section B: Status of Budgetary Resources
 *   Section C: Change in Obligated Balance / Outlays
 *
 * References:
 *   - OMB Circular A-11, Section 130: SF-133 Requirements
 *   - 31 USC Chapter 15: Appropriation Accounting
 *   - Treasury Financial Manual (TFM) Volume I, Part 2
 *   - DoD 7000.14-R, Volume 6A: Reporting Policy
 *   - USSGL TFM Supplement, Section V: Crosswalk to SF-133
 */

import type { Appropriation, Obligation, SF133Data } from '@/types/dod-fmr';

/**
 * Disbursement record used for SF-133 outlay calculations.
 * Mirrors the Disbursement interface from @/types/dod-fmr.
 */
interface Disbursement {
  id: string;
  engagementId: string;
  obligationId: string;
  disbursementNumber: string;
  amount: number;
  disbursementDate: string;
  status: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate SF-133 report data from source records.
 *
 * Per OMB Circular A-11, Section 130: The SF-133 is compiled from appropriation
 * status data, obligation records, and disbursement records. It is submitted
 * quarterly (monthly for certain accounts) through the GTAS system.
 *
 * Section A: Budgetary Resources
 *   - unobligatedBalanceBroughtForward: the unobligated balance carried over
 *     from the prior fiscal year
 *   - adjustments: prior-year recoveries, transfers, and other adjustments
 *   - newBudgetAuthority: from totalAuthority (appropriations received)
 *   - spendingAuthority: from offsetting collections
 *
 * Section B: Status of Budgetary Resources
 *   - newObligationsAndUpwardAdjustments: sum of obligations in the period
 *   - unobligatedBalanceEndOfYear: total resources minus obligations
 *   - apportionedUnexpired, unapportionedUnexpired, expired subdivisions
 *
 * Section C: Outlays
 *   - Net obligations, obligated balance changes, and outlays from disbursements
 *
 * @param appropriation - the Appropriation record for this TAS
 * @param obligations - all Obligation records for this TAS
 * @param disbursements - all Disbursement records for this TAS
 * @param fiscalYear - the fiscal year being reported
 * @param period - the reporting period (e.g., "2025-Q1", "2025-09")
 * @returns SF133Data structure with all computed sections
 */
export function generateSF133(
  appropriation: Appropriation,
  obligations: Obligation[],
  disbursements: Disbursement[],
  fiscalYear: number,
  period: string,
): SF133Data {
  // ========================================================================
  // Section A: Budgetary Resources
  // ========================================================================

  // Line 1000: Unobligated balance brought forward, Oct 1
  const activeObligations = obligations.filter(o => o.status !== 'deobligated');
  const totalCurrentObligations = activeObligations.reduce((sum, o) => sum + o.amount, 0);

  // Unobligated balance brought forward: prior-year carryover
  const unobligatedBalanceBroughtForward = round2(
    Math.max(0, appropriation.unobligatedBalance),
  );

  // Line 1020: Adjustments (recoveries of prior-year obligations, transfers, etc.)
  const deobligated = obligations
    .filter(o => o.status === 'deobligated')
    .reduce((sum, o) => sum + o.amount, 0);
  const adjustments = round2(deobligated);

  // Lines 1100-1160: New budget authority (appropriations received)
  const newBudgetAuthority = round2(appropriation.totalAuthority);

  // Lines 1700-1750: Spending authority from offsetting collections
  const spendingAuthority = round2(
    Math.max(0, appropriation.totalAuthority - appropriation.allotted),
  );

  // Line 1910: Total budgetary resources
  const totalBudgetaryResources = round2(
    unobligatedBalanceBroughtForward +
    adjustments +
    newBudgetAuthority +
    spendingAuthority,
  );

  // ========================================================================
  // Section B: Status of Budgetary Resources
  // ========================================================================

  // Line 2001: New obligations and upward adjustments
  const obligationAdjustments = activeObligations.reduce(
    (sum, o) => sum + o.adjustmentAmount,
    0,
  );
  const newObligationsAndUpwardAdjustments = round2(
    totalCurrentObligations + obligationAdjustments,
  );

  // Line 2204: Unobligated balance, end of year
  const unobligatedBalanceEndOfYear = round2(
    totalBudgetaryResources - newObligationsAndUpwardAdjustments,
  );

  // Line 2204A: Apportioned, unexpired accounts
  const apportionedUnexpired = round2(
    appropriation.status === 'current'
      ? Math.max(0, appropriation.apportioned - appropriation.obligated)
      : 0,
  );

  // Line 2204B: Unapportioned, unexpired accounts
  const unapportionedUnexpired = round2(
    appropriation.status === 'current'
      ? Math.max(0, unobligatedBalanceEndOfYear - apportionedUnexpired)
      : 0,
  );

  // Line 2204C: Expired unobligated balance
  const expired = round2(
    appropriation.status === 'expired'
      ? unobligatedBalanceEndOfYear
      : 0,
  );

  // ========================================================================
  // Section C: Change in Obligated Balance / Outlays
  // ========================================================================

  // Line 3001: Unpaid obligations, brought forward, Oct 1
  const obligatedBalanceNetBeginning = round2(
    activeObligations.reduce((sum, o) => sum + o.unliquidatedBalance, 0),
  );

  // Line 3010: New obligations (same as Line 2001)
  const newObligations = round2(newObligationsAndUpwardAdjustments);

  // Line 3020: Outlays (gross disbursements)
  const activeDisbursements = disbursements.filter(
    d => d.status === 'released' || d.status === 'certified',
  );
  const outlaysNet = round2(
    activeDisbursements.length > 0
      ? activeDisbursements.reduce((sum, d) => sum + d.amount, 0)
      : appropriation.disbursed,
  );

  // Line 3050: Unpaid obligations, end of year
  const obligatedBalanceNetEnd = round2(
    obligatedBalanceNetBeginning + newObligations - outlaysNet,
  );

  return {
    treasuryAccountSymbol: appropriation.treasuryAccountSymbol,
    fiscalYear,
    period,
    budgetaryResources: {
      unobligatedBalanceBroughtForward,
      adjustments,
      newBudgetAuthority,
      spendingAuthority,
      totalBudgetaryResources,
    },
    statusOfBudgetaryResources: {
      newObligationsAndUpwardAdjustments,
      unobligatedBalanceEndOfYear,
      apportionedUnexpired,
      unapportionedUnexpired,
      expired,
    },
    outlays: {
      newObligations,
      obligatedBalanceNetBeginning,
      obligatedBalanceNetEnd,
      outlaysNet,
    },
  };
}

/**
 * Validate an SF-133 report for internal consistency.
 *
 * Per OMB Circular A-11, Section 130: The SF-133 must balance -- total
 * budgetary resources (Section A) must equal total status of budgetary
 * resources (Section B). Additionally, the outlay section must be
 * internally consistent.
 *
 * @param data - the SF133Data to validate
 * @returns Validation result with any errors found
 */
export function validateSF133(
  data: SF133Data,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // --- Section A total check ---
  const computedTotal =
    data.budgetaryResources.unobligatedBalanceBroughtForward +
    data.budgetaryResources.adjustments +
    data.budgetaryResources.newBudgetAuthority +
    data.budgetaryResources.spendingAuthority;
  const sectionADiff = Math.abs(
    computedTotal - data.budgetaryResources.totalBudgetaryResources,
  );
  if (sectionADiff > 0.01) {
    errors.push(
      `Section A total budgetary resources ($${data.budgetaryResources.totalBudgetaryResources.toFixed(2)}) ` +
      `does not equal sum of components ($${computedTotal.toFixed(2)}). ` +
      `Difference: $${sectionADiff.toFixed(2)}. Ref: OMB A-11, Section 130.`,
    );
  }

  // --- Section A = Section B balance check ---
  const sectionBTotal =
    data.statusOfBudgetaryResources.newObligationsAndUpwardAdjustments +
    data.statusOfBudgetaryResources.unobligatedBalanceEndOfYear;
  const abDiff = Math.abs(
    data.budgetaryResources.totalBudgetaryResources - sectionBTotal,
  );
  if (abDiff > 0.01) {
    errors.push(
      `Section A total ($${data.budgetaryResources.totalBudgetaryResources.toFixed(2)}) ` +
      `does not equal Section B total ($${sectionBTotal.toFixed(2)}). ` +
      `Difference: $${abDiff.toFixed(2)}. This is a fundamental SF-133 balance error. ` +
      `Ref: OMB A-11, Section 130.`,
    );
  }

  // --- Section B unobligated balance subdivision check ---
  const subdivisionTotal =
    data.statusOfBudgetaryResources.apportionedUnexpired +
    data.statusOfBudgetaryResources.unapportionedUnexpired +
    data.statusOfBudgetaryResources.expired;
  const subdivDiff = Math.abs(
    subdivisionTotal - data.statusOfBudgetaryResources.unobligatedBalanceEndOfYear,
  );
  if (subdivDiff > 0.01) {
    errors.push(
      `Unobligated balance subdivisions ($${subdivisionTotal.toFixed(2)}) do not sum ` +
      `to total unobligated balance ($${data.statusOfBudgetaryResources.unobligatedBalanceEndOfYear.toFixed(2)}). ` +
      `Difference: $${subdivDiff.toFixed(2)}. Ref: OMB A-11, Section 130.`,
    );
  }

  // --- Section C obligated balance continuity check ---
  const expectedEndBalance =
    data.outlays.obligatedBalanceNetBeginning +
    data.outlays.newObligations -
    data.outlays.outlaysNet;
  const endBalDiff = Math.abs(
    expectedEndBalance - data.outlays.obligatedBalanceNetEnd,
  );
  if (endBalDiff > 0.01) {
    errors.push(
      `Obligated balance end of year ($${data.outlays.obligatedBalanceNetEnd.toFixed(2)}) ` +
      `does not equal beginning ($${data.outlays.obligatedBalanceNetBeginning.toFixed(2)}) + ` +
      `new obligations ($${data.outlays.newObligations.toFixed(2)}) - ` +
      `outlays ($${data.outlays.outlaysNet.toFixed(2)}) = ` +
      `$${expectedEndBalance.toFixed(2)}. Difference: $${endBalDiff.toFixed(2)}. ` +
      `Ref: OMB A-11, Section 130.`,
    );
  }

  // --- Negative balance checks ---
  if (data.budgetaryResources.totalBudgetaryResources < 0) {
    errors.push(
      `Total budgetary resources is negative ($${data.budgetaryResources.totalBudgetaryResources.toFixed(2)}). ` +
      `This is unusual and should be investigated. Ref: OMB A-11, Section 130.`,
    );
  }

  if (data.outlays.outlaysNet < 0) {
    errors.push(
      `Net outlays is negative ($${data.outlays.outlaysNet.toFixed(2)}). ` +
      `Negative outlays may indicate net collections exceeding disbursements. ` +
      `Ref: OMB A-11, Section 130.`,
    );
  }

  // --- Obligation consistency ---
  const oblDiff = Math.abs(
    data.outlays.newObligations -
    data.statusOfBudgetaryResources.newObligationsAndUpwardAdjustments,
  );
  if (oblDiff > 0.01) {
    errors.push(
      `Section B obligations ($${data.statusOfBudgetaryResources.newObligationsAndUpwardAdjustments.toFixed(2)}) ` +
      `do not match Section C obligations ($${data.outlays.newObligations.toFixed(2)}). ` +
      `Ref: OMB A-11, Section 130.`,
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
