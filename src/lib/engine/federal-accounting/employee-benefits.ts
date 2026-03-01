/**
 * Federal Employee Benefits Actuarial Validation Engine
 *
 * Validates the recognition, measurement, and disclosure of federal employee
 * benefit liabilities and associated imputed financing costs. Federal agencies
 * must report actuarial liabilities for:
 *
 *   1. Military Retirement (SFFAS 5, paras 57-67)
 *      - Defined benefit pension for uniformed service members
 *      - Administered by the Military Retirement Fund (MRF)
 *
 *   2. FERS/CSRS Pension Liabilities
 *      - Federal Employees Retirement System (FERS) - defined benefit + TSP
 *      - Civil Service Retirement System (CSRS) - defined benefit only
 *      - OPM administers; employing agencies recognize imputed costs
 *
 *   3. OPEB - Retiree Health Benefits (SFFAS 5, paras 80-96)
 *      - Federal Employees Health Benefits (FEHB) for retirees
 *      - Post-retirement health care liability
 *
 *   4. TSP Matching Obligations
 *      - Thrift Savings Plan employer matching for FERS participants
 *      - Agency recognizes cost when matching contributions vest
 *
 *   5. FECA (Federal Employees' Compensation Act)
 *      - Workers' compensation actuarial liability
 *      - Department of Labor administers; agencies recognize imputed costs
 *
 * Imputed Financing Costs (SFFAS 5, paras 97-104):
 *   Costs of benefits provided to agency employees but funded by other
 *   entities (OPM, Treasury, DoL) are recognized as imputed costs with
 *   an offsetting imputed financing source.
 *
 * References:
 *   - DoD FMR Vol. 4, Ch. 12 (Federal Employee Benefits)
 *   - SFFAS 5 (Accounting for Liabilities of the Federal Government)
 *   - SFFAS 33 (Pensions, ORB, and OPEB)
 *   - OMB Circular A-136, Section II.4 (Note Disclosures)
 *   - FASAB Technical Bulletin 2006-1 (Imputed Costs)
 */

import type { EngagementData } from '@/types/findings';
import type { ActuarialLiability, ActuarialAssumptions, BenefitType } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BenefitsValidationResult {
  fiscalYear: number;
  totalLiabilities: number;
  totalImputedCosts: number;
  findings: BenefitsFinding[];
  benefitSummary: Record<BenefitType, { liability: number; imputedCost: number; funded: number; unfunded: number }>;
}

export interface BenefitsFinding {
  benefitType: BenefitType;
  findingType: 'missing_liability' | 'stale_valuation' | 'unreasonable_assumptions' | 'imputed_cost_missing' | 'funding_gap' | 'disclosure_missing';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  amountImpact: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * All benefit types that must be recognized on the financial statements per
 * SFFAS 5 and DoD FMR Vol. 4, Ch. 12.
 */
const REQUIRED_BENEFIT_TYPES: BenefitType[] = [
  'military_retirement',
  'fers',
  'csrs',
  'opeb_health',
  'tsp_matching',
  'feca',
];

/**
 * Treasury long-term discount rate baseline. Per SFFAS 33, the discount
 * rate used for actuarial valuations should approximate Treasury rates for
 * securities of comparable maturity. A tolerance of +/- 2% is applied
 * for reasonableness checks.
 */
const TREASURY_BASELINE_DISCOUNT_RATE = 0.04;
const DISCOUNT_RATE_TOLERANCE = 0.02;

/**
 * Maximum age of a valuation before it is considered stale. Per SFFAS 33,
 * actuarial valuations should be performed at least annually for material
 * liabilities. A valuation older than one year (365 days) is flagged.
 */
const STALE_VALUATION_DAYS = 365;

/**
 * Reasonable assumption bounds for actuarial inputs.
 * These align with historical federal experience and OMB economic assumptions.
 */
const REASONABLE_SALARY_GROWTH_MIN = 0.005;
const REASONABLE_SALARY_GROWTH_MAX = 0.06;
const REASONABLE_COLA_MIN = 0.0;
const REASONABLE_COLA_MAX = 0.05;
const REASONABLE_INFLATION_MIN = 0.005;
const REASONABLE_INFLATION_MAX = 0.06;

/**
 * Recognized current mortality tables for federal actuarial valuations.
 * The RP-2014 and MP-2021+ projection scales are standard for federal plans.
 */
const ACCEPTED_MORTALITY_TABLES = [
  'RP-2014',
  'RP-2006',
  'MP-2021',
  'MP-2022',
  'MP-2023',
  'MP-2024',
  'MP-2025',
  'CSO-2017',
  'PRI-2012',
];

/**
 * Funding gap threshold. If the unfunded portion exceeds this fraction of
 * the total liability, a funding gap finding is raised.
 */
const FUNDING_GAP_THRESHOLD = 0.25;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function daysSince(dateStr: string): number {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return Infinity;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function emptyBenefitSummary(): Record<BenefitType, { liability: number; imputedCost: number; funded: number; unfunded: number }> {
  const summary = {} as Record<BenefitType, { liability: number; imputedCost: number; funded: number; unfunded: number }>;
  for (const bt of REQUIRED_BENEFIT_TYPES) {
    summary[bt] = { liability: 0, imputedCost: 0, funded: 0, unfunded: 0 };
  }
  return summary;
}

function emptyResult(fiscalYear: number): BenefitsValidationResult {
  return {
    fiscalYear,
    totalLiabilities: 0,
    totalImputedCosts: 0,
    findings: [],
    benefitSummary: emptyBenefitSummary(),
  };
}

// ---------------------------------------------------------------------------
// Core validation: individual liability checks
// ---------------------------------------------------------------------------

/**
 * Check that military retirement liability is recognized per SFFAS 5,
 * paras 57-67. Military retirement is typically the single largest
 * actuarial liability for DoD and must be explicitly recognized.
 */
function validateMilitaryRetirement(
  liabilities: ActuarialLiability[],
  findings: BenefitsFinding[],
): void {
  const milRet = liabilities.find((l) => l.benefitType === 'military_retirement');
  if (!milRet) {
    findings.push({
      benefitType: 'military_retirement',
      findingType: 'missing_liability',
      severity: 'critical',
      description:
        'Military retirement pension liability not recognized. SFFAS 5, paras 57-67 requires ' +
        'recognition of the actuarial liability for military retirement benefits. The Military ' +
        'Retirement Fund liability must be reported on the Balance Sheet. ' +
        '(DoD FMR Vol. 4, Ch. 12)',
      amountImpact: 0,
    });
    return;
  }

  // Validate valuation freshness
  if (daysSince(milRet.valuationDate) > STALE_VALUATION_DAYS) {
    findings.push({
      benefitType: 'military_retirement',
      findingType: 'stale_valuation',
      severity: 'high',
      description:
        `Military retirement actuarial valuation is stale (dated ${milRet.valuationDate}). ` +
        `SFFAS 33 requires actuarial valuations to be updated at least annually for ` +
        `material liabilities. Last valuation is ${daysSince(milRet.valuationDate)} days old.`,
      amountImpact: milRet.totalLiability,
    });
  }

  // Validate discount rate reasonableness
  validateDiscountRate(milRet, findings);

  // Validate imputed financing cost is present
  if (milRet.imputedFinancingCost === 0) {
    findings.push({
      benefitType: 'military_retirement',
      findingType: 'imputed_cost_missing',
      severity: 'high',
      description:
        'Military retirement imputed financing cost is zero. Per SFFAS 5, paras 97-104, ' +
        'the imputed cost of benefits funded by the Treasury must be recognized as an ' +
        'expense with an offsetting imputed financing source.',
      amountImpact: 0,
    });
  }

  // Validate funding gap
  validateFundingGap(milRet, findings);
}

/**
 * Validate FERS and CSRS pension liability recognition.
 * Both retirement systems must be separately recognized per SFFAS 5.
 */
function validatePensionLiabilities(
  liabilities: ActuarialLiability[],
  findings: BenefitsFinding[],
): void {
  const pensionTypes: BenefitType[] = ['fers', 'csrs'];

  for (const pensionType of pensionTypes) {
    const pension = liabilities.find((l) => l.benefitType === pensionType);
    const label = pensionType === 'fers'
      ? 'Federal Employees Retirement System (FERS)'
      : 'Civil Service Retirement System (CSRS)';

    if (!pension) {
      findings.push({
        benefitType: pensionType,
        findingType: 'missing_liability',
        severity: 'high',
        description:
          `${label} pension liability not recognized. SFFAS 5 requires recognition of ` +
          `the employing agency's share of pension liability. Imputed pension costs from ` +
          `OPM must be reported per SFFAS 5, paras 97-104. (DoD FMR Vol. 4, Ch. 12)`,
        amountImpact: 0,
      });
      continue;
    }

    // Validate valuation freshness
    if (daysSince(pension.valuationDate) > STALE_VALUATION_DAYS) {
      findings.push({
        benefitType: pensionType,
        findingType: 'stale_valuation',
        severity: 'medium',
        description:
          `${label} actuarial valuation is stale (dated ${pension.valuationDate}). ` +
          `Valuation is ${daysSince(pension.valuationDate)} days old. ` +
          `Annual updates are required per SFFAS 33.`,
        amountImpact: pension.totalLiability,
      });
    }

    // Validate discount rate
    validateDiscountRate(pension, findings);

    // Validate imputed financing cost for pension
    if (pension.imputedFinancingCost === 0) {
      findings.push({
        benefitType: pensionType,
        findingType: 'imputed_cost_missing',
        severity: 'medium',
        description:
          `${label} imputed financing cost is zero. OPM provides cost factors for each ` +
          `retirement system. Agencies must recognize the difference between employer ` +
          `contributions and the full cost as an imputed cost. (SFFAS 5, paras 97-104)`,
        amountImpact: 0,
      });
    }

    // Validate funding gap
    validateFundingGap(pension, findings);
  }
}

/**
 * Validate OPEB (Other Post-Employment Benefits) - retiree health benefits
 * liability per SFFAS 5, paras 80-96.
 */
function validateOPEB(
  liabilities: ActuarialLiability[],
  findings: BenefitsFinding[],
): void {
  const opeb = liabilities.find((l) => l.benefitType === 'opeb_health');
  if (!opeb) {
    findings.push({
      benefitType: 'opeb_health',
      findingType: 'missing_liability',
      severity: 'high',
      description:
        'Retiree health benefits (OPEB) liability not recognized. SFFAS 5, paras 80-96 ' +
        'requires recognition of the actuarial liability for post-retirement health care. ' +
        'The FEHB retiree health benefit liability and related imputed cost must be ' +
        'reported. (DoD FMR Vol. 4, Ch. 12)',
      amountImpact: 0,
    });
    return;
  }

  // Validate valuation freshness
  if (daysSince(opeb.valuationDate) > STALE_VALUATION_DAYS) {
    findings.push({
      benefitType: 'opeb_health',
      findingType: 'stale_valuation',
      severity: 'medium',
      description:
        `OPEB retiree health actuarial valuation is stale (dated ${opeb.valuationDate}). ` +
        `Valuation is ${daysSince(opeb.valuationDate)} days old. ` +
        `Annual updates are required per SFFAS 33.`,
      amountImpact: opeb.totalLiability,
    });
  }

  // Validate discount rate
  validateDiscountRate(opeb, findings);

  // Validate imputed financing cost
  if (opeb.imputedFinancingCost === 0) {
    findings.push({
      benefitType: 'opeb_health',
      findingType: 'imputed_cost_missing',
      severity: 'medium',
      description:
        'OPEB retiree health imputed financing cost is zero. Per SFFAS 5, paras 97-104, ' +
        'the cost of post-retirement health benefits funded by OPM must be recognized as ' +
        'an imputed cost by the employing agency.',
      amountImpact: 0,
    });
  }

  // Validate funding gap
  validateFundingGap(opeb, findings);
}

/**
 * Validate TSP matching obligation. FERS participants receive agency matching
 * contributions up to 5% of basic pay (1% automatic + up to 4% match).
 */
function validateTSPMatching(
  liabilities: ActuarialLiability[],
  findings: BenefitsFinding[],
): void {
  const tsp = liabilities.find((l) => l.benefitType === 'tsp_matching');
  if (!tsp) {
    findings.push({
      benefitType: 'tsp_matching',
      findingType: 'missing_liability',
      severity: 'medium',
      description:
        'Thrift Savings Plan (TSP) matching obligation not recognized. Agencies must ' +
        'recognize the cost of TSP matching contributions for FERS participants. The 1% ' +
        'automatic contribution and up to 4% matching contribution must be recorded as an ' +
        'expense when earned. (DoD FMR Vol. 4, Ch. 12)',
      amountImpact: 0,
    });
    return;
  }

  // TSP matching is typically current-year cost, not long-term actuarial.
  // Validate that imputed cost is captured if applicable.
  if (tsp.imputedFinancingCost === 0 && tsp.totalLiability > 0) {
    findings.push({
      benefitType: 'tsp_matching',
      findingType: 'imputed_cost_missing',
      severity: 'low',
      description:
        'TSP matching imputed financing cost is zero despite a recognized liability. ' +
        'Verify that TSP matching costs are fully funded through direct agency contributions ' +
        'and do not require imputed cost recognition. (SFFAS 5, paras 97-104)',
      amountImpact: 0,
    });
  }
}

/**
 * Validate FECA (Federal Employees' Compensation Act) workers' compensation
 * actuarial liability. DoL administers FECA; agencies recognize imputed costs.
 */
function validateFECA(
  liabilities: ActuarialLiability[],
  findings: BenefitsFinding[],
): void {
  const feca = liabilities.find((l) => l.benefitType === 'feca');
  if (!feca) {
    findings.push({
      benefitType: 'feca',
      findingType: 'missing_liability',
      severity: 'medium',
      description:
        'FECA workers\' compensation actuarial liability not recognized. The Department of ' +
        'Labor provides actuarial estimates for each agency\'s FECA liability, which must ' +
        'be recognized per SFFAS 5. The imputed cost should also be recorded. ' +
        '(DoD FMR Vol. 4, Ch. 12)',
      amountImpact: 0,
    });
    return;
  }

  // Validate valuation freshness
  if (daysSince(feca.valuationDate) > STALE_VALUATION_DAYS) {
    findings.push({
      benefitType: 'feca',
      findingType: 'stale_valuation',
      severity: 'medium',
      description:
        `FECA actuarial valuation is stale (dated ${feca.valuationDate}). ` +
        `Valuation is ${daysSince(feca.valuationDate)} days old. ` +
        `DoL provides updated FECA estimates annually; agencies must incorporate them timely.`,
      amountImpact: feca.totalLiability,
    });
  }

  // Validate imputed financing cost
  if (feca.imputedFinancingCost === 0) {
    findings.push({
      benefitType: 'feca',
      findingType: 'imputed_cost_missing',
      severity: 'medium',
      description:
        'FECA imputed financing cost is zero. Per SFFAS 5, paras 97-104, agencies must ' +
        'recognize the imputed cost of FECA benefits funded by the Department of Labor.',
      amountImpact: 0,
    });
  }
}

// ---------------------------------------------------------------------------
// Shared validators
// ---------------------------------------------------------------------------

/**
 * Validate the discount rate used in an actuarial valuation. The rate
 * should approximate Treasury rates for securities of comparable maturity.
 * Per SFFAS 33, a tolerance of +/- 2% from the Treasury baseline is
 * considered reasonable.
 */
function validateDiscountRate(
  liability: ActuarialLiability,
  findings: BenefitsFinding[],
): void {
  const lowerBound = TREASURY_BASELINE_DISCOUNT_RATE - DISCOUNT_RATE_TOLERANCE;
  const upperBound = TREASURY_BASELINE_DISCOUNT_RATE + DISCOUNT_RATE_TOLERANCE;

  if (liability.discountRate < lowerBound || liability.discountRate > upperBound) {
    findings.push({
      benefitType: liability.benefitType,
      findingType: 'unreasonable_assumptions',
      severity: 'high',
      description:
        `Discount rate of ${(liability.discountRate * 100).toFixed(2)}% for ` +
        `${liability.benefitType} is outside the reasonable range of ` +
        `${(lowerBound * 100).toFixed(2)}%-${(upperBound * 100).toFixed(2)}% ` +
        `(Treasury baseline ${(TREASURY_BASELINE_DISCOUNT_RATE * 100).toFixed(2)}% +/- ` +
        `${(DISCOUNT_RATE_TOLERANCE * 100).toFixed(2)}%). Unreasonable discount rates ` +
        `can materially misstate the actuarial liability. (SFFAS 33)`,
      amountImpact: liability.totalLiability,
    });
  }
}

/**
 * Validate that the funding gap (unfunded / total) does not exceed the
 * threshold. A significant funding gap indicates potential disclosure
 * and sustainability concerns.
 */
function validateFundingGap(
  liability: ActuarialLiability,
  findings: BenefitsFinding[],
): void {
  if (liability.totalLiability === 0) return;

  const unfundedRatio = liability.unfundedPortion / liability.totalLiability;
  if (unfundedRatio > FUNDING_GAP_THRESHOLD) {
    findings.push({
      benefitType: liability.benefitType,
      findingType: 'funding_gap',
      severity: unfundedRatio > 0.5 ? 'high' : 'medium',
      description:
        `${liability.benefitType} has a significant funding gap: ` +
        `$${liability.unfundedPortion.toLocaleString()} unfunded out of ` +
        `$${liability.totalLiability.toLocaleString()} total liability ` +
        `(${(unfundedRatio * 100).toFixed(1)}% unfunded). Per SFFAS 5, the funded ` +
        `and unfunded portions must be separately disclosed. ` +
        `(DoD FMR Vol. 4, Ch. 12)`,
      amountImpact: liability.unfundedPortion,
    });
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate the recognition, measurement, and disclosure of all federal
 * employee benefit liabilities for a given engagement.
 *
 * For each actuarial liability present in the engagement data, the engine:
 *   - Verifies military retirement liability exists (SFFAS 5, paras 57-67)
 *   - Validates FERS/CSRS pension liability recognition
 *   - Checks OPEB (retiree health benefits) liability
 *   - Validates TSP matching obligation
 *   - Checks imputed financing cost calculations (costs assumed by OPM/Treasury)
 *   - Validates discount rate reasonableness (Treasury rate +/- 2%)
 *   - Flags stale valuations (> 1 year old)
 *
 * Reference: DoD FMR Vol. 4, Ch. 12; SFFAS 5; SFFAS 33
 */
export function validateEmployeeBenefits(data: EngagementData): BenefitsValidationResult {
  const fiscalYear = data.dodData?.fiscalYear ?? new Date().getFullYear();

  // Return empty result if no actuarial liability data present
  if (!data.dodData?.actuarialLiabilities) {
    return emptyResult(fiscalYear);
  }

  const liabilities = data.dodData.actuarialLiabilities;
  const findings: BenefitsFinding[] = [];

  // -------------------------------------------------------------------
  // Validate each benefit type
  // -------------------------------------------------------------------

  // 1. Military retirement (SFFAS 5, paras 57-67)
  validateMilitaryRetirement(liabilities, findings);

  // 2. FERS/CSRS pension liabilities
  validatePensionLiabilities(liabilities, findings);

  // 3. OPEB retiree health benefits (SFFAS 5, paras 80-96)
  validateOPEB(liabilities, findings);

  // 4. TSP matching obligation
  validateTSPMatching(liabilities, findings);

  // 5. FECA workers' compensation
  validateFECA(liabilities, findings);

  // -------------------------------------------------------------------
  // Build the benefit summary
  // -------------------------------------------------------------------

  const benefitSummary = emptyBenefitSummary();

  for (const liability of liabilities) {
    if (benefitSummary[liability.benefitType]) {
      benefitSummary[liability.benefitType] = {
        liability: liability.totalLiability,
        imputedCost: liability.imputedFinancingCost,
        funded: liability.fundedPortion,
        unfunded: liability.unfundedPortion,
      };
    }
  }

  // -------------------------------------------------------------------
  // Compute totals
  // -------------------------------------------------------------------

  const totalLiabilities = liabilities.reduce((sum, l) => sum + l.totalLiability, 0);
  const totalImputedCosts = calculateImputedFinancingCost(liabilities);

  return {
    fiscalYear,
    totalLiabilities,
    totalImputedCosts,
    findings,
    benefitSummary,
  };
}

/**
 * Validate the reasonableness of actuarial assumptions used in benefit
 * liability valuations.
 *
 * Checks include:
 *   - Discount rate within Treasury baseline +/- 2%
 *   - Salary growth rate within historical federal norms
 *   - COLA assumption within historical range
 *   - Inflation assumption within reasonable economic bounds
 *   - Mortality table is current and recognized
 *
 * Reference: SFFAS 33; DoD FMR Vol. 4, Ch. 12
 */
export function validateActuarialAssumptions(
  assumptions: ActuarialAssumptions,
  fiscalYear: number,
): BenefitsFinding[] {
  const findings: BenefitsFinding[] = [];

  // --- Discount rate reasonableness ---
  const discountLower = TREASURY_BASELINE_DISCOUNT_RATE - DISCOUNT_RATE_TOLERANCE;
  const discountUpper = TREASURY_BASELINE_DISCOUNT_RATE + DISCOUNT_RATE_TOLERANCE;

  if (assumptions.discountRate < discountLower || assumptions.discountRate > discountUpper) {
    findings.push({
      benefitType: 'military_retirement',
      findingType: 'unreasonable_assumptions',
      severity: 'high',
      description:
        `Discount rate assumption of ${(assumptions.discountRate * 100).toFixed(2)}% is outside ` +
        `the reasonable range of ${(discountLower * 100).toFixed(2)}%-${(discountUpper * 100).toFixed(2)}% ` +
        `based on Treasury securities of comparable maturity. This could materially ` +
        `misstate all actuarial liabilities. (SFFAS 33)`,
      amountImpact: 0,
    });
  }

  // --- Salary growth rate ---
  if (
    assumptions.salaryGrowthRate < REASONABLE_SALARY_GROWTH_MIN ||
    assumptions.salaryGrowthRate > REASONABLE_SALARY_GROWTH_MAX
  ) {
    findings.push({
      benefitType: 'fers',
      findingType: 'unreasonable_assumptions',
      severity: 'medium',
      description:
        `Salary growth rate assumption of ${(assumptions.salaryGrowthRate * 100).toFixed(2)}% is outside ` +
        `the reasonable range of ${(REASONABLE_SALARY_GROWTH_MIN * 100).toFixed(2)}%-` +
        `${(REASONABLE_SALARY_GROWTH_MAX * 100).toFixed(2)}%. Federal pay adjustments ` +
        `historically fall within this band. Unreasonable salary growth assumptions ` +
        `affect pension and TSP matching liability calculations. (SFFAS 33)`,
      amountImpact: 0,
    });
  }

  // --- COLA assumption ---
  if (
    assumptions.costOfLivingAdjustment < REASONABLE_COLA_MIN ||
    assumptions.costOfLivingAdjustment > REASONABLE_COLA_MAX
  ) {
    findings.push({
      benefitType: 'csrs',
      findingType: 'unreasonable_assumptions',
      severity: 'medium',
      description:
        `COLA assumption of ${(assumptions.costOfLivingAdjustment * 100).toFixed(2)}% is outside the ` +
        `reasonable range of ${(REASONABLE_COLA_MIN * 100).toFixed(2)}%-` +
        `${(REASONABLE_COLA_MAX * 100).toFixed(2)}%. COLA directly affects retirement ` +
        `annuity projections for CSRS and military retirement. (SFFAS 33)`,
      amountImpact: 0,
    });
  }

  // --- Inflation rate ---
  if (
    assumptions.inflationRate < REASONABLE_INFLATION_MIN ||
    assumptions.inflationRate > REASONABLE_INFLATION_MAX
  ) {
    findings.push({
      benefitType: 'opeb_health',
      findingType: 'unreasonable_assumptions',
      severity: 'medium',
      description:
        `Inflation rate assumption of ${(assumptions.inflationRate * 100).toFixed(2)}% is outside the ` +
        `reasonable range of ${(REASONABLE_INFLATION_MIN * 100).toFixed(2)}%-` +
        `${(REASONABLE_INFLATION_MAX * 100).toFixed(2)}%. Healthcare cost trends are ` +
        `particularly sensitive to inflation assumptions, affecting OPEB liability. (SFFAS 33)`,
      amountImpact: 0,
    });
  }

  // --- Mortality table currency ---
  const normalizedTable = assumptions.mortalityTable.trim();
  const isRecognized = ACCEPTED_MORTALITY_TABLES.some(
    (accepted) => normalizedTable.toUpperCase().includes(accepted.toUpperCase()),
  );

  if (!isRecognized) {
    findings.push({
      benefitType: 'military_retirement',
      findingType: 'unreasonable_assumptions',
      severity: 'medium',
      description:
        `Mortality table "${assumptions.mortalityTable}" is not a recognized current table. ` +
        `Accepted tables include ${ACCEPTED_MORTALITY_TABLES.join(', ')}. Using an outdated ` +
        `or non-standard mortality table can materially affect life expectancy projections ` +
        `and therefore the actuarial liability. (SFFAS 33)`,
      amountImpact: 0,
    });
  }

  // --- Valuation date currency ---
  if (daysSince(assumptions.valuationDate) > STALE_VALUATION_DAYS) {
    findings.push({
      benefitType: 'military_retirement',
      findingType: 'stale_valuation',
      severity: 'high',
      description:
        `Actuarial assumptions are based on a valuation dated ${assumptions.valuationDate}, ` +
        `which is ${daysSince(assumptions.valuationDate)} days old. SFFAS 33 requires ` +
        `that actuarial valuations for material liabilities be updated at least annually. ` +
        `Stale assumptions may not reflect current economic conditions or demographic experience.`,
      amountImpact: 0,
    });
  }

  return findings;
}

/**
 * Calculate the total imputed financing cost across all benefit types.
 *
 * Imputed financing costs represent the cost of benefits provided to an
 * agency's employees that are paid for by other federal entities (OPM for
 * pensions and FEHB, Treasury for military retirement, DoL for FECA).
 * The employing agency must recognize these costs per SFFAS 5, paras 97-104.
 *
 * Reference: DoD FMR Vol. 4, Ch. 12; SFFAS 5, paras 97-104;
 *            FASAB Technical Bulletin 2006-1
 */
export function calculateImputedFinancingCost(liabilities: ActuarialLiability[]): number {
  return liabilities.reduce((sum, l) => sum + l.imputedFinancingCost, 0);
}
