/**
 * Statement of Net Cost Report Generator
 *
 * Generates the Statement of Net Cost per OMB A-136 Section II.2.
 * This principal financial statement presents the net cost of operations
 * by major program, showing gross costs less earned revenue.
 *
 * References:
 *   - OMB Circular A-136, Section II.2
 *   - SFFAS 4: Managerial Cost Accounting
 *   - SFFAS 7: Revenue and Other Financing Sources
 *   - DoD FMR Vol 6A, Ch 4
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { USSGLAccount, USSGLTransaction } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NetCostProgram {
  programName: string;
  grossCostIntragovernmental: number;
  grossCostPublic: number;
  totalGrossCost: number;
  earnedRevenueIntragovernmental: number;
  earnedRevenuePublic: number;
  totalEarnedRevenue: number;
  netCostOfOperations: number;
}

export interface NetCostReport {
  fiscalYear: number;
  agencyName: string;
  programs: NetCostProgram[];
  totalIntragovernmentalGrossCost: number;
  totalPublicGrossCost: number;
  totalGrossCost: number;
  totalIntragovernmentalRevenue: number;
  totalPublicRevenue: number;
  totalEarnedRevenue: number;
  netCostOfOperations: number;
  priorYearNetCost: number;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Categorize USSGL accounts into cost/revenue and intra/public.
 * USSGL 6xxx = expenses/costs, 5xxx = revenue
 * Intragovernmental accounts end in specific ranges per USSGL guidance.
 */
function isExpenseAccount(accountNumber: string): boolean {
  return accountNumber.startsWith('6');
}

function isRevenueAccount(accountNumber: string): boolean {
  return accountNumber.startsWith('5');
}

function isIntragovernmental(accountNumber: string): boolean {
  // Intragovernmental accounts are in specific USSGL ranges
  // 6100-6199 and 5100-5199 are typically intragovernmental
  const num = parseInt(accountNumber.substring(0, 4), 10);
  return (num >= 6100 && num <= 6199) || (num >= 5100 && num <= 5199);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate Statement of Net Cost from USSGL account data.
 *
 * @param accounts - USSGL accounts for the reporting period
 * @param fiscalYear - Reporting fiscal year
 * @param agencyName - Name of the reporting entity
 * @param programMapping - Map of account prefixes to program names
 * @param priorYearNetCost - Prior year net cost for comparative display
 */
export function generateNetCostReport(
  accounts: USSGLAccount[],
  fiscalYear: number,
  agencyName: string,
  programMapping?: Map<string, string>,
  priorYearNetCost: number = 0
): NetCostReport {
  // Default program mapping by budget category prefix
  const defaultPrograms = new Map<string, string>([
    ['61', 'Military Personnel'],
    ['62', 'Operation and Maintenance'],
    ['63', 'Procurement'],
    ['64', 'Research, Development, Test & Evaluation'],
    ['65', 'Military Construction'],
    ['66', 'Family Housing'],
    ['67', 'Revolving and Management Funds'],
    ['68', 'Other Defense Activities'],
  ]);
  const mapping = programMapping ?? defaultPrograms;

  // Group accounts by program
  const programMap = new Map<string, { costs: USSGLAccount[]; revenues: USSGLAccount[] }>();

  for (const acct of accounts) {
    if (!isExpenseAccount(acct.accountNumber) && !isRevenueAccount(acct.accountNumber)) continue;

    const prefix = acct.accountNumber.substring(0, 2);
    let programName = mapping.get(prefix) ?? 'Other Programs';
    // Revenue accounts map to programs via matching cost accounts
    if (isRevenueAccount(acct.accountNumber)) {
      const revPrefix = acct.accountNumber.substring(0, 2);
      programName = mapping.get(revPrefix) ?? 'Other Programs';
    }

    if (!programMap.has(programName)) {
      programMap.set(programName, { costs: [], revenues: [] });
    }

    if (isExpenseAccount(acct.accountNumber)) {
      programMap.get(programName)!.costs.push(acct);
    } else {
      programMap.get(programName)!.revenues.push(acct);
    }
  }

  const programs: NetCostProgram[] = [];

  const programEntries = Array.from(programMap.entries());
  for (const [name, data] of programEntries) {
    const grossCostIntra = data.costs.filter((a: USSGLAccount) => isIntragovernmental(a.accountNumber)).reduce((sum: number, a: USSGLAccount) => sum + Math.abs(a.endBalance), 0);
    const grossCostPublic = data.costs.filter((a: USSGLAccount) => !isIntragovernmental(a.accountNumber)).reduce((sum: number, a: USSGLAccount) => sum + Math.abs(a.endBalance), 0);
    const revIntra = data.revenues.filter((a: USSGLAccount) => isIntragovernmental(a.accountNumber)).reduce((sum: number, a: USSGLAccount) => sum + Math.abs(a.endBalance), 0);
    const revPublic = data.revenues.filter((a: USSGLAccount) => !isIntragovernmental(a.accountNumber)).reduce((sum: number, a: USSGLAccount) => sum + Math.abs(a.endBalance), 0);

    programs.push({
      programName: name,
      grossCostIntragovernmental: round2(grossCostIntra),
      grossCostPublic: round2(grossCostPublic),
      totalGrossCost: round2(grossCostIntra + grossCostPublic),
      earnedRevenueIntragovernmental: round2(revIntra),
      earnedRevenuePublic: round2(revPublic),
      totalEarnedRevenue: round2(revIntra + revPublic),
      netCostOfOperations: round2((grossCostIntra + grossCostPublic) - (revIntra + revPublic)),
    });
  }

  const totalIntraGross = programs.reduce((sum, p) => sum + p.grossCostIntragovernmental, 0);
  const totalPublicGross = programs.reduce((sum, p) => sum + p.grossCostPublic, 0);
  const totalIntraRev = programs.reduce((sum, p) => sum + p.earnedRevenueIntragovernmental, 0);
  const totalPublicRev = programs.reduce((sum, p) => sum + p.earnedRevenuePublic, 0);

  return {
    fiscalYear,
    agencyName,
    programs,
    totalIntragovernmentalGrossCost: round2(totalIntraGross),
    totalPublicGrossCost: round2(totalPublicGross),
    totalGrossCost: round2(totalIntraGross + totalPublicGross),
    totalIntragovernmentalRevenue: round2(totalIntraRev),
    totalPublicRevenue: round2(totalPublicRev),
    totalEarnedRevenue: round2(totalIntraRev + totalPublicRev),
    netCostOfOperations: round2((totalIntraGross + totalPublicGross) - (totalIntraRev + totalPublicRev)),
    priorYearNetCost: round2(priorYearNetCost),
    generatedAt: new Date().toISOString(),
  };
}
