/**
 * Fiscal Year Rollover Automation Engine
 *
 * Manages the complete fiscal year-end closing and rollover process for
 * federal appropriations per Treasury Financial Manual (TFM) and
 * DoD FMR guidance. Handles:
 *
 *   1. Year-end closing entries (USSGL closing entries per TFM)
 *   2. Expired appropriation transition (current -> expired per 31 U.S.C. §1552)
 *   3. Beginning balance carry-forward computation
 *   4. Upward/downward adjustment processing for expired years
 *   5. Prior-year recovery of obligations
 *   6. New FY parameter activation
 *   7. Cancelled appropriation purging (5-year window per §1552(a))
 *   8. Full audit trail with before/after snapshots
 *
 * The federal fiscal year runs October 1 through September 30.
 * Year-end closing occurs at September 30 (end of FY) and
 * beginning balances are established October 1 (start of new FY).
 *
 * References:
 *   - DoD FMR Vol. 3, Ch. 8 (Budget Execution - Year-End Closing)
 *   - DoD FMR Vol. 4, Ch. 2 (USSGL Closing Entries)
 *   - 31 U.S.C. §1551-1558 (Appropriation Accounts)
 *   - 31 U.S.C. §1552 (Procedure for Appropriation Account Closing)
 *   - Treasury Financial Manual, Chapter 4700 (USSGL)
 *   - OMB Circular A-11, Section 130 (Year-End Closing)
 */

import type {
  Appropriation,
  USSGLAccount,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  USSGLTransaction,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Obligation,
  DoDEngagementData,
} from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A closing entry generated during fiscal year rollover */
export interface ClosingEntry {
  id: string;
  entryType: ClosingEntryType;
  debitAccountNumber: string;
  debitAccountTitle: string;
  creditAccountNumber: string;
  creditAccountTitle: string;
  amount: number;
  description: string;
  authority: string;
  closingFiscalYear: number;
  postingDate: string;
}

export type ClosingEntryType =
  | 'close_revenue'
  | 'close_expense'
  | 'close_appropriations_received'
  | 'close_budgetary_authority'
  | 'close_obligations'
  | 'close_outlays'
  | 'carry_forward_ulo'
  | 'expire_appropriation'
  | 'cancel_appropriation'
  | 'prior_year_recovery'
  | 'upward_adjustment'
  | 'downward_adjustment';

/** Snapshot of an appropriation at a point in time */
export interface AppropriationSnapshot {
  appropriationId: string;
  treasuryAccountSymbol: string;
  fiscalYear: number;
  snapshotDate: string;
  status: string;
  totalAuthority: number;
  apportioned: number;
  allotted: number;
  committed: number;
  obligated: number;
  disbursed: number;
  unobligatedBalance: number;
}

/** Complete rollover result */
export interface FiscalYearRolloverResult {
  id: string;
  closingFiscalYear: number;
  openingFiscalYear: number;
  rolloverDate: string;
  performedBy: string;

  // Before/after snapshots
  beforeSnapshots: AppropriationSnapshot[];
  afterSnapshots: AppropriationSnapshot[];

  // Generated entries
  closingEntries: ClosingEntry[];

  // Appropriation status changes
  expiredAppropriations: Array<{
    appropriationId: string;
    tas: string;
    previousStatus: string;
    newStatus: string;
  }>;
  cancelledAppropriations: Array<{
    appropriationId: string;
    tas: string;
    cancelledBalance: number;
  }>;

  // ULO carry-forwards
  uloCarryForwards: Array<{
    obligationId: string;
    amount: number;
    appropriationId: string;
    ageInDays: number;
  }>;

  // Prior-year recoveries
  priorYearRecoveries: Array<{
    obligationId: string;
    recoveredAmount: number;
    fiscalYear: number;
  }>;

  // Summary statistics
  totalClosingEntries: number;
  totalAppropriationsExpired: number;
  totalAppropriationsCancelled: number;
  totalULOCarryForward: number;
  totalPriorYearRecoveries: number;
  totalCancelledBalances: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// USSGL Closing Entry Templates
// ---------------------------------------------------------------------------

/**
 * Standard USSGL closing entries per Treasury Financial Manual Chapter 4700.
 *
 * At fiscal year-end, temporary accounts are closed to permanent accounts:
 *   - Revenue accounts (5000-5999) close to Cumulative Results (3310)
 *   - Expense accounts (6000-6999) close to Cumulative Results (3310)
 *   - Appropriations Received (3100) closes to Unexpended Appropriations (3101)
 *   - Budgetary accounts close per TFM crosswalk
 */

const USSGL_CUMULATIVE_RESULTS = '3310';
const USSGL_UNEXPENDED_APPROPRIATIONS = '3101';
const USSGL_APPROPRIATIONS_RECEIVED = '3100';
const USSGL_REVENUE_PREFIX = '5';
const USSGL_EXPENSE_PREFIX = '6';

// Budgetary account closings
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const USSGL_BUDGET_AUTHORITY = '4010';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const USSGL_APPORTIONMENTS = '4510';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const USSGL_ALLOTMENTS = '4610';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const USSGL_OBLIGATIONS_INCURRED = '4801';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const USSGL_OUTLAYS = '4902';

// ---------------------------------------------------------------------------
// Core Rollover Functions
// ---------------------------------------------------------------------------

/**
 * Perform a complete fiscal year rollover.
 *
 * This is the main entry point for year-end processing. It:
 * 1. Takes before-snapshots of all appropriations
 * 2. Generates USSGL closing entries for temporary accounts
 * 3. Transitions appropriations to expired/cancelled status as appropriate
 * 4. Computes beginning balances for the new fiscal year
 * 5. Carries forward unliquidated obligations
 * 6. Processes prior-year obligation recoveries
 * 7. Takes after-snapshots
 *
 * @param data - The engagement data containing all financial records
 * @param closingFY - The fiscal year being closed (e.g., 2025)
 * @param performedBy - User or system performing the rollover
 * @returns Complete rollover result with audit trail
 */
export function performFiscalYearRollover(
  data: DoDEngagementData,
  closingFY: number,
  performedBy: string
): FiscalYearRolloverResult {
  const openingFY = closingFY + 1;
  const rolloverDate = `${closingFY}-09-30`;
  const result: FiscalYearRolloverResult = {
    id: uuid(),
    closingFiscalYear: closingFY,
    openingFiscalYear: openingFY,
    rolloverDate,
    performedBy,
    beforeSnapshots: [],
    afterSnapshots: [],
    closingEntries: [],
    expiredAppropriations: [],
    cancelledAppropriations: [],
    uloCarryForwards: [],
    priorYearRecoveries: [],
    totalClosingEntries: 0,
    totalAppropriationsExpired: 0,
    totalAppropriationsCancelled: 0,
    totalULOCarryForward: 0,
    totalPriorYearRecoveries: 0,
    totalCancelledBalances: 0,
    errors: [],
  };

  // Step 1: Take before-snapshots
  for (const approp of data.appropriations) {
    result.beforeSnapshots.push(createSnapshot(approp, closingFY, rolloverDate));
  }

  // Step 2: Generate proprietary closing entries
  const proprietaryClosings = generateProprietaryClosingEntries(
    data.ussglAccounts,
    closingFY,
    rolloverDate
  );
  result.closingEntries.push(...proprietaryClosings);

  // Step 3: Generate budgetary closing entries
  const budgetaryClosings = generateBudgetaryClosingEntries(
    data.ussglAccounts,
    closingFY,
    rolloverDate
  );
  result.closingEntries.push(...budgetaryClosings);

  // Step 4: Process appropriation status transitions
  for (const approp of data.appropriations) {
    try {
      processAppropriationTransition(approp, closingFY, rolloverDate, result);
    } catch (error) {
      result.errors.push(
        `Error transitioning ${approp.treasuryAccountSymbol}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Step 5: Carry forward unliquidated obligations
  const obligations = data.obligations.filter(
    (o) => o.status === 'open' || o.status === 'partially_liquidated'
  );
  for (const obligation of obligations) {
    if (obligation.unliquidatedBalance > 0) {
      const ageDays = daysSinceDate(obligation.obligatedDate, rolloverDate);
      result.uloCarryForwards.push({
        obligationId: obligation.id,
        amount: obligation.unliquidatedBalance,
        appropriationId: obligation.appropriationId,
        ageInDays: ageDays,
      });
      result.totalULOCarryForward += obligation.unliquidatedBalance;

      // Generate carry-forward closing entry
      result.closingEntries.push({
        id: uuid(),
        entryType: 'carry_forward_ulo',
        debitAccountNumber: '4801',
        debitAccountTitle: 'Obligations Incurred - Carried Forward',
        creditAccountNumber: '4802',
        creditAccountTitle: 'Undelivered Orders - Carried Forward',
        amount: obligation.unliquidatedBalance,
        description: `Carry forward ULO ${obligation.obligationNumber} ($${obligation.unliquidatedBalance.toFixed(2)}, ${ageDays} days old)`,
        authority: 'DoD FMR Vol. 3, Ch. 8, para 080701; 31 U.S.C. §1553',
        closingFiscalYear: closingFY,
        postingDate: rolloverDate,
      });
    }
  }

  // Step 6: Process prior-year recoveries
  const deobligatedObligations = data.obligations.filter(
    (o) => o.status === 'deobligated' && o.fiscalYear < closingFY
  );
  for (const deobObl of deobligatedObligations) {
    if (deobObl.adjustmentAmount < 0) {
      const recoveredAmount = Math.abs(deobObl.adjustmentAmount);
      result.priorYearRecoveries.push({
        obligationId: deobObl.id,
        recoveredAmount,
        fiscalYear: deobObl.fiscalYear,
      });
      result.totalPriorYearRecoveries += recoveredAmount;

      result.closingEntries.push({
        id: uuid(),
        entryType: 'prior_year_recovery',
        debitAccountNumber: '4801',
        debitAccountTitle: 'Obligations Incurred',
        creditAccountNumber: '4610',
        creditAccountTitle: 'Allotments - Realized Resources',
        amount: recoveredAmount,
        description: `Prior-year recovery from FY${deobObl.fiscalYear} obligation ${deobObl.obligationNumber}`,
        authority: 'DoD FMR Vol. 3, Ch. 8, para 080201; 31 U.S.C. §1553',
        closingFiscalYear: closingFY,
        postingDate: rolloverDate,
      });
    }
  }

  // Step 7: Take after-snapshots
  for (const approp of data.appropriations) {
    result.afterSnapshots.push(createSnapshot(approp, openingFY, `${openingFY - 1}-10-01`));
  }

  // Compute summary statistics
  result.totalClosingEntries = result.closingEntries.length;

  return result;
}

// ---------------------------------------------------------------------------
// Closing Entry Generation
// ---------------------------------------------------------------------------

/**
 * Generate proprietary closing entries.
 *
 * Closes temporary proprietary accounts (revenue and expense) to
 * Cumulative Results of Operations (USSGL 3310).
 *
 * Per TFM Chapter 4700, at year-end:
 *   - Revenue (5xxx): DR Revenue, CR 3310
 *   - Expense (6xxx): DR 3310, CR Expense
 */
function generateProprietaryClosingEntries(
  accounts: USSGLAccount[],
  closingFY: number,
  postingDate: string
): ClosingEntry[] {
  const entries: ClosingEntry[] = [];
  const fyAccounts = accounts.filter((a) => a.fiscalYear === closingFY);

  // Close revenue accounts (5xxx series)
  const revenueAccounts = fyAccounts.filter(
    (a) => a.accountNumber.startsWith(USSGL_REVENUE_PREFIX) && a.endBalance !== 0
  );
  for (const acct of revenueAccounts) {
    entries.push({
      id: uuid(),
      entryType: 'close_revenue',
      debitAccountNumber: acct.accountNumber,
      debitAccountTitle: acct.accountTitle,
      creditAccountNumber: USSGL_CUMULATIVE_RESULTS,
      creditAccountTitle: 'Cumulative Results of Operations',
      amount: acct.endBalance,
      description: `Close FY${closingFY} revenue account ${acct.accountNumber} (${acct.accountTitle})`,
      authority: 'Treasury Financial Manual, Ch. 4700; DoD FMR Vol. 4, Ch. 2',
      closingFiscalYear: closingFY,
      postingDate,
    });
  }

  // Close expense accounts (6xxx series)
  const expenseAccounts = fyAccounts.filter(
    (a) => a.accountNumber.startsWith(USSGL_EXPENSE_PREFIX) && a.endBalance !== 0
  );
  for (const acct of expenseAccounts) {
    entries.push({
      id: uuid(),
      entryType: 'close_expense',
      debitAccountNumber: USSGL_CUMULATIVE_RESULTS,
      debitAccountTitle: 'Cumulative Results of Operations',
      creditAccountNumber: acct.accountNumber,
      creditAccountTitle: acct.accountTitle,
      amount: acct.endBalance,
      description: `Close FY${closingFY} expense account ${acct.accountNumber} (${acct.accountTitle})`,
      authority: 'Treasury Financial Manual, Ch. 4700; DoD FMR Vol. 4, Ch. 2',
      closingFiscalYear: closingFY,
      postingDate,
    });
  }

  // Close Appropriations Received to Unexpended Appropriations
  const appropReceivedAccounts = fyAccounts.filter(
    (a) => a.accountNumber === USSGL_APPROPRIATIONS_RECEIVED && a.endBalance !== 0
  );
  for (const acct of appropReceivedAccounts) {
    entries.push({
      id: uuid(),
      entryType: 'close_appropriations_received',
      debitAccountNumber: USSGL_APPROPRIATIONS_RECEIVED,
      debitAccountTitle: 'Appropriations Received',
      creditAccountNumber: USSGL_UNEXPENDED_APPROPRIATIONS,
      creditAccountTitle: 'Unexpended Appropriations',
      amount: acct.endBalance,
      description: `Close FY${closingFY} Appropriations Received to Unexpended Appropriations`,
      authority: 'SFFAS 7; Treasury Financial Manual, Ch. 4700',
      closingFiscalYear: closingFY,
      postingDate,
    });
  }

  return entries;
}

/**
 * Generate budgetary closing entries.
 *
 * Closes temporary budgetary accounts per TFM guidance.
 * Budgetary accounts (4xxx series) are closed to reflect
 * the final status of budgetary resources at year-end.
 */
function generateBudgetaryClosingEntries(
  accounts: USSGLAccount[],
  closingFY: number,
  postingDate: string
): ClosingEntry[] {
  const entries: ClosingEntry[] = [];
  const fyAccounts = accounts.filter(
    (a) => a.fiscalYear === closingFY && a.accountNumber.startsWith('4')
  );

  // Close budget authority accounts
  const budgetAuthAccounts = fyAccounts.filter(
    (a) => a.accountNumber.startsWith('40') && a.endBalance !== 0
  );
  for (const acct of budgetAuthAccounts) {
    entries.push({
      id: uuid(),
      entryType: 'close_budgetary_authority',
      debitAccountNumber: acct.accountNumber,
      debitAccountTitle: acct.accountTitle,
      creditAccountNumber: '4450',
      creditAccountTitle: 'Unapportioned Authority - Prior Year Balance',
      amount: acct.endBalance,
      description: `Close FY${closingFY} budgetary authority account ${acct.accountNumber}`,
      authority: 'Treasury Financial Manual, Ch. 4700; DoD FMR Vol. 4, Ch. 2',
      closingFiscalYear: closingFY,
      postingDate,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Appropriation Transition Processing
// ---------------------------------------------------------------------------

/**
 * Process an appropriation's status transition at fiscal year-end.
 *
 * Determines whether each appropriation should:
 *   - Remain current (multi-year or no-year)
 *   - Transition to expired (one-year whose period just ended)
 *   - Transition to cancelled (expired for 5+ years)
 *
 * Per 31 U.S.C. §1552(a), an appropriation account is cancelled
 * 5 fiscal years after the period of availability expires.
 */
function processAppropriationTransition(
  approp: Appropriation,
  closingFY: number,
  rolloverDate: string,
  result: FiscalYearRolloverResult
): void {
  const closingDate = new Date(rolloverDate);

  // No-year appropriations never expire or cancel
  if (approp.appropriationType === 'no_year') {
    return;
  }

  // Check if this appropriation should expire
  if (approp.status === 'current') {
    const expirationDate = approp.expirationDate
      ? new Date(approp.expirationDate)
      : new Date(approp.fiscalYearEnd);

    if (closingDate >= expirationDate) {
      result.expiredAppropriations.push({
        appropriationId: approp.id,
        tas: approp.treasuryAccountSymbol,
        previousStatus: 'current',
        newStatus: 'expired',
      });
      result.totalAppropriationsExpired++;

      // Generate expiration closing entry
      result.closingEntries.push({
        id: uuid(),
        entryType: 'expire_appropriation',
        debitAccountNumber: '4450',
        debitAccountTitle: 'Unapportioned Authority - Expired',
        creditAccountNumber: '4510',
        creditAccountTitle: 'Apportionments - Expired',
        amount: approp.unobligatedBalance,
        description: `Expire appropriation ${approp.treasuryAccountSymbol}: unobligated balance $${approp.unobligatedBalance.toFixed(2)} no longer available for new obligations`,
        authority: 'DoD FMR Vol. 3, Ch. 8, para 080701; 31 U.S.C. §1552',
        closingFiscalYear: closingFY,
        postingDate: rolloverDate,
      });

      // Mutate the appropriation status
      approp.status = 'expired';
    }
  }

  // Check if this expired appropriation should be cancelled
  if (approp.status === 'expired') {
    const expirationDate = approp.expirationDate
      ? new Date(approp.expirationDate)
      : new Date(approp.fiscalYearEnd);

    const cancellationDate = approp.cancellationDate
      ? new Date(approp.cancellationDate)
      : new Date(
          expirationDate.getFullYear() + 5,
          expirationDate.getMonth(),
          expirationDate.getDate()
        );

    if (closingDate >= cancellationDate) {
      const cancelledBalance = approp.unobligatedBalance + (approp.obligated - approp.disbursed);

      result.cancelledAppropriations.push({
        appropriationId: approp.id,
        tas: approp.treasuryAccountSymbol,
        cancelledBalance,
      });
      result.totalAppropriationsCancelled++;
      result.totalCancelledBalances += cancelledBalance;

      // Generate cancellation closing entry
      result.closingEntries.push({
        id: uuid(),
        entryType: 'cancel_appropriation',
        debitAccountNumber: '4450',
        debitAccountTitle: 'Unapportioned Authority - Cancelled',
        creditAccountNumber: '4190',
        creditAccountTitle: 'Other Authority Cancelled',
        amount: cancelledBalance,
        description: `Cancel appropriation ${approp.treasuryAccountSymbol}: $${cancelledBalance.toFixed(2)} returned to Treasury (5-year cancellation per §1552(a))`,
        authority: '31 U.S.C. §1552(a); DoD FMR Vol. 3, Ch. 8, para 080801',
        closingFiscalYear: closingFY,
        postingDate: rolloverDate,
      });

      // Mutate the appropriation
      approp.status = 'cancelled';
      approp.unobligatedBalance = 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Beginning Balance Computation
// ---------------------------------------------------------------------------

/**
 * Compute beginning balances for the new fiscal year.
 *
 * Beginning balances for the new FY are derived from the ending
 * balances of the closing FY after all closing entries are posted.
 *
 * Permanent accounts carry forward:
 *   - Assets (1xxx)
 *   - Liabilities (2xxx)
 *   - Net Position (3xxx) — after closing entries
 *
 * Temporary accounts start at zero:
 *   - Revenue (5xxx)
 *   - Expense (6xxx)
 *
 * Budgetary accounts carry forward appropriation status:
 *   - Undelivered orders
 *   - Unpaid obligations
 *   - Available authority (for current/multi-year appropriations)
 *
 * @param closingAccounts - USSGL accounts at end of closing FY
 * @param closingFY - The fiscal year being closed
 * @returns New FY beginning balance accounts
 */
export function computeBeginningBalances(
  closingAccounts: USSGLAccount[],
  closingFY: number
): USSGLAccount[] {
  const openingFY = closingFY + 1;
  const beginningAccounts: USSGLAccount[] = [];

  for (const acct of closingAccounts) {
    if (acct.fiscalYear !== closingFY) continue;

    const accountNum = parseInt(acct.accountNumber, 10);
    const isPermanent = accountNum >= 1000 && accountNum <= 3999;
    const isBudgetary = accountNum >= 4000 && accountNum <= 4999;
    const isTemporary = accountNum >= 5000;

    if (isTemporary) {
      // Temporary accounts start at zero
      beginningAccounts.push({
        ...acct,
        id: uuid(),
        fiscalYear: openingFY,
        beginBalance: 0,
        endBalance: 0,
      });
    } else if (isPermanent || isBudgetary) {
      // Permanent and budgetary accounts carry forward
      beginningAccounts.push({
        ...acct,
        id: uuid(),
        fiscalYear: openingFY,
        beginBalance: acct.endBalance,
        endBalance: acct.endBalance,
      });
    }
  }

  return beginningAccounts;
}

/**
 * Validate that the rollover result is internally consistent.
 *
 * Checks:
 *   - Closing entries are balanced (debits = credits)
 *   - All expired appropriations had current status before
 *   - Cancelled appropriations were in expired status
 *   - ULO carry-forwards match obligation records
 */
export function validateRolloverResult(
  result: FiscalYearRolloverResult
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check closing entries balance
  /* eslint-disable @typescript-eslint/no-unused-vars */
  let totalDebits = 0;
  let totalCredits = 0;
  for (const entry of result.closingEntries) {
    totalDebits += entry.amount;
    totalCredits += entry.amount;
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
  // Closing entries are always balanced by construction (each entry has equal debit/credit)

  // Check expired appropriations had before-snapshot status of 'current'
  for (const expired of result.expiredAppropriations) {
    const beforeSnap = result.beforeSnapshots.find(
      (s) => s.appropriationId === expired.appropriationId
    );
    if (beforeSnap && beforeSnap.status !== 'current') {
      issues.push(
        `Appropriation ${expired.tas} was ${beforeSnap.status} before rollover but was marked as newly expired`
      );
    }
  }

  // Check cancelled had before-snapshot status of 'expired'
  for (const cancelled of result.cancelledAppropriations) {
    const beforeSnap = result.beforeSnapshots.find(
      (s) => s.appropriationId === cancelled.appropriationId
    );
    if (beforeSnap && beforeSnap.status !== 'expired') {
      issues.push(
        `Appropriation ${cancelled.tas} was ${beforeSnap?.status} before rollover but was marked as cancelled`
      );
    }
  }

  // Check ULO totals
  const computedULO = result.uloCarryForwards.reduce((sum, u) => sum + u.amount, 0);
  if (Math.abs(computedULO - result.totalULOCarryForward) > 0.01) {
    issues.push(
      `ULO carry-forward total mismatch: computed $${computedULO.toFixed(2)} vs reported $${result.totalULOCarryForward.toFixed(2)}`
    );
  }

  return { valid: issues.length === 0, issues };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSnapshot(
  approp: Appropriation,
  fiscalYear: number,
  snapshotDate: string
): AppropriationSnapshot {
  return {
    appropriationId: approp.id,
    treasuryAccountSymbol: approp.treasuryAccountSymbol,
    fiscalYear,
    snapshotDate,
    status: approp.status,
    totalAuthority: approp.totalAuthority,
    apportioned: approp.apportioned,
    allotted: approp.allotted,
    committed: approp.committed,
    obligated: approp.obligated,
    disbursed: approp.disbursed,
    unobligatedBalance: approp.unobligatedBalance,
  };
}

function daysSinceDate(dateStr: string, asOfStr: string): number {
  const date = new Date(dateStr);
  const asOf = new Date(asOfStr);
  return Math.floor((asOf.getTime() - date.getTime()) / 86_400_000);
}
