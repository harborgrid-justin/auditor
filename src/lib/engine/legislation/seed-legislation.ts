/**
 * Seed Legislation Data
 *
 * Pre-seeded legislation records and rule links for the legislative change
 * tracker. Each entry represents a significant piece of tax legislation that
 * affects audit rules and tax parameters.
 *
 * Sources: Public law text, IRS guidance, Congressional Research Service summaries.
 */

import type { Legislation, LegislationRuleLink } from '@/types/tax-compliance';

// ---------------------------------------------------------------------------
// Legislation Records
// ---------------------------------------------------------------------------

export const SEED_LEGISLATION: Legislation[] = [
  {
    id: 'TCJA',
    name: 'Tax Cuts and Jobs Act of 2017',
    shortName: 'TCJA',
    publicLaw: 'P.L. 115-97',
    enactedDate: '2017-12-22',
    effectiveDate: '2018-01-01',
    sunsetDate: '2025-12-31',
    status: 'active',
    affectedSections: [
      '§1',        // Individual tax rates
      '§11',       // Corporate tax rate (21% flat — permanent)
      '§168(k)',   // Bonus depreciation phase-down
      '§199A',     // Qualified business income deduction
      '§164(b)(6)',// SALT deduction cap
      '§163(j)',   // Business interest limitation (30% ATI)
      '§174',      // R&D amortization requirement
      '§461(l)',   // Excess business loss limitation
      '§162(m)',   // Executive compensation expanded definition
    ],
    summary:
      'Comprehensive tax reform reducing the corporate rate to 21%, creating the §199A QBI deduction ' +
      'for pass-throughs, imposing a $10,000 SALT deduction cap, limiting business interest deductions ' +
      'to 30% of ATI, requiring capitalization of R&D under §174, implementing bonus depreciation ' +
      'phase-down from 100% to 0% over 2023-2027, and limiting excess business losses. Most individual ' +
      'provisions sunset after December 31, 2025.',
  },
  {
    id: 'CARES',
    name: 'Coronavirus Aid, Relief, and Economic Security Act',
    shortName: 'CARES Act',
    publicLaw: 'P.L. 116-136',
    enactedDate: '2020-03-27',
    effectiveDate: '2020-03-27',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      '§172',   // NOL carryback — 5-year carryback for 2018-2020 NOLs
      '§163(j)',// Temporary increase to 50% ATI for 2019-2020
    ],
    summary:
      'Emergency pandemic legislation that temporarily allowed 5-year NOL carrybacks for losses ' +
      'arising in tax years 2018, 2019, and 2020, and temporarily increased the §163(j) business ' +
      'interest limitation from 30% to 50% of ATI for tax years 2019 and 2020. Also provided ' +
      'employer retention credits and payroll tax deferrals.',
  },
  {
    id: 'IRA2022',
    name: 'Inflation Reduction Act of 2022',
    shortName: 'IRA 2022',
    publicLaw: 'P.L. 117-169',
    enactedDate: '2022-08-16',
    effectiveDate: '2023-01-01',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      '§55',    // Corporate Alternative Minimum Tax (CAMT) — 15% on AFSI
      '§59(k)', // Applicable corporation definition ($1B AFSI threshold)
      '§45',    // Production Tax Credit (clean energy extension)
      '§48',    // Investment Tax Credit (clean energy extension)
      '§30D',   // Clean Vehicle Credit
      '§45Y',   // Clean Electricity Production Credit (technology-neutral)
      '§48E',   // Clean Electricity Investment Credit (technology-neutral)
    ],
    summary:
      'Reinstated the corporate alternative minimum tax (CAMT) at 15% on adjusted financial ' +
      'statement income (AFSI) for corporations with 3-year average AFSI exceeding $1 billion. ' +
      'Extended and expanded clean energy tax credits including technology-neutral production and ' +
      'investment credits, clean vehicle credits, and energy-efficient building provisions. Also ' +
      'imposed a 1% excise tax on stock buybacks under new §4501.',
  },
  {
    id: 'SECURE20',
    name: 'SECURE 2.0 Act of 2022',
    shortName: 'SECURE 2.0',
    publicLaw: 'P.L. 117-328',
    enactedDate: '2022-12-29',
    effectiveDate: '2023-01-01',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      '§401(a)', // Qualified plan requirements
      '§401(k)', // 401(k) automatic enrollment
      '§402A',   // Roth contribution changes
      '§408(p)', // SIMPLE IRA enhancements
      '§72(t)',  // Early distribution penalty exceptions
      '§219',    // IRA contribution limits
    ],
    summary:
      'Major retirement plan legislation requiring automatic enrollment for new 401(k) and ' +
      '403(b) plans, increasing catch-up contribution limits, expanding Roth options for ' +
      'employer matching, raising the RMD age to 73 (2023) and 75 (2033), allowing emergency ' +
      'penalty-free distributions, and creating the Saver\'s Match credit. Phases in over ' +
      'multiple years from 2023 through 2033.',
  },
  {
    id: 'CAA2021',
    name: 'Consolidated Appropriations Act, 2021',
    shortName: 'CAA 2021',
    publicLaw: 'P.L. 116-260',
    enactedDate: '2020-12-27',
    effectiveDate: '2021-01-01',
    sunsetDate: '2022-12-31',
    status: 'fully_sunset',
    affectedSections: [
      '§274(n)', // Temporary 100% meals deduction for restaurant meals
    ],
    summary:
      'Temporarily increased the business meals deduction from 50% to 100% for food and ' +
      'beverages provided by a restaurant, effective for expenses paid or incurred in calendar ' +
      'years 2021 and 2022. This provision sunset after December 31, 2022, reverting the meals ' +
      'deduction to the standard 50% limitation.',
  },
];

// ---------------------------------------------------------------------------
// Legislation-to-Rule Links
// ---------------------------------------------------------------------------

export const SEED_RULE_LINKS: LegislationRuleLink[] = [
  // --- TCJA Rule Links ---
  {
    id: 'link-tcja-dep-001',
    legislationId: 'TCJA',
    ruleId: 'IRS-DEP-001',
    parameterCode: 'BONUS_DEPR_RATE',
    impactDescription:
      'TCJA enacted 100% bonus depreciation for qualified property placed in service after ' +
      'September 27, 2017. Phase-down begins 2023 (80%), 2024 (60%), 2025 (40%), 2026 (20%), ' +
      '2027 (0%). Material book-tax depreciation differences expected during phase-down.',
  },
  {
    id: 'link-tcja-dep-002',
    legislationId: 'TCJA',
    ruleId: 'IRS-DEP-002',
    parameterCode: 'SEC_179_LIMIT',
    impactDescription:
      'TCJA doubled the §179 expense limit and phase-out threshold, with ongoing inflation ' +
      'indexing. Ensure the correct year-specific limit is applied.',
  },
  {
    id: 'link-tcja-ded-002',
    legislationId: 'TCJA',
    ruleId: 'IRS-DED-002',
    parameterCode: 'SEC_163J_ATI_PCT',
    impactDescription:
      'TCJA imposed the §163(j) business interest limitation at 30% of adjusted taxable ' +
      'income, applicable to all taxpayers except small businesses under the gross receipts test.',
  },
  {
    id: 'link-tcja-ded-003',
    legislationId: 'TCJA',
    ruleId: 'IRS-DED-003',
    parameterCode: 'SEC_162M_LIMIT',
    impactDescription:
      'TCJA expanded the definition of covered employees under §162(m) to include CFOs and ' +
      'eliminated the performance-based compensation exception. Once an individual is a covered ' +
      'employee, the designation is permanent.',
  },
  {
    id: 'link-tcja-bd-001',
    legislationId: 'TCJA',
    ruleId: 'IRS-BD-001',
    parameterCode: 'BONUS_DEPR_RATE',
    impactDescription:
      'Bonus depreciation rate phases down annually under TCJA: 100% (2022), 80% (2023), ' +
      '60% (2024), 40% (2025), 20% (2026), 0% (2027+). Verify that the correct rate is used ' +
      'for each asset\'s placed-in-service date.',
  },
  {
    id: 'link-tcja-nol-001',
    legislationId: 'TCJA',
    ruleId: 'IRS-NOL-001',
    parameterCode: 'NOL_DEDUCTION_LIMIT_PCT',
    impactDescription:
      'TCJA limited the NOL deduction to 80% of taxable income for losses arising in tax years ' +
      'beginning after December 31, 2017. Eliminates the prior 100% deduction and 2-year ' +
      'carryback (with narrow exceptions).',
  },
  {
    id: 'link-tcja-nol-002',
    legislationId: 'TCJA',
    ruleId: 'IRS-NOL-002',
    impactDescription:
      'TCJA eliminated NOL carrybacks for most taxpayers, effective for losses arising in tax ' +
      'years ending after December 31, 2017. Farming losses retain a 2-year carryback.',
  },
  {
    id: 'link-tcja-rda-001',
    legislationId: 'TCJA',
    ruleId: 'IRS-RDA-001',
    parameterCode: 'RD_AMORT_DOMESTIC_YRS',
    impactDescription:
      'TCJA §174 amendments require capitalization and amortization of R&D expenditures ' +
      'beginning in tax years after December 31, 2021. Domestic: 5-year amortization; ' +
      'foreign: 15-year amortization. Immediate expensing is no longer permitted.',
  },

  // --- CARES Act Rule Links ---
  {
    id: 'link-cares-nol-001',
    legislationId: 'CARES',
    ruleId: 'IRS-NOL-001',
    parameterCode: 'NOL_DEDUCTION_LIMIT_PCT',
    impactDescription:
      'CARES Act temporarily suspended the 80% NOL limitation for tax years 2018, 2019, ' +
      'and 2020, allowing 100% NOL deduction in those years.',
  },
  {
    id: 'link-cares-nol-002',
    legislationId: 'CARES',
    ruleId: 'IRS-NOL-002',
    impactDescription:
      'CARES Act temporarily allowed 5-year NOL carrybacks for net operating losses arising ' +
      'in tax years 2018, 2019, and 2020.',
  },
  {
    id: 'link-cares-ded-002',
    legislationId: 'CARES',
    ruleId: 'IRS-DED-002',
    parameterCode: 'SEC_163J_ATI_PCT',
    impactDescription:
      'CARES Act temporarily increased the §163(j) ATI percentage from 30% to 50% for ' +
      'tax years 2019 and 2020.',
  },

  // --- IRA 2022 Rule Links ---
  {
    id: 'link-ira-amt-001',
    legislationId: 'IRA2022',
    ruleId: 'IRS-AMT-001',
    parameterCode: 'CAMT_THRESHOLD',
    impactDescription:
      'IRA reinstated the corporate AMT (CAMT) at 15% on adjusted financial statement income ' +
      'for applicable corporations with 3-year average AFSI exceeding $1 billion, effective ' +
      'for tax years beginning after December 31, 2022.',
  },
  {
    id: 'link-ira-amt-002',
    legislationId: 'IRA2022',
    ruleId: 'IRS-AMT-002',
    parameterCode: 'CAMT_RATE',
    impactDescription:
      'CAMT imposes a 15% minimum tax on adjusted financial statement income. The tentative ' +
      'minimum tax is the excess of 15% of AFSI (less CAMT foreign tax credit) over the ' +
      'corporate AMT foreign tax credit.',
  },

  // --- CAA 2021 Rule Links ---
  {
    id: 'link-caa-ded-001',
    legislationId: 'CAA2021',
    ruleId: 'IRS-DED-001',
    parameterCode: 'MEALS_DEDUCTION_PCT',
    impactDescription:
      'CAA 2021 temporarily increased the business meals deduction to 100% for food and ' +
      'beverages provided by a restaurant for calendar years 2021 and 2022. Sunset after ' +
      'December 31, 2022; reverts to 50% limitation.',
  },
];
