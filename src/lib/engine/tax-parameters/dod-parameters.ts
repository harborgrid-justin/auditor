/**
 * DoD Financial Management Parameter Definitions
 *
 * All DoD financial management parameters with fiscal-year-by-fiscal-year values.
 * This serves as the in-memory source of truth for military pay, civilian pay,
 * travel, contracts, disbursing, and budget execution parameters. Values can be
 * overridden in the database for specific component or engagement-level adjustments.
 *
 * Sources: NDAA enacted legislation, DoD FMR volumes, JTR, OPM pay tables,
 * FAR/DFARS thresholds, Treasury Prompt Payment rates.
 */

import type { TaxParameter, TaxParameterDefinition } from '@/types/tax-compliance';

// --- Parameter Definitions (metadata) ---

export const DOD_PARAMETER_DEFINITIONS: TaxParameterDefinition[] = [
  // Military Pay
  { code: 'DOD_MILPAY_RAISE_PCT', displayName: 'Annual Military Pay Raise Percentage', description: 'Annual military pay raise percentage', ircSection: 'Vol 7, Ch 3', category: 'military_pay', valueType: 'percentage', inflationAdjusted: false },
  { code: 'DOD_BAS_ENLISTED', displayName: 'Enlisted BAS Monthly Rate', description: 'Enlisted BAS monthly rate', ircSection: 'Vol 7, Ch 25', category: 'military_pay', valueType: 'currency', inflationAdjusted: true },
  { code: 'DOD_BAS_OFFICER', displayName: 'Officer BAS Monthly Rate', description: 'Officer BAS monthly rate', ircSection: 'Vol 7, Ch 25', category: 'military_pay', valueType: 'currency', inflationAdjusted: true },
  { code: 'DOD_TSP_MATCH_MAX_PCT', displayName: 'Maximum TSP Agency Match', description: 'Maximum TSP agency match', ircSection: 'Vol 7, Ch 50', category: 'military_pay', valueType: 'percentage', inflationAdjusted: false },
  { code: 'DOD_TSP_ELECTIVE_LIMIT', displayName: 'Annual TSP Elective Deferral Limit', description: 'Annual TSP elective deferral limit', ircSection: 'Vol 7, Ch 50', category: 'military_pay', valueType: 'currency', inflationAdjusted: true },

  // Civilian Pay
  { code: 'DOD_FERS_EMPLOYEE_RATE', displayName: 'FERS Employee Contribution Rate', description: 'FERS employee contribution rate', ircSection: 'Vol 8, Ch 3', category: 'civilian_pay', valueType: 'percentage', inflationAdjusted: false },
  { code: 'DOD_FERS_REVISED_RATE', displayName: 'FERS-Revised Employee Rate', description: 'FERS-Revised employee rate', ircSection: 'Vol 8, Ch 3', category: 'civilian_pay', valueType: 'percentage', inflationAdjusted: false },
  { code: 'DOD_FEHB_GOV_CONTRIBUTION_PCT', displayName: 'Government FEHB Contribution Percentage', description: 'Government FEHB contribution percentage', ircSection: 'Vol 8, Ch 4', category: 'civilian_pay', valueType: 'percentage', inflationAdjusted: false },
  { code: 'DOD_PREMIUM_PAY_CAP', displayName: 'Premium Pay Cap', description: 'Premium pay cap (GS-15 step 10 equiv)', ircSection: 'Vol 8, Ch 5', category: 'civilian_pay', valueType: 'currency', inflationAdjusted: true },

  // Travel
  { code: 'DOD_CONUS_PERDIEM_STD', displayName: 'Standard CONUS Per Diem Rate', description: 'Standard CONUS per diem rate', ircSection: 'Vol 9, Ch 3', category: 'travel', valueType: 'currency', inflationAdjusted: true },
  { code: 'DOD_CONUS_LODGING_STD', displayName: 'Standard CONUS Lodging Rate', description: 'Standard CONUS lodging rate', ircSection: 'Vol 9, Ch 3', category: 'travel', valueType: 'currency', inflationAdjusted: true },
  { code: 'DOD_CONUS_MIE_STD', displayName: 'Standard CONUS M&IE Rate', description: 'Standard CONUS M&IE rate', ircSection: 'Vol 9, Ch 3', category: 'travel', valueType: 'currency', inflationAdjusted: true },

  // Contracts
  { code: 'DOD_MICRO_PURCHASE_THRESHOLD', displayName: 'Micro-Purchase Threshold', description: 'Micro-purchase threshold', ircSection: 'Vol 10, Ch 1', category: 'contracts', valueType: 'currency', inflationAdjusted: false },
  { code: 'DOD_SIMPLIFIED_ACQ_THRESHOLD', displayName: 'Simplified Acquisition Threshold', description: 'Simplified acquisition threshold', ircSection: 'Vol 10, Ch 1', category: 'contracts', valueType: 'currency', inflationAdjusted: false },
  { code: 'DOD_PROGRESS_PAY_LB_PCT', displayName: 'Progress Payment Rate - Large Business', description: 'Progress payment rate - large business', ircSection: 'Vol 10, Ch 7', category: 'contracts', valueType: 'percentage', inflationAdjusted: false },
  { code: 'DOD_PROGRESS_PAY_SB_PCT', displayName: 'Progress Payment Rate - Small Business', description: 'Progress payment rate - small business', ircSection: 'Vol 10, Ch 7', category: 'contracts', valueType: 'percentage', inflationAdjusted: false },
  { code: 'DOD_DCAA_AUDIT_THRESHOLD', displayName: 'DCAA Audit Required Threshold', description: 'DCAA audit required threshold', ircSection: 'Vol 10, Ch 9', category: 'contracts', valueType: 'currency', inflationAdjusted: false },

  // Disbursing
  { code: 'DOD_PROMPT_PAY_NET_DAYS', displayName: 'Prompt Payment Act Net Payment Days', description: 'Prompt Payment Act net payment days', ircSection: 'Vol 5, Ch 9', category: 'disbursing', valueType: 'integer', inflationAdjusted: false },
  { code: 'DOD_PROMPT_PAY_INTEREST_RATE', displayName: 'Prompt Payment Interest Penalty Rate', description: 'Prompt Payment interest penalty rate', ircSection: 'Vol 5, Ch 9', category: 'disbursing', valueType: 'percentage', inflationAdjusted: false },

  // Budget Execution
  { code: 'DOD_ULO_REVIEW_DAYS', displayName: 'Unliquidated Obligation Review Threshold (Days)', description: 'Unliquidated obligation review threshold (days)', ircSection: 'Vol 3, Ch 8', category: 'budget_execution', valueType: 'integer', inflationAdjusted: false },
  { code: 'DOD_YEAREND_SPIKE_MULTIPLIER', displayName: 'Year-End Spend Spike Multiplier', description: 'Multiplier threshold for detecting year-end spending spikes', ircSection: 'Vol 3, Ch 8', category: 'budget_execution', valueType: 'integer', inflationAdjusted: false },
  { code: 'DOD_LOW_EXECUTION_THRESHOLD', displayName: 'Low Execution Rate Threshold', description: 'Low execution rate threshold (below which triggers alert)', ircSection: 'Vol 3, Ch 8', category: 'budget_execution', valueType: 'percentage', inflationAdjusted: false },
  { code: 'DOD_HIGH_EXECUTION_THRESHOLD', displayName: 'High Execution Rate Threshold', description: 'High execution rate threshold (above which triggers review)', ircSection: 'Vol 3, Ch 8', category: 'budget_execution', valueType: 'percentage', inflationAdjusted: false },
  { code: 'DOD_STALE_OBLIGATION_DAYS', displayName: 'Stale Obligation Threshold (Days)', description: 'Days after which an unliquidated obligation is considered stale', ircSection: 'Vol 3, Ch 8', category: 'budget_execution', valueType: 'integer', inflationAdjusted: false },

  // ADA Compliance
  { code: 'DOD_ADA_REPORT_DEADLINE_DAYS', displayName: 'ADA Reporting Deadline (Days)', description: 'Days from discovery to required ADA violation report', ircSection: 'Vol 14, Ch 3', category: 'ada', valueType: 'integer', inflationAdjusted: false },

  // Disbursing Thresholds
  { code: 'DOD_EXPENSE_INVESTMENT_THRESHOLD', displayName: 'Expense/Investment Threshold', description: 'Dollar threshold between expense and investment classification', ircSection: 'Vol 5, Ch 4', category: 'disbursing', valueType: 'currency', inflationAdjusted: false },
  { code: 'DOD_EFT_COMPLIANCE_THRESHOLD', displayName: 'EFT Compliance Target Rate', description: 'Target percentage for EFT payment compliance', ircSection: 'Vol 5, Ch 3', category: 'disbursing', valueType: 'percentage', inflationAdjusted: false },

  // Contract Thresholds (Phase 1.3 — Acquisition Threshold Versioning)
  { code: 'DOD_TINA_THRESHOLD', displayName: 'TINA/Cost or Pricing Data Threshold', description: 'Truth in Negotiations Act threshold requiring certified cost or pricing data', ircSection: 'Vol 10, Ch 2', category: 'contracts', valueType: 'currency', inflationAdjusted: false },
  { code: 'DOD_CAS_THRESHOLD', displayName: 'Cost Accounting Standards Threshold', description: 'Dollar threshold above which CAS applies to contracts', ircSection: 'Vol 10, Ch 2', category: 'contracts', valueType: 'currency', inflationAdjusted: false },
  { code: 'DOD_COMMERCIAL_ITEM_THRESHOLD', displayName: 'Commercial Item Test Threshold', description: 'Threshold for commercial item determination under FAR Part 12', ircSection: 'Vol 10, Ch 1', category: 'contracts', valueType: 'currency', inflationAdjusted: false },

  // Debt Management (Volume 16)
  { code: 'DOD_DEBT_REFERRAL_THRESHOLD', displayName: 'Debt Referral Threshold', description: 'Delinquent debt amount threshold for Treasury referral', ircSection: 'Vol 16, Ch 1', category: 'debt_management', valueType: 'currency', inflationAdjusted: false },
  { code: 'DOD_DEBT_REFERRAL_DAYS', displayName: 'Debt Referral Days', description: 'Days of delinquency before required Treasury referral per DCIA', ircSection: 'Vol 16, Ch 1', category: 'debt_management', valueType: 'integer', inflationAdjusted: false },
  { code: 'DOD_DEBT_COMPROMISE_AGENCY_LIMIT', displayName: 'Debt Compromise Agency Limit', description: 'Maximum debt amount an agency may compromise without DOJ referral', ircSection: 'Vol 16, Ch 3', category: 'debt_management', valueType: 'currency', inflationAdjusted: false },
  { code: 'DOD_DEBT_INTEREST_RATE', displayName: 'Debt Interest Rate', description: 'Interest rate on delinquent debts per Treasury current value of funds rate', ircSection: 'Vol 16, Ch 2', category: 'debt_management', valueType: 'percentage', inflationAdjusted: false },
  { code: 'DOD_DEBT_ADMIN_FEE', displayName: 'Debt Administrative Fee', description: 'Administrative fee assessed on delinquent debts per 31 U.S.C. §3717', ircSection: 'Vol 16, Ch 2', category: 'debt_management', valueType: 'currency', inflationAdjusted: false },
  { code: 'DOD_DEBT_WRITEOFF_THRESHOLD', displayName: 'Debt Write-Off Threshold', description: 'Threshold above which debt write-off requires higher authority approval', ircSection: 'Vol 16, Ch 4', category: 'debt_management', valueType: 'currency', inflationAdjusted: false },
  { code: 'DOD_TRAVEL_CARD_SALARY_OFFSET_THRESHOLD', displayName: 'Travel Card Salary Offset Threshold', description: 'Delinquency threshold for initiating salary offset on travel card debt', ircSection: 'Vol 16, Ch 5', category: 'debt_management', valueType: 'currency', inflationAdjusted: false },

  // Property Accountability
  { code: 'DOD_PP_E_CAPITALIZATION_THRESHOLD', displayName: 'PP&E Capitalization Threshold', description: 'Dollar threshold for capitalizing general PP&E per SFFAS 6', ircSection: 'Vol 4, Ch 6', category: 'accounting', valueType: 'currency', inflationAdjusted: false },
  { code: 'DOD_INTERNAL_USE_SOFTWARE_THRESHOLD', displayName: 'Internal Use Software Capitalization Threshold', description: 'Threshold for capitalizing internal-use software per SFFAS 10', ircSection: 'Vol 4, Ch 6', category: 'accounting', valueType: 'currency', inflationAdjusted: false },

  // SFFAS 54 Lease Accounting (effective FY2027)
  { code: 'DOD_LEASE_CAPITALIZATION_THRESHOLD', displayName: 'Lease Capitalization Threshold', description: 'Dollar threshold for capitalizing lease assets per SFFAS 54', ircSection: 'Vol 4, Ch 6', category: 'accounting', valueType: 'currency', inflationAdjusted: false },
  { code: 'DOD_LEASE_TERM_THRESHOLD_MONTHS', displayName: 'Lease Term Threshold (Months)', description: 'Minimum lease term in months requiring capitalization per SFFAS 54', ircSection: 'Vol 4, Ch 6', category: 'accounting', valueType: 'integer', inflationAdjusted: false },
];

// Helper to generate parameter entries for a range of years
function years(start: number, end: number, fn: (y: number) => TaxParameter): TaxParameter[] {
  const result: TaxParameter[] = [];
  for (let y = start; y <= end; y++) {
    result.push(fn(y));
  }
  return result;
}

// --- Year-by-Year Parameter Values ---

function p(code: string, taxYear: number, value: number, opts?: Partial<Pick<TaxParameter, 'entityTypes' | 'sunsetDate' | 'notes' | 'legislationId'>>): TaxParameter {
  const def = DOD_PARAMETER_DEFINITIONS.find(d => d.code === code);
  return {
    code,
    taxYear,
    value,
    valueType: def?.valueType ?? 'currency',
    entityTypes: opts?.entityTypes ?? ['dod_component', 'defense_agency', 'combatant_command', 'working_capital_fund', 'naf_entity'],
    citation: def ? `DoD FMR ${def.ircSection}` : '',
    legislationId: opts?.legislationId,
    sunsetDate: opts?.sunsetDate,
    notes: opts?.notes,
  };
}

export const DOD_PARAMETERS: TaxParameter[] = [
  // -----------------------------------------------------------------------
  // Military Pay
  // -----------------------------------------------------------------------

  // Annual Military Pay Raise Percentage — DoD FMR Vol 7, Ch 3
  p('DOD_MILPAY_RAISE_PCT', 2024, 0.052, { legislationId: 'NDAA_FY2024' }),
  p('DOD_MILPAY_RAISE_PCT', 2025, 0.045, { legislationId: 'NDAA_FY2025' }),
  p('DOD_MILPAY_RAISE_PCT', 2026, 0.045, { legislationId: 'NDAA_FY2026' }),

  // Enlisted BAS Monthly Rate — DoD FMR Vol 7, Ch 25
  p('DOD_BAS_ENLISTED', 2024, 452.56),
  p('DOD_BAS_ENLISTED', 2025, 460.25),
  p('DOD_BAS_ENLISTED', 2026, 470.00),

  // Officer BAS Monthly Rate — DoD FMR Vol 7, Ch 25
  p('DOD_BAS_OFFICER', 2024, 311.68),
  p('DOD_BAS_OFFICER', 2025, 318.00),
  p('DOD_BAS_OFFICER', 2026, 325.00),

  // Maximum TSP Agency Match — DoD FMR Vol 7, Ch 50
  ...years(2024, 2026, y => p('DOD_TSP_MATCH_MAX_PCT', y, 0.05)),

  // Annual TSP Elective Deferral Limit — DoD FMR Vol 7, Ch 50
  p('DOD_TSP_ELECTIVE_LIMIT', 2024, 23000),
  p('DOD_TSP_ELECTIVE_LIMIT', 2025, 23500),
  p('DOD_TSP_ELECTIVE_LIMIT', 2026, 24000),

  // -----------------------------------------------------------------------
  // Civilian Pay
  // -----------------------------------------------------------------------

  // FERS Employee Contribution Rate — DoD FMR Vol 8, Ch 3
  ...years(2024, 2026, y => p('DOD_FERS_EMPLOYEE_RATE', y, 0.008)),

  // FERS-Revised Employee Rate — DoD FMR Vol 8, Ch 3
  ...years(2024, 2026, y => p('DOD_FERS_REVISED_RATE', y, 0.045)),

  // Government FEHB Contribution Percentage — DoD FMR Vol 8, Ch 4
  ...years(2024, 2026, y => p('DOD_FEHB_GOV_CONTRIBUTION_PCT', y, 0.72)),

  // Premium Pay Cap (GS-15 Step 10 equiv) — DoD FMR Vol 8, Ch 5
  p('DOD_PREMIUM_PAY_CAP', 2024, 191900),
  p('DOD_PREMIUM_PAY_CAP', 2025, 196300),
  p('DOD_PREMIUM_PAY_CAP', 2026, 201000),

  // -----------------------------------------------------------------------
  // Travel
  // -----------------------------------------------------------------------

  // Standard CONUS Per Diem Rate — DoD FMR Vol 9, Ch 3
  p('DOD_CONUS_PERDIEM_STD', 2024, 166),
  p('DOD_CONUS_PERDIEM_STD', 2025, 172),
  p('DOD_CONUS_PERDIEM_STD', 2026, 178),

  // Standard CONUS Lodging Rate — DoD FMR Vol 9, Ch 3
  p('DOD_CONUS_LODGING_STD', 2024, 107),
  p('DOD_CONUS_LODGING_STD', 2025, 110),
  p('DOD_CONUS_LODGING_STD', 2026, 114),

  // Standard CONUS M&IE Rate — DoD FMR Vol 9, Ch 3
  p('DOD_CONUS_MIE_STD', 2024, 59),
  p('DOD_CONUS_MIE_STD', 2025, 62),
  p('DOD_CONUS_MIE_STD', 2026, 64),

  // -----------------------------------------------------------------------
  // Contracts
  // -----------------------------------------------------------------------

  // Micro-Purchase Threshold — DoD FMR Vol 10, Ch 1
  ...years(2024, 2026, y => p('DOD_MICRO_PURCHASE_THRESHOLD', y, 10000)),

  // Simplified Acquisition Threshold — DoD FMR Vol 10, Ch 1
  ...years(2024, 2026, y => p('DOD_SIMPLIFIED_ACQ_THRESHOLD', y, 250000)),

  // Progress Payment Rate - Large Business — DoD FMR Vol 10, Ch 7
  ...years(2024, 2026, y => p('DOD_PROGRESS_PAY_LB_PCT', y, 0.80)),

  // Progress Payment Rate - Small Business — DoD FMR Vol 10, Ch 7
  ...years(2024, 2026, y => p('DOD_PROGRESS_PAY_SB_PCT', y, 0.90)),

  // DCAA Audit Required Threshold — DoD FMR Vol 10, Ch 9
  ...years(2024, 2026, y => p('DOD_DCAA_AUDIT_THRESHOLD', y, 2000000)),

  // -----------------------------------------------------------------------
  // Disbursing
  // -----------------------------------------------------------------------

  // Prompt Payment Act Net Payment Days — DoD FMR Vol 5, Ch 9
  ...years(2024, 2026, y => p('DOD_PROMPT_PAY_NET_DAYS', y, 30)),

  // Prompt Payment Interest Penalty Rate — DoD FMR Vol 5, Ch 9
  p('DOD_PROMPT_PAY_INTEREST_RATE', 2024, 0.0475),
  p('DOD_PROMPT_PAY_INTEREST_RATE', 2025, 0.05),
  p('DOD_PROMPT_PAY_INTEREST_RATE', 2026, 0.0525),

  // -----------------------------------------------------------------------
  // Budget Execution
  // -----------------------------------------------------------------------

  // Unliquidated Obligation Review Threshold (Days) — DoD FMR Vol 3, Ch 8
  ...years(2024, 2026, y => p('DOD_ULO_REVIEW_DAYS', y, 180)),

  // -----------------------------------------------------------------------
  // Budget Execution Thresholds (previously hardcoded in rule files)
  // -----------------------------------------------------------------------

  // Year-End Spend Spike Multiplier — DoD FMR Vol 3, Ch 8
  ...years(2024, 2026, y => p('DOD_YEAREND_SPIKE_MULTIPLIER', y, 2.0)),

  // Low Execution Rate Threshold — DoD FMR Vol 3, Ch 8
  ...years(2024, 2026, y => p('DOD_LOW_EXECUTION_THRESHOLD', y, 0.25)),

  // High Execution Rate Threshold — DoD FMR Vol 3, Ch 8
  ...years(2024, 2026, y => p('DOD_HIGH_EXECUTION_THRESHOLD', y, 0.98)),

  // Stale Obligation Days — DoD FMR Vol 3, Ch 8
  ...years(2024, 2026, y => p('DOD_STALE_OBLIGATION_DAYS', y, 365)),

  // -----------------------------------------------------------------------
  // ADA Compliance
  // -----------------------------------------------------------------------

  // ADA Reporting Deadline Days — DoD FMR Vol 14, Ch 3
  ...years(2024, 2026, y => p('DOD_ADA_REPORT_DEADLINE_DAYS', y, 30)),

  // -----------------------------------------------------------------------
  // Disbursing Thresholds
  // -----------------------------------------------------------------------

  // Expense/Investment Threshold — DoD FMR Vol 5, Ch 4
  ...years(2024, 2026, y => p('DOD_EXPENSE_INVESTMENT_THRESHOLD', y, 250000)),

  // EFT Compliance Threshold (%) — DoD FMR Vol 5, Ch 3
  ...years(2024, 2026, y => p('DOD_EFT_COMPLIANCE_THRESHOLD', y, 0.95)),

  // -----------------------------------------------------------------------
  // FY2027 Parameter Values (SFFAS 54 Lease Accounting effective)
  // -----------------------------------------------------------------------

  p('DOD_MILPAY_RAISE_PCT', 2027, 0.04, { notes: 'Placeholder pending NDAA FY2027 enactment' }),
  p('DOD_BAS_ENLISTED', 2027, 480.00),
  p('DOD_BAS_OFFICER', 2027, 332.00),
  p('DOD_TSP_MATCH_MAX_PCT', 2027, 0.05),
  p('DOD_TSP_ELECTIVE_LIMIT', 2027, 24500),
  p('DOD_FERS_EMPLOYEE_RATE', 2027, 0.008),
  p('DOD_FERS_REVISED_RATE', 2027, 0.045),
  p('DOD_FEHB_GOV_CONTRIBUTION_PCT', 2027, 0.72),
  p('DOD_PREMIUM_PAY_CAP', 2027, 206000),
  p('DOD_CONUS_PERDIEM_STD', 2027, 184),
  p('DOD_CONUS_LODGING_STD', 2027, 118),
  p('DOD_CONUS_MIE_STD', 2027, 66),
  p('DOD_MICRO_PURCHASE_THRESHOLD', 2027, 10000),
  p('DOD_SIMPLIFIED_ACQ_THRESHOLD', 2027, 250000),
  p('DOD_PROGRESS_PAY_LB_PCT', 2027, 0.80),
  p('DOD_PROGRESS_PAY_SB_PCT', 2027, 0.90),
  p('DOD_DCAA_AUDIT_THRESHOLD', 2027, 2000000),
  p('DOD_PROMPT_PAY_NET_DAYS', 2027, 30),
  p('DOD_PROMPT_PAY_INTEREST_RATE', 2027, 0.055),
  p('DOD_ULO_REVIEW_DAYS', 2027, 180),
  p('DOD_YEAREND_SPIKE_MULTIPLIER', 2027, 2.0),
  p('DOD_LOW_EXECUTION_THRESHOLD', 2027, 0.25),
  p('DOD_HIGH_EXECUTION_THRESHOLD', 2027, 0.98),
  p('DOD_STALE_OBLIGATION_DAYS', 2027, 365),
  p('DOD_ADA_REPORT_DEADLINE_DAYS', 2027, 30),
  p('DOD_EXPENSE_INVESTMENT_THRESHOLD', 2027, 250000),
  p('DOD_EFT_COMPLIANCE_THRESHOLD', 2027, 0.95),

  // -----------------------------------------------------------------------
  // Contract Thresholds (TINA, CAS, Commercial Item) — FAR/DFARS
  // -----------------------------------------------------------------------

  ...years(2024, 2027, y => p('DOD_TINA_THRESHOLD', y, 2000000)),
  ...years(2024, 2027, y => p('DOD_CAS_THRESHOLD', y, 2000000)),
  ...years(2024, 2027, y => p('DOD_COMMERCIAL_ITEM_THRESHOLD', y, 250000)),

  // -----------------------------------------------------------------------
  // Debt Management (Volume 16) — DCIA, 31 U.S.C. Ch 37
  // -----------------------------------------------------------------------

  ...years(2024, 2027, y => p('DOD_DEBT_REFERRAL_THRESHOLD', y, 25000)),
  ...years(2024, 2027, y => p('DOD_DEBT_REFERRAL_DAYS', y, 120)),
  ...years(2024, 2027, y => p('DOD_DEBT_COMPROMISE_AGENCY_LIMIT', y, 100000)),
  p('DOD_DEBT_INTEREST_RATE', 2024, 0.0475),
  p('DOD_DEBT_INTEREST_RATE', 2025, 0.05),
  p('DOD_DEBT_INTEREST_RATE', 2026, 0.0525),
  p('DOD_DEBT_INTEREST_RATE', 2027, 0.055),
  ...years(2024, 2027, y => p('DOD_DEBT_ADMIN_FEE', y, 55)),
  ...years(2024, 2027, y => p('DOD_DEBT_WRITEOFF_THRESHOLD', y, 100000)),
  ...years(2024, 2027, y => p('DOD_TRAVEL_CARD_SALARY_OFFSET_THRESHOLD', y, 250)),

  // -----------------------------------------------------------------------
  // Property Accountability — SFFAS 6, DoD FMR Vol 4 Ch 6
  // -----------------------------------------------------------------------

  ...years(2024, 2027, y => p('DOD_PP_E_CAPITALIZATION_THRESHOLD', y, 250000)),
  ...years(2024, 2027, y => p('DOD_INTERNAL_USE_SOFTWARE_THRESHOLD', y, 250000)),

  // -----------------------------------------------------------------------
  // SFFAS 54 Lease Accounting — Effective FY2027
  // -----------------------------------------------------------------------

  p('DOD_LEASE_CAPITALIZATION_THRESHOLD', 2027, 100000, { legislationId: 'FASAB_SFFAS54', notes: 'SFFAS 54 effective for FY beginning after Sep 30, 2026' }),
  p('DOD_LEASE_TERM_THRESHOLD_MONTHS', 2027, 24, { legislationId: 'FASAB_SFFAS54', notes: 'Leases >24 months require capitalization per SFFAS 54' }),
];
