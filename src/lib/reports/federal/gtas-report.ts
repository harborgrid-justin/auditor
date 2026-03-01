/**
 * GTAS (Governmentwide Treasury Account Symbol Adjusted Trial Balance System)
 * Report Generator
 *
 * Generates the GTAS report, the government-wide system used by Treasury to
 * collect and validate USSGL-level financial data from federal agencies.
 * The report includes USSGL balances by TAS, intragovernmental splits,
 * and reconciliation with Treasury balances.
 *
 * References:
 *   - Treasury Financial Manual (TFM) Volume I, Part 2, Chapter 4700
 *   - USSGL Supplement, Section V: Crosswalks
 *   - OMB Circular A-136: Financial Reporting Requirements
 *   - DoD 7000.14-R, Volume 6A: Reporting Policy
 *   - 31 USC §3513: Treasury Reporting Requirements
 */

import type { USSGLAccount, Appropriation } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * GTAS report structure containing USSGL balances, intragovernmental splits,
 * and reconciliation status.
 */
export interface GTASReport {
  fiscalYear: number;
  period: string;
  generatedDate: string;
  ussglBalances: Record<string, GTASAccountBalance>;
  intragovSplits: Record<string, { federal: number; public: number }>;
  reconciliationStatus: {
    reconciled: boolean;
    budgetaryDebitTotal: number;
    budgetaryCreditTotal: number;
    proprietaryDebitTotal: number;
    proprietaryCreditTotal: number;
    budgetaryNetBalance: number;
    proprietaryNetBalance: number;
    fundBalanceWithTreasury: number;
    trialBalanceCheck: boolean;
  };
}

interface GTASAccountBalance {
  accountNumber: string;
  accountTitle: string;
  normalBalance: string;
  beginBalance: number;
  endBalance: number;
  category: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function classifyAccount(accountNumber: string): string {
  const firstDigit = accountNumber.charAt(0);
  switch (firstDigit) {
    case '1': return 'Assets';
    case '2': return 'Liabilities';
    case '3': return 'Net Position';
    case '4': return 'Budgetary';
    case '5': return 'Revenue';
    case '6': return 'Expenses';
    default:  return 'Other';
  }
}

function isBudgetaryAccount(accountNumber: string): boolean {
  return accountNumber.charAt(0) === '4';
}

function isProprietaryAccount(accountNumber: string): boolean {
  const first = accountNumber.charAt(0);
  return ['1', '2', '3', '5', '6'].includes(first);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a GTAS report from USSGL account balances and appropriation data.
 *
 * Per TFM Part 2, Chapter 4700: Federal agencies submit USSGL trial balance
 * data through GTAS on a monthly/quarterly basis. The submission includes:
 *
 *   1. USSGL account balances grouped by TAS
 *   2. Split between intragovernmental (federal) and public amounts
 *   3. Budgetary vs. proprietary reconciliation
 *
 * @param accounts - all USSGL accounts for the reporting entity
 * @param appropriations - all Appropriation records
 * @param fiscalYear - the fiscal year being reported
 * @param period - the reporting period (e.g., "2025-Q1", "2025-09")
 * @returns GTASReport structure
 */
export function generateGTAS(
  accounts: USSGLAccount[],
  appropriations: Appropriation[],
  fiscalYear: number,
  period: string,
): GTASReport {
  // --- Build USSGL balance map keyed by account number ---
  const ussglBalances: Record<string, GTASAccountBalance> = {};

  for (const acct of accounts) {
    const key = acct.accountNumber;
    if (ussglBalances[key]) {
      // Aggregate if same account number appears multiple times
      ussglBalances[key].beginBalance += acct.beginBalance;
      ussglBalances[key].endBalance += acct.endBalance;
    } else {
      ussglBalances[key] = {
        accountNumber: acct.accountNumber,
        accountTitle: acct.accountTitle,
        normalBalance: acct.normalBalance,
        beginBalance: acct.beginBalance,
        endBalance: acct.endBalance,
        category: classifyAccount(acct.accountNumber),
      };
    }
  }

  // --- Intragovernmental splits ---
  // Per USSGL account attributes, accounts are split into federal (intragovernmental)
  // and public (non-federal) components.
  const intragovSplits: Record<string, { federal: number; public: number }> = {};

  for (const acct of accounts) {
    const category = classifyAccount(acct.accountNumber);
    if (!intragovSplits[category]) {
      intragovSplits[category] = { federal: 0, public: 0 };
    }

    // Federal accounts: FBWT (1010), AR from federal (13xx), AP to federal (21xx),
    // debt (25xx), net position transfers (31xx)
    const federalPrefixes = ['1010', '13', '21', '25', '29', '31'];
    const isFederal = federalPrefixes.some(p => acct.accountNumber.startsWith(p));

    if (isFederal) {
      intragovSplits[category].federal += acct.endBalance;
    } else {
      intragovSplits[category].public += acct.endBalance;
    }
  }

  // --- Reconciliation status ---
  const budgetaryAccts = accounts.filter(a => isBudgetaryAccount(a.accountNumber));
  const proprietaryAccts = accounts.filter(a => isProprietaryAccount(a.accountNumber));

  const budgetaryDebitTotal = budgetaryAccts
    .filter(a => a.normalBalance === 'debit')
    .reduce((sum, a) => sum + a.endBalance, 0);
  const budgetaryCreditTotal = budgetaryAccts
    .filter(a => a.normalBalance === 'credit')
    .reduce((sum, a) => sum + a.endBalance, 0);
  const budgetaryNetBalance = budgetaryDebitTotal - budgetaryCreditTotal;

  const proprietaryDebitTotal = proprietaryAccts
    .filter(a => a.normalBalance === 'debit')
    .reduce((sum, a) => sum + a.endBalance, 0);
  const proprietaryCreditTotal = proprietaryAccts
    .filter(a => a.normalBalance === 'credit')
    .reduce((sum, a) => sum + a.endBalance, 0);
  const proprietaryNetBalance = proprietaryDebitTotal - proprietaryCreditTotal;

  // Fund Balance with Treasury (USSGL 1010)
  const fundBalanceWithTreasury = accounts
    .filter(a => a.accountNumber.startsWith('1010'))
    .reduce((sum, a) => sum + a.endBalance, 0);

  // Trial balance: debits should equal credits within each domain
  const budgetaryBalanced = Math.abs(budgetaryNetBalance) < 0.01;
  const proprietaryBalanced = Math.abs(proprietaryNetBalance) < 0.01;
  const trialBalanceCheck = budgetaryBalanced && proprietaryBalanced;

  return {
    fiscalYear,
    period,
    generatedDate: new Date().toISOString(),
    ussglBalances,
    intragovSplits,
    reconciliationStatus: {
      reconciled: trialBalanceCheck,
      budgetaryDebitTotal: Math.round(budgetaryDebitTotal * 100) / 100,
      budgetaryCreditTotal: Math.round(budgetaryCreditTotal * 100) / 100,
      proprietaryDebitTotal: Math.round(proprietaryDebitTotal * 100) / 100,
      proprietaryCreditTotal: Math.round(proprietaryCreditTotal * 100) / 100,
      budgetaryNetBalance: Math.round(budgetaryNetBalance * 100) / 100,
      proprietaryNetBalance: Math.round(proprietaryNetBalance * 100) / 100,
      fundBalanceWithTreasury: Math.round(fundBalanceWithTreasury * 100) / 100,
      trialBalanceCheck,
    },
  };
}

/**
 * Reconcile agency book balances with Treasury balances.
 *
 * Per TFM Part 2, Chapter 4700 and DoD FMR Vol 6A: Agencies must reconcile
 * their USSGL-reported balances against Treasury-held balances. Differences
 * may arise from:
 *   - In-transit disbursements (checks issued but not yet cleared)
 *   - Deposits in transit
 *   - Timing differences in interagency transactions
 *   - Accounting errors
 *
 * @param accounts - all USSGL accounts for the entity
 * @param appropriations - all Appropriation records (carrying Treasury-side data)
 * @returns Reconciliation result with per-account differences
 */
export function reconcileWithTreasury(
  accounts: USSGLAccount[],
  appropriations: Appropriation[],
): {
  reconciled: boolean;
  differences: Array<{
    account: string;
    bookBalance: number;
    treasuryBalance: number;
    difference: number;
  }>;
} {
  const differences: Array<{
    account: string;
    bookBalance: number;
    treasuryBalance: number;
    difference: number;
  }> = [];

  // --- Fund Balance with Treasury (USSGL 1010) reconciliation ---
  // The primary reconciliation point: USSGL 1010 should match
  // Treasury's record of the agency's cash position.
  const bookFBWT = accounts
    .filter(a => a.accountNumber.startsWith('1010'))
    .reduce((sum, a) => sum + a.endBalance, 0);

  // Treasury-side FBWT = total authority - disbursed
  const treasuryFBWT = appropriations.reduce(
    (sum, a) => sum + (a.totalAuthority - a.disbursed),
    0,
  );

  const fbwtDiff = Math.round((bookFBWT - treasuryFBWT) * 100) / 100;
  if (Math.abs(fbwtDiff) > 0.01) {
    differences.push({
      account: 'USSGL 1010 - Fund Balance with Treasury',
      bookBalance: Math.round(bookFBWT * 100) / 100,
      treasuryBalance: Math.round(treasuryFBWT * 100) / 100,
      difference: fbwtDiff,
    });
  }

  // --- Obligation-level reconciliation ---
  const bookObligations = accounts
    .filter(a =>
      a.accountNumber.startsWith('4801') ||
      a.accountNumber.startsWith('4802') ||
      a.accountNumber.startsWith('4871') ||
      a.accountNumber.startsWith('4872'),
    )
    .reduce((sum, a) => sum + a.endBalance, 0);

  const treasuryObligations = appropriations.reduce(
    (sum, a) => sum + a.obligated,
    0,
  );

  const oblDiff = Math.round((bookObligations - treasuryObligations) * 100) / 100;
  if (Math.abs(oblDiff) > 0.01) {
    differences.push({
      account: 'USSGL 4801/4802 - Obligations',
      bookBalance: Math.round(bookObligations * 100) / 100,
      treasuryBalance: Math.round(treasuryObligations * 100) / 100,
      difference: oblDiff,
    });
  }

  // --- Disbursement reconciliation ---
  const bookDisbursements = accounts
    .filter(a =>
      a.accountNumber.startsWith('4902') ||
      a.accountNumber.startsWith('4908') ||
      a.accountNumber.startsWith('4910'),
    )
    .reduce((sum, a) => sum + a.endBalance, 0);

  const treasuryDisbursements = appropriations.reduce(
    (sum, a) => sum + a.disbursed,
    0,
  );

  const disbDiff = Math.round((bookDisbursements - treasuryDisbursements) * 100) / 100;
  if (Math.abs(disbDiff) > 0.01) {
    differences.push({
      account: 'USSGL 4902/4908/4910 - Disbursements',
      bookBalance: Math.round(bookDisbursements * 100) / 100,
      treasuryBalance: Math.round(treasuryDisbursements * 100) / 100,
      difference: disbDiff,
    });
  }

  // --- Per-TAS authority balance check ---
  for (const approp of appropriations) {
    const tasObligated = approp.obligated;
    const tasUnobligated = approp.unobligatedBalance;
    const tasTotalAuthority = approp.totalAuthority;

    const tasDiff = Math.round(
      ((tasObligated + tasUnobligated) - tasTotalAuthority) * 100,
    ) / 100;

    if (Math.abs(tasDiff) > 0.01) {
      differences.push({
        account: `TAS ${approp.treasuryAccountSymbol} - Authority Balance`,
        bookBalance: Math.round((tasObligated + tasUnobligated) * 100) / 100,
        treasuryBalance: Math.round(tasTotalAuthority * 100) / 100,
        difference: tasDiff,
      });
    }
  }

  return {
    reconciled: differences.length === 0,
    differences,
  };
}
