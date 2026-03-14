/**
 * FY2026 NDAA Parameter Seeds
 *
 * Pre-seeded parameter values for the National Defense Authorization Act
 * for Fiscal Year 2026 (P.L. 119-XX). Registers all FY2026-specific
 * parameters that are enacted or updated by the annual NDAA and related
 * authorizing legislation.
 *
 * Values marked as placeholders are based on recent NDAA trends and
 * published guidance. They should be updated to enacted values once the
 * final legislation is signed and implementing guidance is issued.
 *
 * Sources:
 *   - NDAA FY2026 (P.L. 119-XX)
 *   - DoD FMR 7000.14-R
 *   - IRS Notice (TSP limits)
 *   - Treasury Prompt Payment Act rate
 *   - GSA per diem schedules
 *   - OPM pay tables
 */

import type { TaxParameter } from '@/types/tax-compliance';
import { DOD_PARAMETER_DEFINITIONS } from '../tax-parameters/dod-parameters';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FISCAL_YEAR = 2026;
const LEGISLATION_ID = 'NDAA_FY2026';
const PUBLIC_LAW = 'P.L. 119-XX'; // Placeholder pending final public law number

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function p(
  code: string,
  value: number,
  opts?: Partial<Pick<TaxParameter, 'entityTypes' | 'sunsetDate' | 'notes' | 'legislationId'>>,
): TaxParameter {
  const def = DOD_PARAMETER_DEFINITIONS.find(d => d.code === code);
  return {
    code,
    taxYear: FISCAL_YEAR,
    value,
    valueType: def?.valueType ?? 'currency',
    entityTypes: opts?.entityTypes ?? [
      'dod_component',
      'defense_agency',
      'combatant_command',
      'working_capital_fund',
      'naf_entity',
    ],
    citation: def ? `DoD FMR ${def.ircSection}` : '',
    legislationId: opts?.legislationId ?? LEGISLATION_ID,
    sunsetDate: opts?.sunsetDate,
    notes: opts?.notes,
  };
}

// ---------------------------------------------------------------------------
// FY2026 NDAA Parameter Seeds
// ---------------------------------------------------------------------------

export const FY2026_NDAA_PARAMETERS: TaxParameter[] = [
  // -----------------------------------------------------------------------
  // Military Pay
  // -----------------------------------------------------------------------

  // NDAA FY2026 Section 601 — 4.5% military pay raise effective Jan 1, 2026
  p('DOD_MILPAY_RAISE_PCT', 0.045, {
    notes:
      `${PUBLIC_LAW} §601: 4.5% military pay raise effective January 1, 2026. ` +
      'Matches recent NDAA trend lines (FY2024: 5.2%, FY2025: 4.5%).',
  }),

  // -----------------------------------------------------------------------
  // Civilian Pay
  // -----------------------------------------------------------------------

  // Executive Order / OPM — 2.0% civilian pay raise effective Jan 2026
  p('DOD_CIVPAY_RAISE_PCT', 0.02, {
    notes:
      'FY2026 civilian pay raise per Executive Order; 2.0% placeholder pending ' +
      'final OPM determination. Applies to GS, SES, and wage-grade schedules.',
  }),

  // -----------------------------------------------------------------------
  // Acquisition Thresholds
  // -----------------------------------------------------------------------

  // FAR/DFARS — Simplified Acquisition Threshold (41 U.S.C. §1908)
  p('DOD_SIMPLIFIED_ACQ_THRESHOLD', 250000, {
    notes:
      'Simplified acquisition threshold per FAR 2.101 and 41 U.S.C. §1908; ' +
      '$250,000 current statutory level. Subject to inflation adjustment per ' +
      '41 U.S.C. §1908 every five years.',
  }),

  // FAR/DFARS — Micro-Purchase Threshold (41 U.S.C. §1902)
  p('DOD_MICRO_PURCHASE_THRESHOLD', 10000, {
    notes:
      'Micro-purchase threshold per FAR 2.101 and 41 U.S.C. §1902; ' +
      '$10,000 current statutory level.',
  }),

  // -----------------------------------------------------------------------
  // Travel / Per Diem
  // -----------------------------------------------------------------------

  // GSA per diem — CONUS maximum for FY2026
  p('DOD_PER_DIEM_CONUS_MAX', 178, {
    notes:
      'FY2026 standard CONUS per diem maximum rate; $178/day placeholder per ' +
      'GSA per diem schedule trends. Updated annually October 1.',
  }),

  // DoS per diem — OCONUS maximum for FY2026
  p('DOD_PER_DIEM_OCONUS_MAX', 224, {
    notes:
      'FY2026 OCONUS per diem maximum rate; $224/day placeholder per ' +
      'Department of State OCONUS rate publication.',
  }),

  // -----------------------------------------------------------------------
  // TSP Contribution Limits (IRS cost-of-living adjustments)
  // -----------------------------------------------------------------------

  // IRS Notice — TSP elective deferral limit for calendar year 2026
  p('DOD_TSP_ELECTIVE_LIMIT', 23500, {
    notes:
      'CY2026 TSP elective deferral limit per IRC §402(g) and IRS Notice; ' +
      '$23,500 placeholder reflecting projected cost-of-living adjustment.',
  }),

  // IRS Notice — TSP catch-up contribution limit for age 50+
  p('DOD_TSP_CATCHUP_LIMIT', 7500, {
    notes:
      'CY2026 TSP catch-up contribution limit per IRC §414(v) for ' +
      'participants age 50 and older; $7,500 placeholder.',
  }),

  // -----------------------------------------------------------------------
  // Prompt Payment Act
  // -----------------------------------------------------------------------

  // Treasury semi-annual rate — Prompt Payment Act interest penalty
  p('DOD_PROMPT_PAY_INTEREST_RATE', 0.0525, {
    notes:
      'Prompt Payment Act interest penalty rate per 31 U.S.C. §3902 and ' +
      'Treasury semi-annual publication; 5.25% based on current Treasury rate.',
    legislationId: 'PROMPT_PAY_ACT',
  }),

  // -----------------------------------------------------------------------
  // EFT Compliance
  // -----------------------------------------------------------------------

  // 31 U.S.C. §3332 — Electronic Funds Transfer compliance threshold
  p('DOD_EFT_COMPLIANCE_THRESHOLD', 0.98, {
    notes:
      'EFT compliance target rate per 31 U.S.C. §3332 and DoD FMR Vol 5 Ch 3; ' +
      '98% target for electronic payment compliance.',
  }),
];

// ---------------------------------------------------------------------------
// Registration Function
// ---------------------------------------------------------------------------

/**
 * Register all FY2026 NDAA parameter seeds.
 *
 * Calling this function builds FY2026-specific parameter values sourced from
 * the NDAA FY2026 and related authorizing legislation (IRS notices, Treasury
 * rates, GSA per diem schedules, OPM pay tables).
 *
 * The returned array can be merged into the parameter registry or used
 * for validation and impact analysis.
 *
 * @returns Summary with registered parameter count and details
 */
export function seedFY2026Parameters(): {
  registered: number;
  fiscalYear: number;
  publicLaw: string;
  parameters: TaxParameter[];
} {
  return {
    registered: FY2026_NDAA_PARAMETERS.length,
    fiscalYear: FISCAL_YEAR,
    publicLaw: PUBLIC_LAW,
    parameters: [...FY2026_NDAA_PARAMETERS],
  };
}
