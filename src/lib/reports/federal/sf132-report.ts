/**
 * SF-132 Apportionment and Reapportionment Schedule Generator
 *
 * Generates the Standard Form 132, the document used by OMB to apportion
 * budgetary resources to federal agencies. The SF-132 controls the rate
 * at which agencies can obligate funds, preventing premature exhaustion
 * of appropriations.
 *
 * Apportionment categories (OMB Circular A-11, Section 120):
 *   - Category A: Apportioned by time period (quarterly)
 *   - Category B: Apportioned by activity, project, or object
 *   - Exempt: Not subject to apportionment (e.g., certain trust funds)
 *
 * The SF-132 is critical for ADA compliance because obligations exceeding
 * apportioned amounts at the apportionment level constitute a violation
 * of 31 U.S.C. §1517(a).
 *
 * References:
 *   - OMB Circular A-11, Section 120: Apportionment Process
 *   - 31 U.S.C. §1512: Apportionment requirements
 *   - 31 U.S.C. §1517: Anti-Deficiency Act (apportionment violations)
 *   - DoD FMR Vol. 3, Ch. 2: Apportionment and Reapportionment
 */

import type {
  Appropriation,
  FundControl,
  Obligation,
  SF132Data,
  SF132ApportionmentQuarter,
  SF132ApportionmentProgram,
} from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Determine the federal fiscal quarter for a given date.
 * FY Q1: Oct-Dec, Q2: Jan-Mar, Q3: Apr-Jun, Q4: Jul-Sep
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getFiscalQuarter(dateStr: string): 1 | 2 | 3 | 4 {
  const month = new Date(dateStr).getMonth(); // 0-based
  if (month >= 9) return 1;  // Oct-Dec
  if (month >= 6) return 4;  // Jul-Sep
  if (month >= 3) return 3;  // Apr-Jun
  return 2;                  // Jan-Mar
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an SF-132 Apportionment Schedule from appropriation and
 * obligation data.
 *
 * Per OMB Circular A-11, Section 120: The SF-132 shows the agency's total
 * budgetary resources and how they are apportioned across time periods
 * (Category A) or programs (Category B). Agencies submit the SF-132 to OMB
 * at the start of each fiscal year and whenever reapportionment is needed.
 *
 * @param appropriation - The Appropriation record for this TAS
 * @param fundControls - Fund control records at the apportionment level
 * @param obligations - All Obligation records for quarterly distribution
 * @param fiscalYear - The fiscal year
 * @param period - The reporting period
 * @returns SF132Data structure
 */
export function generateSF132(
  appropriation: Appropriation,
  fundControls: FundControl[],
  obligations: Obligation[],
  fiscalYear: number,
  period: string,
): SF132Data {
  // ========================================================================
  // Section I: Budgetary Resources
  // ========================================================================

  const budgetAuthorityAppropriation = round2(appropriation.totalAuthority);
  const unobligatedBalanceBroughtForward = round2(
    Math.max(0, appropriation.unobligatedBalance),
  );

  // Adjustments: recoveries from deobligations
  const adjustments = round2(
    obligations
      .filter(o => o.status === 'deobligated')
      .reduce((sum, o) => sum + o.amount, 0),
  );

  // Spending authority from offsetting collections
  const spendingAuthority = round2(
    Math.max(0, appropriation.totalAuthority - appropriation.allotted),
  );

  const totalBudgetaryResources = round2(
    budgetAuthorityAppropriation +
    unobligatedBalanceBroughtForward +
    adjustments +
    spendingAuthority,
  );

  // ========================================================================
  // Section II: Apportionments
  // ========================================================================

  // Category A: Quarterly apportionments
  const quarterlyShare = round2(appropriation.apportioned / 4);
  const categoryA: SF132ApportionmentQuarter[] = [
    { quarter: 1, amount: quarterlyShare, cumulativeAmount: quarterlyShare },
    { quarter: 2, amount: quarterlyShare, cumulativeAmount: round2(quarterlyShare * 2) },
    { quarter: 3, amount: quarterlyShare, cumulativeAmount: round2(quarterlyShare * 3) },
    { quarter: 4, amount: round2(appropriation.apportioned - quarterlyShare * 3), cumulativeAmount: round2(appropriation.apportioned) },
  ];

  // Category B: Program-level apportionments from fund controls
  const categoryB: SF132ApportionmentProgram[] = fundControls
    .filter(fc =>
      fc.appropriationId === appropriation.id &&
      fc.controlLevel === 'allotment',
    )
    .map(fc => ({
      programCode: fc.controlledBy,
      programName: `Allotment - ${fc.controlledBy}`,
      amount: round2(fc.amount),
    }));

  const totalApportioned = round2(appropriation.apportioned);
  const amountsNotYetApportioned = round2(
    totalBudgetaryResources - totalApportioned,
  );

  // ========================================================================
  // Section III: Application of Apportioned Amounts
  // ========================================================================

  const activeObligations = obligations.filter(o => o.status !== 'deobligated');
  const obligationsIncurred = round2(
    activeObligations.reduce((sum, o) => sum + o.amount, 0),
  );
  const unobligatedBalanceApportioned = round2(
    totalApportioned - obligationsIncurred,
  );

  return {
    treasuryAccountSymbol: appropriation.treasuryAccountSymbol,
    appropriationTitle: appropriation.appropriationTitle,
    fiscalYear,
    period,
    budgetaryResources: {
      budgetAuthorityAppropriation,
      borrowingAuthority: 0,
      contractAuthority: 0,
      spendingAuthority,
      unobligatedBalanceBroughtForward,
      adjustments,
      totalBudgetaryResources,
    },
    apportionments: {
      categoryA,
      categoryB,
      exempt: 0,
      totalApportioned,
      amountsNotYetApportioned,
    },
    application: {
      obligationsIncurred,
      unobligatedBalanceApportioned,
    },
  };
}

/**
 * Validate an SF-132 for internal consistency.
 *
 * Checks:
 *   1. Total budgetary resources sum correctly
 *   2. Apportioned + not-yet-apportioned = total resources
 *   3. Obligations don't exceed apportioned amounts (ADA check)
 *   4. Quarterly amounts sum to total Category A apportionment
 *
 * @param data - SF132Data to validate
 * @returns Validation result with errors
 */
export function validateSF132(
  data: SF132Data,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. Total budgetary resources
  const computedTotal = round2(
    data.budgetaryResources.budgetAuthorityAppropriation +
    data.budgetaryResources.borrowingAuthority +
    data.budgetaryResources.contractAuthority +
    data.budgetaryResources.spendingAuthority +
    data.budgetaryResources.unobligatedBalanceBroughtForward +
    data.budgetaryResources.adjustments,
  );
  const totalDiff = Math.abs(computedTotal - data.budgetaryResources.totalBudgetaryResources);
  if (totalDiff > 0.01) {
    errors.push(
      `Total budgetary resources ($${data.budgetaryResources.totalBudgetaryResources.toFixed(2)}) ` +
      `does not equal sum of components ($${computedTotal.toFixed(2)}). ` +
      `Ref: OMB A-11, Section 120.`,
    );
  }

  // 2. Apportioned + not-yet-apportioned = total
  const apportionmentSum = round2(
    data.apportionments.totalApportioned +
    data.apportionments.amountsNotYetApportioned,
  );
  const appDiff = Math.abs(apportionmentSum - data.budgetaryResources.totalBudgetaryResources);
  if (appDiff > 0.01) {
    errors.push(
      `Apportioned ($${data.apportionments.totalApportioned.toFixed(2)}) + ` +
      `not-yet-apportioned ($${data.apportionments.amountsNotYetApportioned.toFixed(2)}) ` +
      `does not equal total resources ($${data.budgetaryResources.totalBudgetaryResources.toFixed(2)}). ` +
      `Ref: OMB A-11, Section 120.`,
    );
  }

  // 3. ADA check: obligations vs. apportioned
  if (data.application.obligationsIncurred > data.apportionments.totalApportioned + 0.01) {
    errors.push(
      `Obligations incurred ($${data.application.obligationsIncurred.toFixed(2)}) exceed ` +
      `total apportioned amount ($${data.apportionments.totalApportioned.toFixed(2)}). ` +
      `Potential ADA violation under 31 U.S.C. §1517(a). Ref: OMB A-11, Section 120.`,
    );
  }

  // 4. Quarterly amounts sum check
  const quarterlySum = round2(
    data.apportionments.categoryA.reduce((sum, q) => sum + q.amount, 0),
  );
  if (data.apportionments.categoryA.length > 0 && Math.abs(quarterlySum - data.apportionments.totalApportioned) > 0.01) {
    errors.push(
      `Category A quarterly apportionments ($${quarterlySum.toFixed(2)}) do not sum ` +
      `to total apportioned ($${data.apportionments.totalApportioned.toFixed(2)}). ` +
      `Ref: OMB A-11, Section 120.`,
    );
  }

  return { valid: errors.length === 0, errors };
}
