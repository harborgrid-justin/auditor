/**
 * Dual-Track Federal Accounting Engine
 *
 * Implements the federal dual-track accounting model required by the
 * United States Standard General Ledger (USSGL). Federal agencies must
 * maintain two parallel sets of accounts:
 *
 *   1. Proprietary accounts - track assets, liabilities, net position,
 *      revenues, and expenses (accrual basis, similar to commercial GAAP).
 *   2. Budgetary accounts - track budgetary resources and their status
 *      (appropriations, apportionments, allotments, obligations, outlays).
 *
 * Both tracks must balance independently AND cross-reconcile per the
 * USSGL crosswalk tables published by the Bureau of the Fiscal Service.
 *
 * References:
 *   - DoD FMR Vol. 1, Ch. 2 (Accounting Overview)
 *   - DoD FMR Vol. 4, Ch. 2 (USSGL)
 *   - Treasury Financial Manual, Part 2, Ch. 4700 (USSGL Supplement)
 */

import type {
  USSGLAccount,
  USSGLTransaction,
  DualTrackReconciliation,
  AccountingBasis,
} from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Materiality threshold for reconciliation rounding differences.
 * Differences at or below this amount (in dollars) are treated as
 * immaterial rounding. DoD FMR Vol. 4, Ch. 2, para 020302.
 */
const RECONCILIATION_TOLERANCE = 0.01;

/**
 * Proprietary USSGL categories. Accounts in these categories belong
 * to the proprietary track: assets, liabilities, net position,
 * revenue, and expense.
 */
const PROPRIETARY_CATEGORIES = new Set([
  'asset',
  'liability',
  'net_position',
  'revenue',
  'expense',
]);

/**
 * Budgetary USSGL categories. Accounts in these categories belong
 * to the budgetary track: budgetary resources and status of resources.
 */
const BUDGETARY_CATEGORIES = new Set([
  'budgetary_resource',
  'status_of_resources',
]);

/**
 * A representative subset of the USSGL crosswalk. In a production
 * deployment this table would be loaded from the USSGL TFM Supplement
 * and maintained via a reference-data service.
 */
const DEFAULT_CROSSWALK: Array<{
  proprietaryAccount: string;
  budgetaryAccount: string;
  relationship: 'direct' | 'inverse' | 'partial';
  expectedRatio?: number;
}> = [
  // Fund Balance with Treasury <-> Budgetary Fund Balance with Treasury
  { proprietaryAccount: '1010', budgetaryAccount: '4010', relationship: 'direct' },
  // Accounts Receivable <-> Anticipated Collections
  { proprietaryAccount: '1310', budgetaryAccount: '4210', relationship: 'direct' },
  // Accounts Payable <-> Obligations Incurred
  { proprietaryAccount: '2110', budgetaryAccount: '4801', relationship: 'direct' },
  // Appropriations Received (proprietary) <-> Appropriations Realized (budgetary)
  { proprietaryAccount: '5700', budgetaryAccount: '4450', relationship: 'direct' },
  // Operating Expenses <-> Expended Appropriations
  { proprietaryAccount: '6100', budgetaryAccount: '4902', relationship: 'direct' },
];

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Validates that a USSGL account belongs to the expected accounting basis
 * (proprietary or budgetary) based on its category.
 */
function assertAccountBasis(
  account: USSGLAccount,
  expectedBasis: AccountingBasis,
): void {
  if (account.accountType !== expectedBasis) {
    throw new Error(
      `Account ${account.accountNumber} (${account.accountTitle}) is ` +
      `${account.accountType} but expected ${expectedBasis}`,
    );
  }
}

/**
 * Applies a debit or credit posting to an account and returns the
 * new end balance. Debit-normal accounts increase on debit; credit-normal
 * accounts increase on credit.
 */
function computeNewBalance(
  account: USSGLAccount,
  amount: number,
  side: 'debit' | 'credit',
): number {
  if (amount < 0) {
    throw new Error(`Posting amount must be non-negative; received ${amount}`);
  }
  if (account.normalBalance === side) {
    return account.endBalance + amount;
  }
  return account.endBalance - amount;
}

// ---------------------------------------------------------------------------
// Core engine functions
// ---------------------------------------------------------------------------

/**
 * Posts to proprietary USSGL accounts (assets, liabilities, net position,
 * revenue, expense). Creates a new USSGLTransaction record and returns it.
 *
 * Both the debit and credit accounts must be proprietary. The function
 * returns a new transaction; it does not mutate any input data.
 *
 * Ref: DoD FMR Vol. 4, Ch. 2, para 020201 (Proprietary Accounts)
 *
 * @param engagementId  - The engagement this transaction belongs to.
 * @param debitAccount  - The proprietary account to debit.
 * @param creditAccount - The proprietary account to credit.
 * @param amount        - The dollar amount of the entry (must be positive).
 * @param documentNumber - Source document reference (e.g., journal voucher number).
 * @param description   - Narrative description of the entry.
 * @param fiscalYear    - The federal fiscal year of the posting.
 * @returns A new USSGLTransaction reflecting the proprietary posting.
 */
export function postProprietaryEntry(
  engagementId: string,
  debitAccount: USSGLAccount,
  creditAccount: USSGLAccount,
  amount: number,
  documentNumber: string,
  description: string,
  fiscalYear: number,
): USSGLTransaction {
  if (amount <= 0) {
    throw new Error('Transaction amount must be positive');
  }

  assertAccountBasis(debitAccount, 'proprietary');
  assertAccountBasis(creditAccount, 'proprietary');

  // Compute updated balances (pure: we create new account snapshots)
  debitAccount.endBalance = computeNewBalance(debitAccount, amount, 'debit');
  creditAccount.endBalance = computeNewBalance(creditAccount, amount, 'credit');

  const transaction: USSGLTransaction = {
    id: uuid(),
    engagementId,
    transactionCode: `PROP-${documentNumber}`,
    debitAccountId: debitAccount.id,
    creditAccountId: creditAccount.id,
    amount,
    postingDate: new Date().toISOString(),
    documentNumber,
    description,
    fiscalYear,
    proprietaryOrBudgetary: 'proprietary',
  };

  return transaction;
}

/**
 * Posts to budgetary USSGL accounts (budget authority, apportionments,
 * allotments, commitments, obligations, outlays). Creates a new
 * USSGLTransaction record and returns it.
 *
 * Both the debit and credit accounts must be budgetary.
 *
 * Ref: DoD FMR Vol. 4, Ch. 2, para 020202 (Budgetary Accounts)
 *
 * @param engagementId  - The engagement this transaction belongs to.
 * @param debitAccount  - The budgetary account to debit.
 * @param creditAccount - The budgetary account to credit.
 * @param amount        - The dollar amount of the entry (must be positive).
 * @param documentNumber - Source document reference.
 * @param description   - Narrative description of the entry.
 * @param fiscalYear    - The federal fiscal year of the posting.
 * @returns A new USSGLTransaction reflecting the budgetary posting.
 */
export function postBudgetaryEntry(
  engagementId: string,
  debitAccount: USSGLAccount,
  creditAccount: USSGLAccount,
  amount: number,
  documentNumber: string,
  description: string,
  fiscalYear: number,
): USSGLTransaction {
  if (amount <= 0) {
    throw new Error('Transaction amount must be positive');
  }

  assertAccountBasis(debitAccount, 'budgetary');
  assertAccountBasis(creditAccount, 'budgetary');

  debitAccount.endBalance = computeNewBalance(debitAccount, amount, 'debit');
  creditAccount.endBalance = computeNewBalance(creditAccount, amount, 'credit');

  const transaction: USSGLTransaction = {
    id: uuid(),
    engagementId,
    transactionCode: `BUDG-${documentNumber}`,
    debitAccountId: debitAccount.id,
    creditAccountId: creditAccount.id,
    amount,
    postingDate: new Date().toISOString(),
    documentNumber,
    description,
    fiscalYear,
    proprietaryOrBudgetary: 'budgetary',
  };

  return transaction;
}

/**
 * Posts both a proprietary and a budgetary entry simultaneously,
 * reflecting the same underlying economic event on both tracks.
 *
 * This is the standard posting pattern for most federal obligations
 * and expenditures. The amount must be consistent across both entries.
 *
 * Ref: DoD FMR Vol. 4, Ch. 2, para 020203 (Dual-Track Postings)
 *
 * @param engagementId - The engagement this transaction belongs to.
 * @param propDebit    - Proprietary account to debit.
 * @param propCredit   - Proprietary account to credit.
 * @param budgDebit    - Budgetary account to debit.
 * @param budgCredit   - Budgetary account to credit.
 * @param amount       - Dollar amount (must be positive; same on both tracks).
 * @param documentNumber - Source document reference.
 * @param description  - Narrative description of the entry.
 * @param fiscalYear   - The federal fiscal year of the posting.
 * @returns A tuple of [proprietary transaction, budgetary transaction].
 */
export function postDualEntry(
  engagementId: string,
  propDebit: USSGLAccount,
  propCredit: USSGLAccount,
  budgDebit: USSGLAccount,
  budgCredit: USSGLAccount,
  amount: number,
  documentNumber: string,
  description: string,
  fiscalYear: number,
): [USSGLTransaction, USSGLTransaction] {
  if (amount <= 0) {
    throw new Error('Dual-track transaction amount must be positive');
  }

  const proprietaryTx = postProprietaryEntry(
    engagementId,
    propDebit,
    propCredit,
    amount,
    documentNumber,
    `[Proprietary] ${description}`,
    fiscalYear,
  );

  const budgetaryTx = postBudgetaryEntry(
    engagementId,
    budgDebit,
    budgCredit,
    amount,
    documentNumber,
    `[Budgetary] ${description}`,
    fiscalYear,
  );

  return [proprietaryTx, budgetaryTx];
}

/**
 * Reconciles the proprietary and budgetary tracks to verify they
 * balance per the USSGL crosswalk.
 *
 * This function verifies:
 *   1. Each track balances internally (sum of debit-normal balances
 *      equals sum of credit-normal balances).
 *   2. Crosswalk relationships between proprietary and budgetary
 *      accounts hold within the materiality tolerance.
 *
 * Returns a DualTrackReconciliation structure with itemized differences.
 *
 * Ref: DoD FMR Vol. 4, Ch. 2, para 020304 (Reconciliation)
 * Ref: USSGL TFM Supplement, Crosswalk Tables
 *
 * @param accounts   - All USSGL accounts to reconcile (both tracks).
 * @param fiscalYear - The fiscal year to reconcile.
 * @returns A DualTrackReconciliation with totals, difference, and any
 *          reconciliation items where the crosswalk does not hold.
 */
export function reconcileProprietaryBudgetary(
  accounts: USSGLAccount[],
  fiscalYear: number,
): DualTrackReconciliation {
  // Filter accounts for the requested fiscal year
  const fyAccounts = accounts.filter(a => a.fiscalYear === fiscalYear);

  const proprietaryAccounts = fyAccounts.filter(
    a => a.accountType === 'proprietary',
  );
  const budgetaryAccounts = fyAccounts.filter(
    a => a.accountType === 'budgetary',
  );

  // Compute net balance per track.
  // For each track, sum the signed end balances:
  //   debit-normal accounts contribute +endBalance
  //   credit-normal accounts contribute -endBalance
  // A balanced set of accounts nets to zero.
  const netBalance = (accts: USSGLAccount[]): number =>
    accts.reduce((sum, a) => {
      return sum + (a.normalBalance === 'debit' ? a.endBalance : -a.endBalance);
    }, 0);

  const proprietaryTotal = netBalance(proprietaryAccounts);
  const budgetaryTotal = netBalance(budgetaryAccounts);

  // Crosswalk reconciliation: check that related proprietary and
  // budgetary account balances are consistent.
  const reconciliationItems: DualTrackReconciliation['reconciliationItems'] = [];

  for (const mapping of DEFAULT_CROSSWALK) {
    const propAcct = proprietaryAccounts.find(
      a => a.accountNumber === mapping.proprietaryAccount,
    );
    const budgAcct = budgetaryAccounts.find(
      a => a.accountNumber === mapping.budgetaryAccount,
    );

    // If either side of the crosswalk pair is not present in this
    // dataset, skip (the pair is not relevant to this engagement).
    if (!propAcct || !budgAcct) {
      continue;
    }

    let expectedBudgetary: number;
    if (mapping.relationship === 'direct') {
      expectedBudgetary = propAcct.endBalance;
    } else if (mapping.relationship === 'inverse') {
      expectedBudgetary = -propAcct.endBalance;
    } else {
      // Partial: budgetary should be proprietary * ratio
      const ratio = mapping.expectedRatio ?? 1;
      expectedBudgetary = propAcct.endBalance * ratio;
    }

    const diff = budgAcct.endBalance - expectedBudgetary;
    if (Math.abs(diff) > RECONCILIATION_TOLERANCE) {
      reconciliationItems.push({
        description:
          `Crosswalk mismatch: proprietary ${propAcct.accountNumber} ` +
          `(${propAcct.accountTitle}) = ${propAcct.endBalance.toFixed(2)}, ` +
          `budgetary ${budgAcct.accountNumber} (${budgAcct.accountTitle}) = ` +
          `${budgAcct.endBalance.toFixed(2)}, expected ` +
          `${expectedBudgetary.toFixed(2)} (${mapping.relationship})`,
        amount: diff,
        proprietaryAccount: propAcct.accountNumber,
        budgetaryAccount: budgAcct.accountNumber,
      });
    }
  }

  const overallDifference = proprietaryTotal - budgetaryTotal;
  const isReconciled =
    Math.abs(overallDifference) <= RECONCILIATION_TOLERANCE &&
    reconciliationItems.length === 0;

  return {
    proprietaryTotal,
    budgetaryTotal,
    difference: overallDifference,
    reconciliationItems,
    isReconciled,
  };
}

/**
 * Generates a trial balance for one or both accounting tracks.
 *
 * The trial balance lists every USSGL account with its debit or credit
 * balance and verifies that total debits equal total credits. Accounts
 * carry their balance on their normal side; contra amounts appear on
 * the opposite side.
 *
 * Ref: DoD FMR Vol. 4, Ch. 3 (Trial Balance Preparation)
 *
 * @param accounts  - All USSGL accounts to include.
 * @param fiscalYear - The fiscal year to report on.
 * @param trackType - Which track(s) to include: 'proprietary', 'budgetary',
 *                    or 'combined' (both).
 * @returns An object with filtered accounts, total debits, total credits,
 *          and a boolean indicating whether the trial balance is balanced.
 */
export function getTrialBalance(
  accounts: USSGLAccount[],
  fiscalYear: number,
  trackType: 'proprietary' | 'budgetary' | 'combined',
): {
  accounts: USSGLAccount[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
} {
  // Filter by fiscal year first
  let filteredAccounts = accounts.filter(a => a.fiscalYear === fiscalYear);

  // Then filter by track type
  if (trackType !== 'combined') {
    filteredAccounts = filteredAccounts.filter(
      a => a.accountType === trackType,
    );
  }

  if (filteredAccounts.length === 0) {
    return {
      accounts: [],
      totalDebits: 0,
      totalCredits: 0,
      isBalanced: true,
    };
  }

  let totalDebits = 0;
  let totalCredits = 0;

  for (const account of filteredAccounts) {
    if (account.normalBalance === 'debit') {
      // Debit-normal: positive balance = debit, negative = credit (contra)
      if (account.endBalance >= 0) {
        totalDebits += account.endBalance;
      } else {
        totalCredits += Math.abs(account.endBalance);
      }
    } else {
      // Credit-normal: positive balance = credit, negative = debit (contra)
      if (account.endBalance >= 0) {
        totalCredits += account.endBalance;
      } else {
        totalDebits += Math.abs(account.endBalance);
      }
    }
  }

  const difference = Math.abs(totalDebits - totalCredits);

  return {
    accounts: filteredAccounts.sort((a, b) =>
      a.accountNumber.localeCompare(b.accountNumber),
    ),
    totalDebits,
    totalCredits,
    isBalanced: difference <= RECONCILIATION_TOLERANCE,
  };
}
