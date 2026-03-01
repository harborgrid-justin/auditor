/**
 * Military Pay Computation Engine
 *
 * Implements DoD FMR Volume 7A (Military Pay Policy — Active Duty and Reserve)
 * computations for basic pay, allowances, combat zone exclusions, TSP matching,
 * and pay entitlement validation.
 *
 * References:
 *   - DoD 7000.14-R, Volume 7A: Military Pay Policy — Active Duty and Reserve Pay
 *   - 37 USC Chapter 3: Basic Pay
 *   - 37 USC §403: Basic Allowance for Housing (BAH)
 *   - 37 USC §402: Basic Allowance for Subsistence (BAS)
 *   - 26 USC §112: Combat Zone Tax Exclusion
 *   - 5 USC §8432: Thrift Savings Plan Matching
 */

import type { MilitaryPayRecord } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// FY2025 Military Pay Table
//
// Representative pay table with O-1 through O-10, E-1 through E-9 at key
// YOS breakpoints: 2, 4, 6, 10, 20. Monthly rates in dollars.
//
// Per 37 USC Chapter 3, basic pay is determined from the pay table for the
// member's grade and years of creditable service.
// ---------------------------------------------------------------------------

/** YOS breakpoints used in the pay table. */
const YOS_BREAKPOINTS = [2, 4, 6, 10, 20] as const;

/**
 * FY2025 monthly basic pay rates keyed by pay grade.
 * Each array corresponds to YOS breakpoints [2, 4, 6, 10, 20].
 */
const FY2025_PAY_TABLE: Record<string, number[]> = {
  // Enlisted
  'E-1': [2005, 2005, 2005, 2005, 2005],
  'E-2': [2247, 2247, 2247, 2247, 2247],
  'E-3': [2513, 2666, 2666, 2666, 2666],
  'E-4': [2753, 3032, 3295, 3295, 3295],
  'E-5': [3048, 3340, 3703, 3822, 3822],
  'E-6': [3428, 3750, 4145, 4277, 4558],
  'E-7': [3935, 4284, 4705, 5334, 5712],
  'E-8': [5356, 5508, 5932, 6398, 6398],
  'E-9': [6478, 6662, 7410, 7617, 8057],

  // Officers
  'O-1':  [4167, 5038, 5826, 5826, 5826],
  'O-2':  [5250, 6254, 6385, 6385, 6385],
  'O-3':  [5956, 7019, 7729, 8674, 8674],
  'O-4':  [6922, 7493, 8381, 9727, 10547],
  'O-5':  [7810, 8445, 9218, 10464, 11527],
  'O-6':  [9114, 9708, 10168, 11614, 13672],
  'O-7':  [11454, 11870, 12589, 13914, 14743],
  'O-8':  [13642, 13988, 14744, 15783, 15783],
  'O-9':  [15783, 15783, 15783, 15783, 15783],
  'O-10': [15783, 15783, 15783, 15783, 15783],
};

/** The fiscal year this embedded table represents. */
const PAY_TABLE_FISCAL_YEAR = 2025;

/** Annual pay raise percentage applied when scaling away from the base year. */
const DEFAULT_ANNUAL_RAISE_PCT = 0.045;

// ---------------------------------------------------------------------------
// BAH Rate Structure (simplified national averages, FY2025)
// ---------------------------------------------------------------------------

const BAH_RATES: Record<string, { with: number; without: number }> = {
  'E-1': { with: 1188, without: 955 },
  'E-2': { with: 1242, without: 999 },
  'E-3': { with: 1314, without: 1058 },
  'E-4': { with: 1422, without: 1144 },
  'E-5': { with: 1548, without: 1247 },
  'E-6': { with: 1674, without: 1350 },
  'E-7': { with: 1818, without: 1467 },
  'E-8': { with: 1962, without: 1584 },
  'E-9': { with: 2088, without: 1688 },
  'O-1': { with: 1602, without: 1290 },
  'O-2': { with: 1728, without: 1395 },
  'O-3': { with: 1908, without: 1539 },
  'O-4': { with: 2148, without: 1731 },
  'O-5': { with: 2364, without: 1908 },
  'O-6': { with: 2580, without: 2082 },
  'O-7': { with: 2820, without: 2277 },
  'O-8': { with: 3000, without: 2421 },
  'O-9': { with: 3180, without: 2568 },
  'O-10': { with: 3366, without: 2718 },
};

// ---------------------------------------------------------------------------
// BAS Rates (FY2025)
// ---------------------------------------------------------------------------

const BAS_ENLISTED_FY2025 = 460.25;
const BAS_OFFICER_FY2025 = 316.98;

// ---------------------------------------------------------------------------
// Helper: resolve YOS bracket index
// ---------------------------------------------------------------------------

function resolveYOSIndex(yearsOfService: number): number {
  let idx = 0;
  for (let i = YOS_BREAKPOINTS.length - 1; i >= 0; i--) {
    if (yearsOfService >= YOS_BREAKPOINTS[i]) {
      idx = i;
      break;
    }
  }
  return idx;
}

/**
 * Determine if a pay grade is enlisted (E-prefix).
 */
function isEnlistedGrade(payGrade: string): boolean {
  return payGrade.toUpperCase().trim().startsWith('E');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate monthly basic pay for a given pay grade and years of service.
 *
 * Per DoD FMR Vol 7A, Ch 1: Basic pay is determined from the pay table
 * for the member's grade and years of creditable service.
 *
 * @param payGrade - e.g. "E-5", "O-3"
 * @param yearsOfService - completed years of creditable service
 * @param fiscalYear - fiscal year for rate lookup
 * @returns Monthly basic pay amount in dollars
 */
export function calculateBasicPay(
  payGrade: string,
  yearsOfService: number,
  fiscalYear: number,
): number {
  const normalizedGrade = payGrade.toUpperCase().trim();
  const row = FY2025_PAY_TABLE[normalizedGrade];
  if (!row) {
    throw new Error(
      `Unknown pay grade: ${payGrade}. Expected E-1..E-9 or O-1..O-10.`,
    );
  }

  const yosIndex = resolveYOSIndex(Math.max(0, yearsOfService));
  const basePay = row[Math.min(yosIndex, row.length - 1)];

  // Scale for fiscal year difference from the embedded table year.
  let adjustedPay = basePay;
  const yearDelta = fiscalYear - PAY_TABLE_FISCAL_YEAR;
  if (yearDelta > 0) {
    for (let i = 0; i < yearDelta; i++) {
      adjustedPay *= 1 + DEFAULT_ANNUAL_RAISE_PCT;
    }
  } else if (yearDelta < 0) {
    for (let i = 0; i < Math.abs(yearDelta); i++) {
      adjustedPay /= 1 + DEFAULT_ANNUAL_RAISE_PCT;
    }
  }

  return Math.round(adjustedPay * 100) / 100;
}

/**
 * Calculate Basic Allowance for Housing (BAH).
 *
 * Per DoD FMR Vol 7A, Ch 26: BAH rates vary by pay grade, dependency status,
 * and duty station ZIP code. This implementation uses a simplified rate
 * structure based on national averages, with ZIP-based adjustments applied
 * via a cost-of-living multiplier for high-cost areas.
 *
 * @param payGrade - e.g. "E-5", "O-3"
 * @param dependencyStatus - 'with' or 'without' dependents
 * @param zipCode - duty station ZIP code
 * @param fiscalYear - fiscal year for rate lookup
 * @returns Monthly BAH amount in dollars
 */
export function calculateBAH(
  payGrade: string,
  dependencyStatus: 'with' | 'without',
  zipCode: string,
  fiscalYear: number,
): number {
  const normalizedGrade = payGrade.toUpperCase().trim();
  const gradeRates = BAH_RATES[normalizedGrade];
  if (!gradeRates) {
    throw new Error(
      `No BAH rates available for pay grade: ${payGrade}.`,
    );
  }

  let baseRate = dependencyStatus === 'with' ? gradeRates.with : gradeRates.without;

  // Apply ZIP-based cost-of-living multiplier.
  // High-cost area ZIP prefixes receive an uplift; all others use 1.0.
  const zipPrefix = zipCode.substring(0, 3);
  const highCostMultipliers: Record<string, number> = {
    '100': 1.45, // New York City
    '101': 1.40,
    '200': 1.35, // Washington DC
    '201': 1.35,
    '900': 1.40, // Los Angeles
    '941': 1.50, // San Francisco
    '981': 1.30, // Seattle
    '968': 1.25, // Honolulu
    '021': 1.30, // Boston
    '606': 1.20, // Chicago
    '802': 1.20, // Denver
  };
  const multiplier = highCostMultipliers[zipPrefix] ?? 1.0;
  baseRate *= multiplier;

  // Adjust for fiscal year.
  const yearDelta = fiscalYear - PAY_TABLE_FISCAL_YEAR;
  if (yearDelta !== 0) {
    baseRate *= Math.pow(1.05, yearDelta); // BAH typically rises ~5% annually
  }

  return Math.round(baseRate * 100) / 100;
}

/**
 * Calculate Basic Allowance for Subsistence (BAS).
 *
 * Per DoD FMR Vol 7A, Ch 25: BAS is a flat monthly rate that differs between
 * enlisted members and officers. The rate is adjusted annually.
 *
 * @param payGrade - e.g. "E-5", "O-3"
 * @param fiscalYear - fiscal year for rate lookup
 * @returns Monthly BAS amount in dollars
 */
export function calculateBAS(
  payGrade: string,
  fiscalYear: number,
): number {
  const isEnlisted = isEnlistedGrade(payGrade);
  let rate = isEnlisted ? BAS_ENLISTED_FY2025 : BAS_OFFICER_FY2025;

  // Adjust for fiscal year (BAS tracks the USDA food cost index, ~2.5% annually).
  const yearDelta = fiscalYear - PAY_TABLE_FISCAL_YEAR;
  if (yearDelta !== 0) {
    rate *= Math.pow(1.025, yearDelta);
  }

  return Math.round(rate * 100) / 100;
}

/**
 * Calculate Combat Zone Tax Exclusion (CZTE) amount.
 *
 * Per 26 USC §112 and DoD FMR Vol 7A, Ch 44:
 * - Enlisted members: ALL military compensation is excluded (unlimited).
 * - Officers: Exclusion is capped at the highest enlisted pay rate
 *   (E-9 at max YOS) plus hostile fire/imminent danger pay ($225/month).
 *
 * @param basicPay - monthly basic pay for the member
 * @param isEnlisted - true if the member is enlisted (E-1 through E-9)
 * @returns Amount of monthly income excludable from taxes
 */
export function calculateCombatZoneExclusion(
  basicPay: number,
  isEnlisted: boolean,
): number {
  if (isEnlisted) {
    // Per 26 USC §112(a): Enlisted members receive unlimited exclusion.
    return basicPay;
  }

  // Officers: cap = highest enlisted basic pay (E-9 at 20+ YOS) + hostile fire pay
  const e9MaxPay = FY2025_PAY_TABLE['E-9'][FY2025_PAY_TABLE['E-9'].length - 1];
  const hostileFirePay = 225; // DoD FMR Vol 7A, Ch 10
  const officerCap = e9MaxPay + hostileFirePay;

  return Math.min(basicPay, officerCap);
}

/**
 * Calculate TSP (Thrift Savings Plan) government matching contribution.
 *
 * Per 5 USC §8432 (as applied to military via the Blended Retirement System):
 * - Automatic 1% agency contribution (regardless of member contribution).
 * - Dollar-for-dollar match on the first 3% of basic pay contributed.
 * - 50 cents per dollar on the next 2% of basic pay contributed.
 * - Maximum government match: 5% of basic pay (1% auto + 3% full + 0.5*2%).
 *
 * @param basicPay - monthly basic pay
 * @param contributionPct - member's contribution as a percentage of basic pay (0.0 to 1.0 scale)
 * @returns Monthly government TSP matching contribution amount
 */
export function calculateTSPMatch(
  basicPay: number,
  contributionPct: number,
): number {
  // Clamp contribution; matching is calculated on the first 5%.
  const effectiveContrib = Math.min(Math.max(contributionPct, 0), 1.0);

  // Automatic 1% agency contribution (DoD FMR Vol 7A, Ch 51)
  const autoContrib = basicPay * 0.01;

  // Dollar-for-dollar match on first 3%
  const first3 = Math.min(effectiveContrib, 0.03);
  const matchFirst3 = basicPay * first3;

  // 50 cents on the dollar for next 2%
  const next2 = Math.max(0, Math.min(effectiveContrib - 0.03, 0.02));
  const matchNext2 = basicPay * next2 * 0.50;

  return Math.round((autoContrib + matchFirst3 + matchNext2) * 100) / 100;
}

/**
 * Validate a military pay record's entitlements against computed values.
 *
 * Per DoD FMR Vol 7A: Checks that recorded pay, allowances, and deductions
 * are consistent with the member's grade, years of service, and applicable
 * fiscal year rates.
 *
 * @param record - the MilitaryPayRecord to validate
 * @param fiscalYear - the fiscal year for rate computations
 * @returns Validation result with any discrepancies noted
 */
export function validatePayEntitlements(
  record: MilitaryPayRecord,
  fiscalYear: number,
): { valid: boolean; discrepancies: string[] } {
  const discrepancies: string[] = [];

  // --- Pay grade format validation ---
  const validGradePattern = /^(E-[1-9]|O-(10|[1-9]))$/;
  if (!validGradePattern.test(record.payGrade.toUpperCase().trim())) {
    discrepancies.push(
      `Invalid pay grade format: "${record.payGrade}". ` +
      `Expected E-1..E-9 or O-1..O-10. Ref: DoD FMR Vol 7A, Ch 1.`,
    );
    // Cannot proceed with numeric validations if grade is invalid.
    return { valid: false, discrepancies };
  }

  // --- YOS reasonableness ---
  if (record.yearsOfService < 0 || record.yearsOfService > 42) {
    discrepancies.push(
      `Years of service (${record.yearsOfService}) outside expected range (0-42). ` +
      `Ref: DoD FMR Vol 7A, Ch 1.`,
    );
  }

  // --- Basic Pay validation ---
  const expectedBasicPay = calculateBasicPay(
    record.payGrade,
    record.yearsOfService,
    fiscalYear,
  );
  const basicPayTolerance = expectedBasicPay * 0.02; // 2% tolerance
  const basicPayVariance = Math.abs(record.basicPay - expectedBasicPay);
  if (basicPayVariance > basicPayTolerance) {
    discrepancies.push(
      `Basic pay discrepancy: recorded $${record.basicPay.toFixed(2)}, ` +
      `expected $${expectedBasicPay.toFixed(2)} for ${record.payGrade} ` +
      `with ${record.yearsOfService} YOS (variance: $${basicPayVariance.toFixed(2)}). ` +
      `Ref: DoD FMR Vol 7A, Ch 1.`,
    );
  }

  // --- BAS validation ---
  const expectedBAS = calculateBAS(record.payGrade, fiscalYear);
  if (Math.abs(record.bas - expectedBAS) > 1.00) {
    discrepancies.push(
      `BAS discrepancy: recorded $${record.bas.toFixed(2)}, ` +
      `expected $${expectedBAS.toFixed(2)} for grade ${record.payGrade}. ` +
      `Ref: DoD FMR Vol 7A, Ch 25.`,
    );
  }

  // --- TSP Match validation ---
  if (record.tspContribution > 0 && record.basicPay > 0) {
    const contributionPct = record.tspContribution / record.basicPay;
    const expectedMatch = calculateTSPMatch(record.basicPay, contributionPct);
    const matchVariance = Math.abs(record.tspMatchAmount - expectedMatch);
    if (matchVariance > 1.00) {
      discrepancies.push(
        `TSP match discrepancy: recorded $${record.tspMatchAmount.toFixed(2)}, ` +
        `expected $${expectedMatch.toFixed(2)} based on ` +
        `${(contributionPct * 100).toFixed(1)}% contribution. ` +
        `Ref: DoD FMR Vol 7A, Ch 51; 5 USC §8432.`,
      );
    }
  }

  // --- Total compensation reasonableness ---
  const computedMinTotal = record.basicPay + record.bah + record.bas;
  if (record.totalCompensation < computedMinTotal * 0.95) {
    discrepancies.push(
      `Total compensation ($${record.totalCompensation.toFixed(2)}) appears low ` +
      `relative to basic pay + BAH + BAS ($${computedMinTotal.toFixed(2)}). ` +
      `Verify deductions. Ref: DoD FMR Vol 7A.`,
    );
  }

  // --- Combat zone exclusion + separation pay consistency ---
  if (record.combatZoneExclusion && record.separationPay > 0) {
    discrepancies.push(
      `Member has both combat zone exclusion and separation pay recorded. ` +
      `Verify separation pay is not erroneously included during combat zone service. ` +
      `Ref: DoD FMR Vol 7A, Ch 44.`,
    );
  }

  return {
    valid: discrepancies.length === 0,
    discrepancies,
  };
}
