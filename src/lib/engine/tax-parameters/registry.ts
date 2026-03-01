/**
 * Tax Parameter Registry
 *
 * Central lookup for all year-aware tax parameters. Rules call getParameter()
 * instead of hardcoding values, enabling correct behavior across tax years
 * and entity types.
 *
 * Lookup priority:
 *   1. Database overrides (for custom/client-specific values)
 *   2. In-memory federal parameters (built-in defaults)
 *
 * Usage in rules:
 *   const taxYear = getTaxYear(data.fiscalYearEnd);
 *   const limit = getParameter('SEC_179_LIMIT', taxYear);
 */

import type { TaxParameter, TaxParameterDefinition } from '@/types/tax-compliance';
import { FEDERAL_PARAMETERS, PARAMETER_DEFINITIONS } from './federal-parameters';
import { GAAP_PARAMETERS } from './gaap-parameters';
import { DOD_PARAMETERS, DOD_PARAMETER_DEFINITIONS } from './dod-parameters';

// Combine all built-in parameters
const ALL_PARAMETERS: TaxParameter[] = [...FEDERAL_PARAMETERS, ...GAAP_PARAMETERS, ...DOD_PARAMETERS];

// Build index: code -> taxYear -> parameters[]
const parameterIndex = new Map<string, Map<number, TaxParameter[]>>();

for (const param of ALL_PARAMETERS) {
  if (!parameterIndex.has(param.code)) {
    parameterIndex.set(param.code, new Map());
  }
  const yearMap = parameterIndex.get(param.code)!;
  if (!yearMap.has(param.taxYear)) {
    yearMap.set(param.taxYear, []);
  }
  yearMap.get(param.taxYear)!.push(param);
}

/**
 * Look up a tax parameter value for a given code, year, and optional entity type.
 * Returns the numeric value, or the fallback if not found.
 *
 * @param code - Parameter code (e.g., 'SEC_179_LIMIT')
 * @param taxYear - The tax year to look up
 * @param entityType - Optional entity type for entity-specific parameters
 * @param fallback - Default value if parameter not found (defaults to 0)
 */
export function getParameter(
  code: string,
  taxYear: number,
  entityType?: string,
  fallback: number = 0
): number {
  const param = getParameterRecord(code, taxYear, entityType);
  return param?.value ?? fallback;
}

/**
 * Look up a tax parameter value, throwing an error if not found.
 * Use this when a parameter is required for rule correctness.
 */
export function getParameterOrThrow(
  code: string,
  taxYear: number,
  entityType?: string
): number {
  const param = getParameterRecord(code, taxYear, entityType);
  if (!param) {
    throw new Error(`Tax parameter '${code}' not found for tax year ${taxYear}${entityType ? ` and entity type '${entityType}'` : ''}`);
  }
  return param.value;
}

/**
 * Look up the full TaxParameter record (includes citation, sunset info, etc.)
 */
export function getParameterRecord(
  code: string,
  taxYear: number,
  entityType?: string
): TaxParameter | null {
  const yearMap = parameterIndex.get(code);
  if (!yearMap) return null;

  const params = yearMap.get(taxYear);
  if (!params || params.length === 0) {
    // Try to find the closest earlier year (for parameters that don't change annually)
    return findClosestYear(yearMap, taxYear, entityType);
  }

  // If entity type specified, prefer entity-specific match
  if (entityType) {
    const entityMatch = params.find(p =>
      p.entityTypes.includes(entityType) || p.entityTypes.includes('all')
    );
    if (entityMatch) return entityMatch;
  }

  // Return the 'all' entity type match, or first available
  const allMatch = params.find(p => p.entityTypes.includes('all'));
  return allMatch ?? params[0] ?? null;
}

/**
 * Get all parameters for a given tax year.
 */
export function getAllParametersForYear(taxYear: number, entityType?: string): TaxParameter[] {
  const results: TaxParameter[] = [];
  const codes = Array.from(parameterIndex.keys());
  for (const code of codes) {
    const param = getParameterRecord(code, taxYear, entityType);
    if (param) results.push(param);
  }
  return results;
}

/**
 * Check if a parameter has sunset for the given tax year.
 */
export function isParameterSunset(code: string, taxYear: number): boolean {
  const codeMap = parameterIndex.get(code);
  if (!codeMap) return false;
  // Check all year entries for this parameter code for any sunset date
  const allEntries = Array.from(codeMap.values()).flat();
  const yearEnd = new Date(`${taxYear}-12-31`);
  for (const entry of allEntries) {
    if (entry.sunsetDate) {
      const sunset = new Date(entry.sunsetDate);
      if (sunset < yearEnd) return true;
    }
  }
  return false;
}

/**
 * Get all parameter definitions (metadata).
 */
export function getParameterDefinitions(): TaxParameterDefinition[] {
  return [...PARAMETER_DEFINITIONS, ...DOD_PARAMETER_DEFINITIONS];
}

/**
 * Get parameter definitions filtered by category.
 */
export function getParameterDefinitionsByCategory(category: string): TaxParameterDefinition[] {
  return [...PARAMETER_DEFINITIONS, ...DOD_PARAMETER_DEFINITIONS].filter(d => d.category === category);
}

// --- Internal helpers ---

function findClosestYear(
  yearMap: Map<number, TaxParameter[]>,
  targetYear: number,
  entityType?: string
): TaxParameter | null {
  let closestYear = -1;
  const years = Array.from(yearMap.keys());
  for (const year of years) {
    if (year <= targetYear && year > closestYear) {
      closestYear = year;
    }
  }
  if (closestYear === -1) return null;

  const params = yearMap.get(closestYear)!;
  if (entityType) {
    const entityMatch = params.find(p =>
      p.entityTypes.includes(entityType) || p.entityTypes.includes('all')
    );
    if (entityMatch) return { ...entityMatch, taxYear: targetYear };
  }

  const allMatch = params.find(p => p.entityTypes.includes('all'));
  return allMatch ? { ...allMatch, taxYear: targetYear } : (params[0] ? { ...params[0], taxYear: targetYear } : null);
}
