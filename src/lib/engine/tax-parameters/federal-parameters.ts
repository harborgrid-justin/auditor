/**
 * Federal Tax Parameter Definitions
 *
 * All IRS tax parameters with year-by-year values. This serves as the
 * in-memory source of truth. Values can be overridden in the database
 * for custom engagements or when IRS publishes new inflation adjustments.
 *
 * Sources: IRS Revenue Procedures, enacted legislation (TCJA, IRA, CARES Act)
 */

import type { TaxParameter, TaxParameterDefinition } from '@/types/tax-compliance';

// --- Parameter Definitions (metadata) ---

export const PARAMETER_DEFINITIONS: TaxParameterDefinition[] = [
  { code: 'FEDERAL_CORP_RATE', displayName: 'Federal Corporate Tax Rate', description: 'Flat corporate income tax rate', ircSection: '11(b)', category: 'rates', valueType: 'percentage', inflationAdjusted: false },
  { code: 'SEC_179_LIMIT', displayName: 'Section 179 Expense Limit', description: 'Maximum Section 179 deduction', ircSection: '179(b)(1)', category: 'depreciation', valueType: 'currency', inflationAdjusted: true },
  { code: 'SEC_179_PHASEOUT', displayName: 'Section 179 Phase-Out Threshold', description: 'Investment threshold where Section 179 begins to phase out', ircSection: '179(b)(2)', category: 'depreciation', valueType: 'currency', inflationAdjusted: true },
  { code: 'BONUS_DEPR_RATE', displayName: 'Bonus Depreciation Rate', description: 'First-year bonus depreciation percentage for qualified property', ircSection: '168(k)', category: 'depreciation', valueType: 'percentage', inflationAdjusted: false },
  { code: 'SEC_163J_ATI_PCT', displayName: 'Business Interest Limitation (ATI %)', description: 'Business interest deduction limited to this percentage of ATI', ircSection: '163(j)', category: 'deduction_limits', valueType: 'percentage', inflationAdjusted: false },
  { code: 'SEC_162M_LIMIT', displayName: 'Executive Compensation Limit', description: 'Per-covered-employee deduction cap', ircSection: '162(m)', category: 'deduction_limits', valueType: 'currency', inflationAdjusted: false },
  { code: 'SALT_CAP', displayName: 'SALT Deduction Cap', description: 'State and local tax deduction limitation', ircSection: '164(b)(6)', category: 'deduction_limits', valueType: 'currency', inflationAdjusted: false },
  { code: 'MEALS_DEDUCTION_PCT', displayName: 'Meals Deduction Percentage', description: 'Allowable deduction percentage for business meals', ircSection: '274(n)', category: 'deduction_limits', valueType: 'percentage', inflationAdjusted: false },
  { code: 'NOL_DEDUCTION_LIMIT_PCT', displayName: 'NOL Deduction Limitation', description: 'NOL deduction limited to this percentage of taxable income', ircSection: '172(a)', category: 'nol', valueType: 'percentage', inflationAdjusted: false },
  { code: 'RD_AMORT_DOMESTIC_YRS', displayName: 'R&D Amortization Period (Domestic)', description: 'Mandatory amortization period for domestic R&D expenditures', ircSection: '174', category: 'research_development', valueType: 'integer', inflationAdjusted: false },
  { code: 'RD_AMORT_FOREIGN_YRS', displayName: 'R&D Amortization Period (Foreign)', description: 'Mandatory amortization period for foreign R&D expenditures', ircSection: '174', category: 'research_development', valueType: 'integer', inflationAdjusted: false },
  { code: 'QBI_DEDUCTION_PCT', displayName: 'QBI Deduction Rate', description: 'Qualified business income deduction percentage for pass-throughs', ircSection: '199A', category: 'pass_through', valueType: 'percentage', inflationAdjusted: false },
  { code: 'CAMT_RATE', displayName: 'Corporate AMT Rate', description: 'Corporate alternative minimum tax rate on AFSI', ircSection: '55(b)(2)', category: 'amt', valueType: 'percentage', inflationAdjusted: false },
  { code: 'CAMT_THRESHOLD', displayName: 'Corporate AMT Threshold', description: '3-year average AFSI threshold for CAMT applicability', ircSection: '59(k)', category: 'amt', valueType: 'currency', inflationAdjusted: false },
  { code: 'CHARITABLE_LIMIT_CORP_PCT', displayName: 'Corporate Charitable Contribution Limit', description: 'Charitable deduction limited to this percentage of taxable income', ircSection: '170(b)(2)', category: 'deduction_limits', valueType: 'percentage', inflationAdjusted: false },
  { code: 'EST_TAX_SAFE_HARBOR_PCT', displayName: 'Estimated Tax Safe Harbor', description: 'Percentage of prior year tax for safe harbor', ircSection: '6655', category: 'estimated_tax', valueType: 'percentage', inflationAdjusted: false },
  { code: 'EXCESS_BUSINESS_LOSS_SINGLE', displayName: 'Excess Business Loss Limit (Single)', description: 'Business loss limitation for single/unmarried filers', ircSection: '461(l)', category: 'deduction_limits', valueType: 'currency', inflationAdjusted: true },
  { code: 'EXCESS_BUSINESS_LOSS_MFJ', displayName: 'Excess Business Loss Limit (MFJ)', description: 'Business loss limitation for married filing jointly', ircSection: '461(l)', category: 'deduction_limits', valueType: 'currency', inflationAdjusted: true },
  { code: 'QSBS_EXCLUSION_PCT', displayName: 'QSBS Gain Exclusion Percentage', description: 'Gain exclusion for qualified small business stock', ircSection: '1202(a)', category: 'capital_gains', valueType: 'percentage', inflationAdjusted: false },
  { code: 'QSBS_GAIN_CAP', displayName: 'QSBS Per-Issuer Gain Cap', description: 'Maximum gain excludable per issuer', ircSection: '1202(b)', category: 'capital_gains', valueType: 'currency', inflationAdjusted: false },
  { code: 'ACCURACY_PENALTY_RATE', displayName: 'Accuracy-Related Penalty Rate', description: 'Penalty rate for substantial understatement', ircSection: '6662(a)', category: 'penalties', valueType: 'percentage', inflationAdjusted: false },
  { code: 'ACCURACY_PENALTY_GROSS_RATE', displayName: 'Gross Valuation Misstatement Penalty Rate', description: 'Penalty rate for gross valuation misstatements', ircSection: '6662(h)', category: 'penalties', valueType: 'percentage', inflationAdjusted: false },
  { code: 'SUBSTANTIAL_UNDERSTATEMENT_PCT', displayName: 'Substantial Understatement Threshold %', description: 'Percentage threshold for substantial understatement', ircSection: '6662(d)', category: 'penalties', valueType: 'percentage', inflationAdjusted: false },
  { code: 'SUBSTANTIAL_UNDERSTATEMENT_FLOOR', displayName: 'Substantial Understatement Floor', description: 'Dollar floor for substantial understatement (corps)', ircSection: '6662(d)', category: 'penalties', valueType: 'currency', inflationAdjusted: false },
];

// --- Year-by-Year Parameter Values ---

function p(code: string, taxYear: number, value: number, opts?: Partial<Pick<TaxParameter, 'entityTypes' | 'sunsetDate' | 'notes' | 'legislationId'>>): TaxParameter {
  const def = PARAMETER_DEFINITIONS.find(d => d.code === code);
  return {
    code,
    taxYear,
    value,
    valueType: def?.valueType ?? 'currency',
    entityTypes: opts?.entityTypes ?? ['all'],
    citation: def ? `IRC §${def.ircSection}` : '',
    legislationId: opts?.legislationId,
    sunsetDate: opts?.sunsetDate,
    notes: opts?.notes,
  };
}

export const FEDERAL_PARAMETERS: TaxParameter[] = [
  // Federal Corporate Rate — IRC §11(b) — flat 21% post-TCJA
  ...years(2018, 2030, y => p('FEDERAL_CORP_RATE', y, 0.21)),

  // Section 179 Expense Limit — IRC §179(b)(1) — indexed for inflation
  p('SEC_179_LIMIT', 2022, 1080000, { notes: 'Rev. Proc. 2021-45' }),
  p('SEC_179_LIMIT', 2023, 1160000, { notes: 'Rev. Proc. 2022-38' }),
  p('SEC_179_LIMIT', 2024, 1220000, { notes: 'Rev. Proc. 2023-34' }),
  p('SEC_179_LIMIT', 2025, 1250000, { notes: 'Rev. Proc. 2024-40' }),
  p('SEC_179_LIMIT', 2026, 1290000, { notes: 'Estimated, pending Rev. Proc.' }),

  // Section 179 Phase-Out — IRC §179(b)(2)
  p('SEC_179_PHASEOUT', 2022, 2700000),
  p('SEC_179_PHASEOUT', 2023, 2890000),
  p('SEC_179_PHASEOUT', 2024, 3050000),
  p('SEC_179_PHASEOUT', 2025, 3130000),
  p('SEC_179_PHASEOUT', 2026, 3220000, { notes: 'Estimated' }),

  // Bonus Depreciation Phase-Down — IRC §168(k) — TCJA schedule
  p('BONUS_DEPR_RATE', 2022, 1.00, { legislationId: 'TCJA' }),
  p('BONUS_DEPR_RATE', 2023, 0.80, { legislationId: 'TCJA' }),
  p('BONUS_DEPR_RATE', 2024, 0.60, { legislationId: 'TCJA' }),
  p('BONUS_DEPR_RATE', 2025, 0.40, { legislationId: 'TCJA' }),
  p('BONUS_DEPR_RATE', 2026, 0.20, { legislationId: 'TCJA' }),
  p('BONUS_DEPR_RATE', 2027, 0.00, { legislationId: 'TCJA', notes: 'Bonus depreciation fully phased out' }),

  // Business Interest Limitation — IRC §163(j) — 30% of ATI
  ...years(2022, 2030, y => p('SEC_163J_ATI_PCT', y, 0.30)),

  // Executive Compensation Cap — IRC §162(m) — $1M
  ...years(2018, 2030, y => p('SEC_162M_LIMIT', y, 1000000)),

  // SALT Deduction Cap — IRC §164(b)(6) — $10,000 (TCJA, sunsets end of 2025)
  ...years(2018, 2025, y => p('SALT_CAP', y, 10000, { legislationId: 'TCJA', sunsetDate: '2025-12-31' })),
  // Post-sunset: no cap (represented as very large number)
  ...years(2026, 2030, y => p('SALT_CAP', y, Infinity, { notes: 'SALT cap expired per TCJA sunset' })),

  // Meals Deduction — IRC §274(n)
  p('MEALS_DEDUCTION_PCT', 2021, 1.00, { notes: 'Temporary 100% for restaurant meals (CAA 2021)', legislationId: 'CAA2021' }),
  p('MEALS_DEDUCTION_PCT', 2022, 1.00, { notes: 'Temporary 100% for restaurant meals (CAA 2021)', legislationId: 'CAA2021' }),
  ...years(2023, 2030, y => p('MEALS_DEDUCTION_PCT', y, 0.50)),

  // NOL Deduction Limitation — IRC §172(a) — 80% of taxable income (post-TCJA)
  ...years(2021, 2030, y => p('NOL_DEDUCTION_LIMIT_PCT', y, 0.80, { legislationId: 'TCJA' })),

  // R&D Amortization — IRC §174 — mandatory capitalization post-2021
  ...years(2022, 2030, y => p('RD_AMORT_DOMESTIC_YRS', y, 5)),
  ...years(2022, 2030, y => p('RD_AMORT_FOREIGN_YRS', y, 15)),

  // QBI Deduction — IRC §199A — 20% (sunsets end of 2025)
  ...years(2018, 2025, y => p('QBI_DEDUCTION_PCT', y, 0.20, { legislationId: 'TCJA', sunsetDate: '2025-12-31' })),
  ...years(2026, 2030, y => p('QBI_DEDUCTION_PCT', y, 0, { notes: 'Section 199A expired per TCJA sunset' })),

  // Corporate AMT (CAMT) — IRC §55(b)(2) / §59(k) — IRA 2022
  ...years(2023, 2030, y => p('CAMT_RATE', y, 0.15, { legislationId: 'IRA2022' })),
  ...years(2023, 2030, y => p('CAMT_THRESHOLD', y, 1000000000, { legislationId: 'IRA2022' })),

  // Corporate Charitable Contribution Limit — IRC §170(b)(2)
  ...years(2018, 2030, y => p('CHARITABLE_LIMIT_CORP_PCT', y, 0.10)),

  // Estimated Tax Safe Harbor — IRC §6655
  ...years(2018, 2030, y => p('EST_TAX_SAFE_HARBOR_PCT', y, 1.00)),

  // Excess Business Loss Limitation — IRC §461(l) — indexed
  p('EXCESS_BUSINESS_LOSS_SINGLE', 2022, 270000),
  p('EXCESS_BUSINESS_LOSS_SINGLE', 2023, 289000),
  p('EXCESS_BUSINESS_LOSS_SINGLE', 2024, 305000),
  p('EXCESS_BUSINESS_LOSS_SINGLE', 2025, 315000, { notes: 'Estimated' }),
  p('EXCESS_BUSINESS_LOSS_MFJ', 2022, 540000),
  p('EXCESS_BUSINESS_LOSS_MFJ', 2023, 578000),
  p('EXCESS_BUSINESS_LOSS_MFJ', 2024, 610000),
  p('EXCESS_BUSINESS_LOSS_MFJ', 2025, 630000, { notes: 'Estimated' }),

  // QSBS — IRC §1202
  ...years(2010, 2030, y => p('QSBS_EXCLUSION_PCT', y, 1.00)),
  ...years(2010, 2030, y => p('QSBS_GAIN_CAP', y, 10000000)),

  // Accuracy-Related Penalty — IRC §6662
  ...years(2018, 2030, y => p('ACCURACY_PENALTY_RATE', y, 0.20)),
  ...years(2018, 2030, y => p('ACCURACY_PENALTY_GROSS_RATE', y, 0.40)),
  ...years(2018, 2030, y => p('SUBSTANTIAL_UNDERSTATEMENT_PCT', y, 0.10)),
  ...years(2018, 2030, y => p('SUBSTANTIAL_UNDERSTATEMENT_FLOOR', y, 10000000, { entityTypes: ['c_corp'] })),
];

// Helper to generate parameter entries for a range of years
function years(start: number, end: number, fn: (y: number) => TaxParameter): TaxParameter[] {
  const result: TaxParameter[] = [];
  for (let y = start; y <= end; y++) {
    result.push(fn(y));
  }
  return result;
}
