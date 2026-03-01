/**
 * Government Property Accountability Engine
 *
 * Validates property records for compliance with federal accounting standards
 * governing PP&E (Property, Plant & Equipment) in the DoD context.
 *
 * Key rules enforced:
 *   - General PP&E above the capitalization threshold must be capitalized (not
 *     expensed), and depreciated using an approved method (straight-line default).
 *   - National defense PP&E is expensed on acquisition per SFFAS 23/SFFAS 48 —
 *     it must NOT be capitalized or depreciated.
 *   - Heritage assets and stewardship land are recorded in terms of physical
 *     units (not cost), and must carry zero depreciation.
 *   - Accumulated depreciation may never exceed acquisition cost.
 *   - Annual physical inventories are required; items not inventoried within the
 *     last 12 months are flagged.
 *   - USSGL account numbers for PP&E must fall in the 1700 series.
 *
 * References:
 *   - DoD FMR Vol 4, Ch 6 (Property, Plant and Equipment)
 *   - SFFAS 6  (Accounting for PP&E)
 *   - SFFAS 23 (Eliminating the Category National Defense PP&E — superseded)
 *   - SFFAS 48 (Opening Balances for Inventory, OS&MT, and Stockpile Materials)
 *   - SFFAS 29 (Heritage Assets and Stewardship Land)
 */

import type { EngagementData } from '@/types/findings';
import type { PropertyRecord, DepreciationSchedule, PropertyCategory } from '@/types/dod-fmr';
import { getParameter } from '@/lib/engine/tax-parameters/registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PropertyValidationResult {
  fiscalYear: number;
  totalPropertyRecords: number;
  validRecords: number;
  findings: PropertyFinding[];
  capitalizationThreshold: number;
  totalGeneralPPEValue: number;
  totalNationalDefensePPEValue: number;
  totalHeritageStewardshipCount: number;
}

export interface PropertyFinding {
  propertyId: string;
  findingType:
    | 'capitalization_error'
    | 'depreciation_error'
    | 'existence_assertion'
    | 'completeness_assertion'
    | 'classification_error'
    | 'inventory_overdue';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  amountImpact: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** One year in milliseconds (365 days). */
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate all property records in the engagement for compliance with
 * DoD FMR Vol 4 Ch 6, SFFAS 6, and SFFAS 48.
 *
 * Returns a result summarizing totals, valid records, and individual findings.
 */
export function validatePropertyRecords(data: EngagementData): PropertyValidationResult {
  const emptyResult: PropertyValidationResult = {
    fiscalYear: data.taxYear,
    totalPropertyRecords: 0,
    validRecords: 0,
    findings: [],
    capitalizationThreshold: 0,
    totalGeneralPPEValue: 0,
    totalNationalDefensePPEValue: 0,
    totalHeritageStewardshipCount: 0,
  };

  if (!data.dodData?.propertyRecords) {
    return emptyResult;
  }

  const records = data.dodData.propertyRecords;
  const capitalizationThreshold = getParameter('DOD_PP_E_CAPITALIZATION_THRESHOLD', data.taxYear);
  const findings: PropertyFinding[] = [];
  const now = new Date();

  let totalGeneralPPEValue = 0;
  let totalNationalDefensePPEValue = 0;
  let totalHeritageStewardshipCount = 0;

  for (const record of records) {
    // --- Accumulate category totals ---
    switch (record.category) {
      case 'general_ppe':
      case 'internal_use_software':
        totalGeneralPPEValue += record.currentBookValue;
        break;
      case 'national_defense':
        totalNationalDefensePPEValue += record.acquisitionCost;
        break;
      case 'heritage':
      case 'stewardship_land':
        totalHeritageStewardshipCount += 1;
        break;
    }

    // --- 1. Capitalization checks for general PP&E ---
    if (record.category === 'general_ppe' || record.category === 'internal_use_software') {
      if (record.acquisitionCost >= capitalizationThreshold) {
        // Should be capitalized — book value should be > 0 (unless fully depreciated)
        if (record.currentBookValue === 0 && record.accumulatedDepreciation === 0) {
          findings.push({
            propertyId: record.propertyId,
            findingType: 'capitalization_error',
            severity: 'high',
            description:
              `General PP&E item "${record.description}" (cost $${record.acquisitionCost.toLocaleString()}) ` +
              `meets the capitalization threshold ($${capitalizationThreshold.toLocaleString()}) but appears ` +
              `to have been expensed rather than capitalized. Per SFFAS 6 and DoD FMR Vol 4 Ch 6, ` +
              `general PP&E above the threshold must be capitalized.`,
            amountImpact: record.acquisitionCost,
          });
        }
      }
    }

    // --- 2. National defense PP&E must be expensed on acquisition ---
    if (record.category === 'national_defense') {
      if (record.currentBookValue > 0 || record.accumulatedDepreciation > 0) {
        findings.push({
          propertyId: record.propertyId,
          findingType: 'capitalization_error',
          severity: 'critical',
          description:
            `National defense PP&E item "${record.description}" has a book value of ` +
            `$${record.currentBookValue.toLocaleString()} and accumulated depreciation of ` +
            `$${record.accumulatedDepreciation.toLocaleString()}. Per SFFAS 48 and DoD FMR ` +
            `Vol 4 Ch 6, national defense PP&E must be expensed on acquisition — it should ` +
            `not be capitalized or depreciated.`,
          amountImpact: record.currentBookValue,
        });
      }
    }

    // --- 3. Heritage assets and stewardship land — no depreciation ---
    if (record.category === 'heritage' || record.category === 'stewardship_land') {
      if (record.accumulatedDepreciation > 0) {
        findings.push({
          propertyId: record.propertyId,
          findingType: 'depreciation_error',
          severity: 'high',
          description:
            `${record.category === 'heritage' ? 'Heritage asset' : 'Stewardship land'} ` +
            `"${record.description}" carries accumulated depreciation of ` +
            `$${record.accumulatedDepreciation.toLocaleString()}. Per SFFAS 29, heritage ` +
            `assets and stewardship land are not depreciated.`,
          amountImpact: record.accumulatedDepreciation,
        });
      }
    }

    // --- 4. Depreciation schedule checks for general PP&E ---
    if (record.category === 'general_ppe' || record.category === 'internal_use_software') {
      // 4a. Accumulated depreciation must not exceed acquisition cost
      if (record.accumulatedDepreciation > record.acquisitionCost) {
        findings.push({
          propertyId: record.propertyId,
          findingType: 'depreciation_error',
          severity: 'critical',
          description:
            `Accumulated depreciation ($${record.accumulatedDepreciation.toLocaleString()}) ` +
            `exceeds acquisition cost ($${record.acquisitionCost.toLocaleString()}) for ` +
            `"${record.description}". This is not permitted under SFFAS 6.`,
          amountImpact: record.accumulatedDepreciation - record.acquisitionCost,
        });
      }

      // 4b. Verify straight-line depreciation method for general PP&E
      if (
        record.depreciationMethod &&
        record.depreciationMethod !== 'straight_line' &&
        record.depreciationMethod !== 'none'
      ) {
        findings.push({
          propertyId: record.propertyId,
          findingType: 'depreciation_error',
          severity: 'medium',
          description:
            `Property "${record.description}" uses "${record.depreciationMethod}" depreciation. ` +
            `DoD FMR Vol 4 Ch 6 prescribes straight-line depreciation for general PP&E.`,
          amountImpact: 0,
        });
      }
    }

    // --- 5. Inventory date check — flag if > 1 year since last inventory ---
    if (record.lastInventoryDate) {
      const lastInventory = new Date(record.lastInventoryDate);
      const elapsed = now.getTime() - lastInventory.getTime();
      if (elapsed > ONE_YEAR_MS) {
        const monthsOverdue = Math.floor((elapsed - ONE_YEAR_MS) / (30 * 24 * 60 * 60 * 1000));
        findings.push({
          propertyId: record.propertyId,
          findingType: 'inventory_overdue',
          severity: monthsOverdue >= 12 ? 'high' : 'medium',
          description:
            `Property "${record.description}" has not been inventoried since ` +
            `${record.lastInventoryDate}. Annual physical inventory is required per ` +
            `DoD FMR Vol 4 Ch 6. Last inventory was approximately ` +
            `${monthsOverdue + 12} months ago.`,
          amountImpact: record.currentBookValue,
        });
      }
    } else {
      // No inventory date at all — existence assertion concern
      findings.push({
        propertyId: record.propertyId,
        findingType: 'existence_assertion',
        severity: 'high',
        description:
          `Property "${record.description}" has no recorded inventory date. ` +
          `Physical existence cannot be asserted without a documented inventory. ` +
          `Per DoD FMR Vol 4 Ch 6, annual physical inventories are required.`,
        amountImpact: record.currentBookValue,
      });
    }

    // --- 6. USSGL account number validation (1700-series for PP&E) ---
    if (!record.ussglAccountNumber.startsWith('17')) {
      findings.push({
        propertyId: record.propertyId,
        findingType: 'classification_error',
        severity: 'medium',
        description:
          `Property "${record.description}" is recorded under USSGL account ` +
          `${record.ussglAccountNumber}, which is not in the 1700 series. PP&E must ` +
          `be recorded in USSGL 1700-series accounts per the USSGL chart of accounts.`,
        amountImpact: record.acquisitionCost,
      });
    }
  }

  // Determine how many records are "valid" (no findings against them)
  const propertyIdsWithFindings = new Set(findings.map((f) => f.propertyId));
  const validRecords = records.filter((r) => !propertyIdsWithFindings.has(r.propertyId)).length;

  return {
    fiscalYear: data.taxYear,
    totalPropertyRecords: records.length,
    validRecords,
    findings,
    capitalizationThreshold,
    totalGeneralPPEValue,
    totalNationalDefensePPEValue,
    totalHeritageStewardshipCount,
  };
}

/**
 * Calculate the depreciation schedule for a property record.
 *
 * Only applicable to general_ppe and internal_use_software categories.
 * Returns null for national_defense, heritage, and stewardship_land, which
 * are not subject to depreciation.
 *
 * Default method is straight-line.
 */
export function calculateDepreciationSchedule(
  record: PropertyRecord
): DepreciationSchedule | null {
  // Non-depreciable categories
  if (
    record.category === 'national_defense' ||
    record.category === 'heritage' ||
    record.category === 'stewardship_land'
  ) {
    return null;
  }

  const usefulLife = record.usefulLifeYears ?? 0;
  if (usefulLife <= 0) {
    return null;
  }

  const acquisitionCost = record.acquisitionCost;
  const salvageValue = 0; // Federal accounting typically assumes zero salvage value
  const depreciableBase = acquisitionCost - salvageValue;
  const method = record.depreciationMethod === 'declining_balance' ? 'declining_balance' : 'straight_line';

  let annualDepreciation: number;
  if (method === 'straight_line') {
    annualDepreciation = depreciableBase / usefulLife;
  } else {
    // Declining balance (double-declining, 200%)
    const rate = 2 / usefulLife;
    const currentBookValue = acquisitionCost - record.accumulatedDepreciation;
    annualDepreciation = currentBookValue * rate;
    // Do not depreciate below salvage value
    if (currentBookValue - annualDepreciation < salvageValue) {
      annualDepreciation = currentBookValue - salvageValue;
    }
  }

  // Cap accumulated depreciation at the depreciable base
  const accumulatedDepreciation = Math.min(record.accumulatedDepreciation, depreciableBase);
  const currentBookValue = acquisitionCost - accumulatedDepreciation;

  return {
    propertyId: record.propertyId,
    acquisitionCost,
    salvageValue,
    usefulLifeYears: usefulLife,
    depreciationMethod: method,
    annualDepreciation: Math.round(annualDepreciation * 100) / 100,
    accumulatedDepreciation: Math.round(accumulatedDepreciation * 100) / 100,
    currentBookValue: Math.round(currentBookValue * 100) / 100,
  };
}

/**
 * Summarize property records grouped by category.
 *
 * Returns a record mapping each PropertyCategory to its count and total
 * acquisition-cost value.
 */
export function getPropertySummaryByCategory(
  records: PropertyRecord[]
): Record<PropertyCategory, { count: number; totalValue: number }> {
  const summary: Record<PropertyCategory, { count: number; totalValue: number }> = {
    general_ppe: { count: 0, totalValue: 0 },
    national_defense: { count: 0, totalValue: 0 },
    heritage: { count: 0, totalValue: 0 },
    stewardship_land: { count: 0, totalValue: 0 },
    internal_use_software: { count: 0, totalValue: 0 },
  };

  for (const record of records) {
    const entry = summary[record.category];
    if (entry) {
      entry.count += 1;
      entry.totalValue += record.acquisitionCost;
    }
  }

  return summary;
}
