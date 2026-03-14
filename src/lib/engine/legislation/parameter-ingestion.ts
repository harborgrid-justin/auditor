/**
 * Automated Parameter Ingestion Pipeline
 *
 * Monitors authoritative federal data sources for parameter changes and
 * ingests updates into the parameter registry. Supports multiple source
 * types including the Federal Register, Treasury rate publications,
 * GSA per diem tables, OPM pay schedules, and IRS contribution limits.
 *
 * Ingestion workflow:
 *   1. Check each configured source against its check frequency
 *   2. Compare published values against current registry values
 *   3. Validate changes against schema constraints
 *   4. Stage validated changes for approval or auto-apply
 *
 * References:
 *   - Federal Register API: https://www.federalregister.gov/developers
 *   - Treasury Prompt Payment rates: https://fiscal.treasury.gov
 *   - GSA per diem: https://www.gsa.gov/travel/plan-book/per-diem-rates
 *   - OPM pay tables: https://www.opm.gov/policy-data-oversight/pay-leave
 *   - IRS retirement plan limits: https://www.irs.gov/retirement-plans
 */

import { getParameterRecord } from '../tax-parameters/registry';

// ---------------------------------------------------------------------------
// Types & Enums
// ---------------------------------------------------------------------------

/** Authoritative source types for parameter data */
export enum ParameterSourceType {
  FEDERAL_REGISTER = 'federal_register',
  TREASURY = 'treasury',
  OUSD_COMPTROLLER = 'ousd_comptroller',
  IRS = 'irs',
  OPM = 'opm',
  GSA = 'gsa',
}

/** Configuration for a parameter ingestion source */
export interface ParameterIngestionSource {
  /** Human-readable source name */
  name: string;
  /** Type of authoritative source */
  sourceType: ParameterSourceType;
  /** URL endpoint for the source data */
  url: string;
  /** Parameter codes this source provides values for */
  parameterKeys: string[];
  /** How often to check for updates (ISO 8601 duration or descriptive) */
  checkFrequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi-annually' | 'annually';
}

/** Result of checking a single ingestion source */
export interface IngestionResult {
  /** The source that was checked */
  source: ParameterIngestionSource;
  /** When the check was performed */
  checkedAt: string;
  /** New parameter values detected */
  newParameters: IngestionParameterValue[];
  /** Whether any changes were detected vs. current registry values */
  changesDetected: boolean;
  /** Validation errors encountered during ingestion */
  validationErrors: string[];
}

/** A parameter value discovered during ingestion */
export interface IngestionParameterValue {
  code: string;
  fiscalYear: number;
  newValue: number;
  currentValue: number | null;
  source: string;
  authority: string;
  detectedAt: string;
}

/** Result of applying ingested parameters */
export interface IngestionApplyResult {
  appliedCount: number;
  skippedCount: number;
  appliedParameters: Array<{ code: string; fiscalYear: number; value: number }>;
  skippedParameters: Array<{ code: string; reason: string }>;
  approvedBy: string;
  appliedAt: string;
}

/** Scheduled check entry with next check date */
export interface IngestionScheduleEntry {
  source: ParameterIngestionSource;
  lastChecked: string | null;
  nextCheck: string;
}

// ---------------------------------------------------------------------------
// Validation Schema
// ---------------------------------------------------------------------------

/** Schema constraints for parameter validation */
interface ParameterValidationSchema {
  minValue?: number;
  maxValue?: number;
  valueType: 'percentage' | 'currency' | 'integer' | 'rate';
  maxChangePercent?: number;
}

const PARAMETER_SCHEMAS: Record<string, ParameterValidationSchema> = {
  DOD_MILPAY_RAISE_PCT: {
    valueType: 'percentage',
    minValue: 0,
    maxValue: 0.15,
    maxChangePercent: 100,
  },
  DOD_CIVPAY_RAISE_PCT: {
    valueType: 'percentage',
    minValue: 0,
    maxValue: 0.10,
    maxChangePercent: 100,
  },
  DOD_SIMPLIFIED_ACQ_THRESHOLD: {
    valueType: 'currency',
    minValue: 100000,
    maxValue: 1000000,
    maxChangePercent: 50,
  },
  DOD_MICRO_PURCHASE_THRESHOLD: {
    valueType: 'currency',
    minValue: 2500,
    maxValue: 50000,
    maxChangePercent: 100,
  },
  DOD_PER_DIEM_CONUS_MAX: {
    valueType: 'currency',
    minValue: 100,
    maxValue: 500,
    maxChangePercent: 30,
  },
  DOD_PER_DIEM_OCONUS_MAX: {
    valueType: 'currency',
    minValue: 100,
    maxValue: 1000,
    maxChangePercent: 30,
  },
  DOD_TSP_ELECTIVE_LIMIT: {
    valueType: 'currency',
    minValue: 15000,
    maxValue: 50000,
    maxChangePercent: 20,
  },
  DOD_TSP_CATCHUP_LIMIT: {
    valueType: 'currency',
    minValue: 5000,
    maxValue: 15000,
    maxChangePercent: 50,
  },
  DOD_PROMPT_PAY_INTEREST_RATE: {
    valueType: 'rate',
    minValue: 0,
    maxValue: 0.20,
    maxChangePercent: 100,
  },
  DOD_EFT_COMPLIANCE_THRESHOLD: {
    valueType: 'percentage',
    minValue: 0.80,
    maxValue: 1.0,
    maxChangePercent: 10,
  },
};

// ---------------------------------------------------------------------------
// Built-in Source Configurations
// ---------------------------------------------------------------------------

export const INGESTION_SOURCES: ParameterIngestionSource[] = [
  {
    name: 'Federal Register — NDAA Final Rules',
    sourceType: ParameterSourceType.FEDERAL_REGISTER,
    url: 'https://www.federalregister.gov/api/v1/documents.json?conditions[agencies][]=department-of-defense',
    parameterKeys: [
      'DOD_MILPAY_RAISE_PCT',
      'DOD_CIVPAY_RAISE_PCT',
      'DOD_SIMPLIFIED_ACQ_THRESHOLD',
      'DOD_MICRO_PURCHASE_THRESHOLD',
    ],
    checkFrequency: 'weekly',
  },
  {
    name: 'Treasury — Prompt Payment Interest Rates',
    sourceType: ParameterSourceType.TREASURY,
    url: 'https://fiscal.treasury.gov/prompt-payment/interest.html',
    parameterKeys: [
      'DOD_PROMPT_PAY_INTEREST_RATE',
    ],
    checkFrequency: 'semi-annually',
  },
  {
    name: 'GSA — CONUS & OCONUS Per Diem Rates',
    sourceType: ParameterSourceType.GSA,
    url: 'https://www.gsa.gov/travel/plan-book/per-diem-rates',
    parameterKeys: [
      'DOD_PER_DIEM_CONUS_MAX',
      'DOD_PER_DIEM_OCONUS_MAX',
    ],
    checkFrequency: 'annually',
  },
  {
    name: 'OPM — Federal Pay Tables & Civilian Pay Adjustments',
    sourceType: ParameterSourceType.OPM,
    url: 'https://www.opm.gov/policy-data-oversight/pay-leave/pay-systems',
    parameterKeys: [
      'DOD_CIVPAY_RAISE_PCT',
    ],
    checkFrequency: 'annually',
  },
  {
    name: 'IRS — TSP & Retirement Plan Contribution Limits',
    sourceType: ParameterSourceType.IRS,
    url: 'https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-contributions',
    parameterKeys: [
      'DOD_TSP_ELECTIVE_LIMIT',
      'DOD_TSP_CATCHUP_LIMIT',
    ],
    checkFrequency: 'annually',
  },
];

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const checkHistory = new Map<string, string>(); // source name -> last checked ISO
const pendingResults: IngestionResult[] = [];

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Determine the current fiscal year based on the federal fiscal calendar.
 * Federal FY starts October 1 of the prior calendar year.
 */
function getCurrentFiscalYear(): number {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-indexed
  const year = now.getFullYear();
  return month >= 10 ? year + 1 : year;
}

/**
 * Calculate the next check date for a source based on its frequency.
 */
function calculateNextCheck(lastChecked: string | null, frequency: ParameterIngestionSource['checkFrequency']): string {
  const base = lastChecked ? new Date(lastChecked) : new Date();
  const next = new Date(base);

  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'semi-annually':
      next.setMonth(next.getMonth() + 6);
      break;
    case 'annually':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }

  return next.toISOString();
}

/**
 * Check whether a source needs to be checked based on its schedule.
 */
function isCheckDue(source: ParameterIngestionSource): boolean {
  const lastChecked = checkHistory.get(source.name);
  if (!lastChecked) return true;

  const nextCheck = calculateNextCheck(lastChecked, source.checkFrequency);
  return new Date() >= new Date(nextCheck);
}

/**
 * Run an ingestion check against a single source.
 *
 * Compares the source's parameter keys against the current registry values
 * for the active fiscal year. In a production deployment, this would fetch
 * live data from the source URL; here it performs registry comparison and
 * validation to detect parameters that may need updating.
 *
 * @param source - The ingestion source to check
 * @returns Ingestion result with detected changes and validation status
 */
export function runIngestionCheck(source: ParameterIngestionSource): IngestionResult {
  const checkedAt = new Date().toISOString();
  const fiscalYear = getCurrentFiscalYear();
  const newParameters: IngestionParameterValue[] = [];
  const validationErrors: string[] = [];

  for (const paramKey of source.parameterKeys) {
    const currentRecord = getParameterRecord(paramKey, fiscalYear);
    const currentValue = currentRecord?.value ?? null;

    // Check if this parameter has a value for the current FY
    if (currentValue === null) {
      newParameters.push({
        code: paramKey,
        fiscalYear,
        newValue: 0, // Placeholder — actual value would come from source API
        currentValue: null,
        source: source.name,
        authority: `${source.sourceType} — ${source.name}`,
        detectedAt: checkedAt,
      });
    }

    // Check if the parameter is using a carry-forward value
    if (currentRecord && currentRecord.taxYear !== fiscalYear) {
      validationErrors.push(
        `Parameter '${paramKey}' for FY${fiscalYear} is using a carry-forward ` +
        `value from FY${currentRecord.taxYear}. Source '${source.name}' should ` +
        `provide an updated value.`,
      );
    }
  }

  // Record the check
  checkHistory.set(source.name, checkedAt);

  const result: IngestionResult = {
    source,
    checkedAt,
    newParameters,
    changesDetected: newParameters.length > 0,
    validationErrors,
  };

  pendingResults.push(result);
  return result;
}

/**
 * Validate an ingested parameter value against its schema constraints.
 *
 * Checks that the value falls within acceptable ranges and that the
 * change from the current value is not unexpectedly large (which may
 * indicate a data quality issue).
 *
 * @param key - The parameter code
 * @param value - The proposed new value
 * @param fiscalYear - The fiscal year for the parameter
 * @returns Array of validation error messages (empty if valid)
 */
export function validateIngestedParameter(
  key: string,
  value: number,
  fiscalYear: number,
): string[] {
  const errors: string[] = [];
  const schema = PARAMETER_SCHEMAS[key];

  if (!schema) {
    errors.push(`No validation schema defined for parameter '${key}'. Manual review required.`);
    return errors;
  }

  // Range validation
  if (schema.minValue !== undefined && value < schema.minValue) {
    errors.push(
      `Value ${value} for '${key}' is below minimum ${schema.minValue}.`,
    );
  }
  if (schema.maxValue !== undefined && value > schema.maxValue) {
    errors.push(
      `Value ${value} for '${key}' is above maximum ${schema.maxValue}.`,
    );
  }

  // Change magnitude validation
  if (schema.maxChangePercent !== undefined) {
    const currentRecord = getParameterRecord(key, fiscalYear);
    if (currentRecord && currentRecord.value !== 0) {
      const changePct = Math.abs((value - currentRecord.value) / currentRecord.value) * 100;
      if (changePct > schema.maxChangePercent) {
        errors.push(
          `Value change for '${key}' is ${changePct.toFixed(1)}% which exceeds ` +
          `the maximum allowed change of ${schema.maxChangePercent}%. Manual review required.`,
        );
      }
    }
  }

  // Type-specific validation
  if (schema.valueType === 'integer' && !Number.isInteger(value)) {
    errors.push(`Parameter '${key}' requires an integer value but received ${value}.`);
  }
  if (schema.valueType === 'percentage' && (value < 0 || value > 1)) {
    errors.push(`Parameter '${key}' is a percentage and must be between 0 and 1, received ${value}.`);
  }

  return errors;
}

/**
 * Apply validated ingested parameters to the registry.
 *
 * Takes a set of ingestion results and applies the validated parameter
 * changes. Parameters that fail validation are skipped and reported.
 *
 * @param results - Array of ingestion results to apply
 * @param approvedBy - User ID of the approver
 * @returns Summary of applied and skipped parameters
 */
export function applyIngestedParameters(
  results: IngestionResult[],
  approvedBy: string,
): IngestionApplyResult {
  const appliedParameters: Array<{ code: string; fiscalYear: number; value: number }> = [];
  const skippedParameters: Array<{ code: string; reason: string }> = [];

  for (const result of results) {
    for (const param of result.newParameters) {
      // Validate before applying
      const validationErrors = validateIngestedParameter(
        param.code,
        param.newValue,
        param.fiscalYear,
      );

      if (validationErrors.length > 0) {
        skippedParameters.push({
          code: param.code,
          reason: validationErrors.join('; '),
        });
        continue;
      }

      // In a production deployment, this would call registerParameter()
      // or update the database. For now, record the intent.
      appliedParameters.push({
        code: param.code,
        fiscalYear: param.fiscalYear,
        value: param.newValue,
      });
    }
  }

  return {
    appliedCount: appliedParameters.length,
    skippedCount: skippedParameters.length,
    appliedParameters,
    skippedParameters,
    approvedBy,
    appliedAt: new Date().toISOString(),
  };
}

/**
 * Get the ingestion schedule for all configured sources.
 *
 * Returns each source with its last check timestamp and calculated
 * next check date based on the configured frequency.
 *
 * @returns Array of schedule entries with next check dates
 */
export function getIngestionSchedule(): IngestionScheduleEntry[] {
  return INGESTION_SOURCES.map(source => {
    const lastChecked = checkHistory.get(source.name) ?? null;
    return {
      source,
      lastChecked,
      nextCheck: calculateNextCheck(lastChecked, source.checkFrequency),
    };
  });
}

/**
 * Get all pending ingestion results that have not yet been applied.
 */
export function getPendingResults(): IngestionResult[] {
  return [...pendingResults];
}

/**
 * Clear pending results after they have been processed.
 */
export function clearPendingResults(): void {
  pendingResults.length = 0;
}

/**
 * Clear check history (for testing).
 */
export function clearCheckHistory(): void {
  checkHistory.clear();
}
