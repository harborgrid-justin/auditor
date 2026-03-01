/**
 * Military Pay Calculation Engine — DoD FMR Volume 7
 *
 * Implements pay table lookups, allowance calculations, combat zone exclusions,
 * TSP contributions with BRS matching, retired pay estimation, separation pay,
 * and total compensation roll-ups per DoD FMR Volume 7A (Military Pay Policy —
 * Active Duty and Reserve).
 *
 * All functions are pure: given the same inputs they produce the same outputs
 * with no side effects or external state dependencies beyond the parameter
 * registry.
 *
 * References:
 *   - DoD 7000.14-R, Volume 7A: Military Pay Policy — Active Duty and Reserve Pay
 *   - 37 U.S.C. Chapter 3: Basic Pay
 *   - 37 U.S.C. §402: Basic Allowance for Subsistence (BAS)
 *   - 37 U.S.C. §403: Basic Allowance for Housing (BAH)
 *   - 26 U.S.C. §112: Combat Zone Tax Exclusion (CZTE)
 *   - 5 U.S.C. §8432: Thrift Savings Plan
 *   - 10 U.S.C. §1401–1414: Retired Pay
 *   - 10 U.S.C. §1174: Separation Pay
 *   - 37 U.S.C. §354: Blended Retirement System (BRS)
 */

import { v4 as uuid } from 'uuid';
import { getParameter } from '@/lib/engine/tax-parameters/registry';

// ============================================================================
// Types
// ============================================================================

/** Valid military pay grade strings. */
export type MilitaryGrade =
  | 'E-1' | 'E-2' | 'E-3' | 'E-4' | 'E-5' | 'E-6' | 'E-7' | 'E-8' | 'E-9'
  | 'W-1' | 'W-2' | 'W-3' | 'W-4' | 'W-5'
  | 'O-1' | 'O-2' | 'O-3' | 'O-4' | 'O-5' | 'O-6' | 'O-7' | 'O-8' | 'O-9' | 'O-10';

/** A single entry from the pay table lookup. */
export interface PayTableEntry {
  id: string;
  grade: MilitaryGrade;
  yearsOfService: number;
  fiscalYear: number;
  monthlyBasePay: number;
  annualBasePay: number;
  tableSource: string;
}

/** BAH rate information. */
export interface BAHRate {
  id: string;
  zipCode: string;
  payGrade: MilitaryGrade;
  withDependents: boolean;
  fiscalYear: number;
  monthlyRate: number;
}

/** TSP contribution breakdown. */
export interface TSPCalculation {
  id: string;
  basicPay: number;
  memberContributionPct: number;
  memberContribution: number;
  agencyAutomatic: number;
  agencyMatchFirst3: number;
  agencyMatchNext2: number;
  totalAgencyContribution: number;
  totalMonthlyContribution: number;
  annualElectiveLimit: number;
  exceedsAnnualLimit: boolean;
  isBRS: boolean;
}

/** Retirement system designators. */
export type RetirementSystem = 'high_three' | 'brs' | 'final_pay';

/** Retired pay estimate. */
export interface RetiredPayEstimate {
  id: string;
  retirementSystem: RetirementSystem;
  highThreeAverage: number;
  yearsOfService: number;
  multiplierPct: number;
  monthlyRetiredPay: number;
  annualRetiredPay: number;
  authority: string;
}

/** Input for the comprehensive total compensation calculation. */
export interface MilitaryPayInput {
  grade: MilitaryGrade;
  yearsOfService: number;
  fiscalYear: number;
  zipCode: string;
  withDependents: boolean;
  tspContributionPct: number;
  isBRS: boolean;
  inCombatZone?: boolean;
  combatZoneMonth?: number;
  combatZoneYear?: number;
  additionalDeductions?: number;
}

/** Result of the comprehensive total compensation calculation. */
export interface MilitaryPayResult {
  id: string;
  grade: MilitaryGrade;
  yearsOfService: number;
  fiscalYear: number;
  basePay: PayTableEntry;
  bah: BAHRate;
  basMonthly: number;
  tsp: TSPCalculation;
  combatZoneExclusion: number | null;
  totalMonthlyGross: number;
  totalMonthlyDeductions: number;
  totalMonthlyNet: number;
  totalAnnualCompensation: number;
}

// ============================================================================
// Pay Table Data — FY2024
// ============================================================================

/**
 * Years-of-service breakpoints used in the embedded pay tables.
 * Per 37 U.S.C. Chapter 3, basic pay is determined by grade and cumulative
 * years of creditable service at these breakpoints.
 */
const YOS_BREAKPOINTS = [0, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40] as const;

/**
 * FY2024 monthly basic pay table.
 *
 * Each array maps to YOS_BREAKPOINTS indices. Contains representative amounts
 * for all grades E-1 through E-9, W-1 through W-5, and O-1 through O-10.
 *
 * Source: 37 U.S.C. Chapter 3; DoD FMR Vol 7A, Ch 1.
 * Full tables published annually by DFAS.
 */
const FY2024_BASE_PAY: Record<string, number[]> = {
  // --- Enlisted Grades ---
  'E-1': [1917, 1917, 1917, 1917, 1917, 1917, 1917, 1917, 1917, 1917, 1917, 1917, 1917, 1917, 1917, 1917, 1917, 1917, 1917, 1917, 1917, 1917],
  'E-2': [2150, 2150, 2150, 2150, 2150, 2150, 2150, 2150, 2150, 2150, 2150, 2150, 2150, 2150, 2150, 2150, 2150, 2150, 2150, 2150, 2150, 2150],
  'E-3': [2260, 2402, 2544, 2544, 2544, 2544, 2544, 2544, 2544, 2544, 2544, 2544, 2544, 2544, 2544, 2544, 2544, 2544, 2544, 2544, 2544, 2544],
  'E-4': [2503, 2634, 2776, 2893, 3012, 3012, 3012, 3012, 3012, 3012, 3012, 3012, 3012, 3012, 3012, 3012, 3012, 3012, 3012, 3012, 3012, 3012],
  'E-5': [2731, 2914, 3069, 3193, 3423, 3576, 3654, 3654, 3654, 3654, 3654, 3654, 3654, 3654, 3654, 3654, 3654, 3654, 3654, 3654, 3654, 3654],
  'E-6': [2981, 3280, 3428, 3576, 3730, 3953, 4076, 4203, 4279, 4354, 4404, 4404, 4404, 4404, 4404, 4404, 4404, 4404, 4404, 4404, 4404, 4404],
  'E-7': [3399, 3712, 3856, 4045, 4197, 4437, 4576, 4830, 5019, 5171, 5295, 5407, 5535, 5535, 5535, 5535, 5535, 5535, 5535, 5535, 5535, 5535],
  'E-8': [4886, 5060, 5208, 5356, 5508, 5770, 5932, 6094, 6241, 6398, 6398, 6398, 6398, 6398, 6398, 6398, 6398, 6398, 6398, 6398, 6398, 6398],
  'E-9': [5965, 6195, 6374, 6478, 6662, 6980, 7163, 7410, 7617, 7826, 8057, 8057, 8057, 8057, 8057, 8057, 8057, 8057, 8057, 8057, 8057, 8057],

  // --- Warrant Officer Grades ---
  'W-1': [3614, 3997, 4097, 4311, 4521, 4727, 4887, 5153, 5404, 5571, 5746, 5978, 6213, 6213, 6213, 6213, 6213, 6213, 6213, 6213, 6213, 6213],
  'W-2': [4137, 4525, 4646, 4793, 4996, 5264, 5493, 5699, 5882, 6031, 6184, 6356, 6504, 6682, 6682, 6682, 6682, 6682, 6682, 6682, 6682, 6682],
  'W-3': [4689, 4889, 5094, 5180, 5390, 5663, 5959, 6155, 6395, 6641, 6906, 7157, 7338, 7505, 7708, 7708, 7708, 7708, 7708, 7708, 7708, 7708],
  'W-4': [5132, 5427, 5581, 5735, 6004, 6272, 6540, 6810, 7077, 7347, 7614, 7884, 8098, 8321, 8534, 8748, 8748, 8748, 8748, 8748, 8748, 8748],
  'W-5': [7323, 7578, 7830, 7959, 8211, 8463, 8715, 8967, 9219, 9471, 9471, 9471, 9471, 9471, 9471, 9471, 9471, 9471, 9471, 9471, 9471, 9471],

  // --- Commissioned Officer Grades ---
  'O-1':  [3826, 3982, 4818, 4818, 4818, 5567, 5567, 5567, 5567, 5567, 5567, 5567, 5567, 5567, 5567, 5567, 5567, 5567, 5567, 5567, 5567, 5567],
  'O-2':  [4407, 5024, 5786, 5982, 6105, 6105, 6105, 6105, 6105, 6105, 6105, 6105, 6105, 6105, 6105, 6105, 6105, 6105, 6105, 6105, 6105, 6105],
  'O-3':  [5024, 5694, 6151, 6718, 7040, 7393, 7617, 7994, 8292, 8292, 8292, 8292, 8292, 8292, 8292, 8292, 8292, 8292, 8292, 8292, 8292, 8292],
  'O-4':  [5726, 6623, 7069, 7175, 7584, 8038, 8585, 9014, 9319, 9644, 9899, 9899, 9899, 9899, 9899, 9899, 9899, 9899, 9899, 9899, 9899, 9899],
  'O-5':  [6644, 7475, 7994, 8088, 8414, 8820, 9207, 9605, 10029, 10287, 10598, 10903, 11232, 11232, 11232, 11232, 11232, 11232, 11232, 11232, 11232, 11232],
  'O-6':  [7818, 8585, 9147, 9147, 9159, 9556, 9605, 9605, 10173, 10831, 11381, 11651, 12016, 12557, 13147, 13389, 13389, 13389, 13389, 13389, 13389, 13389],
  'O-7':  [10404, 10892, 11118, 11305, 11626, 11940, 12283, 12623, 12969, 14167, 14167, 14167, 14167, 14167, 14167, 14167, 14167, 14167, 14167, 14167, 14167, 14167],
  'O-8':  [12534, 12961, 13234, 13305, 13640, 14167, 14306, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819],
  'O-9':  [14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819],
  'O-10': [14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819, 14819],
};

/** The fiscal year the embedded table represents. */
const EMBEDDED_TABLE_FY = 2024;

/** Fallback annual military pay raise percentage when no parameter is registered. */
const DEFAULT_RAISE_PCT = 0.045;

// ============================================================================
// BAH Rate Data
// ============================================================================

/**
 * FY2024 BAH national average rates by pay grade.
 * Per 37 U.S.C. §403 and DoD FMR Vol 7A, Ch 26.
 *
 * Each entry maps to { with dependents, without dependents } monthly amounts.
 * Production systems would use the full DFAS BAH rate database by MHA (Military
 * Housing Area). This simplified structure applies a ZIP-prefix multiplier for
 * high-cost localities.
 */
const BAH_NATIONAL_AVERAGES: Record<string, { with: number; without: number }> = {
  'E-1': { with: 1134, without: 912 },
  'E-2': { with: 1188, without: 955 },
  'E-3': { with: 1256, without: 1011 },
  'E-4': { with: 1360, without: 1094 },
  'E-5': { with: 1480, without: 1192 },
  'E-6': { with: 1600, without: 1290 },
  'E-7': { with: 1738, without: 1402 },
  'E-8': { with: 1876, without: 1514 },
  'E-9': { with: 1996, without: 1614 },
  'W-1': { with: 1532, without: 1234 },
  'W-2': { with: 1652, without: 1334 },
  'W-3': { with: 1824, without: 1472 },
  'W-4': { with: 2054, without: 1656 },
  'W-5': { with: 2262, without: 1824 },
  'O-1': { with: 1532, without: 1234 },
  'O-2': { with: 1652, without: 1334 },
  'O-3': { with: 1824, without: 1472 },
  'O-4': { with: 2054, without: 1656 },
  'O-5': { with: 2262, without: 1824 },
  'O-6': { with: 2466, without: 1990 },
  'O-7': { with: 2696, without: 2176 },
  'O-8': { with: 2868, without: 2316 },
  'O-9': { with: 3040, without: 2454 },
  'O-10': { with: 3218, without: 2598 },
};

/**
 * ZIP prefix multipliers for high-cost areas.
 * Applied on top of national averages. Per DoD FMR Vol 7A, Ch 26.
 */
const ZIP_BAH_MULTIPLIERS: Record<string, number> = {
  '100': 1.45,  // New York City
  '101': 1.40,  // NYC metro
  '200': 1.35,  // Washington DC
  '201': 1.35,  // DC metro
  '220': 1.30,  // Northern Virginia
  '900': 1.40,  // Los Angeles
  '941': 1.50,  // San Francisco
  '981': 1.30,  // Seattle
  '968': 1.25,  // Honolulu
  '021': 1.30,  // Boston
  '606': 1.20,  // Chicago
  '802': 1.20,  // Denver
  '921': 1.35,  // San Diego
};

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Resolve the YOS breakpoint index for a given years-of-service value.
 * Returns the index of the highest breakpoint not exceeding the member's YOS.
 */
function resolveYOSIndex(yearsOfService: number): number {
  const clamped = Math.max(0, Math.min(yearsOfService, 40));
  let idx = 0;
  for (let i = YOS_BREAKPOINTS.length - 1; i >= 0; i--) {
    if (clamped >= YOS_BREAKPOINTS[i]) {
      idx = i;
      break;
    }
  }
  return idx;
}

/**
 * Normalize a pay grade string to the canonical form (e.g., "e5" -> "E-5").
 */
function normalizeGrade(grade: string): string {
  return grade.toUpperCase().trim().replace(/^([EOW])(\d+)$/i, '$1-$2');
}

/**
 * Determine if the given grade is an officer grade (O-prefix).
 */
function isOfficerGrade(grade: string): boolean {
  return grade.toUpperCase().trim().startsWith('O');
}

/**
 * Round a number to two decimal places (cents).
 */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

// ============================================================================
// lookupBasePay
// ============================================================================

/**
 * Look up monthly base pay for a given pay grade, years of service, and
 * fiscal year.
 *
 * Per 37 U.S.C. Chapter 3 and DoD FMR Vol 7A, Ch 1:
 * Basic pay is determined from the annual pay table published for the
 * applicable fiscal year. The table is indexed by pay grade (E-1 through E-9,
 * W-1 through W-5, O-1 through O-10) and cumulative years of creditable
 * service (0–40).
 *
 * When the requested fiscal year differs from the embedded table, the
 * DOD_MILPAY_RAISE_PCT parameter is used to project forward or backward.
 *
 * @param grade - Military pay grade (e.g., "E-5", "O-3", "W-2")
 * @param yearsOfService - Completed years of creditable service (0–40)
 * @param fiscalYear - Fiscal year for rate lookup
 * @returns PayTableEntry with monthly and annual pay amounts
 */
export function lookupBasePay(
  grade: MilitaryGrade,
  yearsOfService: number,
  fiscalYear: number,
): PayTableEntry {
  const normalGrade = normalizeGrade(grade);
  const yosIndex = resolveYOSIndex(yearsOfService);

  const row = FY2024_BASE_PAY[normalGrade];
  if (!row) {
    throw new Error(
      `Unknown pay grade: ${grade}. Expected E-1..E-9, W-1..W-5, or O-1..O-10. ` +
      `Ref: 37 U.S.C. Chapter 3.`,
    );
  }

  let monthlyPay = row[Math.min(yosIndex, row.length - 1)];

  // Adjust for fiscal year difference from the embedded table
  const yearDelta = fiscalYear - EMBEDDED_TABLE_FY;
  if (yearDelta > 0) {
    for (let i = 0; i < yearDelta; i++) {
      const fy = EMBEDDED_TABLE_FY + i + 1;
      const raisePct = getParameter('DOD_MILPAY_RAISE_PCT', fy, undefined, DEFAULT_RAISE_PCT);
      monthlyPay *= (1 + raisePct);
    }
  } else if (yearDelta < 0) {
    for (let i = 0; i < Math.abs(yearDelta); i++) {
      const fy = EMBEDDED_TABLE_FY - i;
      const raisePct = getParameter('DOD_MILPAY_RAISE_PCT', fy, undefined, DEFAULT_RAISE_PCT);
      monthlyPay /= (1 + raisePct);
    }
  }

  monthlyPay = roundCents(monthlyPay);
  const tableSource = yearDelta === 0
    ? `FY${EMBEDDED_TABLE_FY}_BASE_PAY`
    : `FY${EMBEDDED_TABLE_FY}_BASE_PAY (projected to FY${fiscalYear})`;

  return {
    id: uuid(),
    grade: normalGrade as MilitaryGrade,
    yearsOfService,
    fiscalYear,
    monthlyBasePay: monthlyPay,
    annualBasePay: roundCents(monthlyPay * 12),
    tableSource,
  };
}

// ============================================================================
// calculateBAH
// ============================================================================

/**
 * Calculate Basic Allowance for Housing (BAH).
 *
 * Per 37 U.S.C. §403 and DoD FMR Vol 7A, Ch 26:
 * BAH rates are determined by pay grade, dependency status, and duty station
 * ZIP code. This implementation uses national averages with ZIP-prefix
 * multipliers for high-cost areas.
 *
 * @param zipCode - 5-digit duty station ZIP code
 * @param payGrade - Military pay grade
 * @param dependencyStatus - Whether the member has dependents
 * @param fiscalYear - Fiscal year for rate lookup
 * @returns BAHRate with monthly rate
 */
export function calculateBAH(
  zipCode: string,
  payGrade: MilitaryGrade,
  dependencyStatus: boolean,
  fiscalYear: number,
): BAHRate {
  const normalGrade = normalizeGrade(payGrade);
  const gradeRates = BAH_NATIONAL_AVERAGES[normalGrade];
  if (!gradeRates) {
    throw new Error(
      `No BAH rates available for pay grade: ${payGrade}. ` +
      `Ref: 37 U.S.C. §403; DoD FMR Vol 7A, Ch 26.`,
    );
  }

  // Select base rate by dependency status
  let rate = dependencyStatus ? gradeRates.with : gradeRates.without;

  // Apply ZIP-based cost-of-living multiplier
  const zipPrefix = zipCode.substring(0, 3);
  const multiplier = ZIP_BAH_MULTIPLIERS[zipPrefix] ?? 1.0;
  rate *= multiplier;

  // Adjust for fiscal year difference (BAH typically rises ~5% annually)
  const yearDelta = fiscalYear - EMBEDDED_TABLE_FY;
  if (yearDelta !== 0) {
    rate *= Math.pow(1.05, yearDelta);
  }

  return {
    id: uuid(),
    zipCode,
    payGrade: normalGrade as MilitaryGrade,
    withDependents: dependencyStatus,
    fiscalYear,
    monthlyRate: roundCents(rate),
  };
}

// ============================================================================
// calculateBAS
// ============================================================================

/**
 * Calculate Basic Allowance for Subsistence (BAS).
 *
 * Per 37 U.S.C. §402 and DoD FMR Vol 7A, Ch 25:
 * BAS is a flat monthly rate that differs between enlisted members and
 * officers. Rates are adjusted annually based on the USDA food cost index.
 *
 * Uses DOD_BAS_ENLISTED and DOD_BAS_OFFICER parameters from the registry.
 *
 * @param isOfficer - true for officer (O-grade), false for enlisted/warrant
 * @param fiscalYear - Fiscal year for rate lookup
 * @returns Monthly BAS amount in dollars
 */
export function calculateBAS(
  isOfficer: boolean,
  fiscalYear: number,
): number {
  const paramCode = isOfficer ? 'DOD_BAS_OFFICER' : 'DOD_BAS_ENLISTED';
  const fallback = isOfficer ? 311.68 : 452.56;
  const monthlyRate = getParameter(paramCode, fiscalYear, undefined, fallback);

  return roundCents(monthlyRate);
}

// ============================================================================
// calculateCombatZoneExclusion
// ============================================================================

/**
 * Calculate Combat Zone Tax Exclusion (CZTE) amount.
 *
 * Per 26 U.S.C. §112 and DoD FMR Vol 7A, Ch 44:
 * - Enlisted members and warrant officers: ALL military compensation earned
 *   during qualifying combat zone service is excluded from gross income
 *   (unlimited exclusion).
 * - Commissioned officers: Exclusion is capped at the highest enlisted basic
 *   pay rate (E-9 at maximum YOS) plus the monthly hostile fire / imminent
 *   danger pay ($225/month per 37 U.S.C. §310).
 *
 * Any month in which the member serves even one day in a designated combat
 * zone qualifies the entire month's pay for exclusion.
 *
 * @param monthlyPay - Total monthly military pay subject to exclusion
 * @param grade - Service member's pay grade
 * @param month - Calendar month of combat zone service (1–12)
 * @param year - Calendar year of combat zone service
 * @returns Dollar amount of monthly income excludable from federal tax
 */
export function calculateCombatZoneExclusion(
  monthlyPay: number,
  grade: MilitaryGrade,
  month: number,
  year: number,
): number {
  const normalGrade = normalizeGrade(grade);
  const isOfficer = isOfficerGrade(normalGrade);

  if (!isOfficer) {
    // Per 26 U.S.C. §112(a): Enlisted and warrant officers — unlimited exclusion
    return roundCents(monthlyPay);
  }

  // Officers: cap = E-9 at max YOS + hostile fire pay ($225)
  // Per 26 U.S.C. §112(b); 37 U.S.C. §310
  const e9Row = FY2024_BASE_PAY['E-9'];
  let e9MaxPay = e9Row[e9Row.length - 1];

  // Adjust for year difference from embedded table
  const yearDelta = year - EMBEDDED_TABLE_FY;
  if (yearDelta > 0) {
    for (let i = 0; i < yearDelta; i++) {
      const fy = EMBEDDED_TABLE_FY + i + 1;
      const raisePct = getParameter('DOD_MILPAY_RAISE_PCT', fy, undefined, DEFAULT_RAISE_PCT);
      e9MaxPay *= (1 + raisePct);
    }
  }

  const hostileFirePay = 225;
  const officerCap = roundCents(e9MaxPay + hostileFirePay);

  return roundCents(Math.min(monthlyPay, officerCap));
}

// ============================================================================
// calculateTSPContribution
// ============================================================================

/**
 * Calculate Thrift Savings Plan (TSP) contribution and agency matching.
 *
 * Per 5 U.S.C. §8432 (as applied to military via the Blended Retirement
 * System, 37 U.S.C. §354) and DoD FMR Vol 7A, Ch 51:
 *
 * BRS matching (members who entered service on or after 1 Jan 2018, or
 * who opted in):
 *   - Agency automatic 1% contribution (regardless of member contribution).
 *   - Dollar-for-dollar match on the first 3% of basic pay contributed.
 *   - 50-cents-per-dollar match on the next 2% of basic pay contributed.
 *   - Maximum government match: 5% of basic pay (1% auto + 3% + 0.5×2%).
 *
 * Legacy (High-3) members receive no agency matching; only the member's
 * own elective deferral applies.
 *
 * @param basicPay - Monthly basic pay amount
 * @param contributionPct - Member's contribution as decimal (e.g., 0.05 = 5%)
 * @param isBRS - Whether the member is under the Blended Retirement System
 * @param yearsOfService - Years of service (BRS matching begins after 60 days)
 * @returns TSPCalculation with full breakdown
 */
export function calculateTSPContribution(
  basicPay: number,
  contributionPct: number,
  isBRS: boolean,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  yearsOfService: number,
): TSPCalculation {
  const annualLimit = getParameter('DOD_TSP_ELECTIVE_LIMIT', EMBEDDED_TABLE_FY, undefined, 23000);

  // Clamp contribution percentage between 0 and 100%
  const effectivePct = Math.min(Math.max(contributionPct, 0), 1.0);
  const memberContribution = roundCents(basicPay * effectivePct);

  let agencyAutomatic = 0;
  let agencyMatchFirst3 = 0;
  let agencyMatchNext2 = 0;

  if (isBRS) {
    // Agency automatic 1% (per DoD FMR Vol 7A, Ch 51)
    agencyAutomatic = roundCents(basicPay * 0.01);

    // Dollar-for-dollar match on first 3%
    const first3Pct = Math.min(effectivePct, 0.03);
    agencyMatchFirst3 = roundCents(basicPay * first3Pct);

    // 50-cent match on next 2%
    const next2Pct = Math.max(0, Math.min(effectivePct - 0.03, 0.02));
    agencyMatchNext2 = roundCents(basicPay * next2Pct * 0.50);
  }

  const totalAgencyContribution = roundCents(agencyAutomatic + agencyMatchFirst3 + agencyMatchNext2);
  const totalMonthlyContribution = roundCents(memberContribution + totalAgencyContribution);

  // Check annual elective deferral limit (member contributions only)
  const annualMemberContribution = memberContribution * 12;
  const exceedsAnnualLimit = annualMemberContribution > annualLimit;

  return {
    id: uuid(),
    basicPay,
    memberContributionPct: effectivePct,
    memberContribution,
    agencyAutomatic,
    agencyMatchFirst3,
    agencyMatchNext2,
    totalAgencyContribution,
    totalMonthlyContribution,
    annualElectiveLimit: annualLimit,
    exceedsAnnualLimit,
    isBRS,
  };
}

// ============================================================================
// calculateRetiredPay
// ============================================================================

/**
 * Estimate retired pay under High-3 or Blended Retirement System (BRS).
 *
 * Per 10 U.S.C. §1401–1414 and DoD FMR Vol 7A, Ch 53:
 *
 * **High-3 (members who entered before 1 Jan 2018 and did not opt into BRS):**
 *   multiplier = 2.5% × years of service
 *   monthly retired pay = high-three average × multiplier
 *
 * **BRS (members who entered on/after 1 Jan 2018 or opted in):**
 *   multiplier = 2.0% × years of service
 *   monthly retired pay = high-three average × multiplier
 *   (Plus a one-time continuation pay at 8–12 YOS and TSP matching,
 *   neither of which is modeled in this estimator.)
 *
 * **Final Pay (pre-8 Sep 1980 entry; rarely seen today):**
 *   multiplier = 2.5% × years of service
 *   monthly retired pay = final basic pay × multiplier (not high-three)
 *
 * @param highThreeAvg - Average of highest 36 months of basic pay
 * @param yearsOfService - Years of creditable service at retirement
 * @param retirementSystem - Which retirement system applies
 * @returns RetiredPayEstimate with monthly and annual amounts
 */
export function calculateRetiredPay(
  highThreeAvg: number,
  yearsOfService: number,
  retirementSystem: RetirementSystem,
): RetiredPayEstimate {
  let multiplierPct: number;
  let authority: string;

  switch (retirementSystem) {
    case 'high_three':
      // 2.5% per year of service; capped at 75% (30 years)
      multiplierPct = Math.min(yearsOfService * 2.5, 75);
      authority = '10 U.S.C. §1409; DoD FMR Vol 7A, Ch 53 (High-3)';
      break;

    case 'brs':
      // 2.0% per year of service; capped at 60% (30 years)
      multiplierPct = Math.min(yearsOfService * 2.0, 60);
      authority = '37 U.S.C. §354; 10 U.S.C. §1409; DoD FMR Vol 7A, Ch 53 (BRS)';
      break;

    case 'final_pay':
      // 2.5% per year of service; uses final basic pay (not high-three)
      multiplierPct = Math.min(yearsOfService * 2.5, 75);
      authority = '10 U.S.C. §1401 (Final Pay — pre-8 Sep 1980 entry)';
      break;

    default: {
      const _exhaustive: never = retirementSystem;
      throw new Error(`Unknown retirement system: ${_exhaustive}`);
    }
  }

  const monthlyRetired = roundCents(highThreeAvg * (multiplierPct / 100));

  return {
    id: uuid(),
    retirementSystem,
    highThreeAverage: highThreeAvg,
    yearsOfService,
    multiplierPct,
    monthlyRetiredPay: monthlyRetired,
    annualRetiredPay: roundCents(monthlyRetired * 12),
    authority,
  };
}

// ============================================================================
// calculateSeparationPay
// ============================================================================

/**
 * Calculate involuntary or voluntary separation pay.
 *
 * Per 10 U.S.C. §1174 and DoD FMR Vol 7A, Ch 35:
 *
 * **Involuntary separation pay (full):**
 *   amount = monthly basic pay × 12 × years of service × 10%
 *   (Minimum 6 YOS required for eligibility.)
 *
 * **Voluntary separation pay (half):**
 *   amount = involuntary amount × 50%
 *   (Available in limited circumstances per service policies.)
 *
 * Separation pay is a one-time lump sum. It is subject to federal income
 * tax and must be repaid if the member later qualifies for retired pay
 * (recoupment per 10 U.S.C. §1174(h)).
 *
 * @param basicPay - Monthly basic pay at time of separation
 * @param yearsOfService - Completed years of active service
 * @param isInvoluntary - true for full separation pay, false for half
 * @returns Lump-sum separation pay amount
 */
export function calculateSeparationPay(
  basicPay: number,
  yearsOfService: number,
  isInvoluntary: boolean,
): number {
  // Per 10 U.S.C. §1174(d): minimum 6 years of service required
  if (yearsOfService < 6) {
    return 0;
  }

  // Full separation pay = basic pay × 12 × YOS × 10%
  const fullAmount = roundCents(basicPay * 12 * yearsOfService * 0.10);

  // Voluntary separation pay is 50% of the full amount
  return isInvoluntary ? fullAmount : roundCents(fullAmount * 0.50);
}

// ============================================================================
// calculateTotalCompensation
// ============================================================================

/**
 * Calculate comprehensive total military compensation by rolling up all
 * pay components.
 *
 * Per DoD FMR Vol 7A, total military compensation includes:
 *   - Basic pay (37 U.S.C. Chapter 3)
 *   - Basic Allowance for Housing (37 U.S.C. §403)
 *   - Basic Allowance for Subsistence (37 U.S.C. §402)
 *   - TSP agency matching contributions (5 U.S.C. §8432)
 * Less:
 *   - Member TSP contributions
 *   - Additional deductions (SGLI, TRICARE dental, etc.)
 *
 * Optionally computes the combat zone tax exclusion amount if the member
 * is serving in a designated combat zone.
 *
 * @param input - MilitaryPayInput with all compensation parameters
 * @returns MilitaryPayResult with complete breakdown
 */
export function calculateTotalCompensation(
  input: MilitaryPayInput,
): MilitaryPayResult {
  // 1. Basic Pay
  const basePay = lookupBasePay(input.grade, input.yearsOfService, input.fiscalYear);

  // 2. BAH
  const bah = calculateBAH(
    input.zipCode,
    input.grade,
    input.withDependents,
    input.fiscalYear,
  );

  // 3. BAS
  const isOfficer = isOfficerGrade(input.grade);
  const basMonthly = calculateBAS(isOfficer, input.fiscalYear);

  // 4. TSP
  const tsp = calculateTSPContribution(
    basePay.monthlyBasePay,
    input.tspContributionPct,
    input.isBRS,
    input.yearsOfService,
  );

  // 5. Combat Zone Tax Exclusion (informational — does not change gross pay)
  let combatZoneExclusion: number | null = null;
  if (input.inCombatZone) {
    const totalMonthlyIncome = basePay.monthlyBasePay + bah.monthlyRate + basMonthly;
    combatZoneExclusion = calculateCombatZoneExclusion(
      totalMonthlyIncome,
      input.grade,
      input.combatZoneMonth ?? 1,
      input.combatZoneYear ?? input.fiscalYear,
    );
  }

  // 6. Roll up
  const totalMonthlyGross = roundCents(
    basePay.monthlyBasePay +
    bah.monthlyRate +
    basMonthly +
    tsp.totalAgencyContribution,
  );

  const totalMonthlyDeductions = roundCents(
    tsp.memberContribution + (input.additionalDeductions ?? 0),
  );

  const totalMonthlyNet = roundCents(totalMonthlyGross - totalMonthlyDeductions);

  return {
    id: uuid(),
    grade: input.grade,
    yearsOfService: input.yearsOfService,
    fiscalYear: input.fiscalYear,
    basePay,
    bah,
    basMonthly,
    tsp,
    combatZoneExclusion,
    totalMonthlyGross,
    totalMonthlyDeductions,
    totalMonthlyNet,
    totalAnnualCompensation: roundCents(totalMonthlyNet * 12),
  };
}
