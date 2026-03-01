/**
 * Statement of Changes in Net Position Report Generator
 *
 * Generates the Statement of Changes in Net Position per OMB A-136
 * Section II.3. This statement shows changes in both unexpended
 * appropriations and cumulative results of operations.
 *
 * References:
 *   - OMB Circular A-136, Section II.3
 *   - SFFAS 7: Revenue and Other Financing Sources
 *   - DoD FMR Vol 6A, Ch 4
 */

import type { Appropriation, USSGLAccount } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NetPositionSection {
  beginningBalance: number;
  items: Array<{ description: string; amount: number }>;
  endingBalance: number;
}

export interface NetPositionReport {
  fiscalYear: number;
  agencyName: string;
  unexpendedAppropriations: {
    beginningBalance: number;
    appropriationsReceived: number;
    appropriationsTransferred: number;
    otherAdjustments: number;
    appropriationsUsed: number;
    endingBalance: number;
  };
  cumulativeResultsOfOperations: {
    beginningBalance: number;
    budgetaryFinancingSources: number;
    appropriationsUsed: number;
    nonExchangeRevenue: number;
    donationsAndForfeitures: number;
    transfersInOut: number;
    imputedFinancing: number;
    otherFinancingSources: number;
    totalFinancingSources: number;
    netCostOfOperations: number;
    netChange: number;
    endingBalance: number;
  };
  totalNetPosition: number;
  priorYearTotalNetPosition: number;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate Statement of Changes in Net Position.
 *
 * @param appropriations - Current year appropriation records
 * @param accounts - USSGL accounts for the period
 * @param fiscalYear - Reporting fiscal year
 * @param agencyName - Reporting entity name
 * @param netCostOfOperations - From Statement of Net Cost
 * @param priorYearNetPosition - Prior year total net position
 */
export function generateNetPositionReport(
  appropriations: Appropriation[],
  accounts: USSGLAccount[],
  fiscalYear: number,
  agencyName: string,
  netCostOfOperations: number,
  priorYearNetPosition: number = 0
): NetPositionReport {
  // Calculate unexpended appropriations from appropriation records
  const totalAuthority = appropriations.reduce((sum, a) => sum + a.totalAuthority, 0);
  const totalDisbursed = appropriations.reduce((sum, a) => sum + a.disbursed, 0);
  const totalObligated = appropriations.reduce((sum, a) => sum + a.obligated, 0);

  // USSGL account analysis for net position components
  // 3xxx = Net Position accounts
  const netPositionAccounts = accounts.filter(a => a.accountNumber.startsWith('3'));
  const beginBalanceUA = netPositionAccounts
    .filter(a => a.accountNumber.startsWith('31'))
    .reduce((sum, a) => sum + a.beginBalance, 0);
  const beginBalanceCRO = netPositionAccounts
    .filter(a => a.accountNumber.startsWith('33'))
    .reduce((sum, a) => sum + a.beginBalance, 0);

  // Appropriations used = amount drawn from unexpended to fund operations
  const appropriationsUsed = totalDisbursed;

  // Calculate financing sources from USSGL 57xx (financing sources)
  const financingAccounts = accounts.filter(a => a.accountNumber.startsWith('57'));
  const imputedFinancing = financingAccounts
    .filter(a => a.accountNumber.startsWith('578'))
    .reduce((sum, a) => sum + Math.abs(a.endBalance), 0);

  // Unexpended appropriations
  const uaBeginning = beginBalanceUA || (totalAuthority * 0.3);
  const uaAppnReceived = totalAuthority;
  const uaTransferred = 0;
  const uaOtherAdj = 0;
  const uaAppnUsed = -appropriationsUsed;
  const uaEnding = uaBeginning + uaAppnReceived + uaTransferred + uaOtherAdj + uaAppnUsed;

  // Cumulative results of operations
  const croBeginning = beginBalanceCRO || priorYearNetPosition - uaBeginning;
  const budgetaryFinancing = appropriationsUsed;
  const nonExchangeRev = 0;
  const donations = 0;
  const transfers = 0;
  const otherFinancing = 0;
  const totalFinancing = budgetaryFinancing + nonExchangeRev + donations + transfers + imputedFinancing + otherFinancing;
  const netChange = totalFinancing - netCostOfOperations;
  const croEnding = croBeginning + netChange;

  const totalNetPosition = uaEnding + croEnding;

  return {
    fiscalYear,
    agencyName,
    unexpendedAppropriations: {
      beginningBalance: round2(uaBeginning),
      appropriationsReceived: round2(uaAppnReceived),
      appropriationsTransferred: round2(uaTransferred),
      otherAdjustments: round2(uaOtherAdj),
      appropriationsUsed: round2(uaAppnUsed),
      endingBalance: round2(uaEnding),
    },
    cumulativeResultsOfOperations: {
      beginningBalance: round2(croBeginning),
      budgetaryFinancingSources: round2(budgetaryFinancing),
      appropriationsUsed: round2(appropriationsUsed),
      nonExchangeRevenue: round2(nonExchangeRev),
      donationsAndForfeitures: round2(donations),
      transfersInOut: round2(transfers),
      imputedFinancing: round2(imputedFinancing),
      otherFinancingSources: round2(otherFinancing),
      totalFinancingSources: round2(totalFinancing),
      netCostOfOperations: round2(netCostOfOperations),
      netChange: round2(netChange),
      endingBalance: round2(croEnding),
    },
    totalNetPosition: round2(totalNetPosition),
    priorYearTotalNetPosition: round2(priorYearNetPosition),
    generatedAt: new Date().toISOString(),
  };
}
