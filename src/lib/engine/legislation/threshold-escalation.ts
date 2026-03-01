/**
 * Threshold Escalation Engine
 *
 * Automatically adjusts financial thresholds and rates based on economic
 * indices (CPI, ECI), legislative changes, and annual update schedules.
 * Supports automatic derivation of future fiscal year parameters from
 * escalation rules when explicit values have not yet been enacted.
 *
 * Key escalation types:
 *   1. CPI-linked: Consumer Price Index adjustments (per diem, BAS, etc.)
 *   2. ECI-linked: Employment Cost Index adjustments (pay caps, locality pay)
 *   3. Legislative: Fixed by statute (acquisition thresholds per 41 U.S.C. §1908)
 *   4. Administrative: Set by agency policy (review periods, multipliers)
 *   5. Actuarial: Based on actuarial valuations (retirement contributions)
 *
 * This engine works in conjunction with the NDAA Change Processor to
 * provide forward-looking parameter estimates when final enacted values
 * are not yet available.
 *
 * References:
 *   - 41 U.S.C. §1908 (Inflation Adjustment of Acquisition-Related Thresholds)
 *   - DoD FMR Vol. 7A, Ch. 3 (Military Pay)
 *   - DoD FMR Vol. 8, Ch. 2 (Civilian Pay)
 *   - JTR Ch. 2 (Per Diem Rates)
 *   - OPM Annual Pay Adjustment Guidance
 *   - BLS CPI and ECI data series
 */

import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EscalationType = 'cpi' | 'eci' | 'legislative' | 'administrative' | 'actuarial' | 'fixed';

export type IndexType = 'cpi_u' | 'cpi_w' | 'eci_total' | 'eci_wages' | 'gdp_deflator' | 'custom';

/** Defines how a parameter escalates over time */
export interface EscalationRule {
  id: string;
  parameterCode: string;
  escalationType: EscalationType;
  indexType?: IndexType;
  /** Fixed annual escalation rate (e.g., 0.03 for 3%) */
  fixedRate?: number;
  /** Rounding rule for the escalated value */
  roundingRule: 'none' | 'nearest_dollar' | 'nearest_hundred' | 'nearest_thousand';
  /** Statutory authority for the escalation */
  authority: string;
  /** How often the escalation occurs */
  frequency: 'annual' | 'biennial' | 'quinquennial';
  /** Month the escalation takes effect (1-12, default October = 10 for federal FY) */
  effectiveMonth: number;
  /** Whether this rule is currently active */
  active: boolean;
  /** Optional cap on the escalation percentage per cycle */
  maxEscalationPct?: number;
  /** Optional floor on the escalation percentage per cycle */
  minEscalationPct?: number;
}

/** Annual index data point */
export interface IndexDataPoint {
  indexType: IndexType;
  year: number;
  month: number;
  value: number;
  source: string;
}

/** Result of applying an escalation rule */
export interface EscalationResult {
  parameterCode: string;
  baseFiscalYear: number;
  baseValue: number;
  targetFiscalYear: number;
  escalatedValue: number;
  escalationRate: number;
  escalationType: EscalationType;
  isEstimate: boolean;
  authority: string;
  calculationDetails: string;
}

/** Pay table annual adjustment result */
export interface PayTableAdjustment {
  paySystem: 'military' | 'gs' | 'ses';
  fiscalYear: number;
  adjustmentPct: number;
  effectiveDate: string;
  authority: string;
  isProjected: boolean;
}

/** Per diem rate update result */
export interface PerDiemUpdate {
  rateType: 'conus_standard' | 'conus_lodging' | 'conus_mie' | 'oconus';
  fiscalYear: number;
  previousRate: number;
  newRate: number;
  changePct: number;
  effectiveDate: string;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const escalationRules: EscalationRule[] = [];
const indexData: IndexDataPoint[] = [];

// ---------------------------------------------------------------------------
// Escalation Rule Management
// ---------------------------------------------------------------------------

/**
 * Register an escalation rule for a parameter.
 */
export function registerEscalationRule(rule: Omit<EscalationRule, 'id'>): EscalationRule {
  const fullRule: EscalationRule = { id: uuid(), ...rule };
  escalationRules.push(fullRule);
  return fullRule;
}

/**
 * Get the escalation rule for a parameter code.
 */
export function getEscalationRule(parameterCode: string): EscalationRule | null {
  return escalationRules.find((r) => r.parameterCode === parameterCode && r.active) || null;
}

/**
 * Get all active escalation rules.
 */
export function getAllEscalationRules(): EscalationRule[] {
  return escalationRules.filter((r) => r.active);
}

// ---------------------------------------------------------------------------
// Index Data Management
// ---------------------------------------------------------------------------

/**
 * Load index data points (e.g., from BLS API or manual entry).
 */
export function loadIndexData(points: IndexDataPoint[]): void {
  indexData.push(...points);
}

/**
 * Get the year-over-year change for an index.
 *
 * @param indexType - The economic index type
 * @param year - The year to get the change for
 * @param month - The reference month (default: September for federal FY)
 * @returns The YoY change rate, or null if insufficient data
 */
export function getIndexYoYChange(
  indexType: IndexType,
  year: number,
  month: number = 9
): number | null {
  const current = indexData.find(
    (d) => d.indexType === indexType && d.year === year && d.month === month
  );
  const previous = indexData.find(
    (d) => d.indexType === indexType && d.year === year - 1 && d.month === month
  );

  if (!current || !previous || previous.value === 0) return null;

  return (current.value - previous.value) / previous.value;
}

// ---------------------------------------------------------------------------
// Core Escalation Functions
// ---------------------------------------------------------------------------

/**
 * Escalate a parameter value from a base fiscal year to a target fiscal year.
 *
 * Uses the registered escalation rule for the parameter code. If actual
 * index data is available, uses it; otherwise falls back to the fixed
 * rate or historical average.
 *
 * @param parameterCode - The parameter to escalate
 * @param baseValue - The known value in the base fiscal year
 * @param baseFiscalYear - The fiscal year of the known value
 * @param targetFiscalYear - The fiscal year to project to
 * @returns The escalation result, or null if no rule exists
 */
export function escalateParameter(
  parameterCode: string,
  baseValue: number,
  baseFiscalYear: number,
  targetFiscalYear: number
): EscalationResult | null {
  const rule = getEscalationRule(parameterCode);
  if (!rule) return null;

  if (targetFiscalYear <= baseFiscalYear) {
    return {
      parameterCode,
      baseFiscalYear,
      baseValue,
      targetFiscalYear,
      escalatedValue: baseValue,
      escalationRate: 0,
      escalationType: rule.escalationType,
      isEstimate: false,
      authority: rule.authority,
      calculationDetails: 'No escalation needed (target <= base)',
    };
  }

  const yearsToEscalate = targetFiscalYear - baseFiscalYear;
  let totalRate = 0;
  let isEstimate = false;
  const details: string[] = [];

  let currentValue = baseValue;

  for (let y = 1; y <= yearsToEscalate; y++) {
    const year = baseFiscalYear + y;
    let annualRate: number;

    if (rule.escalationType === 'fixed' || rule.escalationType === 'administrative') {
      annualRate = rule.fixedRate || 0;
      details.push(`FY${year}: Fixed rate ${(annualRate * 100).toFixed(2)}%`);
    } else if (rule.indexType) {
      const indexChange = getIndexYoYChange(rule.indexType, year - 1, rule.effectiveMonth - 1);
      if (indexChange !== null) {
        annualRate = indexChange;
        details.push(`FY${year}: ${rule.indexType} actual ${(annualRate * 100).toFixed(2)}%`);
      } else {
        // Fall back to fixed rate or historical average
        annualRate = rule.fixedRate || 0.03;
        isEstimate = true;
        details.push(`FY${year}: Estimated ${(annualRate * 100).toFixed(2)}% (no index data)`);
      }
    } else {
      annualRate = rule.fixedRate || 0;
      details.push(`FY${year}: Default rate ${(annualRate * 100).toFixed(2)}%`);
    }

    // Apply caps and floors
    if (rule.maxEscalationPct !== undefined && annualRate > rule.maxEscalationPct) {
      annualRate = rule.maxEscalationPct;
      details.push(`  Capped at ${(rule.maxEscalationPct * 100).toFixed(2)}%`);
    }
    if (rule.minEscalationPct !== undefined && annualRate < rule.minEscalationPct) {
      annualRate = rule.minEscalationPct;
      details.push(`  Floored at ${(rule.minEscalationPct * 100).toFixed(2)}%`);
    }

    totalRate = (1 + totalRate) * (1 + annualRate) - 1;
    currentValue = currentValue * (1 + annualRate);
  }

  // Apply rounding
  const escalatedValue = applyRounding(currentValue, rule.roundingRule);

  return {
    parameterCode,
    baseFiscalYear,
    baseValue,
    targetFiscalYear,
    escalatedValue,
    escalationRate: totalRate,
    escalationType: rule.escalationType,
    isEstimate,
    authority: rule.authority,
    calculationDetails: details.join('; '),
  };
}

/**
 * Project pay table adjustments for a future fiscal year.
 *
 * @param currentFY - The current fiscal year with known pay rates
 * @param targetFY - The target fiscal year to project
 * @returns Projected pay adjustments for military, GS, and SES
 */
export function projectPayTableAdjustments(
  currentFY: number,
  targetFY: number
): PayTableAdjustment[] {
  const adjustments: PayTableAdjustment[] = [];

  // Military pay - typically linked to ECI per 37 U.S.C. §1009
  const milEscalation = escalateParameter('DOD_MILPAY_RAISE_PCT', 0.045, currentFY, targetFY);
  adjustments.push({
    paySystem: 'military',
    fiscalYear: targetFY,
    adjustmentPct: milEscalation?.escalatedValue || 0.04,
    effectiveDate: `${targetFY}-01-01`,
    authority: '37 U.S.C. §1009; NDAA Section 601',
    isProjected: milEscalation?.isEstimate ?? true,
  });

  // GS pay - linked to ECI per 5 U.S.C. §5303
  const gsEciChange = getIndexYoYChange('eci_wages', targetFY - 1);
  adjustments.push({
    paySystem: 'gs',
    fiscalYear: targetFY,
    adjustmentPct: gsEciChange !== null ? gsEciChange : 0.04,
    effectiveDate: `${targetFY - 1}-10-01`,
    authority: '5 U.S.C. §5303; President\'s Alternative Pay Plan',
    isProjected: gsEciChange === null,
  });

  // SES pay - typically follows GS base adjustment
  adjustments.push({
    paySystem: 'ses',
    fiscalYear: targetFY,
    adjustmentPct: gsEciChange !== null ? gsEciChange : 0.04,
    effectiveDate: `${targetFY - 1}-10-01`,
    authority: '5 U.S.C. §5382',
    isProjected: gsEciChange === null,
  });

  return adjustments;
}

/**
 * Project per diem rate updates for a future fiscal year.
 *
 * Per diem rates are updated annually by GSA based on lodging cost surveys
 * and meal cost data from the USDA.
 *
 * @param currentRates - Current fiscal year rates { lodging, mie, total }
 * @param currentFY - Current fiscal year
 * @param targetFY - Target fiscal year
 * @returns Projected per diem rate updates
 */
export function projectPerDiemUpdates(
  currentRates: { lodging: number; mie: number; total: number },
  currentFY: number,
  targetFY: number
): PerDiemUpdate[] {
  const cpiChange = getIndexYoYChange('cpi_u', targetFY - 1);
  const escalationRate = cpiChange !== null ? cpiChange : 0.03;

  const newLodging = applyRounding(currentRates.lodging * (1 + escalationRate), 'nearest_dollar');
  const newMie = applyRounding(currentRates.mie * (1 + escalationRate), 'nearest_dollar');
  const newTotal = newLodging + newMie;

  return [
    {
      rateType: 'conus_lodging',
      fiscalYear: targetFY,
      previousRate: currentRates.lodging,
      newRate: newLodging,
      changePct: (newLodging - currentRates.lodging) / currentRates.lodging,
      effectiveDate: `${targetFY - 1}-10-01`,
    },
    {
      rateType: 'conus_mie',
      fiscalYear: targetFY,
      previousRate: currentRates.mie,
      newRate: newMie,
      changePct: (newMie - currentRates.mie) / currentRates.mie,
      effectiveDate: `${targetFY - 1}-10-01`,
    },
    {
      rateType: 'conus_standard',
      fiscalYear: targetFY,
      previousRate: currentRates.total,
      newRate: newTotal,
      changePct: (newTotal - currentRates.total) / currentRates.total,
      effectiveDate: `${targetFY - 1}-10-01`,
    },
  ];
}

/**
 * Process FAR/DFARS acquisition threshold escalation.
 *
 * Per 41 U.S.C. §1908, acquisition-related thresholds are adjusted every
 * 5 years based on the CPI. The FAR Council publishes updated thresholds.
 *
 * @param currentThresholds - Map of threshold code -> current value
 * @param baseFY - The fiscal year of current thresholds
 * @param targetFY - The fiscal year to project to
 * @returns Map of threshold code -> escalated value
 */
export function escalateAcquisitionThresholds(
  currentThresholds: Record<string, number>,
  baseFY: number,
  targetFY: number
): Record<string, EscalationResult> {
  const results: Record<string, EscalationResult> = {};

  for (const [code, value] of Object.entries(currentThresholds)) {
    const result = escalateParameter(code, value, baseFY, targetFY);
    if (result) {
      results[code] = result;
    } else {
      // Default: acquisition thresholds escalate at CPI, rounded to nearest $1000
      const years = targetFY - baseFY;
      const cpiRate = 0.03; // Default assumption
      const escalated = value * Math.pow(1 + cpiRate, years);
      results[code] = {
        parameterCode: code,
        baseFiscalYear: baseFY,
        baseValue: value,
        targetFiscalYear: targetFY,
        escalatedValue: applyRounding(escalated, 'nearest_thousand'),
        escalationRate: Math.pow(1 + cpiRate, years) - 1,
        escalationType: 'legislative',
        isEstimate: true,
        authority: '41 U.S.C. §1908',
        calculationDetails: `Default CPI escalation at ${(cpiRate * 100)}% over ${years} years`,
      };
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Default Escalation Rule Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the default escalation rules for all DoD parameters.
 *
 * Call this at application startup to register the standard escalation
 * rules. These can be overridden or supplemented via the API.
 */
export function initializeDefaultEscalationRules(): void {
  // Military pay raise - linked to ECI per 37 U.S.C. §1009
  registerEscalationRule({
    parameterCode: 'DOD_MILPAY_RAISE_PCT',
    escalationType: 'eci',
    indexType: 'eci_wages',
    fixedRate: 0.04,
    roundingRule: 'none',
    authority: '37 U.S.C. §1009; DoD FMR Vol 7, Ch 3',
    frequency: 'annual',
    effectiveMonth: 1,
    active: true,
    maxEscalationPct: 0.10,
    minEscalationPct: 0.01,
  });

  // BAS - linked to USDA food cost index (approximated by CPI food)
  registerEscalationRule({
    parameterCode: 'DOD_BAS_ENLISTED',
    escalationType: 'cpi',
    indexType: 'cpi_u',
    fixedRate: 0.025,
    roundingRule: 'none',
    authority: '37 U.S.C. §402; DoD FMR Vol 7, Ch 25',
    frequency: 'annual',
    effectiveMonth: 1,
    active: true,
  });

  registerEscalationRule({
    parameterCode: 'DOD_BAS_OFFICER',
    escalationType: 'cpi',
    indexType: 'cpi_u',
    fixedRate: 0.025,
    roundingRule: 'none',
    authority: '37 U.S.C. §402; DoD FMR Vol 7, Ch 25',
    frequency: 'annual',
    effectiveMonth: 1,
    active: true,
  });

  // Per diem - linked to CPI
  registerEscalationRule({
    parameterCode: 'DOD_CONUS_PERDIEM_STD',
    escalationType: 'cpi',
    indexType: 'cpi_u',
    fixedRate: 0.03,
    roundingRule: 'nearest_dollar',
    authority: 'JTR Ch. 2; DoD FMR Vol 9, Ch 3',
    frequency: 'annual',
    effectiveMonth: 10,
    active: true,
  });

  registerEscalationRule({
    parameterCode: 'DOD_CONUS_LODGING_STD',
    escalationType: 'cpi',
    indexType: 'cpi_u',
    fixedRate: 0.03,
    roundingRule: 'nearest_dollar',
    authority: 'JTR Ch. 2; DoD FMR Vol 9, Ch 3',
    frequency: 'annual',
    effectiveMonth: 10,
    active: true,
  });

  registerEscalationRule({
    parameterCode: 'DOD_CONUS_MIE_STD',
    escalationType: 'cpi',
    indexType: 'cpi_u',
    fixedRate: 0.03,
    roundingRule: 'nearest_dollar',
    authority: 'JTR Ch. 2; DoD FMR Vol 9, Ch 3',
    frequency: 'annual',
    effectiveMonth: 10,
    active: true,
  });

  // TSP limit - IRS inflation adjustment
  registerEscalationRule({
    parameterCode: 'DOD_TSP_ELECTIVE_LIMIT',
    escalationType: 'cpi',
    indexType: 'cpi_u',
    fixedRate: 0.025,
    roundingRule: 'nearest_thousand',
    authority: '26 U.S.C. §402(g); IRS Revenue Procedure',
    frequency: 'annual',
    effectiveMonth: 1,
    active: true,
  });

  // Premium pay cap - linked to GS pay adjustments
  registerEscalationRule({
    parameterCode: 'DOD_PREMIUM_PAY_CAP',
    escalationType: 'eci',
    indexType: 'eci_total',
    fixedRate: 0.03,
    roundingRule: 'nearest_hundred',
    authority: '5 U.S.C. §5547; OPM Annual Adjustments',
    frequency: 'annual',
    effectiveMonth: 1,
    active: true,
  });

  // Acquisition thresholds - quinquennial CPI adjustment
  for (const code of ['DOD_MICRO_PURCHASE_THRESHOLD', 'DOD_SIMPLIFIED_ACQ_THRESHOLD', 'DOD_TINA_THRESHOLD', 'DOD_CAS_THRESHOLD']) {
    registerEscalationRule({
      parameterCode: code,
      escalationType: 'legislative',
      indexType: 'cpi_u',
      fixedRate: 0.03,
      roundingRule: 'nearest_thousand',
      authority: '41 U.S.C. §1908; FAR/DFARS',
      frequency: 'quinquennial',
      effectiveMonth: 10,
      active: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function applyRounding(value: number, rule: EscalationRule['roundingRule']): number {
  switch (rule) {
    case 'nearest_dollar':
      return Math.round(value);
    case 'nearest_hundred':
      return Math.round(value / 100) * 100;
    case 'nearest_thousand':
      return Math.round(value / 1000) * 1000;
    case 'none':
    default:
      return Math.round(value * 100) / 100;
  }
}

/**
 * Clear all escalation rules and index data (for testing).
 */
export function clearEscalationData(): void {
  escalationRules.length = 0;
  indexData.length = 0;
}
