/**
 * Fund Control Engine
 *
 * Implements the federal funds control framework governing the lifecycle
 * of appropriated funds from commitment through disbursement. Every
 * transaction must pass through a hierarchy of control checks:
 *
 *   Apportionment -> Allotment -> Sub-Allotment -> Operating Budget
 *
 * Violations at any level may constitute an Anti-Deficiency Act (ADA)
 * violation under 31 U.S.C. ss1341 or ss1517.
 *
 * The engine also enforces the three-pronged test for valid obligations:
 *   1. Purpose - funds used for intended statutory purpose
 *   2. Time    - obligation incurred within the period of availability
 *   3. Amount  - obligation does not exceed available balance
 *
 * References:
 *   - DoD FMR Vol. 3, Ch. 8  (Fund Control)
 *   - DoD FMR Vol. 3, Ch. 10 (Anti-Deficiency Act Violations)
 *   - DoD FMR Vol. 14, Ch. 1 (Appropriation and Fund Symbols)
 *   - 31 U.S.C. ss1341, ss1342, ss1517 (Anti-Deficiency Act)
 *   - 31 U.S.C. ss1501 (Bona Fide Need Rule)
 *   - Prompt Payment Act, 31 U.S.C. ss3901-3907
 */

import type {
  Appropriation,
  FundControl,
  FundAvailabilityResult,
  Obligation,
  Disbursement,
  ADAViolation,
  FundControlLevel,
} from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';
import { getParameter } from '@/lib/engine/tax-parameters/registry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Prompt Payment Act standard payment terms in calendar days.
 * 31 U.S.C. ss3903(a)(1): 30 days is the default.
 * Now dynamically resolved via getParameter; fallback preserved.
 */
const PROMPT_PAYMENT_DEFAULT_DAYS_FALLBACK = 30;

/**
 * Prompt Payment Act interest rate used when the Treasury rate is not
 * available. In production this would be fetched from the Bureau of the
 * Fiscal Service. Rate is per annum.
 * Now dynamically resolved via getParameter; fallback preserved.
 */
const PROMPT_PAYMENT_ANNUAL_RATE_FALLBACK = 0.04;

/**
 * Expense/investment threshold (DoD FMR Vol. 2A, Ch. 1). Items below
 * this amount are normally classified as expenses (O&M); items at or
 * above are investments (Procurement).
 * Now dynamically resolved via getParameter; fallback preserved.
 */
const EXPENSE_INVESTMENT_THRESHOLD_FALLBACK = 250_000;

/**
 * Budget Object Codes (BOCs) typically associated with procurement
 * (equipment/investment) appropriations.
 */
const PROCUREMENT_BOC_PREFIXES = ['31', '32'];

/**
 * Budget Object Codes typically associated with O&M (operating) expenses.
 */
const OM_BOC_PREFIXES = ['21', '22', '23', '24', '25', '26'];

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
 * Returns the federal fiscal year for a given date.
 * The federal fiscal year runs Oct 1 to Sep 30.
 * Example: 2025-10-15 -> FY2026; 2025-09-15 -> FY2025.
 */
function federalFiscalYear(date: Date): number {
  return date.getMonth() >= 9 ? date.getFullYear() + 1 : date.getFullYear();
}

/**
 * Finds the most restrictive fund control record for a given
 * appropriation. Fund controls are hierarchical:
 *   apportionment > allotment > sub_allotment > operating_budget
 * The most restrictive is the one with the smallest available balance.
 */
function findMostRestrictiveControl(
  fundControls: FundControl[],
  appropriationId: string,
): FundControl | null {
  const relevant = fundControls.filter(
    fc => fc.appropriationId === appropriationId,
  );
  if (relevant.length === 0) return null;

  return relevant.reduce((most, current) =>
    current.availableBalance < most.availableBalance ? current : most,
  );
}

// ---------------------------------------------------------------------------
// Core engine functions
// ---------------------------------------------------------------------------

/**
 * Checks whether funds are available at the most restrictive control level
 * for the given appropriation.
 *
 * Walks the fund control hierarchy (apportionment -> allotment ->
 * sub-allotment -> operating budget) and returns the result at the
 * tightest constraint.
 *
 * Ref: DoD FMR Vol. 3, Ch. 8, para 080201
 *
 * @param appropriation - The appropriation to check.
 * @param fundControls  - All fund control records for this appropriation.
 * @param amount        - The dollar amount being requested.
 * @returns A FundAvailabilityResult indicating whether funds are available.
 */
export function checkFundAvailability(
  appropriation: Appropriation,
  fundControls: FundControl[],
  amount: number,
): FundAvailabilityResult {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  // Cancelled appropriations have zero available balance
  if (appropriation.status === 'cancelled') {
    return {
      available: false,
      availableBalance: 0,
      wouldExceed: true,
      controlLevel: 'apportionment',
      appropriationStatus: 'cancelled',
    };
  }

  // Expired appropriations cannot accept new obligations
  if (appropriation.status === 'expired') {
    return {
      available: false,
      availableBalance: appropriation.unobligatedBalance,
      wouldExceed: true,
      controlLevel: 'apportionment',
      appropriationStatus: 'expired',
    };
  }

  // Walk fund control hierarchy: find the most restrictive control
  const mostRestrictive = findMostRestrictiveControl(
    fundControls,
    appropriation.id,
  );

  // If there are fund controls, check at the most restrictive level
  if (mostRestrictive) {
    if (amount > mostRestrictive.availableBalance) {
      return {
        available: false,
        availableBalance: mostRestrictive.availableBalance,
        wouldExceed: true,
        controlLevel: mostRestrictive.controlLevel,
        appropriationStatus: appropriation.status,
      };
    }
  }

  // Check at apportionment level
  const apportionedAvailable = appropriation.apportioned - appropriation.obligated;
  if (amount > apportionedAvailable) {
    return {
      available: false,
      availableBalance: apportionedAvailable,
      wouldExceed: true,
      controlLevel: 'apportionment',
      appropriationStatus: appropriation.status,
    };
  }

  // Check at allotment level
  const allottedAvailable = appropriation.allotted - appropriation.obligated;
  if (amount > allottedAvailable) {
    return {
      available: false,
      availableBalance: allottedAvailable,
      wouldExceed: true,
      controlLevel: 'allotment',
      appropriationStatus: appropriation.status,
    };
  }

  // Check overall unobligated balance
  if (amount > appropriation.unobligatedBalance) {
    return {
      available: false,
      availableBalance: appropriation.unobligatedBalance,
      wouldExceed: true,
      controlLevel: 'allotment',
      appropriationStatus: appropriation.status,
    };
  }

  // Determine the controlling level for reporting
  const controlLevel: FundControlLevel = mostRestrictive
    ? mostRestrictive.controlLevel
    : 'allotment';

  return {
    available: true,
    availableBalance: appropriation.unobligatedBalance,
    wouldExceed: false,
    controlLevel,
    appropriationStatus: appropriation.status,
  };
}

/**
 * Records a commitment (pre-obligation reservation of funds).
 *
 * Commitments are administrative reservations that reduce the available
 * balance for planning purposes but are not legally binding obligations.
 * They must not exceed the available balance.
 *
 * Ref: DoD FMR Vol. 3, Ch. 8, para 080301
 *
 * @param appropriation - The appropriation to commit against.
 * @param amount        - The dollar amount to commit.
 * @param description   - A description of the commitment.
 * @returns An object with the updated appropriation and committed amount.
 */
export function recordCommitment(
  appropriation: Appropriation,
  amount: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  description: string,
): { updated: Appropriation; committed: number } {
  if (amount <= 0) {
    throw new Error('Commitment amount must be positive');
  }

  // Check that uncommitted unobligated balance can absorb the commitment
  const uncommittedBalance = appropriation.unobligatedBalance - appropriation.committed;
  if (amount > uncommittedBalance) {
    throw new Error(
      `Insufficient funds for commitment. Uncommitted balance: ` +
      `$${uncommittedBalance.toFixed(2)}, Requested: $${amount.toFixed(2)}`,
    );
  }

  const updated: Appropriation = {
    ...appropriation,
    committed: appropriation.committed + amount,
  };

  return { updated, committed: amount };
}

/**
 * Records an obligation against an appropriation.
 *
 * Before recording, the function validates:
 *   1. Bona fide need (time restriction via checkBonafideNeed)
 *   2. Fund availability at all control levels (ADA amount check)
 *
 * If the obligation would exceed available funds, an ADA violation is
 * created and returned in the violations array rather than throwing.
 *
 * Ref: DoD FMR Vol. 3, Ch. 8, para 080401
 * Ref: 31 U.S.C. ss1501 (Recording of obligations)
 *
 * @param appropriation  - The appropriation to obligate against.
 * @param obligationData - Partial obligation data to record.
 * @param fundControls   - All fund control records for this appropriation.
 * @returns An object with the completed obligation and any ADA violations.
 */
export function recordObligation(
  appropriation: Appropriation,
  obligationData: Partial<Obligation>,
  fundControls: FundControl[],
): { obligation: Obligation; violations: ADAViolation[] } {
  const violations: ADAViolation[] = [];
  const now = new Date();
  const obligatedDate = obligationData.obligatedDate || now.toISOString();
  const amount = obligationData.amount ?? 0;

  if (amount <= 0) {
    throw new Error('Obligation amount must be positive');
  }

  // 1. Validate bona fide need (time restriction)
  const bonafide = checkBonafideNeed(appropriation, obligatedDate);
  if (!bonafide.valid) {
    violations.push({
      id: uuid(),
      engagementId: appropriation.engagementId,
      appropriationId: appropriation.id,
      violationType: 'time_violation',
      statutoryBasis: '31 U.S.C. ss1502 (Bona Fide Need Rule)',
      amount,
      description: bonafide.reason || 'Bona fide need rule violation',
      discoveredDate: now.toISOString(),
      investigationStatus: 'detected',
      fiscalYear: federalFiscalYear(parseDate(obligatedDate)),
      createdAt: now.toISOString(),
    });
  }

  // 2. Check fund availability (ADA amount check)
  const availability = checkFundAvailability(appropriation, fundControls, amount);
  if (!availability.available) {
    violations.push({
      id: uuid(),
      engagementId: appropriation.engagementId,
      appropriationId: appropriation.id,
      violationType: 'over_obligation',
      statutoryBasis:
        availability.controlLevel === 'apportionment' || availability.controlLevel === 'allotment'
          ? '31 U.S.C. ss1517(a)'
          : '31 U.S.C. ss1341(a)(1)(A)',
      amount: amount - availability.availableBalance,
      description:
        `Obligation of $${amount.toFixed(2)} exceeds available balance of ` +
        `$${availability.availableBalance.toFixed(2)} at ${availability.controlLevel} level`,
      discoveredDate: now.toISOString(),
      investigationStatus: 'detected',
      fiscalYear: federalFiscalYear(parseDate(obligatedDate)),
      createdAt: now.toISOString(),
    });
  }

  // 3. Build the obligation record regardless (for tracking purposes;
  //    violations are surfaced to the caller for reporting/remediation)
  const obligation: Obligation = {
    id: obligationData.id || uuid(),
    engagementId: obligationData.engagementId || appropriation.engagementId,
    appropriationId: appropriation.id,
    obligationNumber: obligationData.obligationNumber || `OBL-${uuid().slice(0, 8).toUpperCase()}`,
    documentType: obligationData.documentType || 'misc',
    vendorOrPayee: obligationData.vendorOrPayee,
    amount,
    obligatedDate,
    liquidatedAmount: 0,
    unliquidatedBalance: amount,
    adjustmentAmount: 0,
    status: 'open',
    bonafideNeedDate: obligationData.bonafideNeedDate,
    fiscalYear: obligationData.fiscalYear || federalFiscalYear(parseDate(obligatedDate)),
    budgetObjectCode: obligationData.budgetObjectCode || '',
    budgetActivityCode: obligationData.budgetActivityCode,
    programElement: obligationData.programElement,
    createdBy: obligationData.createdBy || 'system',
    createdAt: now.toISOString(),
  };

  // Update appropriation balances
  appropriation.obligated += amount;
  appropriation.unobligatedBalance = appropriation.totalAuthority - appropriation.obligated;

  // If this was previously committed, reduce the committed amount
  if (appropriation.committed >= amount) {
    appropriation.committed -= amount;
  } else if (appropriation.committed > 0) {
    appropriation.committed = 0;
  }

  // Update the most restrictive fund control
  const mostRestrictive = findMostRestrictiveControl(fundControls, appropriation.id);
  if (mostRestrictive) {
    mostRestrictive.obligatedAgainst += amount;
    mostRestrictive.availableBalance = mostRestrictive.amount - mostRestrictive.obligatedAgainst;
  }

  return { obligation, violations };
}

/**
 * Records an expenditure (delivery/performance) against an obligation.
 *
 * Validates that the expenditure does not exceed the obligation's
 * unliquidated balance. Excess expenditures may constitute an ADA
 * violation under 31 U.S.C. ss1341(a)(1)(B).
 *
 * Ref: DoD FMR Vol. 3, Ch. 8, para 080501
 *
 * @param obligation    - The obligation to expend against.
 * @param appropriation - The parent appropriation.
 * @param amount        - The dollar amount of the expenditure.
 * @returns An object with the updated obligation and any ADA violations.
 */
export function recordExpenditure(
  obligation: Obligation,
  appropriation: Appropriation,
  amount: number,
): { updated: Obligation; violations: ADAViolation[] } {
  if (amount <= 0) {
    throw new Error('Expenditure amount must be positive');
  }

  const violations: ADAViolation[] = [];
  const now = new Date();

  // Check that expenditure does not exceed the unliquidated balance
  if (amount > obligation.unliquidatedBalance) {
    const excessAmount = amount - obligation.unliquidatedBalance;
    violations.push({
      id: uuid(),
      engagementId: obligation.engagementId,
      appropriationId: obligation.appropriationId,
      violationType: 'over_expenditure',
      statutoryBasis: '31 U.S.C. ss1341(a)(1)(B)',
      amount: excessAmount,
      description:
        `Expenditure of $${amount.toFixed(2)} exceeds unliquidated obligation ` +
        `balance of $${obligation.unliquidatedBalance.toFixed(2)} on ` +
        `obligation ${obligation.obligationNumber}`,
      discoveredDate: now.toISOString(),
      investigationStatus: 'detected',
      fiscalYear: obligation.fiscalYear,
      createdAt: now.toISOString(),
    });
  }

  // Apply the expenditure (capped at the unliquidated balance if excess)
  const appliedAmount = Math.min(amount, obligation.unliquidatedBalance);

  const updated: Obligation = {
    ...obligation,
    liquidatedAmount: obligation.liquidatedAmount + appliedAmount,
    unliquidatedBalance: obligation.unliquidatedBalance - appliedAmount,
  };

  // Determine new status
  if (updated.liquidatedAmount >= updated.amount - updated.adjustmentAmount) {
    updated.status = 'fully_liquidated';
  } else if (updated.liquidatedAmount > 0) {
    updated.status = 'partially_liquidated';
  }

  // Update appropriation disbursed tracking
  appropriation.disbursed += appliedAmount;

  return { updated, violations };
}

/**
 * Records a disbursement (actual payment) against an obligation.
 *
 * Validates the payment amount and performs a Prompt Payment Act date
 * check to calculate any interest penalty for late payment.
 *
 * Ref: DoD FMR Vol. 10, Ch. 7 (Prompt Payment)
 * Ref: 31 U.S.C. ss3901-3907 (Prompt Payment Act)
 *
 * @param obligation      - The obligation being paid against.
 * @param disbursementData - Partial disbursement data.
 * @returns A completed Disbursement record.
 */
export function recordDisbursement(
  obligation: Obligation,
  disbursementData: Partial<Disbursement>,
): Disbursement {
  const amount = disbursementData.amount ?? 0;
  if (amount <= 0) {
    throw new Error('Disbursement amount must be positive');
  }

  const now = new Date();
  const disbursementDate = disbursementData.disbursementDate || now.toISOString();
  const paymentDate = parseDate(disbursementDate);
  const fy = obligation.fiscalYear ?? federalFiscalYear(now);

  // Prompt Payment Act: compute due date and interest penalty
  const promptPayDays = getParameter('DOD_PROMPT_PAY_NET_DAYS', fy, undefined, PROMPT_PAYMENT_DEFAULT_DAYS_FALLBACK);
  const promptPayRate = getParameter('DOD_PROMPT_PAY_ANNUAL_RATE', fy, undefined, PROMPT_PAYMENT_ANNUAL_RATE_FALLBACK);

  const promptPayDueDate = disbursementData.promptPayDueDate
    ? parseDate(disbursementData.promptPayDueDate)
    : new Date(
        parseDate(obligation.obligatedDate).getTime() +
        promptPayDays * 86_400_000,
      );

  const daysLate = Math.max(0, daysBetween(promptPayDueDate, paymentDate));
  let interestPenalty = 0;
  if (daysLate > 0) {
    // Simple interest: principal * annual_rate * (days / 365)
    interestPenalty = amount * promptPayRate * (daysLate / 365);
  }

  // Apply discount if payment is made by the discount date
  if (
    disbursementData.discountDate &&
    (disbursementData.discountAmount ?? 0) > 0 &&
    paymentDate <= parseDate(disbursementData.discountDate)
  ) {
    // Discount is noted in the record; net amount is computed downstream
  }

  const disbursement: Disbursement = {
    id: disbursementData.id || uuid(),
    engagementId: disbursementData.engagementId || obligation.engagementId,
    obligationId: obligation.id,
    disbursementNumber:
      disbursementData.disbursementNumber ||
      `DISB-${uuid().slice(0, 8).toUpperCase()}`,
    voucherNumber: disbursementData.voucherNumber,
    payeeId: disbursementData.payeeId,
    amount,
    disbursementDate,
    paymentMethod: disbursementData.paymentMethod || 'eft',
    certifiedBy: disbursementData.certifiedBy,
    status: 'certified',
    promptPayDueDate: promptPayDueDate.toISOString(),
    discountDate: disbursementData.discountDate,
    discountAmount: disbursementData.discountAmount ?? 0,
    interestPenalty,
    createdAt: now.toISOString(),
  };

  return disbursement;
}

/**
 * Deobligates (reduces) an existing obligation in whole or in part.
 *
 * Deobligations release funds back to the unobligated balance,
 * provided the appropriation has not been cancelled. The deobligation
 * amount cannot exceed the unliquidated balance.
 *
 * Ref: DoD FMR Vol. 3, Ch. 8, para 080601
 *
 * @param obligation - The obligation to deobligate.
 * @param amount     - The dollar amount to deobligate.
 * @param reason     - The reason for the deobligation.
 * @returns A new Obligation reflecting the deobligation.
 */
export function deobligate(
  obligation: Obligation,
  amount: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  reason: string,
): Obligation {
  if (amount <= 0) {
    throw new Error('Deobligation amount must be positive');
  }

  if (amount > obligation.unliquidatedBalance) {
    throw new Error(
      `Deobligation amount $${amount.toFixed(2)} exceeds unliquidated balance ` +
      `$${obligation.unliquidatedBalance.toFixed(2)} on obligation ` +
      `${obligation.obligationNumber}`,
    );
  }

  const updated: Obligation = {
    ...obligation,
    amount: obligation.amount - amount,
    adjustmentAmount: obligation.adjustmentAmount + amount,
    unliquidatedBalance: obligation.unliquidatedBalance - amount,
  };

  // Determine new status
  if (updated.unliquidatedBalance <= 0 && updated.liquidatedAmount <= 0) {
    updated.status = 'deobligated';
  } else {
    updated.status = 'adjusted';
  }

  return updated;
}

/**
 * Validates the bona fide need rule (time restriction).
 *
 * The bona fide need rule (31 U.S.C. ss1502) requires that a fiscal year
 * appropriation may be obligated only to meet a genuine need arising in,
 * or continuing to exist in, the period of availability.
 *
 *   - One-year appropriations: obligation must occur within the single
 *     fiscal year (Oct 1 - Sep 30).
 *   - Multi-year appropriations: obligation must occur within the
 *     specified start/end dates.
 *   - No-year / revolving: no time restriction.
 *
 * Ref: DoD FMR Vol. 14, Ch. 1, para 010301 (Time Restrictions)
 * Ref: GAO Red Book, Ch. 5 (Availability as to Time)
 *
 * @param appropriation  - The appropriation to validate against.
 * @param transactionDate - The date of the proposed obligation (ISO string).
 * @returns An object indicating validity and, if invalid, the reason.
 */
export function checkBonafideNeed(
  appropriation: Appropriation,
  transactionDate: string,
): { valid: boolean; reason?: string } {
  const txDate = parseDate(transactionDate);

  // No-year and revolving fund appropriations have no time restriction
  if (
    appropriation.appropriationType === 'no_year' ||
    appropriation.appropriationType === 'revolving'
  ) {
    return { valid: true };
  }

  const periodStart = parseDate(appropriation.fiscalYearStart);
  const periodEnd = appropriation.expirationDate
    ? parseDate(appropriation.expirationDate)
    : parseDate(appropriation.fiscalYearEnd);

  if (txDate < periodStart) {
    return {
      valid: false,
      reason:
        `Transaction date ${transactionDate} is before the period of availability ` +
        `(${appropriation.fiscalYearStart}). Funds are not yet available for obligation.`,
    };
  }

  if (txDate > periodEnd) {
    return {
      valid: false,
      reason:
        `Transaction date ${transactionDate} is after the expiration of the period of ` +
        `availability (${periodEnd.toISOString()}). ` +
        `${appropriation.appropriationType === 'one_year' ? 'One-year' : 'Multi-year'} ` +
        `appropriation has expired for new obligations per 31 U.S.C. ss1502.`,
    };
  }

  return { valid: true };
}

/**
 * Validates the purpose restriction for an obligation.
 *
 * The purpose statute (31 U.S.C. ss1301(a)) requires that appropriations
 * be applied only to the objects for which they were made. Key rules:
 *
 *   - O&M funds: for day-to-day operating expenses.
 *   - Procurement funds: for investment items at or above the threshold.
 *   - MILCON funds: for construction projects exceeding cost thresholds.
 *   - RDT&E funds: for research, development, test, and evaluation.
 *
 * Ref: DoD FMR Vol. 14, Ch. 1, para 010201 (Purpose Restrictions)
 * Ref: GAO Red Book, Ch. 4 (Availability as to Purpose)
 *
 * @param appropriation   - The appropriation to validate against.
 * @param budgetObjectCode - The BOC of the proposed expense.
 * @param description      - A description of the expense for contextual validation.
 * @returns An object indicating validity and, if invalid, the reason.
 */
export function checkPurposeRestriction(
  appropriation: Appropriation,
  budgetObjectCode: string,
  description: string,
): { valid: boolean; reason?: string } {
  const boc = budgetObjectCode.trim();
  const fy = appropriation.fiscalYearStart
    ? federalFiscalYear(parseDate(appropriation.fiscalYearStart))
    : federalFiscalYear(new Date());
  const expenseInvestmentThreshold = getParameter('DOD_EXPENSE_INVESTMENT_THRESHOLD', fy, undefined, EXPENSE_INVESTMENT_THRESHOLD_FALLBACK);

  const isProcurementBOC = PROCUREMENT_BOC_PREFIXES.some(prefix => boc.startsWith(prefix));
  const isOMBOC = OM_BOC_PREFIXES.some(prefix => boc.startsWith(prefix));

  // Procurement BOC on O&M appropriation
  if (appropriation.budgetCategory === 'om' && isProcurementBOC) {
    return {
      valid: false,
      reason:
        `Budget Object Code ${boc} indicates a procurement/investment expense, ` +
        `but appropriation ${appropriation.treasuryAccountSymbol} is O&M. ` +
        `Equipment purchases on O&M funds must be below the expense/investment ` +
        `threshold of $${expenseInvestmentThreshold.toLocaleString()}. ` +
        `Use Procurement appropriation for investment items. (31 U.S.C. ss1301(a))`,
    };
  }

  // MILCON BOC on O&M appropriation
  if (appropriation.budgetCategory === 'om' && boc.startsWith('33')) {
    return {
      valid: false,
      reason:
        `Budget Object Code ${boc} indicates construction, which requires MILCON ` +
        `appropriation, not O&M. (10 U.S.C. ss2802-2805). Description: "${description}"`,
    };
  }

  // O&M BOC on Procurement appropriation (valid but advisory warning)
  if (appropriation.budgetCategory === 'procurement' && isOMBOC) {
    return {
      valid: true,
      reason:
        `Advisory: Budget Object Code ${boc} indicates an operating expense charged ` +
        `to Procurement appropriation ${appropriation.treasuryAccountSymbol}. ` +
        `While not prohibited, consider O&M appropriation for routine operating ` +
        `expenses. Description: "${description}"`,
    };
  }

  return { valid: true };
}

/**
 * Validates the amount restriction (ADA amount ceiling check).
 *
 * Ensures the requested amount does not exceed the available balance
 * at any fund control level. Failure triggers an ADA violation under
 * 31 U.S.C. ss1341(a)(1)(A) or ss1517(a).
 *
 * Ref: DoD FMR Vol. 14, Ch. 1, para 010101 (Amount Restrictions)
 *
 * @param appropriation - The appropriation to check against.
 * @param fundControls  - All fund control records for this appropriation.
 * @param amount        - The dollar amount being requested.
 * @returns An object indicating validity and, if invalid, the ADA violation.
 */
export function checkAmountRestriction(
  appropriation: Appropriation,
  fundControls: FundControl[],
  amount: number,
): { valid: boolean; violation?: ADAViolation } {
  if (amount <= 0) {
    throw new Error('Amount must be positive');
  }

  const now = new Date();

  // Check at apportionment level (ss1517 violation)
  const apportionedAvailable = appropriation.apportioned - appropriation.obligated;
  if (amount > apportionedAvailable) {
    return {
      valid: false,
      violation: {
        id: uuid(),
        engagementId: appropriation.engagementId,
        appropriationId: appropriation.id,
        violationType: 'over_obligation',
        statutoryBasis: '31 U.S.C. ss1517(a) - exceeding OMB apportionment',
        amount: amount - apportionedAvailable,
        description:
          `Requested amount $${amount.toFixed(2)} exceeds apportionment balance ` +
          `$${apportionedAvailable.toFixed(2)}`,
        discoveredDate: now.toISOString(),
        investigationStatus: 'detected',
        fiscalYear: federalFiscalYear(now),
        createdAt: now.toISOString(),
      },
    };
  }

  // Check at allotment level (ss1517 violation)
  const allottedAvailable = appropriation.allotted - appropriation.obligated;
  if (amount > allottedAvailable) {
    return {
      valid: false,
      violation: {
        id: uuid(),
        engagementId: appropriation.engagementId,
        appropriationId: appropriation.id,
        violationType: 'over_obligation',
        statutoryBasis: '31 U.S.C. ss1517(a) - exceeding administrative subdivision',
        amount: amount - allottedAvailable,
        description:
          `Requested amount $${amount.toFixed(2)} exceeds allotment balance ` +
          `$${allottedAvailable.toFixed(2)}`,
        discoveredDate: now.toISOString(),
        investigationStatus: 'detected',
        fiscalYear: federalFiscalYear(now),
        createdAt: now.toISOString(),
      },
    };
  }

  // Check at overall appropriation level (ss1341 violation)
  if (amount > appropriation.unobligatedBalance) {
    return {
      valid: false,
      violation: {
        id: uuid(),
        engagementId: appropriation.engagementId,
        appropriationId: appropriation.id,
        violationType: 'over_obligation',
        statutoryBasis: '31 U.S.C. ss1341(a)(1)(A) - obligations exceeding amount available',
        amount: amount - appropriation.unobligatedBalance,
        description:
          `Requested amount $${amount.toFixed(2)} exceeds unobligated balance ` +
          `$${appropriation.unobligatedBalance.toFixed(2)}`,
        discoveredDate: now.toISOString(),
        investigationStatus: 'detected',
        fiscalYear: federalFiscalYear(now),
        createdAt: now.toISOString(),
      },
    };
  }

  // Check fund controls at sub-allotment / operating budget levels
  const relevantControls = fundControls.filter(
    fc => fc.appropriationId === appropriation.id,
  );
  for (const control of relevantControls) {
    if (amount > control.availableBalance) {
      return {
        valid: false,
        violation: {
          id: uuid(),
          engagementId: appropriation.engagementId,
          appropriationId: appropriation.id,
          violationType: 'over_obligation',
          statutoryBasis: `31 U.S.C. ss1517(a) - exceeding ${control.controlLevel} ceiling`,
          amount: amount - control.availableBalance,
          description:
            `Requested amount $${amount.toFixed(2)} exceeds ${control.controlLevel} ` +
            `available balance $${control.availableBalance.toFixed(2)} ` +
            `(controlled by: ${control.controlledBy})`,
          discoveredDate: now.toISOString(),
          investigationStatus: 'detected',
          fiscalYear: federalFiscalYear(now),
          createdAt: now.toISOString(),
        },
      };
    }
  }

  return { valid: true };
}
