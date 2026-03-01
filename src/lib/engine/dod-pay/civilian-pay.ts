/**
 * Civilian Pay Computation Engine
 *
 * Implements DoD FMR Volume 8 (Civilian Pay Policy and Procedures) computations
 * for GS pay, FERS contributions, FEHB, leave accrual, premium pay, and
 * compliance validation.
 *
 * References:
 *   - DoD 7000.14-R, Volume 8: Civilian Pay Policy and Procedures
 *   - 5 USC §5332: GS Pay Schedule
 *   - 5 USC §5304: Locality Pay
 *   - 5 USC §8422: FERS Employee Deductions
 *   - 5 USC §8906: FEHB Government Contribution
 *   - 5 USC §6303: Annual Leave Accrual
 *   - 5 USC §§5542-5546: Premium Pay
 */

import type { CivilianPayRecord } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// GS Base Pay Table — FY2025 (annual rates)
// Rows: grades 1-15, Columns: steps 1, 5, 10
// Per 5 USC §5332, the General Schedule is published annually by OPM.
// ---------------------------------------------------------------------------

/**
 * FY2025 GS pay table. Each row is [step 1, step 5, step 10].
 * Index 0 = GS-1, Index 14 = GS-15.
 */
const GS_PAY_TABLE_FY2025: number[][] = [
  /* GS-1  */ [22997, 26043, 28798],
  /* GS-2  */ [25858, 28388, 32563],
  /* GS-3  */ [28207, 31953, 36654],
  /* GS-4  */ [31658, 35866, 41133],
  /* GS-5  */ [35435, 40156, 46058],
  /* GS-6  */ [39484, 44729, 51298],
  /* GS-7  */ [43894, 49715, 57027],
  /* GS-8  */ [48568, 55005, 63103],
  /* GS-9  */ [53692, 60800, 69752],
  /* GS-10 */ [59090, 66919, 76762],
  /* GS-11 */ [64924, 73535, 84371],
  /* GS-12 */ [77819, 88142, 101117],
  /* GS-13 */ [92528, 104789, 120223],
  /* GS-14 */ [109339, 123828, 142072],
  /* GS-15 */ [128608, 145653, 167157],
];

const GS_TABLE_FISCAL_YEAR = 2025;
const DEFAULT_GS_RAISE_PCT = 0.046;

/**
 * Steps represented in the embedded table. We interpolate for other steps.
 */
const TABLE_STEPS = [1, 5, 10] as const;

// ---------------------------------------------------------------------------
// Locality pay percentages (FY2025 baseline)
// Per 5 USC §5304, locality pay is set by the Federal Salary Council.
// ---------------------------------------------------------------------------

const LOCALITY_RATES: Record<string, number> = {
  'REST_OF_US':        0.1772,
  'WASHINGTON_DC':     0.3341,
  'SAN_FRANCISCO':     0.4614,
  'NEW_YORK':          0.3699,
  'LOS_ANGELES':       0.3476,
  'CHICAGO':           0.3036,
  'BOSTON':             0.3117,
  'SEATTLE':           0.3248,
  'HOUSTON':           0.3418,
  'DENVER':            0.3024,
  'ATLANTA':           0.2584,
  'DALLAS':            0.2739,
  'DETROIT':           0.2893,
  'PHILADELPHIA':      0.2716,
  'HAWAII':            0.2834,
  'ALASKA':            0.2960,
  'SAN_DIEGO':         0.3165,
  'SACRAMENTO':        0.2946,
  'MIAMI':             0.2680,
  'PHOENIX':           0.2250,
};

// ---------------------------------------------------------------------------
// Helper: interpolate step pay
// ---------------------------------------------------------------------------

function interpolateStepPay(gradeIndex: number, step: number): number {
  const row = GS_PAY_TABLE_FY2025[gradeIndex];
  // row = [step1, step5, step10]
  if (step <= 1) return row[0];
  if (step >= 10) return row[2];

  if (step <= 5) {
    // Linear interpolation between step 1 and step 5
    const fraction = (step - 1) / (5 - 1);
    return row[0] + fraction * (row[1] - row[0]);
  }

  // Linear interpolation between step 5 and step 10
  const fraction = (step - 5) / (10 - 5);
  return row[1] + fraction * (row[2] - row[1]);
}

function normalizeLocality(locality: string): string {
  return locality.toUpperCase().trim().replace(/[\s-]+/g, '_');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate GS pay including locality adjustment.
 *
 * Per 5 USC §5332 and §5304: Total adjusted basic pay = GS base rate +
 * locality adjustment for the employee's duty station.
 *
 * @param grade - GS grade (1-15)
 * @param step - GS step (1-10)
 * @param locality - locality pay area identifier (e.g. "WASHINGTON_DC", "REST_OF_US")
 * @param fiscalYear - fiscal year for rate lookup
 * @returns Object with base pay, locality adjustment, and total
 */
export function calculateGSPay(
  grade: number,
  step: number,
  locality: string,
  fiscalYear: number,
): { base: number; localityAdj: number; total: number } {
  if (grade < 1 || grade > 15) {
    throw new Error(`Invalid GS grade: ${grade}. Must be 1-15.`);
  }
  if (step < 1 || step > 10) {
    throw new Error(`Invalid GS step: ${step}. Must be 1-10.`);
  }

  // Base pay from embedded table (interpolated for non-anchor steps)
  let basePay = interpolateStepPay(grade - 1, step);

  // Adjust for fiscal year differences
  const yearDelta = fiscalYear - GS_TABLE_FISCAL_YEAR;
  if (yearDelta > 0) {
    for (let i = 0; i < yearDelta; i++) {
      basePay *= 1 + DEFAULT_GS_RAISE_PCT;
    }
  } else if (yearDelta < 0) {
    for (let i = 0; i < Math.abs(yearDelta); i++) {
      basePay /= 1 + DEFAULT_GS_RAISE_PCT;
    }
  }

  basePay = Math.round(basePay * 100) / 100;

  // Locality adjustment
  const normalizedLocality = normalizeLocality(locality);
  const localityPct = LOCALITY_RATES[normalizedLocality] ?? LOCALITY_RATES['REST_OF_US'];
  const localityAdj = Math.round(basePay * localityPct * 100) / 100;
  const total = Math.round((basePay + localityAdj) * 100) / 100;

  return { base: basePay, localityAdj, total };
}

/**
 * Calculate FERS (Federal Employees Retirement System) employee contribution.
 *
 * Per 5 USC §8422 and DoD FMR Vol 8, Ch 3:
 * - FERS (hired before 2013): Employee contributes 0.8% of basic pay.
 * - FERS-Revised (FERS-RAE/FERS-FRAE, hired 2013+): Employee contributes 4.4%.
 *
 * @param basicPay - annual basic pay
 * @param fersCategory - 'fers' (original) or 'fers_revised'
 * @returns Annual employee FERS contribution amount
 */
export function calculateFERSContribution(
  basicPay: number,
  fersCategory: 'fers' | 'fers_revised',
): number {
  const rate = fersCategory === 'fers' ? 0.008 : 0.044;
  return Math.round(basicPay * rate * 100) / 100;
}

/**
 * Calculate FEHB (Federal Employees Health Benefits) government contribution.
 *
 * Per 5 USC §8906 and DoD FMR Vol 8, Ch 3: The government pays up to 75% of
 * the weighted average premium. This returns estimated biweekly government
 * contribution by enrollment type.
 *
 * @param planType - enrollment type: 'self', 'self_plus_one', or 'family'
 * @returns Biweekly FEHB government contribution estimate
 */
export function calculateFEHB(
  planType: 'self' | 'self_plus_one' | 'family',
): number {
  // Representative biweekly government contributions (FY2025 estimates)
  // Per OPM FEHB weighted average rates
  const rates: Record<string, number> = {
    self: 175.50,
    self_plus_one: 385.75,
    family: 428.00,
  };

  return rates[planType] ?? rates.self;
}

/**
 * Calculate annual leave accrual rate (hours per biweekly pay period).
 *
 * Per 5 USC §6303 and DoD FMR Vol 8, Ch 5:
 * - Less than 3 years of service: 4 hours/pay period (13 days/year)
 * - 3 to less than 15 years: 6 hours/pay period (20 days/year)
 * - 15 or more years: 8 hours/pay period (26 days/year)
 *
 * @param yearsOfService - completed years of creditable civilian service
 * @returns Hours of annual leave accrued per biweekly pay period
 */
export function calculateLeaveAccrual(yearsOfService: number): number {
  if (yearsOfService < 3) {
    return 4; // 5 USC §6303(a)(1): 4 hrs/pp = 104 hrs = 13 days/year
  } else if (yearsOfService < 15) {
    return 6; // 5 USC §6303(a)(2): 6 hrs/pp = 160 hrs = 20 days/year
  } else {
    return 8; // 5 USC §6303(a)(3): 8 hrs/pp = 208 hrs = 26 days/year
  }
}

/**
 * Calculate premium pay for overtime, Sunday, holiday, and night differential.
 *
 * Per 5 USC §§5542-5546 and DoD FMR Vol 8, Ch 4:
 * - Overtime: 1.5x hourly rate (5 USC §5542)
 * - Sunday premium: 25% of basic rate for regularly scheduled Sunday work
 * - Holiday premium: 100% of basic rate for holiday work
 * - Night differential: 10% of basic rate for night work (6pm-6am)
 *
 * @param basicPay - annual basic pay
 * @param hours - number of premium hours worked
 * @param payType - type of premium pay
 * @returns Premium pay amount for the specified hours
 */
export function calculatePremiumPay(
  basicPay: number,
  hours: number,
  payType: 'overtime' | 'sunday' | 'holiday' | 'night',
): number {
  if (hours <= 0) return 0;

  // OPM standard work hours per year = 2087
  const hourlyRate = basicPay / 2087;

  switch (payType) {
    case 'overtime':
      // 5 USC §5542: 1.5x the hourly rate
      return Math.round(hourlyRate * 1.5 * hours * 100) / 100;

    case 'sunday':
      // 5 USC §5546(a): 25% additional
      return Math.round(hourlyRate * 0.25 * hours * 100) / 100;

    case 'holiday':
      // 5 USC §5546(b): 100% additional (double time)
      return Math.round(hourlyRate * 1.0 * hours * 100) / 100;

    case 'night':
      // 5 USC §5545(a): 10% additional
      return Math.round(hourlyRate * 0.10 * hours * 100) / 100;

    default: {
      const _exhaustive: never = payType;
      throw new Error(`Unknown premium pay type: ${_exhaustive}`);
    }
  }
}

/**
 * Validate a civilian pay record against computed entitlements.
 *
 * Per DoD FMR Vol 8: Checks recorded pay, contributions, and leave accrual
 * against expected values based on grade, step, locality, and service years.
 *
 * @param record - the CivilianPayRecord to validate
 * @param fiscalYear - the fiscal year for rate computations
 * @returns Validation result with discrepancies
 */
export function validatePayCompliance(
  record: CivilianPayRecord,
  fiscalYear: number,
): { valid: boolean; discrepancies: string[] } {
  const discrepancies: string[] = [];

  // --- Pay plan validation ---
  if (record.payPlan && record.payPlan.toUpperCase() !== 'GS' && record.payPlan.toUpperCase() !== 'GL') {
    discrepancies.push(
      `Pay plan "${record.payPlan}" is not GS/GL. This engine validates General ` +
      `Schedule only. Manual review required. Ref: DoD FMR Vol 8.`,
    );
  }

  // --- GS Pay validation ---
  const gradeNum = parseInt(record.grade, 10);
  if (isNaN(gradeNum) || gradeNum < 1 || gradeNum > 15) {
    discrepancies.push(
      `Invalid GS grade: "${record.grade}". Must be 1-15. Ref: 5 USC §5332.`,
    );
  } else if (record.step < 1 || record.step > 10) {
    discrepancies.push(
      `Invalid GS step: ${record.step}. Must be 1-10. Ref: 5 USC §5332.`,
    );
  } else {
    const computed = calculateGSPay(gradeNum, record.step, record.locality, fiscalYear);
    // Convert annual to per-pay-period (26 pay periods/year)
    const expectedPPTotal = computed.total / 26;
    const recordedPPPay = record.basicPay + record.localityAdjustment;

    const tolerance = expectedPPTotal * 0.02;
    const variance = Math.abs(recordedPPPay - expectedPPTotal);
    if (variance > tolerance) {
      discrepancies.push(
        `GS pay discrepancy: recorded $${recordedPPPay.toFixed(2)}/pp, ` +
        `expected ~$${expectedPPTotal.toFixed(2)}/pp for GS-${gradeNum}/Step ${record.step} ` +
        `(${record.locality}). Variance: $${variance.toFixed(2)}. ` +
        `Ref: DoD FMR Vol 8, Ch 2; 5 USC §5332, §5304.`,
      );
    }
  }

  // --- FERS contribution validation ---
  if (record.retirementPlan === 'fers' || record.retirementPlan === 'fers_revised') {
    const annualBasic = record.basicPay * 26; // approximate annualized
    const fersCategory = record.retirementPlan === 'fers_revised' ? 'fers_revised' : 'fers';
    const expectedAnnualFERS = calculateFERSContribution(annualBasic, fersCategory);
    const expectedPPFERS = expectedAnnualFERS / 26;

    const fersVariance = Math.abs(record.retirementContribution - expectedPPFERS);
    if (fersVariance > expectedPPFERS * 0.05) {
      discrepancies.push(
        `FERS contribution discrepancy: recorded $${record.retirementContribution.toFixed(2)}/pp, ` +
        `expected ~$${expectedPPFERS.toFixed(2)}/pp for ${fersCategory}. ` +
        `Ref: DoD FMR Vol 8, Ch 3; 5 USC §8422.`,
      );
    }
  }

  // --- Leave accrual validation ---
  const validLeaveRates = [4, 6, 8];
  if (record.leaveHoursAccrued > 0 && !validLeaveRates.includes(record.leaveHoursAccrued)) {
    discrepancies.push(
      `Leave accrual rate (${record.leaveHoursAccrued} hrs/pp) does not match ` +
      `any standard rate (4, 6, or 8 hrs/pp). ` +
      `Ref: DoD FMR Vol 8, Ch 5; 5 USC §6303.`,
    );
  }

  // --- Premium pay cap check ---
  // Per 5 USC §5547: Total annualized compensation cannot exceed GS-15/Step 10
  // + locality or Level V of the Executive Schedule
  const annualizedTotal = record.totalCompensation * 26;
  const gs15Step10 = GS_PAY_TABLE_FY2025[14][2]; // GS-15, Step 10
  const localityPct = LOCALITY_RATES[normalizeLocality(record.locality)] ?? LOCALITY_RATES['REST_OF_US'];
  const gs15Cap = gs15Step10 * (1 + localityPct);
  const execLevelV = 191900; // FY2025 Level V, Executive Schedule
  const capAmount = Math.max(gs15Cap, execLevelV);

  if (annualizedTotal > capAmount) {
    const excess = annualizedTotal - capAmount;
    discrepancies.push(
      `Total annualized compensation ($${annualizedTotal.toFixed(2)}) exceeds premium pay cap ` +
      `($${capAmount.toFixed(2)}) by $${excess.toFixed(2)}. ` +
      `Verify emergency/combat waiver applicability. ` +
      `Ref: DoD FMR Vol 8, Ch 4; 5 USC §5547.`,
    );
  }

  // --- TSP match validation ---
  if (record.tspContribution > 0 && record.basicPay > 0) {
    const contributionPct = record.tspContribution / record.basicPay;
    const autoContrib = record.basicPay * 0.01;
    const first3 = Math.min(contributionPct, 0.03);
    const matchFirst3 = record.basicPay * first3;
    const next2 = Math.max(0, Math.min(contributionPct - 0.03, 0.02));
    const matchNext2 = record.basicPay * next2 * 0.50;
    const expectedMatch = autoContrib + matchFirst3 + matchNext2;

    const matchVariance = Math.abs(record.tspMatchAmount - expectedMatch);
    if (matchVariance > 2.00) {
      discrepancies.push(
        `TSP match discrepancy: recorded $${record.tspMatchAmount.toFixed(2)}, ` +
        `expected ~$${expectedMatch.toFixed(2)}. ` +
        `Ref: DoD FMR Vol 8, Ch 3; 5 USC §8432.`,
      );
    }
  }

  return {
    valid: discrepancies.length === 0,
    discrepancies,
  };
}
