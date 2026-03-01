/**
 * Statement of Net Cost Generator
 *
 * Generates the Statement of Net Cost per OMB Circular A-136, Section II.2.
 * This principal financial statement presents the net cost of operations
 * by major program or responsibility segment, showing gross costs less
 * earned revenue for each. Federal entities must separate intragovernmental
 * costs (transactions with other federal entities) from public costs
 * (transactions with non-federal entities).
 *
 * USSGL Account Series:
 *   5000-5999: Revenue and Financing Sources
 *   6000-6999: Expenses and Losses
 *
 * For DoD, major programs align with budget categories:
 *   - Military Personnel
 *   - Operation and Maintenance
 *   - Procurement
 *   - Research, Development, Test & Evaluation
 *   - Military Construction
 *   - Family Housing
 *   - Revolving and Management Funds
 *
 * References:
 *   - OMB Circular A-136, Section II.2 (Statement of Net Cost)
 *   - SFFAS 4: Managerial Cost Accounting Standards
 *   - SFFAS 7: Accounting for Revenue and Other Financing Sources
 *   - FASAB Interpretation 6: Accounting for Imputed Intragovernmental Costs
 *   - DoD FMR 7000.14-R, Vol. 6A, Ch. 4: Financial Statements
 *   - DoD FMR 7000.14-R, Vol. 4, Ch. 13: Cost Accounting
 */

import type {
  USSGLAccount,
  DoDEngagementData,
  DoDComponentCode,
} from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROUNDING_PRECISION = 2;

/**
 * Default DoD program mapping for the Statement of Net Cost.
 * Maps USSGL account sub-ranges to major program/responsibility segments.
 * Per DoD FMR Vol. 6A, Ch. 4, Table 4-1.
 */
const DOD_PROGRAM_MAP: ReadonlyArray<{
  expensePrefix: string;
  revenuePrefix: string;
  programName: string;
}> = [
  { expensePrefix: '610', revenuePrefix: '510', programName: 'Military Personnel' },
  { expensePrefix: '611', revenuePrefix: '511', programName: 'Military Personnel' },
  { expensePrefix: '620', revenuePrefix: '520', programName: 'Operation and Maintenance' },
  { expensePrefix: '621', revenuePrefix: '521', programName: 'Operation and Maintenance' },
  { expensePrefix: '622', revenuePrefix: '522', programName: 'Operation and Maintenance' },
  { expensePrefix: '630', revenuePrefix: '530', programName: 'Procurement' },
  { expensePrefix: '631', revenuePrefix: '531', programName: 'Procurement' },
  { expensePrefix: '640', revenuePrefix: '540', programName: 'Research, Development, Test and Evaluation' },
  { expensePrefix: '641', revenuePrefix: '541', programName: 'Research, Development, Test and Evaluation' },
  { expensePrefix: '650', revenuePrefix: '550', programName: 'Military Construction' },
  { expensePrefix: '651', revenuePrefix: '551', programName: 'Military Construction' },
  { expensePrefix: '660', revenuePrefix: '560', programName: 'Family Housing' },
  { expensePrefix: '661', revenuePrefix: '561', programName: 'Family Housing' },
  { expensePrefix: '670', revenuePrefix: '570', programName: 'Revolving and Management Funds' },
  { expensePrefix: '680', revenuePrefix: '580', programName: 'Other Defense Activities' },
  { expensePrefix: '690', revenuePrefix: '590', programName: 'Other Defense Activities' },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Cost and revenue detail for a single program/responsibility segment. */
export interface ProgramCostDetail {
  id: string;
  programName: string;
  grossCost: {
    intragovernmental: number;
    public: number;
    total: number;
  };
  earnedRevenue: {
    intragovernmental: number;
    public: number;
    total: number;
  };
  netCostOfOperations: number;
}

/**
 * Complete Statement of Net Cost.
 * Per OMB A-136, Section II.2.
 */
export interface NetCostStatementReport {
  id: string;
  fiscalYear: number;
  dodComponent: string;
  reportingPeriodEnd: string;
  programs: ProgramCostDetail[];
  consolidated: {
    totalIntragovernmentalGrossCost: number;
    totalPublicGrossCost: number;
    totalGrossCost: number;
    totalIntragovernmentalEarnedRevenue: number;
    totalPublicEarnedRevenue: number;
    totalEarnedRevenue: number;
    netCostOfOperations: number;
  };
  costNotAssignedToPrograms: number;
  earnedRevenueNotAssignedToPrograms: number;
  lessInterGovernmentalCostsEliminated: number;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * (10 ** ROUNDING_PRECISION)) / (10 ** ROUNDING_PRECISION);
}

/**
 * Determines whether a USSGL account is an expense account (6xxx series).
 * Per USSGL TFM Supplement, 6000-6999 are expenses and losses.
 */
function isExpenseAccount(accountNumber: string): boolean {
  const num = parseInt(accountNumber.charAt(0), 10);
  return num === 6;
}

/**
 * Determines whether a USSGL account is a revenue account (5xxx series).
 * Per USSGL TFM Supplement, 5000-5999 are revenue and financing sources.
 */
function isRevenueAccount(accountNumber: string): boolean {
  const num = parseInt(accountNumber.charAt(0), 10);
  return num === 5;
}

/**
 * Classifies an account as intragovernmental or public based on
 * USSGL sub-ranges. Intragovernmental accounts typically fall in
 * the lower sub-range of each century (e.g., 6100-6199 for intra
 * expenses vs. 6200-6299 for public expenses).
 *
 * @see USSGL TFM Supplement, Section III (Account Attributes)
 */
function isIntragovernmentalCostRevenue(accountNumber: string): boolean {
  const subRange = parseInt(accountNumber.substring(1, 3), 10);
  // Intra accounts are typically in the x1xx pattern (e.g., 6100-6199, 5100-5199)
  return subRange >= 10 && subRange <= 19;
}

/**
 * Sum ending balances for accounts matching prefixes, taking absolute
 * values since expense accounts carry debit balances.
 */
function sumAbsoluteEnd(accounts: USSGLAccount[], prefixes: string[]): number {
  return accounts
    .filter(a => prefixes.some(p => a.accountNumber.startsWith(p)))
    .reduce((sum, a) => sum + Math.abs(a.endBalance), 0);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates the Statement of Net Cost from DoD engagement data.
 *
 * This function produces a complete Statement of Net Cost per
 * OMB A-136, Section II.2, with the following structure:
 *
 *   For each major program:
 *     Gross Costs (intragovernmental + public)
 *     Less: Earned Revenue (intragovernmental + public)
 *     = Net Cost of Operations
 *
 *   Consolidated totals across all programs
 *
 * Costs are sourced from USSGL 6000-6999 series accounts, and revenues
 * from USSGL 5000-5999 series. Intragovernmental vs. public separation
 * is determined by USSGL sub-ranges.
 *
 * For DoD, programs align with DoD FMR Vol. 6A, Ch. 4, Table 4-1 major
 * program categories. The function also identifies costs and revenues
 * that cannot be assigned to a specific program.
 *
 * @param data - Complete DoD engagement dataset
 * @returns NetCostStatementReport with program-level detail and consolidated totals
 *
 * @see OMB A-136, Section II.2
 * @see SFFAS 4 (Managerial Cost Accounting)
 * @see SFFAS 7 (Revenue and Financing Sources)
 */
export function generateNetCostStatement(data: DoDEngagementData): NetCostStatementReport {
  const { ussglAccounts } = data;
  const fiscalYear = data.fiscalYear;

  const proprietaryAccounts = ussglAccounts.filter(a => a.accountType === 'proprietary');
  const expenseAccounts = proprietaryAccounts.filter(a => isExpenseAccount(a.accountNumber));
  const revenueAccounts = proprietaryAccounts.filter(a => isRevenueAccount(a.accountNumber));

  // -------------------------------------------------------------------------
  // Build program-level detail
  // -------------------------------------------------------------------------
  const programAccumulator = new Map<string, {
    grossCostIntra: number;
    grossCostPublic: number;
    revIntra: number;
    revPublic: number;
  }>();

  const assignedExpenseIds = new Set<string>();
  const assignedRevenueIds = new Set<string>();

  for (const mapping of DOD_PROGRAM_MAP) {
    if (!programAccumulator.has(mapping.programName)) {
      programAccumulator.set(mapping.programName, {
        grossCostIntra: 0,
        grossCostPublic: 0,
        revIntra: 0,
        revPublic: 0,
      });
    }

    const prog = programAccumulator.get(mapping.programName)!;

    // Assign expense accounts
    for (const acct of expenseAccounts) {
      if (acct.accountNumber.startsWith(mapping.expensePrefix)) {
        assignedExpenseIds.add(acct.id);
        if (isIntragovernmentalCostRevenue(acct.accountNumber)) {
          prog.grossCostIntra += Math.abs(acct.endBalance);
        } else {
          prog.grossCostPublic += Math.abs(acct.endBalance);
        }
      }
    }

    // Assign revenue accounts
    for (const acct of revenueAccounts) {
      if (acct.accountNumber.startsWith(mapping.revenuePrefix)) {
        assignedRevenueIds.add(acct.id);
        if (isIntragovernmentalCostRevenue(acct.accountNumber)) {
          prog.revIntra += Math.abs(acct.endBalance);
        } else {
          prog.revPublic += Math.abs(acct.endBalance);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Build program detail array
  // -------------------------------------------------------------------------
  const programs: ProgramCostDetail[] = [];

  for (const [name, data] of programAccumulator.entries()) {
    const totalGrossCost = data.grossCostIntra + data.grossCostPublic;
    const totalRevenue = data.revIntra + data.revPublic;

    // Only include programs with activity
    if (totalGrossCost > 0 || totalRevenue > 0) {
      programs.push({
        id: uuid(),
        programName: name,
        grossCost: {
          intragovernmental: round2(data.grossCostIntra),
          public: round2(data.grossCostPublic),
          total: round2(totalGrossCost),
        },
        earnedRevenue: {
          intragovernmental: round2(data.revIntra),
          public: round2(data.revPublic),
          total: round2(totalRevenue),
        },
        netCostOfOperations: round2(totalGrossCost - totalRevenue),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Unassigned costs and revenues
  // -------------------------------------------------------------------------
  const unassignedExpenses = expenseAccounts
    .filter(a => !assignedExpenseIds.has(a.id))
    .reduce((s, a) => s + Math.abs(a.endBalance), 0);

  const unassignedRevenue = revenueAccounts
    .filter(a => !assignedRevenueIds.has(a.id))
    .reduce((s, a) => s + Math.abs(a.endBalance), 0);

  // If there are unassigned costs, add them as a catch-all program
  if (unassignedExpenses > 0 || unassignedRevenue > 0) {
    programs.push({
      id: uuid(),
      programName: 'Costs Not Assigned to Programs',
      grossCost: {
        intragovernmental: 0,
        public: round2(unassignedExpenses),
        total: round2(unassignedExpenses),
      },
      earnedRevenue: {
        intragovernmental: 0,
        public: round2(unassignedRevenue),
        total: round2(unassignedRevenue),
      },
      netCostOfOperations: round2(unassignedExpenses - unassignedRevenue),
    });
  }

  // -------------------------------------------------------------------------
  // Consolidation eliminations for intragovernmental transactions
  // -------------------------------------------------------------------------
  const eliminations = (data.consolidationEliminations ?? [])
    .reduce((s, e) => s + e.eliminationAmount, 0);

  // -------------------------------------------------------------------------
  // Consolidated totals
  // -------------------------------------------------------------------------
  const totalIntraGross = programs.reduce((s, p) => s + p.grossCost.intragovernmental, 0);
  const totalPublicGross = programs.reduce((s, p) => s + p.grossCost.public, 0);
  const totalGrossCost = totalIntraGross + totalPublicGross;
  const totalIntraRev = programs.reduce((s, p) => s + p.earnedRevenue.intragovernmental, 0);
  const totalPublicRev = programs.reduce((s, p) => s + p.earnedRevenue.public, 0);
  const totalEarnedRevenue = totalIntraRev + totalPublicRev;
  const netCostOfOperations = totalGrossCost - totalEarnedRevenue;

  return {
    id: uuid(),
    fiscalYear,
    dodComponent: data.dodComponent,
    reportingPeriodEnd: `${fiscalYear}-09-30`,
    programs,
    consolidated: {
      totalIntragovernmentalGrossCost: round2(totalIntraGross),
      totalPublicGrossCost: round2(totalPublicGross),
      totalGrossCost: round2(totalGrossCost),
      totalIntragovernmentalEarnedRevenue: round2(totalIntraRev),
      totalPublicEarnedRevenue: round2(totalPublicRev),
      totalEarnedRevenue: round2(totalEarnedRevenue),
      netCostOfOperations: round2(netCostOfOperations),
    },
    costNotAssignedToPrograms: round2(unassignedExpenses),
    earnedRevenueNotAssignedToPrograms: round2(unassignedRevenue),
    lessInterGovernmentalCostsEliminated: round2(eliminations),
    generatedAt: new Date().toISOString(),
  };
}
