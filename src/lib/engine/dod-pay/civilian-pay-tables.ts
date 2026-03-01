/**
 * Civilian Pay Calculation Engine
 *
 * Implements DoD FMR Volume 8 (Civilian Pay Policy and Procedures) pay table
 * lookups, within-grade increases, retirement contributions, FEHB premiums,
 * TSP calculations, premium pay, and total compensation roll-ups.
 *
 * All functions are pure: given the same inputs they produce the same outputs
 * with no side effects or external state dependencies beyond the parameter
 * registry.
 *
 * References:
 *   - DoD 7000.14-R, Volume 8: Civilian Pay Policy and Procedures
 *   - 5 U.S.C. §5332: General Schedule Pay Rates
 *   - 5 U.S.C. §5304: Locality-Based Comparability Payments
 *   - 5 U.S.C. §5335: Within-Grade Increases
 *   - 5 U.S.C. §8422: FERS Employee Deductions
 *   - 5 U.S.C. §8334: CSRS Employee Deductions
 *   - 5 U.S.C. §8906: FEHB Government Contribution
 *   - 5 U.S.C. §8432: Thrift Savings Plan
 *   - 5 U.S.C. §§5542-5547: Premium Pay
 *   - OPM Pay Tables (published annually)
 */

import { v4 as uuid } from 'uuid';
import { getParameter } from '@/lib/engine/tax-parameters/registry';

// ============================================================================
// Types
// ============================================================================

/** GS grade (1-15). */
export type GSGrade = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

/** GS step (1-10). */
export type GSStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** Supported locality pay areas. */
export type LocalityArea =
  | 'REST_OF_US'
  | 'WASHINGTON_DC'
  | 'SAN_FRANCISCO'
  | 'NEW_YORK'
  | 'LOS_ANGELES'
  | 'CHICAGO'
  | 'BOSTON'
  | 'SEATTLE'
  | 'HOUSTON'
  | 'DENVER'
  | 'ATLANTA'
  | 'DALLAS'
  | 'DETROIT'
  | 'PHILADELPHIA'
  | 'HAWAII'
  | 'ALASKA'
  | 'SAN_DIEGO'
  | 'SACRAMENTO'
  | 'MIAMI'
  | 'PHOENIX';

/** Input parameters for GS pay lookup. */
export interface GSPayInput {
  grade: GSGrade;
  step: GSStep;
  locality: string;
  fiscalYear: number;
}

/** Result of a GS pay lookup. */
export interface GSPayResult {
  id: string;
  grade: GSGrade;
  step: GSStep;
  locality: string;
  fiscalYear: number;
  annualBase: number;
  localityPct: number;
  localityAdjustment: number;
  annualAdjusted: number;
  biweeklyRate: number;
  hourlyRate: number;
}

/** Retirement plan type. */
export type RetirementPlanType = 'fers' | 'csrs' | 'fers_revised';

/** Input parameters for within-grade increase calculation. */
export interface WGIInput {
  grade: GSGrade;
  currentStep: GSStep;
}

/** Result of within-grade increase calculation. */
export interface WGIResult {
  id: string;
  grade: GSGrade;
  currentStep: GSStep;
  nextStep: GSStep | null;
  waitingPeriodWeeks: number;
  waitingPeriodYears: number;
  eligible: boolean;
  currentStepRate: number;
  nextStepRate: number | null;
  increaseAmount: number | null;
  authority: string;
}

/** Input for retirement contribution calculation. */
export interface RetirementContributionInput {
  basicPay: number;
  plan: RetirementPlanType;
  fiscalYear: number;
}

/** Result of retirement contribution calculation. */
export interface RetirementContributionResult {
  id: string;
  basicPay: number;
  plan: RetirementPlanType;
  fiscalYear: number;
  employeeRate: number;
  employeeContribution: number;
  annualContribution: number;
  authority: string;
}

/** FEHB enrollment type. */
export type FEHBEnrollmentType = 'self' | 'self_plus_one' | 'family';

/** FEHB plan category. */
export type FEHBPlanType = 'standard' | 'high' | 'basic';

/** Input for FEHB premium calculation. */
export interface FEHBPremiumInput {
  planType: FEHBPlanType;
  enrollmentType: FEHBEnrollmentType;
  fiscalYear: number;
}

/** Result of FEHB premium calculation. */
export interface FEHBPremiumResult {
  id: string;
  planType: FEHBPlanType;
  enrollmentType: FEHBEnrollmentType;
  fiscalYear: number;
  totalBiweeklyPremium: number;
  governmentContribution: number;
  employeeContribution: number;
  governmentPct: number;
  authority: string;
}

/** Input for civilian TSP calculation. */
export interface CivilianTSPInput {
  basicPay: number;
  contributionPct: number;
  fiscalYear: number;
}

/** Result of civilian TSP calculation. */
export interface CivilianTSPResult {
  id: string;
  basicPay: number;
  memberContributionPct: number;
  memberContribution: number;
  agencyAutomatic: number;
  agencyMatchFirst3: number;
  agencyMatchNext2: number;
  totalAgencyContribution: number;
  totalContribution: number;
  annualElectiveLimit: number;
  exceedsAnnualLimit: boolean;
  authority: string;
}

/** Premium pay type. */
export type PremiumPayType = 'overtime' | 'night' | 'sunday' | 'holiday';

/** Input for premium pay calculation. */
export interface PremiumPayInput {
  basicPay: number;
  hours: number;
  type: PremiumPayType;
}

/** Result of premium pay calculation. */
export interface PremiumPayResult {
  id: string;
  basicPay: number;
  hours: number;
  type: PremiumPayType;
  hourlyRate: number;
  multiplier: number;
  premiumAmount: number;
  premiumPayCapApplied: boolean;
  authority: string;
}

/** Input for total civilian compensation calculation. */
export interface CivilianCompensationInput {
  grade: GSGrade;
  step: GSStep;
  locality: string;
  fiscalYear: number;
  retirementPlan: RetirementPlanType;
  fehbPlanType: FEHBPlanType;
  fehbEnrollmentType: FEHBEnrollmentType;
  tspContributionPct: number;
  overtimeHours?: number;
  nightHours?: number;
  sundayHours?: number;
  holidayHours?: number;
  additionalDeductions?: number;
}

/** Result of total civilian compensation calculation. */
export interface CivilianCompensationResult {
  id: string;
  grade: GSGrade;
  step: GSStep;
  locality: string;
  fiscalYear: number;
  gsPay: GSPayResult;
  retirement: RetirementContributionResult;
  fehb: FEHBPremiumResult;
  tsp: CivilianTSPResult;
  premiumPay: PremiumPayResult[];
  totalBiweeklyGross: number;
  totalBiweeklyDeductions: number;
  totalBiweeklyNet: number;
  totalAnnualCompensation: number;
}

// ============================================================================
// GS Base Pay Table Data
// ============================================================================

/**
 * FY2024 GS annual base pay table.
 * Rows: GS-1 through GS-15. Columns: Steps 1-10.
 *
 * Per 5 U.S.C. §5332 and OPM Pay Tables, the General Schedule is published
 * annually. This table contains representative rates for all 15 grades and
 * all 10 steps.
 *
 * Source: OPM 2024 GS Base Pay Table (effective January 2024).
 */
const GS_BASE_PAY_FY2024: number[][] = [
  /* GS-1  */ [22050, 22788, 23520, 24248, 24980, 25440, 26163, 26892, 26926, 27600],
  /* GS-2  */ [24789, 25384, 26198, 26892, 27130, 27922, 28714, 29506, 30298, 31090],
  /* GS-3  */ [27045, 27947, 28849, 29751, 30653, 31555, 32457, 33359, 34261, 35163],
  /* GS-4  */ [30352, 31364, 32376, 33388, 34400, 35412, 36424, 37436, 38448, 39460],
  /* GS-5  */ [33953, 35085, 36217, 37349, 38481, 39613, 40745, 41877, 43009, 44141],
  /* GS-6  */ [37839, 39101, 40363, 41625, 42887, 44149, 45411, 46673, 47935, 49197],
  /* GS-7  */ [42052, 43454, 44856, 46258, 47660, 49062, 50464, 51866, 53268, 54670],
  /* GS-8  */ [46547, 48098, 49649, 51200, 52751, 54302, 55853, 57404, 58955, 60506],
  /* GS-9  */ [51460, 53175, 54890, 56605, 58320, 60035, 61750, 63465, 65180, 66895],
  /* GS-10 */ [56663, 58552, 60441, 62330, 64219, 66108, 67997, 69886, 71775, 73664],
  /* GS-11 */ [62217, 64291, 66365, 68439, 70513, 72587, 74661, 76735, 78809, 80883],
  /* GS-12 */ [74580, 77066, 79552, 82038, 84524, 87010, 89496, 91982, 94468, 96954],
  /* GS-13 */ [88684, 91640, 94596, 97552, 100508, 103464, 106420, 109376, 112332, 115288],
  /* GS-14 */ [104785, 108278, 111771, 115264, 118757, 122250, 125743, 129236, 132729, 136222],
  /* GS-15 */ [123225, 127333, 131441, 135549, 139657, 143765, 147873, 151981, 156089, 160197],
];

/**
 * FY2025 GS annual base pay table.
 * Reflects the across-the-board pay adjustment for FY2025.
 *
 * Per 5 U.S.C. §5332 and OPM Pay Tables.
 * Source: OPM 2025 GS Base Pay Table (effective January 2025).
 */
const GS_BASE_PAY_FY2025: number[][] = [
  /* GS-1  */ [23044, 23816, 24581, 25342, 26107, 26588, 27343, 28103, 28139, 28843],
  /* GS-2  */ [25907, 26529, 27380, 28103, 28352, 29180, 30008, 30836, 31664, 32492],
  /* GS-3  */ [28265, 29208, 30151, 31094, 32037, 32980, 33923, 34866, 35809, 36752],
  /* GS-4  */ [31718, 32776, 33834, 34892, 35950, 37008, 38066, 39124, 40182, 41240],
  /* GS-5  */ [35481, 36664, 37847, 39030, 40213, 41396, 42579, 43762, 44945, 46128],
  /* GS-6  */ [39541, 40860, 42179, 43498, 44817, 46136, 47455, 48774, 50093, 51412],
  /* GS-7  */ [43944, 45410, 46876, 48342, 49808, 51274, 52740, 54206, 55672, 57138],
  /* GS-8  */ [48641, 50262, 51883, 53504, 55125, 56746, 58367, 59988, 61609, 63230],
  /* GS-9  */ [53776, 55568, 57360, 59152, 60944, 62736, 64528, 66320, 68112, 69904],
  /* GS-10 */ [59213, 61187, 63161, 65135, 67109, 69083, 71057, 73031, 75005, 76979],
  /* GS-11 */ [65017, 67184, 69351, 71518, 73685, 75852, 78019, 80186, 82353, 84520],
  /* GS-12 */ [77936, 80534, 83132, 85730, 88328, 90926, 93524, 96122, 98719, 101317],
  /* GS-13 */ [92675, 95764, 98853, 101942, 105031, 108120, 111209, 114298, 117387, 120476],
  /* GS-14 */ [109500, 113150, 116800, 120450, 124100, 127750, 131400, 135050, 138700, 142350],
  /* GS-15 */ [128770, 133062, 137354, 141646, 145938, 150230, 154522, 158814, 163106, 167398],
];

/** Map of fiscal year to its GS pay table. */
const GS_PAY_TABLES: Record<number, number[][]> = {
  2024: GS_BASE_PAY_FY2024,
  2025: GS_BASE_PAY_FY2025,
};

/** Fallback annual GS pay raise percentage. */
const DEFAULT_GS_RAISE_PCT = 0.046;

// ============================================================================
// Locality Pay Percentages
// ============================================================================

/**
 * Locality pay percentages by area.
 *
 * Per 5 U.S.C. §5304 and recommendations of the Federal Salary Council,
 * locality pay rates are set annually. These are FY2025 baseline rates.
 */
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

// ============================================================================
// FEHB Premium Tables
// ============================================================================

/**
 * FEHB representative biweekly total premium by plan type and enrollment.
 * Per 5 U.S.C. §8906 and OPM FEHB weighted-average premium data.
 *
 * These are FY2025 estimates. Actual rates vary by plan chosen.
 */
const FEHB_BIWEEKLY_PREMIUMS: Record<FEHBPlanType, Record<FEHBEnrollmentType, number>> = {
  basic: {
    self: 180.00,
    self_plus_one: 395.00,
    family: 440.00,
  },
  standard: {
    self: 245.00,
    self_plus_one: 535.00,
    family: 595.00,
  },
  high: {
    self: 325.00,
    self_plus_one: 710.00,
    family: 790.00,
  },
};

// ============================================================================
// WGI Waiting Periods
// ============================================================================

/**
 * Within-Grade Increase waiting periods by current step.
 *
 * Per 5 U.S.C. §5335 and 5 C.F.R. §531.405:
 * - Steps 1 to 2, 2 to 3, 3 to 4: 52 weeks (1 year)
 * - Steps 4 to 5, 5 to 6, 6 to 7: 104 weeks (2 years)
 * - Steps 7 to 8, 8 to 9, 9 to 10: 156 weeks (3 years)
 */
const WGI_WAITING_PERIODS: Record<number, number> = {
  1: 52,
  2: 52,
  3: 52,
  4: 104,
  5: 104,
  6: 104,
  7: 156,
  8: 156,
  9: 156,
};

// ============================================================================
// Constants
// ============================================================================

/** OPM standard work hours per year for hourly rate calculation. */
const OPM_HOURS_PER_YEAR = 2087;

/** Number of biweekly pay periods per year. */
const PAY_PERIODS_PER_YEAR = 26;

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Normalize a locality string to the canonical key form.
 * E.g., "Washington DC" -> "WASHINGTON_DC", "rest of us" -> "REST_OF_US".
 */
function normalizeLocality(locality: string): string {
  return locality.toUpperCase().trim().replace(/[\s-]+/g, '_');
}

/**
 * Round a number to two decimal places (cents).
 */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Look up the GS base annual pay from the embedded tables.
 * If the exact fiscal year table is not available, the nearest table
 * is used with DOD_CIVPAY_RAISE_PCT extrapolation.
 */
function lookupGSBaseAnnual(grade: GSGrade, step: GSStep, fiscalYear: number): number {
  // Try direct table lookup
  const directTable = GS_PAY_TABLES[fiscalYear];
  if (directTable) {
    return directTable[grade - 1][step - 1];
  }

  // Find nearest available table and extrapolate
  const availableYears = Object.keys(GS_PAY_TABLES).map(Number).sort((a, b) => a - b);
  let nearestYear = availableYears[availableYears.length - 1];
  for (const y of availableYears) {
    if (y <= fiscalYear) {
      nearestYear = y;
    }
  }

  const nearestTable = GS_PAY_TABLES[nearestYear];
  if (!nearestTable) {
    throw new Error(
      `No GS pay table data available. Ref: 5 U.S.C. §5332.`,
    );
  }

  let basePay = nearestTable[grade - 1][step - 1];
  const yearDelta = fiscalYear - nearestYear;

  if (yearDelta > 0) {
    for (let i = 0; i < yearDelta; i++) {
      const fy = nearestYear + i + 1;
      const raisePct = getParameter('DOD_CIVPAY_RAISE_PCT', fy, undefined, DEFAULT_GS_RAISE_PCT);
      basePay *= (1 + raisePct);
    }
  } else if (yearDelta < 0) {
    for (let i = 0; i < Math.abs(yearDelta); i++) {
      const fy = nearestYear - i;
      const raisePct = getParameter('DOD_CIVPAY_RAISE_PCT', fy, undefined, DEFAULT_GS_RAISE_PCT);
      basePay /= (1 + raisePct);
    }
  }

  return roundCents(basePay);
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Look up GS pay including locality adjustment.
 *
 * Per 5 U.S.C. §5332 and §5304:
 * Total adjusted basic pay = GS base rate + locality pay adjustment.
 * The GS base rate is determined from the annual pay table published by
 * OPM. Locality pay percentages are set by the Federal Salary Council
 * and the President's Pay Agent for each locality pay area.
 *
 * Supported locality areas include "Rest of US", "Washington DC",
 * "San Francisco", and 17 other major metropolitan areas.
 *
 * @param grade - GS grade (1-15)
 * @param step - GS step (1-10)
 * @param locality - Locality pay area (e.g., "WASHINGTON_DC", "REST_OF_US")
 * @param fiscalYear - Fiscal year for rate lookup
 * @returns GSPayResult with base, locality, adjusted pay, and derived rates
 */
export function lookupGSPay(
  grade: GSGrade,
  step: GSStep,
  locality: string,
  fiscalYear: number,
): GSPayResult {
  if (grade < 1 || grade > 15) {
    throw new Error(
      `Invalid GS grade: ${grade}. Must be 1-15. Ref: 5 U.S.C. §5332.`,
    );
  }
  if (step < 1 || step > 10) {
    throw new Error(
      `Invalid GS step: ${step}. Must be 1-10. Ref: 5 U.S.C. §5332.`,
    );
  }

  const annualBase = lookupGSBaseAnnual(grade, step, fiscalYear);
  const normalizedLocality = normalizeLocality(locality);
  const localityPct = LOCALITY_RATES[normalizedLocality] ?? LOCALITY_RATES['REST_OF_US'];
  const localityAdjustment = roundCents(annualBase * localityPct);
  const annualAdjusted = roundCents(annualBase + localityAdjustment);
  const biweeklyRate = roundCents(annualAdjusted / PAY_PERIODS_PER_YEAR);
  const hourlyRate = roundCents(annualAdjusted / OPM_HOURS_PER_YEAR);

  return {
    id: uuid(),
    grade,
    step,
    locality: normalizedLocality,
    fiscalYear,
    annualBase,
    localityPct,
    localityAdjustment,
    annualAdjusted,
    biweeklyRate,
    hourlyRate,
  };
}

/**
 * Calculate Within-Grade Increase (WGI) eligibility and amount.
 *
 * Per 5 U.S.C. §5335 and 5 C.F.R. §531.405:
 * Employees advance to the next step within their grade after completing
 * the required waiting period of acceptable performance:
 *
 * - Steps 1-3 to 2-4: 1 year (52 weeks)
 * - Steps 4-6 to 5-7: 2 years (104 weeks)
 * - Steps 7-9 to 8-10: 3 years (156 weeks)
 *
 * An employee at Step 10 is not eligible for further WGIs and must receive
 * a promotion to advance.
 *
 * Uses the FY2025 base table for rate lookups. For other fiscal years,
 * use lookupGSPay() with the appropriate year.
 *
 * @param grade - GS grade (1-15)
 * @param currentStep - Current GS step (1-10)
 * @returns WGIResult with eligibility, waiting period, and increase amount
 */
export function calculateWGI(
  grade: GSGrade,
  currentStep: GSStep,
): WGIResult {
  if (currentStep >= 10) {
    // Per 5 U.S.C. §5335: No WGI beyond Step 10
    const currentRate = lookupGSBaseAnnual(grade, currentStep, 2025);
    return {
      id: uuid(),
      grade,
      currentStep,
      nextStep: null,
      waitingPeriodWeeks: 0,
      waitingPeriodYears: 0,
      eligible: false,
      currentStepRate: roundCents(currentRate),
      nextStepRate: null,
      increaseAmount: null,
      authority: '5 U.S.C. §5335; 5 C.F.R. §531.405',
    };
  }

  const nextStep = (currentStep + 1) as GSStep;
  const waitingWeeks = WGI_WAITING_PERIODS[currentStep] ?? 52;
  const waitingYears = waitingWeeks / 52;

  const currentRate = lookupGSBaseAnnual(grade, currentStep, 2025);
  const nextRate = lookupGSBaseAnnual(grade, nextStep, 2025);
  const increaseAmount = roundCents(nextRate - currentRate);

  return {
    id: uuid(),
    grade,
    currentStep,
    nextStep,
    waitingPeriodWeeks: waitingWeeks,
    waitingPeriodYears: waitingYears,
    eligible: true,
    currentStepRate: roundCents(currentRate),
    nextStepRate: roundCents(nextRate),
    increaseAmount,
    authority: '5 U.S.C. §5335; 5 C.F.R. §531.405',
  };
}

/**
 * Calculate retirement contribution for FERS, CSRS, or FERS-Revised.
 *
 * Per 5 U.S.C. §8422 (FERS), 5 U.S.C. §8334 (CSRS), and DoD FMR Vol 8, Ch 3:
 *
 * - FERS (hired before 2013): Employee contributes 0.8% of basic pay.
 * - FERS-Revised (FERS-RAE, hired 2013-2013; FERS-FRAE, hired 2014+):
 *   Employee contributes 4.4% of basic pay (effective rates may vary;
 *   uses DOD_FERS_REVISED_RATE parameter).
 * - CSRS: Employee contributes 7.0% of basic pay.
 *
 * Uses DOD_FERS_EMPLOYEE_RATE and DOD_FERS_REVISED_RATE parameters from
 * the registry for the applicable fiscal year.
 *
 * @param basicPay - Biweekly basic pay amount
 * @param plan - Retirement plan type
 * @param fiscalYear - Fiscal year for rate lookup
 * @returns RetirementContributionResult with biweekly and annual amounts
 */
export function calculateRetirementContribution(
  basicPay: number,
  plan: RetirementPlanType,
  fiscalYear: number,
): RetirementContributionResult {
  let rate: number;
  let authority: string;

  switch (plan) {
    case 'fers': {
      rate = getParameter('DOD_FERS_EMPLOYEE_RATE', fiscalYear, undefined, 0.008);
      authority = '5 U.S.C. §8422; DoD FMR Vol 8, Ch 3';
      break;
    }
    case 'fers_revised': {
      rate = getParameter('DOD_FERS_REVISED_RATE', fiscalYear, undefined, 0.045);
      authority = '5 U.S.C. §8422a (FERS-RAE/FRAE); DoD FMR Vol 8, Ch 3';
      break;
    }
    case 'csrs': {
      rate = 0.07;
      authority = '5 U.S.C. §8334; DoD FMR Vol 8, Ch 3';
      break;
    }
    default: {
      const _exhaustive: never = plan;
      throw new Error(`Unknown retirement plan: ${_exhaustive}`);
    }
  }

  const employeeContribution = roundCents(basicPay * rate);
  const annualContribution = roundCents(employeeContribution * PAY_PERIODS_PER_YEAR);

  return {
    id: uuid(),
    basicPay,
    plan,
    fiscalYear,
    employeeRate: rate,
    employeeContribution,
    annualContribution,
    authority,
  };
}

/**
 * Calculate FEHB premium split between government and employee.
 *
 * Per 5 U.S.C. §8906 and DoD FMR Vol 8, Ch 4:
 * The government contribution is the lesser of:
 * (a) 72% of the weighted average of all FEHB plan premiums, or
 * (b) 75% of the total premium for the specific plan chosen.
 *
 * This implementation uses DOD_FEHB_GOV_CONTRIBUTION_PCT from the parameter
 * registry (default 72%) and representative biweekly total premiums.
 *
 * @param planType - FEHB plan category (basic, standard, high)
 * @param enrollmentType - Enrollment level (self, self_plus_one, family)
 * @param fiscalYear - Fiscal year for rate lookup
 * @returns FEHBPremiumResult with government and employee shares
 */
export function calculateFEHBPremium(
  planType: FEHBPlanType,
  enrollmentType: FEHBEnrollmentType,
  fiscalYear: number,
): FEHBPremiumResult {
  const totalPremium = FEHB_BIWEEKLY_PREMIUMS[planType]?.[enrollmentType]
    ?? FEHB_BIWEEKLY_PREMIUMS.standard.self;

  // Adjust premium for fiscal year (premiums typically increase ~3-5% annually)
  const baseYear = 2025;
  const yearDelta = fiscalYear - baseYear;
  const adjustedPremium = roundCents(totalPremium * Math.pow(1.04, yearDelta));

  const govPct = getParameter('DOD_FEHB_GOV_CONTRIBUTION_PCT', fiscalYear, undefined, 0.72);

  // Government pays the lesser of govPct of weighted average or 75% of plan premium
  const govContribByPct = roundCents(adjustedPremium * govPct);
  const govContrib75 = roundCents(adjustedPremium * 0.75);
  const governmentContribution = Math.min(govContribByPct, govContrib75);

  const employeeContribution = roundCents(adjustedPremium - governmentContribution);

  return {
    id: uuid(),
    planType,
    enrollmentType,
    fiscalYear,
    totalBiweeklyPremium: adjustedPremium,
    governmentContribution,
    employeeContribution,
    governmentPct: govPct,
    authority: '5 U.S.C. §8906; DoD FMR Vol 8, Ch 4',
  };
}

/**
 * Calculate civilian TSP contribution and agency matching.
 *
 * Per 5 U.S.C. §8432 and DoD FMR Vol 8, Ch 3:
 * For FERS employees (including FERS-Revised), the agency provides:
 * - Automatic 1% of basic pay (regardless of employee contribution).
 * - Dollar-for-dollar match on the first 3% of basic pay contributed.
 * - 50-cents-per-dollar match on the next 2% of basic pay contributed.
 * - Maximum government contribution: 5% of basic pay (1% + 3% + 1%).
 *
 * CSRS employees receive no agency matching but may make elective
 * contributions. This function calculates matching for FERS-eligible
 * employees.
 *
 * @param basicPay - Biweekly basic pay amount
 * @param contributionPct - Employee contribution as decimal (e.g., 0.05 = 5%)
 * @param fiscalYear - Fiscal year for limit lookups
 * @returns CivilianTSPResult with contribution breakdown
 */
export function calculateCivilianTSP(
  basicPay: number,
  contributionPct: number,
  fiscalYear: number,
): CivilianTSPResult {
  const annualLimit = getParameter('DOD_TSP_ELECTIVE_LIMIT', fiscalYear, undefined, 23500);

  // Clamp contribution percentage
  const effectivePct = Math.min(Math.max(contributionPct, 0), 1.0);

  // Employee contribution (biweekly)
  const memberContribution = roundCents(basicPay * effectivePct);

  // Agency automatic 1%
  const agencyAutomatic = roundCents(basicPay * 0.01);

  // Dollar-for-dollar match on first 3%
  const first3Pct = Math.min(effectivePct, 0.03);
  const agencyMatchFirst3 = roundCents(basicPay * first3Pct);

  // 50-cent match on next 2%
  const next2Pct = Math.max(0, Math.min(effectivePct - 0.03, 0.02));
  const agencyMatchNext2 = roundCents(basicPay * next2Pct * 0.50);

  const totalAgencyContribution = roundCents(agencyAutomatic + agencyMatchFirst3 + agencyMatchNext2);
  const totalContribution = roundCents(memberContribution + totalAgencyContribution);

  // Check annual elective deferral limit (employee contributions only)
  const annualEmployeeContribution = memberContribution * PAY_PERIODS_PER_YEAR;
  const exceedsAnnualLimit = annualEmployeeContribution > annualLimit;

  return {
    id: uuid(),
    basicPay,
    memberContributionPct: effectivePct,
    memberContribution,
    agencyAutomatic,
    agencyMatchFirst3,
    agencyMatchNext2,
    totalAgencyContribution,
    totalContribution,
    annualElectiveLimit: annualLimit,
    exceedsAnnualLimit,
    authority: '5 U.S.C. §8432; DoD FMR Vol 8, Ch 3',
  };
}

/**
 * Calculate premium pay for overtime, night differential, Sunday, or
 * holiday work.
 *
 * Per 5 U.S.C. §§5542-5547 and DoD FMR Vol 8, Ch 4:
 *
 * - Overtime (5 U.S.C. §5542): 1.5x the employee's hourly rate for hours
 *   in excess of 8 per day or 40 per week.
 * - Night differential (5 U.S.C. §5545(a)): 10% of basic rate for work
 *   performed between 6:00 PM and 6:00 AM.
 * - Sunday premium (5 U.S.C. §5546(a)): 25% of basic rate for regularly
 *   scheduled non-overtime work performed on Sunday.
 * - Holiday premium (5 U.S.C. §5546(b)): 100% of basic rate for
 *   non-overtime work on a federal holiday (double time).
 *
 * Premium pay cap (5 U.S.C. §5547): Total premium pay plus basic pay in
 * any pay period may not exceed the greater of GS-15/Step 10 rate (with
 * locality) or Level V of the Executive Schedule, unless a waiver applies.
 * Uses DOD_PREMIUM_PAY_CAP parameter from the registry.
 *
 * @param basicPay - Annual basic pay (locality-adjusted)
 * @param hours - Number of premium hours worked
 * @param type - Type of premium pay
 * @returns PremiumPayResult with computed premium amount
 */
export function calculatePremiumPay(
  basicPay: number,
  hours: number,
  type: PremiumPayType,
): PremiumPayResult {
  if (hours <= 0) {
    return {
      id: uuid(),
      basicPay,
      hours: 0,
      type,
      hourlyRate: roundCents(basicPay / OPM_HOURS_PER_YEAR),
      multiplier: 0,
      premiumAmount: 0,
      premiumPayCapApplied: false,
      authority: '5 U.S.C. §§5542-5546; DoD FMR Vol 8, Ch 4',
    };
  }

  const hourlyRate = basicPay / OPM_HOURS_PER_YEAR;
  let multiplier: number;
  let authority: string;

  switch (type) {
    case 'overtime':
      // 5 U.S.C. §5542: 1.5x the hourly rate
      multiplier = 1.5;
      authority = '5 U.S.C. §5542; DoD FMR Vol 8, Ch 4';
      break;
    case 'night':
      // 5 U.S.C. §5545(a): 10% differential
      multiplier = 0.10;
      authority = '5 U.S.C. §5545(a); DoD FMR Vol 8, Ch 4';
      break;
    case 'sunday':
      // 5 U.S.C. §5546(a): 25% premium
      multiplier = 0.25;
      authority = '5 U.S.C. §5546(a); DoD FMR Vol 8, Ch 4';
      break;
    case 'holiday':
      // 5 U.S.C. §5546(b): 100% premium (double time)
      multiplier = 1.0;
      authority = '5 U.S.C. §5546(b); DoD FMR Vol 8, Ch 4';
      break;
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown premium pay type: ${_exhaustive}`);
    }
  }

  const premiumAmount = roundCents(hourlyRate * multiplier * hours);

  // Premium pay cap check per 5 U.S.C. §5547
  // The cap is the biweekly equivalent of the DOD_PREMIUM_PAY_CAP (annual)
  // We flag if the premium would push compensation above the cap
  const capAnnual = getParameter('DOD_PREMIUM_PAY_CAP', 2025, undefined, 196300);
  const biweeklyCap = capAnnual / PAY_PERIODS_PER_YEAR;
  const biweeklyBasic = basicPay / PAY_PERIODS_PER_YEAR;
  const premiumPayCapApplied = (biweeklyBasic + premiumAmount) > biweeklyCap;

  return {
    id: uuid(),
    basicPay,
    hours,
    type,
    hourlyRate: roundCents(hourlyRate),
    multiplier,
    premiumAmount,
    premiumPayCapApplied,
    authority,
  };
}

/**
 * Calculate total civilian compensation by rolling up all components.
 *
 * Per DoD FMR Vol 8, total civilian compensation includes:
 * - GS base pay + locality adjustment (5 U.S.C. §§5332, 5304)
 * - Agency TSP contributions (5 U.S.C. §8432)
 * - Premium pay for overtime/night/Sunday/holiday (5 U.S.C. §§5542-5546)
 * Less:
 * - Employee retirement contributions (5 U.S.C. §§8334, 8422)
 * - Employee FEHB share (5 U.S.C. §8906)
 * - Employee TSP contributions (5 U.S.C. §8432)
 * - Other deductions
 *
 * All amounts are computed on a biweekly basis (26 pay periods per year)
 * and then annualized.
 *
 * @param params - CivilianCompensationInput with all compensation parameters
 * @returns CivilianCompensationResult with complete breakdown
 */
export function calculateCivilianCompensation(
  params: CivilianCompensationInput,
): CivilianCompensationResult {
  // 1. GS Pay
  const gsPay = lookupGSPay(params.grade, params.step, params.locality, params.fiscalYear);

  // 2. Retirement contribution (biweekly)
  const retirement = calculateRetirementContribution(
    gsPay.biweeklyRate,
    params.retirementPlan,
    params.fiscalYear,
  );

  // 3. FEHB premium
  const fehb = calculateFEHBPremium(
    params.fehbPlanType,
    params.fehbEnrollmentType,
    params.fiscalYear,
  );

  // 4. TSP (biweekly)
  const tsp = calculateCivilianTSP(
    gsPay.biweeklyRate,
    params.tspContributionPct,
    params.fiscalYear,
  );

  // 5. Premium pay (all types, based on annual adjusted pay)
  const premiumPays: PremiumPayResult[] = [];
  if (params.overtimeHours && params.overtimeHours > 0) {
    premiumPays.push(calculatePremiumPay(gsPay.annualAdjusted, params.overtimeHours, 'overtime'));
  }
  if (params.nightHours && params.nightHours > 0) {
    premiumPays.push(calculatePremiumPay(gsPay.annualAdjusted, params.nightHours, 'night'));
  }
  if (params.sundayHours && params.sundayHours > 0) {
    premiumPays.push(calculatePremiumPay(gsPay.annualAdjusted, params.sundayHours, 'sunday'));
  }
  if (params.holidayHours && params.holidayHours > 0) {
    premiumPays.push(calculatePremiumPay(gsPay.annualAdjusted, params.holidayHours, 'holiday'));
  }

  // Convert premium pay to biweekly equivalent (assume premium hours are per pay period)
  const totalPremiumBiweekly = premiumPays.reduce((sum, pp) => sum + pp.premiumAmount, 0);

  // 6. Roll up (all biweekly)
  const totalBiweeklyGross = roundCents(
    gsPay.biweeklyRate +
    tsp.totalAgencyContribution +
    totalPremiumBiweekly,
  );

  const totalBiweeklyDeductions = roundCents(
    retirement.employeeContribution +
    fehb.employeeContribution +
    tsp.memberContribution +
    (params.additionalDeductions ?? 0),
  );

  const totalBiweeklyNet = roundCents(totalBiweeklyGross - totalBiweeklyDeductions);
  const totalAnnualCompensation = roundCents(totalBiweeklyNet * PAY_PERIODS_PER_YEAR);

  return {
    id: uuid(),
    grade: params.grade,
    step: params.step,
    locality: normalizeLocality(params.locality),
    fiscalYear: params.fiscalYear,
    gsPay,
    retirement,
    fehb,
    tsp,
    premiumPay: premiumPays,
    totalBiweeklyGross,
    totalBiweeklyDeductions,
    totalBiweeklyNet,
    totalAnnualCompensation,
  };
}
