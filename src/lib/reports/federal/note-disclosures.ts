/**
 * Note Disclosures Generator — OMB Circular A-136, Section II.3.2
 *
 * Generates the required note disclosures for federal financial statements
 * as prescribed by OMB Circular A-136 and applicable SFFAS standards.
 * Notes provide additional detail, context, and breakdowns beyond the
 * face of the principal financial statements.
 *
 * Required notes per OMB A-136, Section II.3.2:
 *   Note  1: Significant Accounting Policies
 *   Note  2: Fund Balance with Treasury
 *   Note  3: Investments
 *   Note  4: Accounts Receivable
 *   Note  5: Inventory and Related Property
 *   Note  6: Property, Plant, and Equipment
 *   Note  7: Leases (SFFAS 54)
 *   Note  8: Liabilities Not Covered by Budgetary Resources
 *   Note  9: Federal Employee and Veteran Benefits
 *   Note 10: Commitments and Contingencies
 *
 * References:
 *   - OMB Circular A-136, Section II.3.2 (Notes to Financial Statements)
 *   - SFFAS 1: Accounting for Selected Assets and Liabilities
 *   - SFFAS 5: Accounting for Liabilities of the Federal Government
 *   - SFFAS 6: Accounting for Property, Plant, and Equipment
 *   - SFFAS 7: Accounting for Revenue and Other Financing Sources
 *   - SFFAS 33: Pensions, Other Retirement Benefits, and Other Postemployment Benefits
 *   - SFFAS 47: Reporting Entity
 *   - SFFAS 54: Leases
 *   - DoD FMR 7000.14-R, Vol. 6B, Ch. 10-19: Notes to Financial Statements
 */

import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Rounding precision for financial statement amounts. */
const ROUNDING_PRECISION = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single note disclosure with structured content. */
export interface NoteDisclosure {
  id: string;
  noteNumber: number;
  title: string;
  standardReference: string;
  narrative: string;
  tables: NoteTable[];
  subnotes: SubNote[];
}

/** A structured table within a note disclosure. */
export interface NoteTable {
  id: string;
  title: string;
  headers: string[];
  rows: NoteTableRow[];
  totalRow?: NoteTableRow;
}

/** A single row in a note disclosure table. */
export interface NoteTableRow {
  label: string;
  values: number[];
}

/** A sub-note within a parent note disclosure. */
export interface SubNote {
  id: string;
  subtitle: string;
  narrative: string;
  tables: NoteTable[];
}

/** The complete set of note disclosures for the financial statements. */
export interface NoteDisclosureSet {
  id: string;
  reportDate: string;
  fiscalYear: number;
  entityName: string;
  notes: NoteDisclosure[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Input Types
// ---------------------------------------------------------------------------

/** Input data for Note 1: Significant Accounting Policies. */
export interface AccountingPoliciesInput {
  entityDescription: string;
  basisOfAccounting: string;
  budgetaryAccounting: string;
  revenueRecognition: string;
  entityPolicies: Array<{ policyArea: string; description: string }>;
}

/** Input data for Note 2: Fund Balance with Treasury. */
export interface FundBalanceInput {
  fundTypes: Array<{
    fundType: 'general' | 'revolving' | 'trust' | 'special' | 'other';
    description: string;
    currentYear: number;
    priorYear: number;
  }>;
  statusOfFunds: {
    unobligatedAvailable: { currentYear: number; priorYear: number };
    unobligatedUnavailable: { currentYear: number; priorYear: number };
    obligatedNotYetDisbursed: { currentYear: number; priorYear: number };
    nonBudgetary: { currentYear: number; priorYear: number };
  };
}

/** Input data for Note 3: Investments. */
export interface InvestmentsInput {
  investments: Array<{
    description: string;
    cost: { currentYear: number; priorYear: number };
    amortizedPremiumDiscount: { currentYear: number; priorYear: number };
    interestReceivable: { currentYear: number; priorYear: number };
    netInvestment: { currentYear: number; priorYear: number };
    marketValue: { currentYear: number; priorYear: number };
  }>;
}

/** Input data for Note 4: Accounts Receivable. */
export interface AccountsReceivableInput {
  intragovernmental: {
    grossReceivable: { currentYear: number; priorYear: number };
    allowanceForUncollectible: { currentYear: number; priorYear: number };
  };
  public: {
    grossReceivable: { currentYear: number; priorYear: number };
    allowanceForUncollectible: { currentYear: number; priorYear: number };
  };
}

/** Input data for Note 5: Inventory and Related Property. */
export interface InventoryInput {
  categories: Array<{
    category: string;
    valuationMethod: string;
    currentYear: number;
    priorYear: number;
  }>;
}

/** Input data for Note 6: Property, Plant, and Equipment. */
export interface PPEInput {
  categories: Array<{
    category: string;
    usefulLife: string;
    acquisitionCost: { currentYear: number; priorYear: number };
    accumulatedDepreciation: { currentYear: number; priorYear: number };
  }>;
}

/** Input data for Note 7: Leases (SFFAS 54). */
export interface LeasesInput {
  operatingLeases: {
    description: string;
    futurePayments: Array<{
      period: string;
      landAndBuildings: number;
      equipment: number;
      other: number;
    }>;
  };
  capitalLeases: {
    description: string;
    assets: Array<{
      category: string;
      assetValue: number;
      accumulatedAmortization: number;
    }>;
    futurePayments: Array<{
      period: string;
      amount: number;
    }>;
  };
}

/** Input data for Note 8: Liabilities Not Covered by Budgetary Resources. */
export interface UncoveredLiabilitiesInput {
  liabilities: Array<{
    description: string;
    currentYear: number;
    priorYear: number;
  }>;
  totalCoveredByBudgetaryResources: { currentYear: number; priorYear: number };
}

/** Input data for Note 9: Federal Employee and Veteran Benefits. */
export interface EmployeeBenefitsInput {
  pensionLiability: { currentYear: number; priorYear: number };
  healthBenefitsLiability: { currentYear: number; priorYear: number };
  fecaActuarialLiability: { currentYear: number; priorYear: number };
  otherBenefits: Array<{
    description: string;
    currentYear: number;
    priorYear: number;
  }>;
}

/** Input data for Note 10: Commitments and Contingencies. */
export interface CommitmentsContingenciesInput {
  commitments: Array<{
    description: string;
    estimatedAmount: number;
    expirationDate: string;
  }>;
  contingencies: Array<{
    description: string;
    likelihood: 'probable' | 'reasonably_possible' | 'remote';
    estimatedRange: { low: number; high: number };
    accrued: number;
  }>;
}

/** Combined input for all note disclosures. */
export interface NoteDisclosuresData {
  accountingPolicies: AccountingPoliciesInput;
  fundBalance: FundBalanceInput;
  investments: InvestmentsInput;
  accountsReceivable: AccountsReceivableInput;
  inventory: InventoryInput;
  ppe: PPEInput;
  leases: LeasesInput;
  uncoveredLiabilities: UncoveredLiabilitiesInput;
  employeeBenefits: EmployeeBenefitsInput;
  commitmentsContingencies: CommitmentsContingenciesInput;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Round a number to the standard financial statement precision.
 */
function round2(n: number): number {
  return Math.round(n * 10 ** ROUNDING_PRECISION) / 10 ** ROUNDING_PRECISION;
}

/**
 * Create a NoteTable from headers, data rows, and optional total row.
 */
function makeTable(
  title: string,
  headers: string[],
  rows: NoteTableRow[],
  totalRow?: NoteTableRow,
): NoteTable {
  return {
    id: uuid(),
    title,
    headers,
    rows: rows.map((r) => ({
      label: r.label,
      values: r.values.map(round2),
    })),
    totalRow: totalRow
      ? { label: totalRow.label, values: totalRow.values.map(round2) }
      : undefined,
  };
}

/**
 * Map fund type enum to a display label.
 */
function fundTypeLabel(
  fundType: 'general' | 'revolving' | 'trust' | 'special' | 'other',
): string {
  const labels: Record<string, string> = {
    general: 'General Funds',
    revolving: 'Revolving Funds',
    trust: 'Trust Funds',
    special: 'Special Funds',
    other: 'Other Fund Types',
  };
  return labels[fundType] ?? fundType;
}

// ---------------------------------------------------------------------------
// Note Generators (Individual)
// ---------------------------------------------------------------------------

/**
 * Note 1: Significant Accounting Policies.
 *
 * Per OMB A-136 and SFFAS 47, entities must disclose a summary of
 * significant accounting policies including the reporting entity
 * description, basis of accounting, and specific policy elections.
 *
 * @see SFFAS 47, para 75-78 (Reporting Entity Disclosures)
 */
function generateNote1(input: AccountingPoliciesInput): NoteDisclosure {
  const subnotes: SubNote[] = [
    {
      id: uuid(),
      subtitle: 'Reporting Entity',
      narrative: input.entityDescription,
      tables: [],
    },
    {
      id: uuid(),
      subtitle: 'Basis of Accounting',
      narrative: input.basisOfAccounting,
      tables: [],
    },
    {
      id: uuid(),
      subtitle: 'Budgetary Accounting',
      narrative: input.budgetaryAccounting,
      tables: [],
    },
    {
      id: uuid(),
      subtitle: 'Revenue Recognition',
      narrative: input.revenueRecognition,
      tables: [],
    },
    ...input.entityPolicies.map((p) => ({
      id: uuid(),
      subtitle: p.policyArea,
      narrative: p.description,
      tables: [] as NoteTable[],
    })),
  ];

  return {
    id: uuid(),
    noteNumber: 1,
    title: 'Significant Accounting Policies',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 47, para 75-78',
    narrative:
      'This note summarizes the significant accounting policies of the reporting entity, ' +
      'including the basis of accounting, revenue recognition, and other policy elections ' +
      'applied in preparing these financial statements.',
    tables: [],
    subnotes,
  };
}

/**
 * Note 2: Fund Balance with Treasury.
 *
 * Per OMB A-136, entities must disclose fund balances by fund type
 * and the status of fund balance (obligated vs. unobligated).
 *
 * @see SFFAS 1, para 30-33 (Fund Balance with Treasury)
 */
function generateNote2(input: FundBalanceInput): NoteDisclosure {
  const fundRows: NoteTableRow[] = input.fundTypes.map((f) => ({
    label: f.description || fundTypeLabel(f.fundType),
    values: [f.currentYear, f.priorYear],
  }));

  const totalFundCY = input.fundTypes.reduce((s, f) => s + f.currentYear, 0);
  const totalFundPY = input.fundTypes.reduce((s, f) => s + f.priorYear, 0);

  const fundTable = makeTable(
    'Fund Balance with Treasury by Fund Type',
    ['Fund Type', 'Current Year', 'Prior Year'],
    fundRows,
    { label: 'Total Fund Balance with Treasury', values: [totalFundCY, totalFundPY] },
  );

  const sf = input.statusOfFunds;
  const statusRows: NoteTableRow[] = [
    { label: 'Unobligated Balance - Available', values: [sf.unobligatedAvailable.currentYear, sf.unobligatedAvailable.priorYear] },
    { label: 'Unobligated Balance - Unavailable', values: [sf.unobligatedUnavailable.currentYear, sf.unobligatedUnavailable.priorYear] },
    { label: 'Obligated Balance Not Yet Disbursed', values: [sf.obligatedNotYetDisbursed.currentYear, sf.obligatedNotYetDisbursed.priorYear] },
    { label: 'Non-Budgetary FBWT', values: [sf.nonBudgetary.currentYear, sf.nonBudgetary.priorYear] },
  ];

  const statusTotalCY = sf.unobligatedAvailable.currentYear + sf.unobligatedUnavailable.currentYear +
    sf.obligatedNotYetDisbursed.currentYear + sf.nonBudgetary.currentYear;
  const statusTotalPY = sf.unobligatedAvailable.priorYear + sf.unobligatedUnavailable.priorYear +
    sf.obligatedNotYetDisbursed.priorYear + sf.nonBudgetary.priorYear;

  const statusTable = makeTable(
    'Status of Fund Balance with Treasury',
    ['Status', 'Current Year', 'Prior Year'],
    statusRows,
    { label: 'Total Fund Balance with Treasury', values: [statusTotalCY, statusTotalPY] },
  );

  return {
    id: uuid(),
    noteNumber: 2,
    title: 'Fund Balance with Treasury',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 1, para 30-33',
    narrative:
      'Fund Balance with Treasury represents the aggregate amount of funds in the ' +
      'entity\'s accounts with the U.S. Treasury from which the entity is authorized ' +
      'to make expenditures and pay liabilities.',
    tables: [fundTable, statusTable],
    subnotes: [],
  };
}

/**
 * Note 3: Investments.
 *
 * Per OMB A-136, entities must disclose investments by type with
 * cost, amortization, interest receivable, net value, and market value.
 *
 * @see SFFAS 1, para 53-67 (Investments in Treasury Securities)
 */
function generateNote3(input: InvestmentsInput): NoteDisclosure {
  const rows: NoteTableRow[] = input.investments.map((inv) => ({
    label: inv.description,
    values: [
      inv.cost.currentYear,
      inv.amortizedPremiumDiscount.currentYear,
      inv.interestReceivable.currentYear,
      inv.netInvestment.currentYear,
      inv.marketValue.currentYear,
    ],
  }));

  const totalRow: NoteTableRow = {
    label: 'Total Investments',
    values: [
      input.investments.reduce((s, i) => s + i.cost.currentYear, 0),
      input.investments.reduce((s, i) => s + i.amortizedPremiumDiscount.currentYear, 0),
      input.investments.reduce((s, i) => s + i.interestReceivable.currentYear, 0),
      input.investments.reduce((s, i) => s + i.netInvestment.currentYear, 0),
      input.investments.reduce((s, i) => s + i.marketValue.currentYear, 0),
    ],
  };

  const investmentTable = makeTable(
    'Investments (Current Year)',
    ['Description', 'Cost', 'Amortized Premium/(Discount)', 'Interest Receivable', 'Net Investment', 'Market Value'],
    rows,
    totalRow,
  );

  return {
    id: uuid(),
    noteNumber: 3,
    title: 'Investments',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 1, para 53-67',
    narrative:
      'Investments consist of Treasury securities and other federal investments ' +
      'held to maturity. Premiums and discounts are amortized over the life of ' +
      'the investment using the effective interest method.',
    tables: [investmentTable],
    subnotes: [],
  };
}

/**
 * Note 4: Accounts Receivable.
 *
 * Per OMB A-136, entities must disclose accounts receivable by
 * intragovernmental and public, showing gross, allowance, and net amounts.
 *
 * @see SFFAS 1, para 40-52 (Accounts Receivable)
 */
function generateNote4(input: AccountsReceivableInput): NoteDisclosure {
  const intraNetCY = round2(input.intragovernmental.grossReceivable.currentYear +
    input.intragovernmental.allowanceForUncollectible.currentYear);
  const intraNetPY = round2(input.intragovernmental.grossReceivable.priorYear +
    input.intragovernmental.allowanceForUncollectible.priorYear);
  const publicNetCY = round2(input.public.grossReceivable.currentYear +
    input.public.allowanceForUncollectible.currentYear);
  const publicNetPY = round2(input.public.grossReceivable.priorYear +
    input.public.allowanceForUncollectible.priorYear);

  const rows: NoteTableRow[] = [
    {
      label: 'Intragovernmental - Gross',
      values: [input.intragovernmental.grossReceivable.currentYear, input.intragovernmental.grossReceivable.priorYear],
    },
    {
      label: 'Intragovernmental - Allowance',
      values: [input.intragovernmental.allowanceForUncollectible.currentYear, input.intragovernmental.allowanceForUncollectible.priorYear],
    },
    { label: 'Intragovernmental - Net', values: [intraNetCY, intraNetPY] },
    {
      label: 'With the Public - Gross',
      values: [input.public.grossReceivable.currentYear, input.public.grossReceivable.priorYear],
    },
    {
      label: 'With the Public - Allowance',
      values: [input.public.allowanceForUncollectible.currentYear, input.public.allowanceForUncollectible.priorYear],
    },
    { label: 'With the Public - Net', values: [publicNetCY, publicNetPY] },
  ];

  const arTable = makeTable(
    'Accounts Receivable',
    ['Category', 'Current Year', 'Prior Year'],
    rows,
    {
      label: 'Total Accounts Receivable, Net',
      values: [round2(intraNetCY + publicNetCY), round2(intraNetPY + publicNetPY)],
    },
  );

  return {
    id: uuid(),
    noteNumber: 4,
    title: 'Accounts Receivable, Net',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 1, para 40-52',
    narrative:
      'Accounts receivable represents amounts owed to the entity by other federal ' +
      'entities (intragovernmental) and by the public. An allowance for uncollectible ' +
      'amounts is established for public receivables based on historical collection rates.',
    tables: [arTable],
    subnotes: [],
  };
}

/**
 * Note 5: Inventory and Related Property.
 *
 * Per OMB A-136, entities must disclose inventory by category and
 * valuation method.
 *
 * @see SFFAS 3: Accounting for Inventory and Related Property
 */
function generateNote5(input: InventoryInput): NoteDisclosure {
  const rows: NoteTableRow[] = input.categories.map((c) => ({
    label: `${c.category} (${c.valuationMethod})`,
    values: [c.currentYear, c.priorYear],
  }));

  const totalCY = input.categories.reduce((s, c) => s + c.currentYear, 0);
  const totalPY = input.categories.reduce((s, c) => s + c.priorYear, 0);

  const inventoryTable = makeTable(
    'Inventory and Related Property',
    ['Category (Valuation Method)', 'Current Year', 'Prior Year'],
    rows,
    { label: 'Total Inventory and Related Property', values: [totalCY, totalPY] },
  );

  return {
    id: uuid(),
    noteNumber: 5,
    title: 'Inventory and Related Property',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 3',
    narrative:
      'Inventory consists of tangible personal property held for sale, in the process ' +
      'of production for sale, or to be consumed in the production of goods for sale or ' +
      'in the provision of services. Related property includes operating materials and ' +
      'supplies, stockpile materials, and seized and forfeited property.',
    tables: [inventoryTable],
    subnotes: [],
  };
}

/**
 * Note 6: Property, Plant, and Equipment (PP&E).
 *
 * Per OMB A-136, entities must disclose PP&E by category, showing
 * acquisition cost, accumulated depreciation, and net book value.
 *
 * @see SFFAS 6: Accounting for Property, Plant, and Equipment
 */
function generateNote6(input: PPEInput): NoteDisclosure {
  const rows: NoteTableRow[] = input.categories.map((c) => {
    const netCY = round2(c.acquisitionCost.currentYear - Math.abs(c.accumulatedDepreciation.currentYear));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const netPY = round2(c.acquisitionCost.priorYear - Math.abs(c.accumulatedDepreciation.priorYear));
    return {
      label: `${c.category} (${c.usefulLife})`,
      values: [
        c.acquisitionCost.currentYear,
        c.accumulatedDepreciation.currentYear,
        netCY,
      ],
    };
  });

  const totalAcqCY = input.categories.reduce((s, c) => s + c.acquisitionCost.currentYear, 0);
  const totalDeprCY = input.categories.reduce((s, c) => s + c.accumulatedDepreciation.currentYear, 0);
  const totalNetCY = round2(totalAcqCY - Math.abs(totalDeprCY));

  const ppeTable = makeTable(
    'General Property, Plant, and Equipment, Net (Current Year)',
    ['Category (Useful Life)', 'Acquisition Cost', 'Accumulated Depreciation', 'Net Book Value'],
    rows,
    { label: 'Total General PP&E', values: [totalAcqCY, totalDeprCY, totalNetCY] },
  );

  return {
    id: uuid(),
    noteNumber: 6,
    title: 'General Property, Plant, and Equipment, Net',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 6',
    narrative:
      'General PP&E consists of items used in providing goods or services. PP&E is ' +
      'stated at acquisition cost and depreciated using the straight-line method ' +
      'over the estimated useful life of each asset category. Land and construction ' +
      'in progress are not depreciated.',
    tables: [ppeTable],
    subnotes: [],
  };
}

/**
 * Note 7: Leases.
 *
 * Per OMB A-136 and SFFAS 54, entities must disclose operating and
 * capital lease information including future payment obligations.
 *
 * @see SFFAS 54: Leases (effective FY2027)
 * @see SFFAS 5 (prior to SFFAS 54 effective date)
 */
function generateNote7(input: LeasesInput): NoteDisclosure {
  // Operating lease future payments table
  const opRows: NoteTableRow[] = input.operatingLeases.futurePayments.map((fp) => ({
    label: fp.period,
    values: [fp.landAndBuildings, fp.equipment, fp.other, round2(fp.landAndBuildings + fp.equipment + fp.other)],
  }));

  const opTable = makeTable(
    'Future Payments Due Under Operating Leases',
    ['Period', 'Land & Buildings', 'Equipment', 'Other', 'Total'],
    opRows,
  );

  // Capital lease assets table
  const capAssetRows: NoteTableRow[] = input.capitalLeases.assets.map((a) => ({
    label: a.category,
    values: [a.assetValue, a.accumulatedAmortization, round2(a.assetValue - Math.abs(a.accumulatedAmortization))],
  }));

  const capAssetTable = makeTable(
    'Assets Under Capital Leases',
    ['Category', 'Asset Value', 'Accumulated Amortization', 'Net'],
    capAssetRows,
  );

  // Capital lease future payments table
  const capPayRows: NoteTableRow[] = input.capitalLeases.futurePayments.map((fp) => ({
    label: fp.period,
    values: [fp.amount],
  }));

  const capPayTable = makeTable(
    'Future Payments Due Under Capital Leases',
    ['Period', 'Amount'],
    capPayRows,
  );

  const subnotes: SubNote[] = [
    {
      id: uuid(),
      subtitle: 'Operating Leases',
      narrative: input.operatingLeases.description,
      tables: [opTable],
    },
    {
      id: uuid(),
      subtitle: 'Capital Leases',
      narrative: input.capitalLeases.description,
      tables: [capAssetTable, capPayTable],
    },
  ];

  return {
    id: uuid(),
    noteNumber: 7,
    title: 'Leases',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 54; SFFAS 5',
    narrative:
      'The entity enters into leasing arrangements for real property, equipment, ' +
      'and other assets. Leases are classified as either operating or capital in ' +
      'accordance with SFFAS 54 (effective FY2027) or SFFAS 5 (prior years).',
    tables: [],
    subnotes,
  };
}

/**
 * Note 8: Liabilities Not Covered by Budgetary Resources.
 *
 * Per OMB A-136, entities must disclose liabilities that are not funded
 * by current budgetary resources and must be funded by future appropriations.
 *
 * @see SFFAS 5: Accounting for Liabilities of the Federal Government
 */
function generateNote8(input: UncoveredLiabilitiesInput): NoteDisclosure {
  const rows: NoteTableRow[] = input.liabilities.map((l) => ({
    label: l.description,
    values: [l.currentYear, l.priorYear],
  }));

  const totalNotCoveredCY = input.liabilities.reduce((s, l) => s + l.currentYear, 0);
  const totalNotCoveredPY = input.liabilities.reduce((s, l) => s + l.priorYear, 0);

  rows.push({
    label: 'Total Liabilities Not Covered by Budgetary Resources',
    values: [totalNotCoveredCY, totalNotCoveredPY],
  });

  rows.push({
    label: 'Total Liabilities Covered by Budgetary Resources',
    values: [input.totalCoveredByBudgetaryResources.currentYear, input.totalCoveredByBudgetaryResources.priorYear],
  });

  const totalLiabCY = round2(totalNotCoveredCY + input.totalCoveredByBudgetaryResources.currentYear);
  const totalLiabPY = round2(totalNotCoveredPY + input.totalCoveredByBudgetaryResources.priorYear);

  const liabTable = makeTable(
    'Liabilities Not Covered by Budgetary Resources',
    ['Description', 'Current Year', 'Prior Year'],
    rows,
    { label: 'Total Liabilities', values: [totalLiabCY, totalLiabPY] },
  );

  return {
    id: uuid(),
    noteNumber: 8,
    title: 'Liabilities Not Covered by Budgetary Resources',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 5',
    narrative:
      'Liabilities not covered by budgetary resources are liabilities for which ' +
      'congressional action is needed before budgetary resources can be provided. ' +
      'These include unfunded leave, FECA actuarial liabilities, environmental ' +
      'liabilities, and other long-term obligations.',
    tables: [liabTable],
    subnotes: [],
  };
}

/**
 * Note 9: Federal Employee and Veteran Benefits.
 *
 * Per OMB A-136, entities must disclose actuarial liabilities for
 * pension benefits, health benefits, and workers compensation.
 *
 * @see SFFAS 33: Pensions, Other Retirement Benefits, and Other Postemployment Benefits
 */
function generateNote9(input: EmployeeBenefitsInput): NoteDisclosure {
  const rows: NoteTableRow[] = [
    { label: 'Pension Liability', values: [input.pensionLiability.currentYear, input.pensionLiability.priorYear] },
    { label: 'Health Benefits Liability', values: [input.healthBenefitsLiability.currentYear, input.healthBenefitsLiability.priorYear] },
    { label: 'FECA Actuarial Liability', values: [input.fecaActuarialLiability.currentYear, input.fecaActuarialLiability.priorYear] },
    ...input.otherBenefits.map((b) => ({
      label: b.description,
      values: [b.currentYear, b.priorYear],
    })),
  ];

  const totalCY = round2(
    input.pensionLiability.currentYear +
    input.healthBenefitsLiability.currentYear +
    input.fecaActuarialLiability.currentYear +
    input.otherBenefits.reduce((s, b) => s + b.currentYear, 0),
  );
  const totalPY = round2(
    input.pensionLiability.priorYear +
    input.healthBenefitsLiability.priorYear +
    input.fecaActuarialLiability.priorYear +
    input.otherBenefits.reduce((s, b) => s + b.priorYear, 0),
  );

  const benefitsTable = makeTable(
    'Federal Employee and Veteran Benefits',
    ['Benefit Type', 'Current Year', 'Prior Year'],
    rows,
    { label: 'Total Federal Employee and Veteran Benefits', values: [totalCY, totalPY] },
  );

  return {
    id: uuid(),
    noteNumber: 9,
    title: 'Federal Employee and Veteran Benefits',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 33',
    narrative:
      'Federal employee and veteran benefits represent the actuarial present value of ' +
      'projected benefits for current and past employees and veterans. Pension and health ' +
      'benefit liabilities are calculated by OPM actuaries. FECA liabilities are ' +
      'calculated by the Department of Labor.',
    tables: [benefitsTable],
    subnotes: [],
  };
}

/**
 * Note 10: Commitments and Contingencies.
 *
 * Per OMB A-136, entities must disclose commitments (signed agreements
 * to acquire goods/services) and contingencies (potential future losses
 * from pending litigation, claims, or assessments).
 *
 * @see SFFAS 5, para 33-44 (Contingencies)
 * @see SFFAS 12: Recognition of Contingent Liabilities from Litigation
 */
function generateNote10(input: CommitmentsContingenciesInput): NoteDisclosure {
  // Commitments table
  const commitmentRows: NoteTableRow[] = input.commitments.map((c) => ({
    label: `${c.description} (exp: ${c.expirationDate})`,
    values: [c.estimatedAmount],
  }));

  const totalCommitments = input.commitments.reduce((s, c) => s + c.estimatedAmount, 0);

  const commitmentTable = makeTable(
    'Commitments',
    ['Description', 'Estimated Amount'],
    commitmentRows,
    { label: 'Total Commitments', values: [totalCommitments] },
  );

  // Contingencies table
  const contingencyRows: NoteTableRow[] = input.contingencies.map((c) => ({
    label: `${c.description} [${c.likelihood}]`,
    values: [c.estimatedRange.low, c.estimatedRange.high, c.accrued],
  }));

  const contingencyTable = makeTable(
    'Contingencies',
    ['Description [Likelihood]', 'Estimated Low', 'Estimated High', 'Accrued'],
    contingencyRows,
  );

  const subnotes: SubNote[] = [];

  // Add narrative for probable contingencies (SFFAS 5, para 33-35)
  const probableContingencies = input.contingencies.filter(
    (c) => c.likelihood === 'probable',
  );
  if (probableContingencies.length > 0) {
    subnotes.push({
      id: uuid(),
      subtitle: 'Probable Contingencies (Accrued)',
      narrative:
        'The following contingencies are considered probable and have been accrued ' +
        'in the financial statements per SFFAS 5, paragraph 33.',
      tables: [],
    });
  }

  // Add narrative for reasonably possible contingencies (SFFAS 5, para 36-38)
  const possibleContingencies = input.contingencies.filter(
    (c) => c.likelihood === 'reasonably_possible',
  );
  if (possibleContingencies.length > 0) {
    subnotes.push({
      id: uuid(),
      subtitle: 'Reasonably Possible Contingencies (Disclosed)',
      narrative:
        'The following contingencies are considered reasonably possible. While not ' +
        'accrued, they are disclosed per SFFAS 5, paragraph 36.',
      tables: [],
    });
  }

  return {
    id: uuid(),
    noteNumber: 10,
    title: 'Commitments and Contingencies',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 5, para 33-44; SFFAS 12',
    narrative:
      'Commitments represent binding agreements for future transactions. ' +
      'Contingencies represent potential future losses from litigation, claims, ' +
      'and assessments. Contingent liabilities are accrued when loss is probable ' +
      'and the amount can be reasonably estimated; disclosed when reasonably possible; ' +
      'and not disclosed when remote.',
    tables: [commitmentTable, contingencyTable],
    subnotes,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates the complete set of Note Disclosures per OMB A-136, Section II.3.2.
 *
 * Produces Notes 1-10 as required for federal financial statements:
 *   Note  1: Significant Accounting Policies — entity description, basis of
 *            accounting, and specific policy elections (SFFAS 47)
 *   Note  2: Fund Balance with Treasury — by fund type and status of funds (SFFAS 1)
 *   Note  3: Investments — cost, amortization, interest, net, and market value (SFFAS 1)
 *   Note  4: Accounts Receivable — intra/public, gross, allowance, net (SFFAS 1)
 *   Note  5: Inventory and Related Property — by category and valuation method (SFFAS 3)
 *   Note  6: PP&E — acquisition cost, accumulated depreciation, net by category (SFFAS 6)
 *   Note  7: Leases — operating and capital per SFFAS 54 (SFFAS 54/SFFAS 5)
 *   Note  8: Liabilities Not Covered — unfunded liabilities requiring future
 *            appropriations (SFFAS 5)
 *   Note  9: Federal Employee Benefits — pension, health, FECA actuarial (SFFAS 33)
 *   Note 10: Commitments and Contingencies — future obligations and potential
 *            losses by likelihood (SFFAS 5, SFFAS 12)
 *
 * @param data - Combined input data for all note disclosures
 * @param fiscalYear - The fiscal year of the report
 * @param entityName - Name of the reporting entity
 * @returns NoteDisclosureSet with all 10 required notes
 *
 * @see OMB Circular A-136, Section II.3.2 (Notes to Financial Statements)
 * @see SFFAS 1, 3, 5, 6, 7, 12, 33, 47, 54
 */
export function generateNoteDisclosures(
  data: NoteDisclosuresData,
  fiscalYear: number,
  entityName: string = 'Federal Reporting Entity',
): NoteDisclosureSet {
  const notes: NoteDisclosure[] = [
    generateNote1(data.accountingPolicies),
    generateNote2(data.fundBalance),
    generateNote3(data.investments),
    generateNote4(data.accountsReceivable),
    generateNote5(data.inventory),
    generateNote6(data.ppe),
    generateNote7(data.leases),
    generateNote8(data.uncoveredLiabilities),
    generateNote9(data.employeeBenefits),
    generateNote10(data.commitmentsContingencies),
  ];

  return {
    id: uuid(),
    reportDate: new Date().toISOString(),
    fiscalYear,
    entityName,
    notes,
    generatedAt: new Date().toISOString(),
  };
}
