/**
 * Federal Financial Statement Note Disclosures Generator
 *
 * Generates the required note disclosures per OMB A-136, Section II.3.2
 * for federal financial statements. Each note provides essential context
 * for understanding the principal financial statements.
 *
 * Required notes include:
 *   - Note 1: Significant Accounting Policies
 *   - Note 2: Fund Balance with Treasury
 *   - Note 3: Investments
 *   - Note 4: Accounts Receivable
 *   - Note 5: Inventory and Related Property
 *   - Note 6: Property, Plant, and Equipment
 *   - Note 7: Leases (SFFAS 54)
 *   - Note 8: Liabilities Not Covered by Budgetary Resources
 *   - Note 9: Federal Employee Benefits
 *   - Note 10: Commitments and Contingencies
 *
 * References:
 *   - OMB Circular A-136, Section II.3.2 (Notes to Financial Statements)
 *   - SFFAS 1 (Accounting and Financial Reporting)
 *   - SFFAS 5 (Accounting for Liabilities)
 *   - SFFAS 6 (PP&E)
 *   - SFFAS 54 (Leases)
 *   - DoD FMR Vol. 6B (Form and Content of DoD Financial Statements)
 */

import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NoteDisclosure {
  noteNumber: number;
  title: string;
  content: NoteSection[];
  authority: string;
}

export interface NoteSection {
  heading: string;
  narrative?: string;
  tableData?: NoteTableRow[];
}

export interface NoteTableRow {
  label: string;
  currentYear: number;
  priorYear?: number;
}

export interface NoteDisclosureInput {
  entityName: string;
  fiscalYear: number;
  priorFiscalYear?: number;
  fundBalanceByType?: Record<string, number>;
  investmentsByType?: Array<{ type: string; cost: number; amortization: number; marketValue: number }>;
  receivables?: { intragovernmental: { gross: number; allowance: number }; public: { gross: number; allowance: number } };
  inventory?: Array<{ category: string; amount: number; valuationMethod: string }>;
  ppe?: Array<{ category: string; acquisitionCost: number; accumulatedDepreciation: number }>;
  leases?: { operatingCount: number; capitalCount: number; totalLiability: number; totalAsset: number };
  unfundedLiabilities?: Array<{ type: string; amount: number }>;
  employeeBenefits?: { fersLiability: number; fehbLiability: number; fecaLiability: number; militaryRetirement: number };
  contingencies?: Array<{ description: string; likelihood: 'probable' | 'reasonably_possible' | 'remote'; estimatedAmount?: number }>;
}

export interface NoteDisclosureSet {
  id: string;
  entityName: string;
  fiscalYear: number;
  generatedAt: string;
  notes: NoteDisclosure[];
  totalNotes: number;
}

// ---------------------------------------------------------------------------
// Note Generators
// ---------------------------------------------------------------------------

function generateNote1(input: NoteDisclosureInput): NoteDisclosure {
  return {
    noteNumber: 1,
    title: 'Significant Accounting Policies',
    content: [
      {
        heading: 'Reporting Entity',
        narrative: `${input.entityName} is a component of the United States Department of Defense. These financial statements have been prepared to report the financial position and results of operations of the entity as required by 31 U.S.C. §3515 and per the form and content guidance in OMB Circular A-136.`,
      },
      {
        heading: 'Basis of Accounting',
        narrative: 'These financial statements are prepared in accordance with generally accepted accounting principles (GAAP) for federal entities as promulgated by the Federal Accounting Standards Advisory Board (FASAB). The entity uses the accrual basis of accounting for proprietary accounts and the budgetary basis for budgetary accounts.',
      },
      {
        heading: 'Use of Estimates',
        narrative: 'The preparation of financial statements requires management to make estimates and assumptions that affect reported amounts of assets, liabilities, revenue, and expenses. Actual results may differ from those estimates.',
      },
    ],
    authority: 'OMB A-136, Section II.3.2, Note 1; SFFAS 1',
  };
}

function generateNote2(input: NoteDisclosureInput): NoteDisclosure {
  const fundTypes = input.fundBalanceByType || {
    'General Funds': 0,
    'Revolving Funds': 0,
    'Trust Funds': 0,
    'Other Fund Types': 0,
  };

  const tableData = Object.entries(fundTypes).map(([label, amount]) => ({
    label,
    currentYear: amount,
  }));

  const total = Object.values(fundTypes).reduce((s, v) => s + v, 0);
  tableData.push({ label: 'Total Fund Balance with Treasury', currentYear: total });

  return {
    noteNumber: 2,
    title: 'Fund Balance with Treasury',
    content: [
      {
        heading: 'Fund Balance by Fund Type',
        narrative: 'Fund Balance with Treasury is the aggregate amount of funds in the entity\'s accounts with the U.S. Treasury. The fund balance is available to pay current liabilities and finance authorized purchases.',
        tableData,
      },
      {
        heading: 'Status of Fund Balance',
        narrative: 'Fund balance consists of unobligated balance (available and unavailable), obligated balance not yet disbursed, and non-budgetary FBWT.',
      },
    ],
    authority: 'OMB A-136, Section II.3.2, Note 2; SFFAS 1, para 42-45',
  };
}

function generateNote3(input: NoteDisclosureInput): NoteDisclosure {
  const investments = input.investmentsByType || [];

  const tableData = investments.map((inv) => ({
    label: inv.type,
    currentYear: Math.round((inv.cost + inv.amortization) * 100) / 100,
  }));

  const total = investments.reduce((s, i) => s + i.cost + i.amortization, 0);
  tableData.push({ label: 'Total Investments', currentYear: Math.round(total * 100) / 100 });

  return {
    noteNumber: 3,
    title: 'Investments',
    content: [
      {
        heading: 'Investments',
        narrative: 'Investments consist of Treasury securities held by trust funds and other investment accounts. Investments are reported at cost, adjusted for amortization of premiums or discounts.',
        tableData,
      },
    ],
    authority: 'OMB A-136, Section II.3.2, Note 3; SFFAS 1, para 66-73',
  };
}

function generateNote4(input: NoteDisclosureInput): NoteDisclosure {
  const receivables = input.receivables || {
    intragovernmental: { gross: 0, allowance: 0 },
    public: { gross: 0, allowance: 0 },
  };

  return {
    noteNumber: 4,
    title: 'Accounts Receivable, Net',
    content: [
      {
        heading: 'Accounts Receivable',
        narrative: 'Accounts receivable represent amounts due from other federal agencies (intragovernmental) and from the public. An allowance for uncollectible accounts is established for public receivables based on historical experience and analysis of outstanding balances.',
        tableData: [
          { label: 'Intragovernmental Receivables (Gross)', currentYear: receivables.intragovernmental.gross },
          { label: 'Less: Allowance for Uncollectible (Intragov)', currentYear: -receivables.intragovernmental.allowance },
          { label: 'Intragovernmental Receivables, Net', currentYear: receivables.intragovernmental.gross - receivables.intragovernmental.allowance },
          { label: 'Public Receivables (Gross)', currentYear: receivables.public.gross },
          { label: 'Less: Allowance for Uncollectible (Public)', currentYear: -receivables.public.allowance },
          { label: 'Public Receivables, Net', currentYear: receivables.public.gross - receivables.public.allowance },
          { label: 'Total Accounts Receivable, Net', currentYear: (receivables.intragovernmental.gross - receivables.intragovernmental.allowance) + (receivables.public.gross - receivables.public.allowance) },
        ],
      },
    ],
    authority: 'OMB A-136, Section II.3.2, Note 4; SFFAS 1, para 41-55',
  };
}

function generateNote5(input: NoteDisclosureInput): NoteDisclosure {
  const inventory = input.inventory || [];

  const tableData = inventory.map((item) => ({
    label: `${item.category} (${item.valuationMethod})`,
    currentYear: item.amount,
  }));

  const total = inventory.reduce((s, i) => s + i.amount, 0);
  tableData.push({ label: 'Total Inventory and Related Property', currentYear: total });

  return {
    noteNumber: 5,
    title: 'Inventory and Related Property',
    content: [
      {
        heading: 'Inventory',
        narrative: 'Inventory includes items held for sale, held for repair, excess/obsolete/unserviceable inventory, and operating materials and supplies. Inventory is valued using the methods indicated.',
        tableData,
      },
    ],
    authority: 'OMB A-136, Section II.3.2, Note 5; SFFAS 3',
  };
}

function generateNote6(input: NoteDisclosureInput): NoteDisclosure {
  const ppe = input.ppe || [];

  const tableData: NoteTableRow[] = [];
  let totalAcquisition = 0;
  let totalDepreciation = 0;

  for (const item of ppe) {
    tableData.push({
      label: item.category,
      currentYear: Math.round((item.acquisitionCost - item.accumulatedDepreciation) * 100) / 100,
    });
    totalAcquisition += item.acquisitionCost;
    totalDepreciation += item.accumulatedDepreciation;
  }

  tableData.push({ label: 'Total Acquisition Cost', currentYear: Math.round(totalAcquisition * 100) / 100 });
  tableData.push({ label: 'Less: Accumulated Depreciation', currentYear: -Math.round(totalDepreciation * 100) / 100 });
  tableData.push({ label: 'PP&E, Net', currentYear: Math.round((totalAcquisition - totalDepreciation) * 100) / 100 });

  return {
    noteNumber: 6,
    title: 'Property, Plant, and Equipment, Net',
    content: [
      {
        heading: 'General PP&E',
        narrative: 'General PP&E consists of real property, personal property, and internal use software used in providing goods and services. PP&E is recorded at acquisition cost and depreciated using the straight-line method over the estimated useful life of the asset.',
        tableData,
      },
    ],
    authority: 'OMB A-136, Section II.3.2, Note 6; SFFAS 6; SFFAS 10',
  };
}

function generateNote7(input: NoteDisclosureInput): NoteDisclosure {
  const leases = input.leases || { operatingCount: 0, capitalCount: 0, totalLiability: 0, totalAsset: 0 };

  return {
    noteNumber: 7,
    title: 'Leases',
    content: [
      {
        heading: 'Lease Summary',
        narrative: `The entity has recognized lease assets and liabilities in accordance with SFFAS 54. As of the reporting date, the entity has ${leases.operatingCount} operating leases and ${leases.capitalCount} capital/finance leases.`,
        tableData: [
          { label: 'Lease Assets (USSGL 175000)', currentYear: leases.totalAsset },
          { label: 'Lease Liabilities (USSGL 294000)', currentYear: leases.totalLiability },
          { label: 'Operating Lease Count', currentYear: leases.operatingCount },
          { label: 'Capital/Finance Lease Count', currentYear: leases.capitalCount },
        ],
      },
      {
        heading: 'Future Lease Payments',
        narrative: 'Future minimum lease payments under non-cancellable leases are disclosed per SFFAS 54 for fiscal years +1 through +5 and thereafter.',
      },
    ],
    authority: 'OMB A-136, Section II.3.2, Note 7; SFFAS 54; SFFAS 62',
  };
}

function generateNote8(input: NoteDisclosureInput): NoteDisclosure {
  const unfunded = input.unfundedLiabilities || [];

  const tableData = unfunded.map((item) => ({
    label: item.type,
    currentYear: item.amount,
  }));

  const total = unfunded.reduce((s, i) => s + i.amount, 0);
  tableData.push({ label: 'Total Liabilities Not Covered by Budgetary Resources', currentYear: total });

  return {
    noteNumber: 8,
    title: 'Liabilities Not Covered by Budgetary Resources',
    content: [
      {
        heading: 'Unfunded Liabilities',
        narrative: 'Liabilities not covered by budgetary resources are liabilities for which congressional action is needed before budgetary resources can be provided. These include military retirement benefits, FECA actuarial liability, environmental cleanup costs, and unfunded annual leave.',
        tableData,
      },
    ],
    authority: 'OMB A-136, Section II.3.2, Note 8; SFFAS 5',
  };
}

function generateNote9(input: NoteDisclosureInput): NoteDisclosure {
  const benefits = input.employeeBenefits || {
    fersLiability: 0,
    fehbLiability: 0,
    fecaLiability: 0,
    militaryRetirement: 0,
  };

  const total = benefits.fersLiability + benefits.fehbLiability + benefits.fecaLiability + benefits.militaryRetirement;

  return {
    noteNumber: 9,
    title: 'Federal Employee and Veteran Benefits Payable',
    content: [
      {
        heading: 'Employee Benefits',
        narrative: 'Federal employee benefits payable include the actuarial liabilities for pension, post-retirement health, and workers\' compensation benefits. These liabilities are determined by actuarial estimates.',
        tableData: [
          { label: 'FERS Pension Liability', currentYear: benefits.fersLiability },
          { label: 'FEHB Post-Retirement Health', currentYear: benefits.fehbLiability },
          { label: 'FECA Workers\' Compensation', currentYear: benefits.fecaLiability },
          { label: 'Military Retirement Benefits', currentYear: benefits.militaryRetirement },
          { label: 'Total Federal Employee Benefits Payable', currentYear: total },
        ],
      },
    ],
    authority: 'OMB A-136, Section II.3.2, Note 9; SFFAS 5; SFFAS 33',
  };
}

function generateNote10(input: NoteDisclosureInput): NoteDisclosure {
  const contingencies = input.contingencies || [];

  const sections: NoteSection[] = [
    {
      heading: 'Commitments and Contingencies',
      narrative: 'The entity is a party to various legal actions and claims. Contingent liabilities are recognized when the loss is probable and reasonably estimable. Contingencies that are reasonably possible are disclosed but not accrued.',
    },
  ];

  if (contingencies.length > 0) {
    sections.push({
      heading: 'Contingent Liabilities',
      tableData: contingencies
        .filter((c) => c.likelihood !== 'remote')
        .map((c) => ({
          label: `${c.description} (${c.likelihood})`,
          currentYear: c.estimatedAmount || 0,
        })),
    });
  }

  return {
    noteNumber: 10,
    title: 'Commitments and Contingencies',
    content: sections,
    authority: 'OMB A-136, Section II.3.2, Note 10; SFFAS 5, para 33-40; SFFAS 12',
  };
}

// ---------------------------------------------------------------------------
// Main Generator
// ---------------------------------------------------------------------------

/**
 * Generate the complete set of note disclosures for federal financial statements.
 *
 * Produces all 10 required notes per OMB A-136, Section II.3.2.
 * Each note includes structured data tables and narrative content
 * suitable for inclusion in the financial statement package.
 *
 * @param input - Data inputs for generating note content
 * @returns Complete note disclosure set
 */
export function generateNoteDisclosures(input: NoteDisclosureInput): NoteDisclosureSet {
  const notes: NoteDisclosure[] = [
    generateNote1(input),
    generateNote2(input),
    generateNote3(input),
    generateNote4(input),
    generateNote5(input),
    generateNote6(input),
    generateNote7(input),
    generateNote8(input),
    generateNote9(input),
    generateNote10(input),
  ];

  return {
    id: uuid(),
    entityName: input.entityName,
    fiscalYear: input.fiscalYear,
    generatedAt: new Date().toISOString(),
    notes,
    totalNotes: notes.length,
  };
}

/**
 * Generate a single note disclosure by number.
 *
 * @param noteNumber - The note number (1-10)
 * @param input - Data inputs for generating note content
 * @returns Single note disclosure, or null if invalid number
 */
export function generateSingleNote(
  noteNumber: number,
  input: NoteDisclosureInput,
): NoteDisclosure | null {
  const generators: Record<number, (input: NoteDisclosureInput) => NoteDisclosure> = {
    1: generateNote1,
    2: generateNote2,
    3: generateNote3,
    4: generateNote4,
    5: generateNote5,
    6: generateNote6,
    7: generateNote7,
    8: generateNote8,
    9: generateNote9,
    10: generateNote10,
  };

  const gen = generators[noteNumber];
  return gen ? gen(input) : null;
}
