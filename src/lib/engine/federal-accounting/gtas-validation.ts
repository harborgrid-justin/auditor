/**
 * GTAS Submission Validation Engine
 *
 * Validates GTAS (Governmentwide Treasury Account Symbol Adjusted Trial
 * Balance System) submissions against Treasury's edit checks. Ensures
 * data quality before submission to Treasury.
 *
 * Treasury GTAS edit categories:
 *   - Fatal edits: Must be resolved before submission accepted
 *   - Warning edits: May be submitted with explanations
 *   - Informational edits: For data quality awareness
 *
 * Key validations:
 *   1. Trial balance equality (debits = credits)
 *   2. USSGL crosswalk consistency (USSGL -> SF-133 mapping)
 *   3. SF-133 / SFR reconciliation
 *   4. Fund Balance with Treasury reconciliation
 *   5. Intragovernmental balance consistency
 *
 * References:
 *   - TFM Volume I, Part 2, Chapter 4700: GTAS Requirements
 *   - USSGL TFM Supplement, Section V: Crosswalks
 *   - OMB Circular A-136: Financial Reporting Requirements
 *   - DoD FMR Vol. 6A: Reporting Policy
 */

import type { USSGLAccount, Appropriation, SF133Data } from '@/types/dod-fmr';
import type { GTASReport } from '@/lib/reports/federal/gtas-report';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GTASEditSeverity = 'fatal' | 'warning' | 'informational';

export interface GTASEditResult {
  editCode: string;
  severity: GTASEditSeverity;
  description: string;
  affectedAccounts?: string[];
  amount?: number;
  passed: boolean;
}

export interface GTASValidationResult {
  valid: boolean;
  fatalErrors: number;
  warnings: number;
  informational: number;
  edits: GTASEditResult[];
  validatedAt: string;
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
 * Run all Treasury GTAS edit checks against a GTAS report.
 *
 * Per TFM Part 2, Ch. 4700: Agencies must pass all fatal edits before
 * Treasury will accept a GTAS submission. Warning edits require
 * explanatory footnotes.
 *
 * @param report - The generated GTAS report
 * @param accounts - Source USSGL accounts
 * @param appropriations - Source appropriation data
 * @returns GTASValidationResult with all edit results
 */
export function validateGTASEdits(
  report: GTASReport,
  accounts: USSGLAccount[],
  appropriations: Appropriation[],
): GTASValidationResult {
  const edits: GTASEditResult[] = [];

  // ======================================================================
  // Edit 1: Trial Balance Equality (Fatal)
  // Debits must equal credits for both budgetary and proprietary
  // ======================================================================
  const budgetaryBalance = Math.abs(
    report.reconciliationStatus.budgetaryDebitTotal -
    report.reconciliationStatus.budgetaryCreditTotal,
  );
  edits.push({
    editCode: 'GTAS-001',
    severity: 'fatal',
    description: 'Budgetary trial balance: debits must equal credits',
    amount: budgetaryBalance,
    passed: budgetaryBalance < 0.01,
  });

  const proprietaryBalance = Math.abs(
    report.reconciliationStatus.proprietaryDebitTotal -
    report.reconciliationStatus.proprietaryCreditTotal,
  );
  edits.push({
    editCode: 'GTAS-002',
    severity: 'fatal',
    description: 'Proprietary trial balance: debits must equal credits',
    amount: proprietaryBalance,
    passed: proprietaryBalance < 0.01,
  });

  // ======================================================================
  // Edit 2: FBWT Consistency (Fatal)
  // USSGL 1010 must be non-negative and reconcilable
  // ======================================================================
  const fbwt = report.reconciliationStatus.fundBalanceWithTreasury;
  edits.push({
    editCode: 'GTAS-003',
    severity: 'fatal',
    description: 'Fund Balance with Treasury (USSGL 1010) must not be negative',
    amount: fbwt,
    passed: fbwt >= 0,
  });

  // ======================================================================
  // Edit 3: Budgetary/Proprietary Relationship (Warning)
  // USSGL 4201 (Total Authority) should approximate total budgetary debit
  // ======================================================================
  const totalAuthority = appropriations.reduce(
    (sum, a) => sum + a.totalAuthority, 0,
  );
  const budgetaryResources = report.reconciliationStatus.budgetaryDebitTotal;
  const authorityDiff = Math.abs(totalAuthority - budgetaryResources);
  const authorityThreshold = totalAuthority * 0.01; // 1% tolerance
  edits.push({
    editCode: 'GTAS-004',
    severity: 'warning',
    description: 'Total authority should be consistent with budgetary debit total',
    amount: authorityDiff,
    passed: authorityDiff < authorityThreshold || totalAuthority === 0,
  });

  // ======================================================================
  // Edit 4: Intragovernmental Balance Pairs (Warning)
  // Federal AR (13xx) should have corresponding federal AP (21xx)
  // ======================================================================
  const federalAR = accounts
    .filter(a => a.accountNumber.startsWith('13'))
    .reduce((sum, a) => sum + a.endBalance, 0);
  const federalAP = accounts
    .filter(a => a.accountNumber.startsWith('21'))
    .reduce((sum, a) => sum + a.endBalance, 0);
  const igtDiff = Math.abs(federalAR - federalAP);
  edits.push({
    editCode: 'GTAS-005',
    severity: 'warning',
    description: 'Intragovernmental AR (13xx) and AP (21xx) should be consistent for elimination',
    amount: igtDiff,
    affectedAccounts: ['13xx', '21xx'],
    passed: igtDiff < 1000, // $1000 tolerance for rounding
  });

  // ======================================================================
  // Edit 5: Obligation Consistency (Fatal)
  // Sum of obligation accounts must equal appropriation obligated amounts
  // ======================================================================
  const bookObligations = accounts
    .filter(a =>
      a.accountNumber.startsWith('4801') ||
      a.accountNumber.startsWith('4802') ||
      a.accountNumber.startsWith('4871') ||
      a.accountNumber.startsWith('4872'),
    )
    .reduce((sum, a) => sum + a.endBalance, 0);
  const appObligations = appropriations.reduce(
    (sum, a) => sum + a.obligated, 0,
  );
  const oblDiff = Math.abs(bookObligations - appObligations);
  edits.push({
    editCode: 'GTAS-006',
    severity: 'fatal',
    description: 'USSGL obligation accounts must reconcile to appropriation records',
    amount: oblDiff,
    affectedAccounts: ['4801', '4802', '4871', '4872'],
    passed: oblDiff < 0.01,
  });

  // ======================================================================
  // Edit 6: Account Attribute Consistency (Warning)
  // Normal balance direction must be consistent
  // ======================================================================
  const misbalancedAccounts: string[] = [];
  for (const acct of accounts) {
    const isDebitNormal = acct.normalBalance === 'debit';
    const hasDebitBalance = acct.endBalance >= 0;
    // Assets and expenses normally debit; liabilities and revenues normally credit
    if (isDebitNormal && !hasDebitBalance) {
      misbalancedAccounts.push(acct.accountNumber);
    }
  }
  edits.push({
    editCode: 'GTAS-007',
    severity: 'warning',
    description: 'Account balances should align with normal balance direction',
    affectedAccounts: misbalancedAccounts.slice(0, 10),
    passed: misbalancedAccounts.length === 0,
  });

  // ======================================================================
  // Edit 7: Required Account Presence (Warning)
  // Certain USSGL accounts must be present for a valid submission
  // ======================================================================
  const requiredAccounts = ['1010', '3100', '3101', '4801'];
  const presentAccounts = new Set(accounts.map(a => a.accountNumber.substring(0, 4)));
  const missingRequired = requiredAccounts.filter(ra => !presentAccounts.has(ra));
  edits.push({
    editCode: 'GTAS-008',
    severity: 'warning',
    description: 'Required USSGL accounts must be present in submission',
    affectedAccounts: missingRequired,
    passed: missingRequired.length === 0,
  });

  // ======================================================================
  // Edit 8: Zero Balance Submission (Informational)
  // ======================================================================
  const allZero = accounts.every(a => a.beginBalance === 0 && a.endBalance === 0);
  edits.push({
    editCode: 'GTAS-009',
    severity: 'informational',
    description: 'Submission contains non-zero balances',
    passed: !allZero,
  });

  // Summarize
  const fatalErrors = edits.filter(e => e.severity === 'fatal' && !e.passed).length;
  const warnings = edits.filter(e => e.severity === 'warning' && !e.passed).length;
  const informational = edits.filter(e => e.severity === 'informational' && !e.passed).length;

  return {
    valid: fatalErrors === 0,
    fatalErrors,
    warnings,
    informational,
    edits,
    validatedAt: new Date().toISOString(),
  };
}

/**
 * Validate SF-133 / SFR reconciliation.
 *
 * Per OMB Circular A-136 and TFM: The SF-133 (Budget Execution) must
 * reconcile with the Statement of Federal Financial Resources (SFR)
 * derived from USSGL balances. Key reconciliation points:
 *   - Total budgetary resources
 *   - Status of budgetary resources
 *   - Net outlays
 *
 * @param sf133 - The SF-133 report data
 * @param accounts - Source USSGL accounts
 * @returns Reconciliation result with differences
 */
export function validateSF133Reconciliation(
  sf133: SF133Data,
  accounts: USSGLAccount[],
): { reconciled: boolean; differences: Array<{ item: string; sf133Amount: number; ussglAmount: number; difference: number }> } {
  const differences: Array<{ item: string; sf133Amount: number; ussglAmount: number; difference: number }> = [];

  // Budgetary authority from USSGL 4010/4020 series
  const ussglAuthority = accounts
    .filter(a =>
      a.accountNumber.startsWith('4010') ||
      a.accountNumber.startsWith('4020') ||
      a.accountNumber.startsWith('4175'),
    )
    .reduce((sum, a) => sum + a.endBalance, 0);

  const sf133Authority = sf133.budgetaryResources.newBudgetAuthority;
  const authDiff = round2(Math.abs(ussglAuthority - sf133Authority));
  if (authDiff > 0.01) {
    differences.push({
      item: 'New Budget Authority',
      sf133Amount: sf133Authority,
      ussglAmount: round2(ussglAuthority),
      difference: authDiff,
    });
  }

  // Obligations from USSGL 4801/4802
  const ussglObligations = accounts
    .filter(a =>
      a.accountNumber.startsWith('4801') ||
      a.accountNumber.startsWith('4802'),
    )
    .reduce((sum, a) => sum + a.endBalance, 0);

  const sf133Obligations = sf133.statusOfBudgetaryResources.newObligationsAndUpwardAdjustments;
  const oblDiff = round2(Math.abs(ussglObligations - sf133Obligations));
  if (oblDiff > 0.01) {
    differences.push({
      item: 'Obligations Incurred',
      sf133Amount: sf133Obligations,
      ussglAmount: round2(ussglObligations),
      difference: oblDiff,
    });
  }

  // Outlays from USSGL 4902/4908/4910
  const ussglOutlays = accounts
    .filter(a =>
      a.accountNumber.startsWith('4902') ||
      a.accountNumber.startsWith('4908') ||
      a.accountNumber.startsWith('4910'),
    )
    .reduce((sum, a) => sum + a.endBalance, 0);

  const sf133Outlays = sf133.outlays.outlaysNet;
  const outDiff = round2(Math.abs(ussglOutlays - sf133Outlays));
  if (outDiff > 0.01) {
    differences.push({
      item: 'Net Outlays',
      sf133Amount: sf133Outlays,
      ussglAmount: round2(ussglOutlays),
      difference: outDiff,
    });
  }

  return {
    reconciled: differences.length === 0,
    differences,
  };
}

/**
 * Validate trial balance equality at the USSGL level.
 *
 * Per USSGL TFM Supplement: Within each accounting domain (budgetary
 * and proprietary), total debits must equal total credits.
 *
 * @param accounts - All USSGL accounts
 * @returns Validation result with balance details
 */
export function validateTrialBalanceEquality(
  accounts: USSGLAccount[],
): {
  balanced: boolean;
  budgetary: { debits: number; credits: number; difference: number };
  proprietary: { debits: number; credits: number; difference: number };
} {
  const budgetaryAccounts = accounts.filter(a => a.accountType === 'budgetary');
  const proprietaryAccounts = accounts.filter(a => a.accountType === 'proprietary');

  const budgetaryDebits = round2(
    budgetaryAccounts
      .filter(a => a.normalBalance === 'debit')
      .reduce((sum, a) => sum + a.endBalance, 0),
  );
  const budgetaryCredits = round2(
    budgetaryAccounts
      .filter(a => a.normalBalance === 'credit')
      .reduce((sum, a) => sum + a.endBalance, 0),
  );

  const proprietaryDebits = round2(
    proprietaryAccounts
      .filter(a => a.normalBalance === 'debit')
      .reduce((sum, a) => sum + a.endBalance, 0),
  );
  const proprietaryCredits = round2(
    proprietaryAccounts
      .filter(a => a.normalBalance === 'credit')
      .reduce((sum, a) => sum + a.endBalance, 0),
  );

  const budgetaryDiff = round2(Math.abs(budgetaryDebits - budgetaryCredits));
  const proprietaryDiff = round2(Math.abs(proprietaryDebits - proprietaryCredits));

  return {
    balanced: budgetaryDiff < 0.01 && proprietaryDiff < 0.01,
    budgetary: {
      debits: budgetaryDebits,
      credits: budgetaryCredits,
      difference: budgetaryDiff,
    },
    proprietary: {
      debits: proprietaryDebits,
      credits: proprietaryCredits,
      difference: proprietaryDiff,
    },
  };
}
