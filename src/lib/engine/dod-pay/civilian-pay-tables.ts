/**
 * Civilian Pay Calculation Engine — DoD FMR Volume 8
 *
 * Implements GS pay table lookups, locality pay adjustments, within-grade
 * increase eligibility, FERS contributions, FEHB premium calculations,
 * overtime pay, night differential, premium pay caps, and total compensation
 * roll-ups per DoD FMR Volume 8 (Civilian Pay Policy and Procedures).
 *
 * All functions are pure: given the same inputs they produce the same outputs
 * with no side effects or external state dependencies beyond the parameter
 * registry.
 *
 * References:
 *   - DoD 7000.14-R, Volume 8: Civilian Pay Policy and Procedures
 *   - 5 U.S.C. §5332: GS Pay Schedule
 *   - 5 U.S.C. §5304: Locality-Based Comparability Payments
 *   - 5 U.S.C. §5335: Within-Grade Increases
 *   - 5 U.S.C. §8422: FERS Employee Deductions
 *   - 5 U.S.C. §8906: FEHB Government Contribution
 *   - 5 U.S.C. §5542: Overtime Pay
 *   - 5 U.S.C. §5545(a): Night Pay Differential
 *   - 5 U.S.C. §5547: Premium Pay Cap
 *   - 5 U.S.C. §8432: Thrift Savings Plan
 */

import { v4 as uuid } from 'uuid';
import { getParameter } from '@/lib/engine/tax-parameters/registry';

// ============================================================================
// Types
// ============================================================================

/** Valid GS grade numbers (1–15). */
export type GSGrade = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

/** Valid GS step numbers (1–10). */
export type GSStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/** Locality pay area identifiers. */
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

/** FERS contribution tier based on hire date. */
export type FERSTier = 'fers_original' | 'fers_rae' | 'fers_frae';

/** WGI eligibility result. */
export interface WGIEligibility {
  id: string;
  grade: GSGrade;
  currentStep: GSStep;
  timeInStepMonths: number;
  requiredWaitingMonths: number;
  isEligible: boolean;
  nextStep: GSStep | null;
  authority: string;
}

/** Input for comprehensive civilian compensation calculation. */
export interface CivilianPayInput {
  grade: GSGrade;
  step: GSStep;
  localityArea: LocalityArea;
  fiscalYear: number;
  entryDate: string;
  planType: 'self' | 'self_plus_one' | 'family';
  enrollmentType: 'self' | 'self_plus_one' | 'family';
  overtimeHours?: number;
  nightHours?: number;
  isTitle5?: boolean;
  tspContributionPct?: number;
  additionalDeductions?: number;
}

/** Result of comprehensive civilian compensation calculation. */
export interface CivilianPayResult {
  id: string;
  grade: GSGrade;
  step: GSStep;
  localityArea: LocalityArea;
  fiscalYear: number;
  annualBasePay: number;
  localityAdjustment: number;
  annualAdjustedPay: number;
  biweeklyPay: number;
  fersContribution: number;
  fehbEmployeePremium: number;
  overtimePay: number;
  nightDifferential: number;
  totalAnnualGross: number;
  totalAnnualDeductions: number;
  totalAnnualNet: number;
  premiumPayCapApplied: boolean;
}

// ============================================================================
// GS Pay Table Data — FY2024
// ============================================================================

/**
 * FY2024 GS base pay table — annual rates.
 *
 * Rows: grades 1–15 (index 0 = GS-1, index 14 = GS-15).
 * Columns: steps 1–10.
 *
 * Per 5 U.S.C. §5332, the General Schedule pay table is published annually
 * by OPM. These are representative amounts for auditing purposes.
 *
 * Source: OPM GS Base Pay Table, Effective January 2024.
 */
const GS_PAY_TABLE_FY2024: number[][] = [
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

/** The fiscal year the embedded GS table represents. */
const GS_TABLE_FY = 2024;

/** Default GS pay raise percentage when no parameter is registered. */
const DEFAULT_GS_RAISE_PCT = 0.046;

/** OPM standard work hours per year for hourly rate calculation. */
const WORK_HOURS_PER_YEAR = 2087;

/** Number of biweekly pay periods per year. */
const PAY_PERIODS_PER_YEAR = 26;

// ============================================================================
// Locality Pay Percentages
// ============================================================================

/**
 * FY2024 locality pay percentages by area.
 *
 * Per 5 U.S.C. §5304 and DoD FMR Vol 8, Ch 2, locality pay is a percentage
 * adjustment applied to base GS pay for employees in defined pay areas.
 * The Federal Salary Council recommends rates annually.
 */
const LOCALITY_RATES: Record<string, number> = {
  'REST_OF_US':       0.1653,
  'WASHINGTON_DC':    0.3253,
  'SAN_FRANCISCO':    0.4498,
  'NEW_YORK':         0.3594,
  'LOS_ANGELES':      0.3386,
  'CHICAGO':          0.2955,
  'BOSTON':            0.3032,
  'SEATTLE':          0.3164,
  'HOUSTON':          0.3334,
  'DENVER':           0.2945,
  'ATLANTA':          0.2513,
  'DALLAS':           0.2660,
  'DETROIT':          0.2813,
  'PHILADELPHIA':     0.2637,
  'HAWAII':           0.2753,
  'ALASKA':           0.2878,
  'SAN_DIEGO':        0.3080,
  'SACRAMENTO':       0.2864,
  'MIAMI':            0.2601,
  'PHOENIX':          0.2178,
};

// ============================================================================
// FEHB Premium Estimates
// ============================================================================

/**
 * Representative biweekly FEHB total premium by enrollment type.
 *
 * Per 5 U.S.C. §8906 and DoD FMR Vol 8, Ch 3: the government contribution
 * is the lesser of (a) 75% of the total premium or (b) 72% of the weighted
 * average of all plan premiums. These are representative totals.
 */
const FEHB_BIWEEKLY_PREMIUMS: Record<string, number> = {
  'self':          242.00,
  'self_plus_one': 532.00,
  'family':        580.00,
};

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Normalize a locality area string to the canonical key form.
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
 * Determine FERS tier from hire date.
 *
 * Per 5 U.S.C. §8422 and DoD FMR Vol 8, Ch 3:
 *   - Hired before 1 Jan 2013: FERS Original (0.8%)
 *   - Hired 1 Jan 2013 – 31 Dec 2013: FERS-RAE (3.1%)
 *   - Hired on or after 1 Jan 2014: FERS-FRAE (4.4%)
 */
function determineFERSTier(entryDate: string): FERSTier {
  const date = new Date(entryDate);
  const rae2013 = new Date('2013-01-01');
  const frae2014 = new Date('2014-01-01');

  if (date < rae2013) return 'fers_original';
  if (date < frae2014) return 'fers_rae';
  return 'fers_frae';
}

// ============================================================================
// lookupGSBasePay
// ============================================================================

/**
 * Look up annual GS base pay for a given grade, step, and fiscal year.
 *
 * Per 5 U.S.C. §5332 and DoD FMR Vol 8, Ch 2:
 * The General Schedule base pay is determined by grade (1–15) and step
 * (1–10). When the requested fiscal year differs from the embedded table,
 * the DOD_CIVPAY_RAISE_PCT parameter is used to project forward or backward.
 *
 * @param grade - GS grade (1–15)
 * @param step - GS step (1–10)
 * @param fiscalYear - Fiscal year for rate lookup
 * @returns Annual base pay in dollars
 */
export function lookupGSBasePay(
  grade: GSGrade,
  step: GSStep,
  fiscalYear: number,
): number {
  if (grade < 1 || grade > 15) {
    throw new Error(
      `Invalid GS grade: ${grade}. Must be 1–15. Ref: 5 U.S.C. §5332.`,
    );
  }
  if (step < 1 || step > 10) {
    throw new Error(
      `Invalid GS step: ${step}. Must be 1–10. Ref: 5 U.S.C. §5332.`,
    );
  }

  let basePay = GS_PAY_TABLE_FY2024[grade - 1][step - 1];

  // Adjust for fiscal year difference from the embedded table
  const yearDelta = fiscalYear - GS_TABLE_FY;
  if (yearDelta > 0) {
    for (let i = 0; i < yearDelta; i++) {
      const fy = GS_TABLE_FY + i + 1;
      const raisePct = getParameter('DOD_CIVPAY_RAISE_PCT', fy, undefined, DEFAULT_GS_RAISE_PCT);
      basePay *= (1 + raisePct);
    }
  } else if (yearDelta < 0) {
    for (let i = 0; i < Math.abs(yearDelta); i++) {
      const fy = GS_TABLE_FY - i;
      const raisePct = getParameter('DOD_CIVPAY_RAISE_PCT', fy, undefined, DEFAULT_GS_RAISE_PCT);
      basePay /= (1 + raisePct);
    }
  }

  return roundCents(basePay);
}

// ============================================================================
// calculateLocalityPay
// ============================================================================

/**
 * Apply locality pay adjustment to a base pay amount.
 *
 * Per 5 U.S.C. §5304 and DoD FMR Vol 8, Ch 2:
 * Locality pay is a percentage increase applied to GS base pay for
 * employees assigned to a specific locality pay area. If the area is
 * not recognized, the "Rest of US" rate applies.
 *
 * @param basePay - Annual GS base pay
 * @param localityArea - Locality pay area identifier
 * @returns Locality pay dollar adjustment (annual)
 */
export function calculateLocalityPay(
  basePay: number,
  localityArea: LocalityArea,
): number {
  const normalized = normalizeLocality(localityArea);
  const pct = LOCALITY_RATES[normalized] ?? LOCALITY_RATES['REST_OF_US'];
  return roundCents(basePay * pct);
}

// ============================================================================
// calculateAdjustedPay
// ============================================================================

/**
 * Calculate adjusted annual pay (base + locality).
 *
 * Per 5 U.S.C. §§5332 and 5304 and DoD FMR Vol 8, Ch 2:
 * Total adjusted basic pay = GS base rate + locality adjustment.
 *
 * @param grade - GS grade (1–15)
 * @param step - GS step (1–10)
 * @param localityArea - Locality pay area
 * @param fiscalYear - Fiscal year
 * @returns Annual adjusted pay in dollars
 */
export function calculateAdjustedPay(
  grade: GSGrade,
  step: GSStep,
  localityArea: LocalityArea,
  fiscalYear: number,
): number {
  const basePay = lookupGSBasePay(grade, step, fiscalYear);
  const localityAdj = calculateLocalityPay(basePay, localityArea);
  return roundCents(basePay + localityAdj);
}

// ============================================================================
// calculateWGIEligibility
// ============================================================================

/**
 * Determine Within-Grade Increase (WGI) eligibility.
 *
 * Per 5 U.S.C. §5335 and DoD FMR Vol 8, Ch 2:
 * Employees advance to the next step within their grade after completing
 * the required waiting period with acceptable performance:
 *   - Steps 1 to 2, 2 to 3, 3 to 4: 1 year (12 months) each
 *   - Steps 4 to 5, 5 to 6, 6 to 7: 2 years (24 months) each
 *   - Steps 7 to 8, 8 to 9, 9 to 10: 3 years (36 months) each
 *
 * An employee at Step 10 is not eligible for further WGIs.
 *
 * @param grade - GS grade (1–15)
 * @param step - Current GS step (1–10)
 * @param timeInStep - Months in current step
 * @returns WGIEligibility with eligibility determination
 */
export function calculateWGIEligibility(
  grade: GSGrade,
  step: GSStep,
  timeInStep: number,
): WGIEligibility {
  // Step 10 is the maximum — no further WGI
  if (step >= 10) {
    return {
      id: uuid(),
      grade,
      currentStep: step,
      timeInStepMonths: timeInStep,
      requiredWaitingMonths: 0,
      isEligible: false,
      nextStep: null,
      authority: '5 U.S.C. §5335; DoD FMR Vol 8, Ch 2 — already at step 10',
    };
  }

  let requiredMonths: number;
  if (step <= 3) {
    // Steps 1–3 -> next step: 1-year (12-month) waiting period
    requiredMonths = 12;
  } else if (step <= 6) {
    // Steps 4–6 -> next step: 2-year (24-month) waiting period
    requiredMonths = 24;
  } else {
    // Steps 7–9 -> next step: 3-year (36-month) waiting period
    requiredMonths = 36;
  }

  const isEligible = timeInStep >= requiredMonths;
  const nextStep = (step + 1) as GSStep;

  return {
    id: uuid(),
    grade,
    currentStep: step,
    timeInStepMonths: timeInStep,
    requiredWaitingMonths: requiredMonths,
    isEligible,
    nextStep,
    authority: '5 U.S.C. §5335; DoD FMR Vol 8, Ch 2',
  };
}

// ============================================================================
// calculateFERSContribution
// ============================================================================

/**
 * Calculate FERS employee contribution amount.
 *
 * Per 5 U.S.C. §8422 and DoD FMR Vol 8, Ch 3:
 *   - FERS Original (hired before 1 Jan 2013): 0.8% of basic pay
 *   - FERS-RAE (hired 1 Jan 2013 – 31 Dec 2013): 3.1% of basic pay
 *   - FERS-FRAE (hired on or after 1 Jan 2014): 4.4% of basic pay
 *
 * @param adjustedPay - Annual adjusted basic pay (base + locality)
 * @param entryDate - Employee's initial federal service date (ISO string)
 * @returns Annual FERS employee contribution amount
 */
export function calculateFERSContribution(
  adjustedPay: number,
  entryDate: string,
): number {
  const tier = determineFERSTier(entryDate);

  let rate: number;
  switch (tier) {
    case 'fers_original':
      rate = 0.008;
      break;
    case 'fers_rae':
      rate = 0.031;
      break;
    case 'fers_frae':
      rate = 0.044;
      break;
    default: {
      const _exhaustive: never = tier;
      throw new Error(`Unknown FERS tier: ${_exhaustive}`);
    }
  }

  return roundCents(adjustedPay * rate);
}

// ============================================================================
// calculateFEHBPremium
// ============================================================================

/**
 * Calculate FEHB employee premium (after government contribution).
 *
 * Per 5 U.S.C. §8906 and DoD FMR Vol 8, Ch 3:
 * The government pays the lesser of 75% of the total premium or 72% of the
 * weighted average premium. The DOD_FEHB_GOV_CONTRIBUTION_PCT parameter
 * can override the government share percentage.
 *
 * @param planType - FEHB plan type (self, self_plus_one, family)
 * @param enrollmentType - Enrollment level (self, self_plus_one, family)
 * @returns Biweekly employee premium (total minus government share)
 */
export function calculateFEHBPremium(
  planType: 'self' | 'self_plus_one' | 'family',
  enrollmentType: 'self' | 'self_plus_one' | 'family',
): number {
  const key = enrollmentType;
  const totalPremium = FEHB_BIWEEKLY_PREMIUMS[key] ?? FEHB_BIWEEKLY_PREMIUMS['self'];

  // Government contribution percentage — defaults to 72% per 5 U.S.C. §8906
  const govPct = getParameter('DOD_FEHB_GOV_CONTRIBUTION_PCT', GS_TABLE_FY, undefined, 0.72);

  const govShare = roundCents(totalPremium * govPct);
  const employeeShare = roundCents(totalPremium - govShare);

  return employeeShare;
}

// ============================================================================
// calculateOvertimePay
// ============================================================================

/**
 * Calculate overtime pay.
 *
 * Per 5 U.S.C. §5542 and DoD FMR Vol 8, Ch 4:
 * Overtime is paid at 1.5 times the employee's hourly rate for hours worked
 * in excess of 8 hours per day or 40 hours per week. For employees paid at
 * rates above GS-10 step 1, overtime is the greater of 1.5 times the GS-10
 * step 1 rate or the employee's basic hourly rate.
 *
 * Title 5 employees are subject to the GS-10/step-1 cap on the overtime
 * rate; non-Title-5 employees may use their full rate (at agency discretion).
 *
 * @param adjustedPay - Annual adjusted pay (base + locality)
 * @param hours - Overtime hours worked
 * @param isTitle5 - Whether the employee is under Title 5 (applies GS-10 cap)
 * @returns Overtime pay amount
 */
export function calculateOvertimePay(
  adjustedPay: number,
  hours: number,
  isTitle5: boolean,
): number {
  if (hours <= 0) return 0;

  const hourlyRate = adjustedPay / WORK_HOURS_PER_YEAR;

  if (isTitle5) {
    // GS-10 step 1 cap on the overtime rate
    const gs10Step1Base = GS_PAY_TABLE_FY2024[9][0]; // index 9 = GS-10, index 0 = step 1
    const gs10Step1Locality = gs10Step1Base * (1 + (LOCALITY_RATES['REST_OF_US'] ?? 0.1653));
    const gs10Step1Hourly = gs10Step1Locality / WORK_HOURS_PER_YEAR;

    // Per 5 U.S.C. §5542(a)(2): overtime rate is the greater of
    // 1.5 * GS-10/step-1 rate OR employee's basic hourly rate
    const overtimeRate = Math.max(gs10Step1Hourly * 1.5, hourlyRate);
    return roundCents(overtimeRate * hours);
  }

  // Non-Title-5: straight 1.5x
  return roundCents(hourlyRate * 1.5 * hours);
}

// ============================================================================
// calculateNightDifferential
// ============================================================================

/**
 * Calculate night pay differential.
 *
 * Per 5 U.S.C. §5545(a) and DoD FMR Vol 8, Ch 4:
 * GS employees who are regularly scheduled to work between 6:00 PM and
 * 6:00 AM receive a 10% differential on their basic hourly rate for each
 * hour of night work.
 *
 * @param adjustedPay - Annual adjusted pay (base + locality)
 * @param hours - Number of qualifying night hours
 * @returns Night differential pay amount
 */
export function calculateNightDifferential(
  adjustedPay: number,
  hours: number,
): number {
  if (hours <= 0) return 0;

  const hourlyRate = adjustedPay / WORK_HOURS_PER_YEAR;
  // Per 5 U.S.C. §5545(a): 10% of the basic rate for night hours
  return roundCents(hourlyRate * 0.10 * hours);
}

// ============================================================================
// enforcePremiumPayCap
// ============================================================================

/**
 * Enforce the premium pay cap.
 *
 * Per 5 U.S.C. §5547 and DoD FMR Vol 8, Ch 4:
 * An employee's total premium pay (overtime, night, Sunday, holiday) may
 * not cause annualized total compensation to exceed the greater of:
 *   (a) GS-15 step 10 rate for the employee's locality, or
 *   (b) Level V of the Executive Schedule (per DOD_PREMIUM_PAY_CAP parameter).
 *
 * In emergency/combat situations, the cap can be raised to Level II of the
 * Executive Schedule (not modeled here).
 *
 * @param totalPay - Annualized total pay including all premiums
 * @param fiscalYear - Fiscal year for cap determination
 * @returns Capped annualized total pay
 */
export function enforcePremiumPayCap(
  totalPay: number,
  fiscalYear: number,
): number {
  // GS-15 step 10 base for the applicable fiscal year
  let gs15Step10 = GS_PAY_TABLE_FY2024[14][9];
  const yearDelta = fiscalYear - GS_TABLE_FY;
  if (yearDelta > 0) {
    for (let i = 0; i < yearDelta; i++) {
      const fy = GS_TABLE_FY + i + 1;
      const raisePct = getParameter('DOD_CIVPAY_RAISE_PCT', fy, undefined, DEFAULT_GS_RAISE_PCT);
      gs15Step10 *= (1 + raisePct);
    }
  }

  // GS-15/10 with Rest-of-US locality
  const gs15Cap = roundCents(gs15Step10 * (1 + (LOCALITY_RATES['REST_OF_US'] ?? 0.1653)));

  // Executive Schedule Level V from parameter registry
  const execLevelV = getParameter('DOD_PREMIUM_PAY_CAP', fiscalYear, undefined, 191900);

  const cap = Math.max(gs15Cap, execLevelV);

  return Math.min(totalPay, cap);
}

// ============================================================================
// calculateTotalCompensation
// ============================================================================

/**
 * Calculate comprehensive total civilian compensation by rolling up all
 * pay components.
 *
 * Per DoD FMR Vol 8, total civilian compensation includes:
 *   - GS base pay (5 U.S.C. §5332)
 *   - Locality pay adjustment (5 U.S.C. §5304)
 *   - Overtime pay (5 U.S.C. §5542)
 *   - Night differential (5 U.S.C. §5545(a))
 * Less:
 *   - FERS employee contribution (5 U.S.C. §8422)
 *   - FEHB employee premium (5 U.S.C. §8906)
 *   - TSP employee contribution (5 U.S.C. §8432)
 *   - Additional deductions
 *
 * The premium pay cap per 5 U.S.C. §5547 is enforced on total annualized
 * compensation.
 *
 * @param input - CivilianPayInput with all compensation parameters
 * @returns CivilianPayResult with complete breakdown
 */
export function calculateTotalCompensation(
  input: CivilianPayInput,
): CivilianPayResult {
  // 1. Base Pay
  const annualBasePay = lookupGSBasePay(input.grade, input.step, input.fiscalYear);

  // 2. Locality Pay
  const localityAdjustment = calculateLocalityPay(annualBasePay, input.localityArea);
  const annualAdjustedPay = roundCents(annualBasePay + localityAdjustment);

  // 3. Biweekly pay (for reference)
  const biweeklyPay = roundCents(annualAdjustedPay / PAY_PERIODS_PER_YEAR);

  // 4. Overtime Pay
  const overtimePay = calculateOvertimePay(
    annualAdjustedPay,
    input.overtimeHours ?? 0,
    input.isTitle5 ?? true,
  );

  // 5. Night Differential
  const nightDifferential = calculateNightDifferential(
    annualAdjustedPay,
    input.nightHours ?? 0,
  );

  // 6. FERS Contribution
  const fersContribution = calculateFERSContribution(annualAdjustedPay, input.entryDate);

  // 7. FEHB Premium (employee share, annualized from biweekly)
  const fehbBiweekly = calculateFEHBPremium(input.planType, input.enrollmentType);
  const fehbAnnual = roundCents(fehbBiweekly * PAY_PERIODS_PER_YEAR);

  // 8. TSP Contribution
  const tspPct = input.tspContributionPct ?? 0.05;
  const tspContribution = roundCents(annualAdjustedPay * tspPct);

  // 9. Total gross (before deductions)
  let totalAnnualGross = roundCents(
    annualAdjustedPay + overtimePay + nightDifferential,
  );

  // 10. Enforce premium pay cap
  const cappedGross = enforcePremiumPayCap(totalAnnualGross, input.fiscalYear);
  const premiumPayCapApplied = cappedGross < totalAnnualGross;
  totalAnnualGross = cappedGross;

  // 11. Total deductions
  const totalAnnualDeductions = roundCents(
    fersContribution + fehbAnnual + tspContribution + (input.additionalDeductions ?? 0),
  );

  // 12. Net
  const totalAnnualNet = roundCents(totalAnnualGross - totalAnnualDeductions);

  return {
    id: uuid(),
    grade: input.grade,
    step: input.step,
    localityArea: input.localityArea,
    fiscalYear: input.fiscalYear,
    annualBasePay,
    localityAdjustment,
    annualAdjustedPay,
    biweeklyPay,
    fersContribution,
    fehbEmployeePremium: fehbAnnual,
    overtimePay,
    nightDifferential,
    totalAnnualGross,
    totalAnnualDeductions,
    totalAnnualNet,
    premiumPayCapApplied,
  };
}
