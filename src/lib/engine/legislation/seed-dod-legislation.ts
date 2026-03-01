/**
 * Seed DoD FMR Legislation Data
 *
 * Pre-seeded legislation records and rule links for the DoD Financial
 * Management Regulation (FMR) compliance engine. Each entry represents a
 * significant piece of defense legislation, OMB circular, or FASAB standard
 * that affects DoD audit rules and financial parameters.
 *
 * Sources: Public law text, OMB circulars, FASAB standards, DoD FMR volumes.
 */

import type { Legislation, LegislationRuleLink } from '@/types/tax-compliance';

// ---------------------------------------------------------------------------
// Legislation Records
// ---------------------------------------------------------------------------

export const SEED_DOD_LEGISLATION: Legislation[] = [
  // --- National Defense Authorization Acts ---
  {
    id: 'NDAA_FY2024',
    name: 'National Defense Authorization Act for Fiscal Year 2024',
    shortName: 'NDAA FY2024',
    publicLaw: 'P.L. 118-31',
    enactedDate: '2023-12-22',
    effectiveDate: '2024-01-01',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'Military pay tables',
      'BAH reform',
      'Procurement thresholds',
      'Force structure',
    ],
    summary:
      '5.2% military pay raise effective January 2024. Includes BAH reform provisions, ' +
      'updated procurement thresholds, and force structure authorizations for active-duty, ' +
      'reserve, and National Guard components.',
  },
  {
    id: 'NDAA_FY2025',
    name: 'National Defense Authorization Act for Fiscal Year 2025',
    shortName: 'NDAA FY2025',
    publicLaw: 'P.L. 118-159',
    enactedDate: '2024-12-23',
    effectiveDate: '2025-01-01',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'Military pay tables',
      'FIAR requirements',
      'Audit remediation',
      'Force structure',
    ],
    summary:
      '4.5% military pay raise effective January 2025. Updated Financial Improvement and ' +
      'Audit Remediation (FIAR) requirements, strengthened audit remediation mandates, and ' +
      'continued force structure authorizations.',
  },
  {
    id: 'NDAA_FY2026',
    name: 'National Defense Authorization Act for Fiscal Year 2026',
    shortName: 'NDAA FY2026',
    enactedDate: '2025-12-20',
    effectiveDate: '2026-01-01',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'Military pay tables',
      'Force structure',
    ],
    summary:
      'Placeholder for the annual NDAA update. Authorizes defense programs, military ' +
      'construction, and Department of Energy national security activities for FY2026.',
  },

  // --- DoD Appropriations Acts ---
  {
    id: 'DOD_APPN_FY2024',
    name: 'Department of Defense Appropriations Act, Fiscal Year 2024',
    shortName: 'DoD Appn FY2024',
    publicLaw: 'P.L. 118-47',
    enactedDate: '2024-03-23',
    effectiveDate: '2024-10-01',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'O&M funding levels',
      'Procurement funding levels',
      'RDT&E funding levels',
      'Military personnel funding levels',
    ],
    summary:
      'Annual DoD appropriations providing funding levels for operations and maintenance, ' +
      'procurement, research and development, and military personnel accounts for FY2024.',
  },
  {
    id: 'DOD_APPN_FY2025',
    name: 'Department of Defense Appropriations Act, Fiscal Year 2025',
    shortName: 'DoD Appn FY2025',
    enactedDate: '2025-03-15',
    effectiveDate: '2025-10-01',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'O&M funding levels',
      'Procurement funding levels',
      'RDT&E funding levels',
      'Military personnel funding levels',
    ],
    summary:
      'Annual DoD appropriations providing funding levels for operations and maintenance, ' +
      'procurement, research and development, and military personnel accounts for FY2025.',
  },

  // --- OMB Circulars ---
  {
    id: 'OMB_A11',
    name: 'OMB Circular A-11: Preparation, Submission, and Execution of the Budget',
    shortName: 'OMB A-11',
    enactedDate: '2024-08-01',
    effectiveDate: '2024-08-01',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'Budget formulation',
      'Budget execution',
      'Program performance',
    ],
    summary:
      'Provides guidance on budget preparation, submission, and execution requirements for ' +
      'all federal agencies. Establishes the framework for budget formulation, apportionment, ' +
      'allotment, and expenditure reporting that DoD components must follow.',
  },
  {
    id: 'OMB_A123',
    name: "OMB Circular A-123: Management's Responsibility for Enterprise Risk Management and Internal Control",
    shortName: 'OMB A-123',
    enactedDate: '2016-07-15',
    effectiveDate: '2016-07-15',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'Internal controls over financial reporting',
      'Payment integrity',
      'Enterprise risk management',
      'Appendix A — internal control assessment',
      'Appendix C — payment integrity',
    ],
    summary:
      'Establishes management responsibility for enterprise risk management and internal ' +
      'controls over financial reporting. Requires agencies to assess internal controls, ' +
      'report on payment integrity, and implement corrective action plans for identified ' +
      'deficiencies. Central to DoD audit remediation efforts.',
  },
  {
    id: 'OMB_A136',
    name: 'OMB Circular A-136: Financial Reporting Requirements',
    shortName: 'OMB A-136',
    enactedDate: '2024-08-01',
    effectiveDate: '2024-08-01',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'Financial statement presentation',
      'Notes to financial statements',
      'Required supplementary information',
      'Management discussion and analysis',
    ],
    summary:
      'Prescribes the form and content of federal financial statements. Establishes ' +
      'requirements for the Balance Sheet, Statement of Net Cost, Statement of Changes in ' +
      'Net Position, Statement of Budgetary Resources, and related notes and supplementary ' +
      'information that DoD components must prepare.',
  },

  // --- FASAB Standards ---
  {
    id: 'FASAB_SFFAS1',
    name: 'SFFAS 1: Accounting for Selected Assets and Liabilities',
    shortName: 'SFFAS 1',
    enactedDate: '1997-10-01',
    effectiveDate: '1997-10-01',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'Fund balance with Treasury',
      'Accounts receivable',
      'Advances and prepayments',
      'Accounts payable',
    ],
    summary:
      'Federal Accounting Standards Advisory Board standard establishing recognition, ' +
      'measurement, and disclosure requirements for selected assets (fund balance with ' +
      'Treasury, accounts receivable, advances) and liabilities (accounts payable, other ' +
      'liabilities) reported on federal financial statements.',
  },
  {
    id: 'FASAB_SFFAS5',
    name: 'SFFAS 5: Accounting for Liabilities of the Federal Government',
    shortName: 'SFFAS 5',
    enactedDate: '1997-10-01',
    effectiveDate: '1997-10-01',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'Liability recognition',
      'Contingent liabilities',
      'Environmental liabilities',
      'Federal employee benefits',
    ],
    summary:
      'Establishes recognition and measurement standards for federal liabilities including ' +
      'probable and measurable contingencies, environmental cleanup costs, and federal ' +
      'employee pension and other retirement benefit liabilities.',
  },
  {
    id: 'FASAB_SFFAS6',
    name: 'SFFAS 6: Accounting for Property, Plant, and Equipment',
    shortName: 'SFFAS 6',
    enactedDate: '1998-10-01',
    effectiveDate: '1998-10-01',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'General PP&E',
      'National defense PP&E',
      'Heritage assets',
      'Stewardship land',
    ],
    summary:
      'Establishes accounting standards for federal property, plant, and equipment including ' +
      'general PP&E (capitalized and depreciated), national defense PP&E (expense on ' +
      'acquisition), heritage assets, and stewardship land. Critical for DoD given the scale ' +
      'of military equipment and real property.',
  },
  {
    id: 'FASAB_SFFAS7',
    name: 'SFFAS 7: Accounting for Revenue and Other Financing Sources',
    shortName: 'SFFAS 7',
    enactedDate: '1997-10-01',
    effectiveDate: '1997-10-01',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'Appropriations recognized',
      'Exchange revenue',
      'Non-exchange revenue',
      'Imputed financing sources',
    ],
    summary:
      'Provides standards for recognizing and reporting revenue and other financing sources ' +
      'in federal financial statements, including appropriations, exchange and non-exchange ' +
      'revenue, and imputed financing from costs assumed by other entities.',
  },
  {
    id: 'FASAB_SFFAS47',
    name: 'SFFAS 47: Reporting Entity',
    shortName: 'SFFAS 47',
    enactedDate: '2018-10-01',
    effectiveDate: '2018-10-01',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'Reporting entity definition',
      'Consolidation requirements',
      'Disclosure entities',
      'Related party transactions',
    ],
    summary:
      'Defines the federal reporting entity and establishes principles for determining which ' +
      'organizations should be included in a reporting entity\'s general purpose federal ' +
      'financial reports. Distinguishes between consolidation entities and disclosure entities.',
  },
  {
    id: 'FASAB_SFFAS54',
    name: 'SFFAS 54: Leases',
    shortName: 'SFFAS 54',
    enactedDate: '2026-10-01',
    effectiveDate: '2026-10-01',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'Lease recognition',
      'Lessee accounting',
      'Lessor accounting',
      'Intragovernmental leases',
    ],
    summary:
      'NEW federal lease accounting standard phasing in for fiscal years beginning after ' +
      'September 30, 2026. Requires recognition of lease assets and lease liabilities by ' +
      'lessees, similar in concept to ASC 842 but tailored for federal entities. Significant ' +
      'impact expected on DoD given extensive use of leased facilities and equipment.',
  },

  // --- Other Key Legislation ---
  {
    id: 'PROMPT_PAY_ACT',
    name: 'Prompt Payment Act',
    shortName: 'Prompt Payment Act',
    publicLaw: '31 USC \u00A73901-3907',
    enactedDate: '1982-05-21',
    effectiveDate: '1982-05-21',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      '31 USC \u00A73903 — Payment timing requirements',
      '31 USC \u00A73902 — Interest penalties',
      '31 USC \u00A73904 — Regulations',
      '31 USC \u00A73907 — Relationship to other laws',
    ],
    summary:
      'Requires federal agencies to pay commercial invoices within 30 days (or other ' +
      'contract-specified terms) and to pay interest penalties on late payments. Treasury ' +
      'publishes the applicable interest rate semi-annually. Critical for DoD disbursing ' +
      'offices and vendor payment compliance.',
  },
  {
    id: 'PIIA',
    name: 'Payment Integrity Information Act of 2019',
    shortName: 'PIIA',
    publicLaw: 'P.L. 116-117',
    enactedDate: '2020-03-02',
    effectiveDate: '2020-03-02',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      '31 USC \u00A73351 \u2014 Definitions',
      '31 USC \u00A73352 \u2014 Estimates of improper payments',
      '31 USC \u00A73353 \u2014 Compliance requirements',
      '31 USC \u00A73354 \u2014 Do Not Pay Initiative',
    ],
    summary:
      'Consolidates and updates federal improper payment requirements (replacing IPERA/IPERIA). ' +
      'Requires agencies to identify programs susceptible to significant improper payments, ' +
      'estimate improper payment rates, and report corrective actions.',
  },
  {
    id: 'DATA_ACT',
    name: 'Digital Accountability and Transparency Act of 2014',
    shortName: 'DATA Act',
    publicLaw: 'P.L. 113-101',
    enactedDate: '2014-05-09',
    effectiveDate: '2017-05-09',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'Federal spending data standardization',
      'USASpending.gov reporting',
      'DAIMS data elements',
      'Agency data quality certification',
    ],
    summary:
      'Requires federal agencies to report standardized spending data to USASpending.gov. ' +
      'Establishes government-wide data standards (DAIMS) for financial and award data. ' +
      'DoD must submit Files A-F with 57+ data elements, certified quarterly.',
  },
  {
    id: 'CFO_ACT',
    name: 'Chief Financial Officers Act of 1990',
    shortName: 'CFO Act',
    publicLaw: 'P.L. 101-576',
    enactedDate: '1990-11-15',
    effectiveDate: '1990-11-15',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      '31 USC \u00A7901 \u2014 CFO establishment',
      '31 USC \u00A7902 \u2014 CFO authority and functions',
      '31 USC \u00A73515 \u2014 Financial statement requirements',
      '31 USC \u00A73521 \u2014 Audit requirements',
    ],
    summary:
      'Established Chief Financial Officers at 24 major federal agencies including DoD. ' +
      'Requires preparation of audited financial statements. Foundation of federal ' +
      'financial management reform and the basis for DoD audit requirements.',
  },
  {
    id: 'GMRA',
    name: 'Government Management Reform Act of 1994',
    shortName: 'GMRA',
    publicLaw: 'P.L. 103-356',
    enactedDate: '1994-10-13',
    effectiveDate: '1994-10-13',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'Agency-wide audited financial statements',
      'Government-wide consolidated financial statements',
      'Annual audit requirements',
    ],
    summary:
      'Extended the CFO Act audit requirement to agency-wide financial statements. ' +
      'Requires annual audits of the 24 CFO Act agencies including DoD. Established ' +
      'the requirement for government-wide consolidated financial statements.',
  },
  {
    id: 'FFMIA',
    name: 'Federal Financial Management Improvement Act of 1996',
    shortName: 'FFMIA',
    publicLaw: 'P.L. 104-208',
    enactedDate: '1996-09-30',
    effectiveDate: '1996-09-30',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'USSGL compliance',
      'Federal accounting standards compliance',
      'Financial management system requirements',
    ],
    summary:
      'Requires federal agencies to implement financial management systems that comply ' +
      'substantially with federal financial management systems requirements, applicable ' +
      'federal accounting standards (FASAB), and the USSGL at the transaction level.',
  },
  {
    id: 'DCIA',
    name: 'Debt Collection Improvement Act of 1996',
    shortName: 'DCIA',
    publicLaw: 'P.L. 104-134',
    enactedDate: '1996-04-26',
    effectiveDate: '1996-04-26',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      '31 USC \u00A73711 \u2014 Collection and compromise',
      '31 USC \u00A73716 \u2014 Administrative offset',
      '31 USC \u00A73717 \u2014 Interest and penalty on claims',
      '31 USC \u00A73720A \u2014 Treasury offset program',
    ],
    summary:
      'Strengthened federal debt collection. Requires transfer of delinquent non-tax debts ' +
      'to Treasury for collection. Mandates use of Treasury Offset Program, establishes ' +
      'interest/penalty/admin fee requirements, and cross-servicing of debts.',
  },
  {
    id: 'FISMA',
    name: 'Federal Information Security Modernization Act of 2014',
    shortName: 'FISMA',
    publicLaw: 'P.L. 113-283',
    enactedDate: '2014-12-18',
    effectiveDate: '2014-12-18',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'Information security program requirements',
      'FISMA reporting',
      'Continuous monitoring',
    ],
    summary:
      'Requires federal agencies to develop, document, and implement agency-wide information ' +
      'security programs. DoD financial systems must comply with FISMA requirements. ' +
      'Relevant to financial system access controls and IT general controls for audit.',
  },
  {
    id: 'FASAB_SFFAS33',
    name: 'SFFAS 33: Pensions, Other Retirement Benefits, and Other Postemployment Benefits',
    shortName: 'SFFAS 33',
    enactedDate: '2008-10-01',
    effectiveDate: '2008-10-01',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'Pension liability disclosure',
      'OPEB liability recognition',
      'Actuarial assumptions',
    ],
    summary:
      'Establishes disclosure requirements for federal pension and OPEB liabilities. ' +
      'Requires actuarial present value calculations, sensitivity analysis of key ' +
      'assumptions, and reconciliation of beginning and ending balances.',
  },
  {
    id: 'FASAB_SFFAS48',
    name: 'SFFAS 48: Opening Balances for Inventory and Related Property',
    shortName: 'SFFAS 48',
    enactedDate: '2016-10-01',
    effectiveDate: '2016-10-01',
    sunsetDate: undefined,
    status: 'active',
    affectedSections: [
      'Inventory valuation',
      'Operating materials and supplies',
      'Stockpile materials',
    ],
    summary:
      'Provides alternative methods for establishing opening balances of inventory, ' +
      'operating materials and supplies, and stockpile materials. Particularly relevant ' +
      'for DoD given the scale and complexity of military inventory.',
  },
];

// ---------------------------------------------------------------------------
// Legislation-to-Rule Links
// ---------------------------------------------------------------------------

export const SEED_DOD_RULE_LINKS: LegislationRuleLink[] = [
  // --- NDAA FY2024 Rule Links ---
  {
    id: 'link-ndaa24-milpay-001',
    legislationId: 'NDAA_FY2024',
    ruleId: 'DOD-MILPAY-001',
    parameterCode: 'DOD_MILPAY_RAISE_PCT',
    impactDescription:
      'NDAA FY2024 authorized a 5.2% military pay raise effective January 1, 2024. ' +
      'All military pay computations must use the updated pay tables reflecting this increase.',
  },
  {
    id: 'link-ndaa24-milpay-002',
    legislationId: 'NDAA_FY2024',
    ruleId: 'DOD-MILPAY-002',
    parameterCode: 'DOD_BAS_ENLISTED',
    impactDescription:
      'NDAA FY2024 updated Basic Allowance for Subsistence rates for enlisted members ' +
      'and officers, effective January 2024.',
  },
  {
    id: 'link-ndaa24-milpay-003',
    legislationId: 'NDAA_FY2024',
    ruleId: 'DOD-MILPAY-003',
    parameterCode: 'DOD_BAS_OFFICER',
    impactDescription:
      'NDAA FY2024 updated Basic Allowance for Subsistence rates for officers, ' +
      'effective January 2024.',
  },

  // --- NDAA FY2025 Rule Links ---
  {
    id: 'link-ndaa25-milpay-001',
    legislationId: 'NDAA_FY2025',
    ruleId: 'DOD-MILPAY-001',
    parameterCode: 'DOD_MILPAY_RAISE_PCT',
    impactDescription:
      'NDAA FY2025 authorized a 4.5% military pay raise effective January 1, 2025. ' +
      'Updated FIAR requirements strengthen audit remediation mandates for military ' +
      'pay systems.',
  },
  {
    id: 'link-ndaa25-milpay-002',
    legislationId: 'NDAA_FY2025',
    ruleId: 'DOD-MILPAY-002',
    parameterCode: 'DOD_BAS_ENLISTED',
    impactDescription:
      'NDAA FY2025 updated Basic Allowance for Subsistence rates for enlisted members, ' +
      'effective January 2025.',
  },

  // --- NDAA FY2026 Rule Links ---
  {
    id: 'link-ndaa26-milpay-001',
    legislationId: 'NDAA_FY2026',
    ruleId: 'DOD-MILPAY-001',
    parameterCode: 'DOD_MILPAY_RAISE_PCT',
    impactDescription:
      'NDAA FY2026 authorized the annual military pay raise effective January 1, 2026. ' +
      'Placeholder pending final enacted rates.',
  },

  // --- OMB A-123 Rule Links ---
  {
    id: 'link-omba123-gfm-002',
    legislationId: 'OMB_A123',
    ruleId: 'DOD-GFM-002',
    impactDescription:
      'OMB Circular A-123 requires management assessment of internal controls over ' +
      'financial reporting. DoD Government Furnished Material (GFM) tracking and ' +
      'accountability controls must comply with Appendix A assessment requirements.',
  },
  {
    id: 'link-omba123-disb-001',
    legislationId: 'OMB_A123',
    ruleId: 'DOD-DISB-001',
    impactDescription:
      'OMB Circular A-123 Appendix C (Payment Integrity) requires agencies to identify ' +
      'and reduce improper payments. DoD disbursing operations must implement controls ' +
      'to minimize improper payments and report payment integrity metrics.',
  },

  // --- FASAB Standards Rule Links ---
  {
    id: 'link-sffas1-acct-001',
    legislationId: 'FASAB_SFFAS1',
    ruleId: 'DOD-ACCT-001',
    impactDescription:
      'SFFAS 1 governs accounting for fund balance with Treasury, accounts receivable, ' +
      'and accounts payable. DoD accounting entries must conform to SFFAS 1 recognition ' +
      'and measurement criteria.',
  },
  {
    id: 'link-sffas5-acct-002',
    legislationId: 'FASAB_SFFAS5',
    ruleId: 'DOD-ACCT-002',
    impactDescription:
      'SFFAS 5 establishes liability recognition standards. DoD must properly recognize ' +
      'contingent liabilities, environmental cleanup costs, and employee benefit ' +
      'liabilities in accordance with probable-and-measurable criteria.',
  },
  {
    id: 'link-sffas6-acct-003',
    legislationId: 'FASAB_SFFAS6',
    ruleId: 'DOD-ACCT-003',
    impactDescription:
      'SFFAS 6 governs PP&E accounting. DoD must properly categorize assets as general ' +
      'PP&E (capitalize and depreciate), national defense PP&E (expense on acquisition), ' +
      'heritage assets, or stewardship land.',
  },
  {
    id: 'link-sffas7-acct-004',
    legislationId: 'FASAB_SFFAS7',
    ruleId: 'DOD-ACCT-004',
    impactDescription:
      'SFFAS 7 governs revenue and financing source recognition. DoD must properly ' +
      'recognize appropriations, reimbursable revenue, and imputed financing sources.',
  },
  {
    id: 'link-sffas47-acct-005',
    legislationId: 'FASAB_SFFAS47',
    ruleId: 'DOD-ACCT-005',
    impactDescription:
      'SFFAS 47 defines reporting entity boundaries. DoD components must properly ' +
      'identify consolidation and disclosure entities for financial reporting.',
  },
  {
    id: 'link-sffas54-acct-006',
    legislationId: 'FASAB_SFFAS54',
    ruleId: 'DOD-ACCT-006',
    impactDescription:
      'SFFAS 54 introduces federal lease accounting requirements effective FY2027 ' +
      '(fiscal years beginning after September 30, 2026). DoD must prepare for ' +
      'recognition of lease assets and lease liabilities across extensive leased ' +
      'facilities and equipment portfolios.',
  },

  // --- Prompt Payment Act Rule Links ---
  {
    id: 'link-ppa-disb-001',
    legislationId: 'PROMPT_PAY_ACT',
    ruleId: 'DOD-DISB-001',
    parameterCode: 'DOD_PROMPT_PAY_NET_DAYS',
    impactDescription:
      'Prompt Payment Act requires DoD to pay commercial invoices within 30 days (or ' +
      'contract-specified terms). Late payments trigger automatic interest penalties ' +
      'at the Treasury-published rate.',
  },
  {
    id: 'link-ppa-disb-002',
    legislationId: 'PROMPT_PAY_ACT',
    ruleId: 'DOD-DISB-002',
    parameterCode: 'DOD_PROMPT_PAY_INTEREST_RATE',
    impactDescription:
      'Prompt Payment Act interest penalty rate is updated semi-annually by Treasury. ' +
      'DoD disbursing offices must apply the current rate when calculating interest on ' +
      'late vendor payments.',
  },

  // --- DCIA Rule Links (Debt Management) ---
  {
    id: 'link-dcia-debt-001',
    legislationId: 'DCIA',
    ruleId: 'DOD-FMR-V16-001',
    parameterCode: 'DOD_DEBT_REFERRAL_DAYS',
    impactDescription:
      'DCIA requires referral of delinquent debts to Treasury for cross-servicing ' +
      'within 120 days of delinquency. DoD components must comply with referral timelines.',
  },
  {
    id: 'link-dcia-debt-003',
    legislationId: 'DCIA',
    ruleId: 'DOD-FMR-V16-003',
    parameterCode: 'DOD_DEBT_REFERRAL_THRESHOLD',
    impactDescription:
      'DCIA mandates enrollment in Treasury Offset Program for delinquent debts ' +
      'exceeding the referral threshold.',
  },
  {
    id: 'link-dcia-debt-004',
    legislationId: 'DCIA',
    ruleId: 'DOD-FMR-V16-004',
    parameterCode: 'DOD_DEBT_INTEREST_RATE',
    impactDescription:
      '31 U.S.C. \u00A73717 requires assessment of interest, penalties, and administrative ' +
      'fees on delinquent debts. Rates follow Treasury current value of funds rate.',
  },

  // --- PIIA Rule Links ---
  {
    id: 'link-piia-payment-001',
    legislationId: 'PIIA',
    ruleId: 'DOD-DISB-001',
    impactDescription:
      'PIIA requires DoD to estimate improper payments, report corrective actions, ' +
      'and achieve compliance. Affects all disbursing operations.',
  },

  // --- DATA Act Rule Links ---
  {
    id: 'link-data-act-report-001',
    legislationId: 'DATA_ACT',
    ruleId: 'DOD-FMR-V06-001',
    impactDescription:
      'DATA Act requires quarterly submission of standardized spending data to ' +
      'USASpending.gov, affecting financial reporting processes.',
  },

  // --- FFMIA Rule Links ---
  {
    id: 'link-ffmia-acct-001',
    legislationId: 'FFMIA',
    ruleId: 'DOD-ACCT-001',
    impactDescription:
      'FFMIA requires DoD financial systems to comply with USSGL at the transaction ' +
      'level and conform to FASAB standards.',
  },

  // --- SFFAS 33 Rule Links ---
  {
    id: 'link-sffas33-acct-007',
    legislationId: 'FASAB_SFFAS33',
    ruleId: 'DOD-ACCT-002',
    impactDescription:
      'SFFAS 33 establishes disclosure requirements for federal pension and OPEB ' +
      'liabilities, requiring actuarial present value calculations.',
  },

  // --- SFFAS 48 Rule Links ---
  {
    id: 'link-sffas48-acct-008',
    legislationId: 'FASAB_SFFAS48',
    ruleId: 'DOD-ACCT-003',
    impactDescription:
      'SFFAS 48 provides methods for establishing opening balances of inventory ' +
      'and related property, relevant to DoD property accountability.',
  },
];
