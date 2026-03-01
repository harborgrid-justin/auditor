/**
 * Note Disclosures Generator — OMB Circular A-136, Section II.3.2
 *
 * Generates the required note disclosures for federal financial statements
 * as prescribed by OMB Circular A-136 and applicable SFFAS standards.
 * Notes provide additional detail, context, and breakdowns beyond the
 * face of the principal financial statements.
 *
 * This module is data-driven: all 24 notes pull directly from
 * `DoDEngagementData` arrays (USSGL accounts, property records,
 * environmental liabilities, actuarial liabilities, lease records,
 * FBWT reconciliations, ADA violations, obligations, etc.).
 *
 * Required notes per OMB A-136, Section II.3.2:
 *   Note  1: Significant Accounting Policies
 *   Note  2: Fund Balance with Treasury
 *   Note  3: Investments
 *   Note  4: Accounts Receivable
 *   Note  5: Loans Receivable
 *   Note  6: Inventory and Related Property
 *   Note  7: General Property, Plant, and Equipment
 *   Note  8: Stewardship Property, Plant, and Equipment
 *   Note  9: Leases (SFFAS 54)
 *   Note 10: Liabilities Not Covered by Budgetary Resources
 *   Note 11: Accounts Payable
 *   Note 12: Federal Employee and Veteran Benefits
 *   Note 13: Environmental and Disposal Liabilities
 *   Note 14: Other Liabilities
 *   Note 15: Commitments and Contingencies
 *   Note 16: Dedicated Collections
 *   Note 17: Intragovernmental Costs and Exchange Revenue
 *   Note 18: Program Costs
 *   Note 19: Inter-Entity Costs
 *   Note 20: Undelivered Orders at the End of the Period
 *   Note 21: Explanation of Differences Between the SBR and Budget
 *   Note 22: Custodial Collections and Disposition
 *   Note 23: Anti-Deficiency Act Violations
 *   Note 24: Subsequent Events
 *
 * References:
 *   - OMB Circular A-136, Section II.3.2 (Notes to Financial Statements)
 *   - SFFAS 1: Accounting for Selected Assets and Liabilities
 *   - SFFAS 3: Accounting for Inventory and Related Property
 *   - SFFAS 5: Accounting for Liabilities of the Federal Government
 *   - SFFAS 6: Accounting for Property, Plant, and Equipment
 *   - SFFAS 7: Accounting for Revenue and Other Financing Sources
 *   - SFFAS 12: Recognition of Contingent Liabilities from Litigation
 *   - SFFAS 27: Identifying and Reporting Earmarked Funds
 *   - SFFAS 29: Heritage Assets and Stewardship Land
 *   - SFFAS 33: Pensions, Other Retirement Benefits, and Other Postemployment Benefits
 *   - SFFAS 47: Reporting Entity
 *   - SFFAS 54: Leases
 *   - DoD FMR 7000.14-R, Vol. 6B, Ch. 10-19: Notes to Financial Statements
 */

import type {
  USSGLAccount,
  DoDEngagementData,
  PropertyRecord,
  EnvironmentalLiability,
  ActuarialLiability,
  LeaseRecord,
  FBWTReconciliation,
  ADAViolation,
  Obligation,
  Collection,
  IntragovernmentalTransaction,
} from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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
export interface NoteDisclosuresReport {
  id: string;
  fiscalYear: number;
  dodComponent: string;
  reportingPeriodEnd: string;
  notes: NoteDisclosure[];
  totalNoteCount: number;
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 10 ** ROUNDING_PRECISION) / 10 ** ROUNDING_PRECISION;
}

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
 * Sum end-balance for proprietary USSGL accounts whose account number
 * falls within a numeric range. Optionally filter by sub-range for
 * intragovernmental vs. public classification.
 */
function sumRange(
  accounts: USSGLAccount[],
  minAcct: number,
  maxAcct: number,
  absoluteValue = true,
): number {
  return accounts
    .filter((a) => {
      const n = parseInt(a.accountNumber, 10);
      return a.accountType === 'proprietary' && n >= minAcct && n <= maxAcct;
    })
    .reduce(
      (sum, a) => sum + (absoluteValue ? Math.abs(a.endBalance) : a.endBalance),
      0,
    );
}

/**
 * Sum begin-balance for proprietary USSGL accounts in a range.
 */
function sumBeginRange(
  accounts: USSGLAccount[],
  minAcct: number,
  maxAcct: number,
  absoluteValue = true,
): number {
  return accounts
    .filter((a) => {
      const n = parseInt(a.accountNumber, 10);
      return a.accountType === 'proprietary' && n >= minAcct && n <= maxAcct;
    })
    .reduce(
      (sum, a) =>
        sum + (absoluteValue ? Math.abs(a.beginBalance) : a.beginBalance),
      0,
    );
}

/**
 * Sum end-balance for accounts matching a set of prefixes.
 */
function sumPrefixes(
  accounts: USSGLAccount[],
  prefixes: string[],
  absoluteValue = true,
): number {
  return accounts
    .filter(
      (a) =>
        a.accountType === 'proprietary' &&
        prefixes.some((p) => a.accountNumber.startsWith(p)),
    )
    .reduce(
      (sum, a) => sum + (absoluteValue ? Math.abs(a.endBalance) : a.endBalance),
      0,
    );
}

// ---------------------------------------------------------------------------
// Note Generators (1-24)
// ---------------------------------------------------------------------------

/**
 * Note 1: Significant Accounting Policies.
 *
 * @see SFFAS 47, para 75-78 (Reporting Entity Disclosures)
 * @see OMB A-136, Section II.3.2
 */
function generateNote1(data: DoDEngagementData): NoteDisclosure {
  const subnotes: SubNote[] = [
    {
      id: uuid(),
      subtitle: 'Reporting Entity',
      narrative:
        `The ${data.dodComponent} is a component of the United States Department ` +
        `of Defense. These financial statements reflect the financial position ` +
        `and results of operations for fiscal year ${data.fiscalYear}.`,
      tables: [],
    },
    {
      id: uuid(),
      subtitle: 'Basis of Accounting and Presentation',
      narrative:
        'These financial statements are prepared in accordance with accounting ' +
        'principles and standards prescribed by the Federal Accounting Standards ' +
        'Advisory Board (FASAB), the Office of Management and Budget (OMB) ' +
        'Circular A-136, and the DoD Financial Management Regulation ' +
        '(DoD FMR 7000.14-R). The statements are prepared on both an ' +
        'accrual basis (proprietary) and an obligation basis (budgetary).',
      tables: [],
    },
    {
      id: uuid(),
      subtitle: 'Budgetary Accounting',
      narrative:
        'Budgetary resources are recognized when authorized by public law ' +
        '(appropriations, borrowing authority, contract authority, spending ' +
        'authority from offsetting collections). Obligations are recognized ' +
        'when the entity enters into binding agreements.',
      tables: [],
    },
    {
      id: uuid(),
      subtitle: 'Revenue Recognition',
      narrative:
        'Exchange revenue is recognized when goods have been delivered or ' +
        'services rendered. Nonexchange revenue (taxes, fines, penalties) ' +
        'is recognized when a specifically identifiable, legally enforceable ' +
        'claim arises, per SFFAS 7.',
      tables: [],
    },
    {
      id: uuid(),
      subtitle: 'Use of Estimates',
      narrative:
        'The preparation of financial statements requires management to make ' +
        'estimates and assumptions that affect amounts reported. Actual results ' +
        'could differ. Key estimates include environmental liabilities, ' +
        'actuarial benefit liabilities, and allowances for uncollectible amounts.',
      tables: [],
    },
  ];

  return {
    id: uuid(),
    noteNumber: 1,
    title: 'Significant Accounting Policies',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 47, para 75-78',
    narrative:
      'This note summarizes the significant accounting policies applied in ' +
      'preparing these financial statements in accordance with FASAB standards.',
    tables: [],
    subnotes,
  };
}

/**
 * Note 2: Fund Balance with Treasury (FBWT).
 *
 * @see SFFAS 1, para 30-33 (Fund Balance with Treasury)
 */
function generateNote2(data: DoDEngagementData): NoteDisclosure {
  const accts = data.ussglAccounts;

  // USSGL 1010 - FBWT
  const fbwtEnd = sumRange(accts, 1010, 1010);
  const fbwtBegin = sumBeginRange(accts, 1010, 1010);

  // Status of FBWT from appropriation data
  const unobligatedAvailable = data.appropriations
    .filter((a) => a.status === 'current')
    .reduce((s, a) => s + a.unobligatedBalance, 0);

  const unobligatedUnavailable = data.appropriations
    .filter((a) => a.status === 'expired')
    .reduce((s, a) => s + a.unobligatedBalance, 0);

  const obligatedNotDisbursed = data.obligations
    .filter(
      (o) =>
        o.status === 'open' || o.status === 'partially_liquidated',
    )
    .reduce((s, o) => s + o.unliquidatedBalance, 0);

  const statusRows: NoteTableRow[] = [
    { label: 'Unobligated Balance - Available', values: [unobligatedAvailable] },
    {
      label: 'Unobligated Balance - Unavailable',
      values: [unobligatedUnavailable],
    },
    {
      label: 'Obligated Balance Not Yet Disbursed',
      values: [obligatedNotDisbursed],
    },
  ];

  const statusTable = makeTable(
    'Status of Fund Balance with Treasury',
    ['Status', 'Amount'],
    statusRows,
    {
      label: 'Total Fund Balance with Treasury',
      values: [fbwtEnd],
    },
  );

  // FBWT reconciliation items
  const reconTables: NoteTable[] = [];
  if (data.fbwtReconciliations && data.fbwtReconciliations.length > 0) {
    const reconRows: NoteTableRow[] = data.fbwtReconciliations.map((r) => ({
      label: r.treasuryAccountSymbol,
      values: [r.agencyBookBalance, r.treasuryBalance, r.netDifference],
    }));
    reconTables.push(
      makeTable(
        'FBWT Reconciliation Summary',
        ['Treasury Account', 'Agency Balance', 'Treasury Balance', 'Difference'],
        reconRows,
      ),
    );
  }

  return {
    id: uuid(),
    noteNumber: 2,
    title: 'Fund Balance with Treasury',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 1, para 30-33',
    narrative:
      'Fund Balance with Treasury represents the aggregate amount of funds ' +
      "in the entity's accounts with the U.S. Treasury from which the entity " +
      'is authorized to make expenditures and pay liabilities.',
    tables: [statusTable, ...reconTables],
    subnotes: [],
  };
}

/**
 * Note 3: Investments.
 *
 * @see SFFAS 1, para 53-67 (Investments in Treasury Securities)
 */
function generateNote3(data: DoDEngagementData): NoteDisclosure {
  const accts = data.ussglAccounts;

  // USSGL 1601-1699: Investments
  const investmentsEnd = sumRange(accts, 1601, 1699);
  const investmentsBegin = sumBeginRange(accts, 1601, 1699);

  // Interest receivable on investments (1341)
  const interestReceivable = sumRange(accts, 1341, 1341);

  const rows: NoteTableRow[] = [
    { label: 'Investments in Treasury Securities', values: [investmentsEnd] },
    { label: 'Interest Receivable', values: [interestReceivable] },
  ];

  const investmentTable = makeTable(
    'Investments',
    ['Description', 'Amount'],
    rows,
    {
      label: 'Total Investments, Net',
      values: [round2(investmentsEnd + interestReceivable)],
    },
  );

  return {
    id: uuid(),
    noteNumber: 3,
    title: 'Investments',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 1, para 53-67',
    narrative:
      'Investments consist of Treasury securities and other federal investments. ' +
      'Premiums and discounts are amortized over the life of the investment ' +
      'using the effective interest method.',
    tables: [investmentTable],
    subnotes: [],
  };
}

/**
 * Note 4: Accounts Receivable.
 *
 * @see SFFAS 1, para 40-52 (Accounts Receivable)
 */
function generateNote4(data: DoDEngagementData): NoteDisclosure {
  const accts = data.ussglAccounts;

  // Intragovernmental receivables (1310-1319)
  const intraGross = sumRange(accts, 1310, 1319);
  // Public receivables (1320-1399, excluding interest receivable 1341)
  const publicGross = sumRange(accts, 1320, 1340) + sumRange(accts, 1342, 1399);
  // Allowance for uncollectible (1390-series, typically credit balance)
  const allowance = sumRange(accts, 1390, 1399);

  const rows: NoteTableRow[] = [
    { label: 'Intragovernmental Receivables', values: [intraGross, 0, intraGross] },
    {
      label: 'Public Receivables',
      values: [publicGross, allowance, round2(publicGross - allowance)],
    },
  ];

  const arTable = makeTable(
    'Accounts Receivable, Net',
    ['Category', 'Gross', 'Allowance', 'Net'],
    rows,
    {
      label: 'Total Accounts Receivable, Net',
      values: [
        round2(intraGross + publicGross),
        allowance,
        round2(intraGross + publicGross - allowance),
      ],
    },
  );

  return {
    id: uuid(),
    noteNumber: 4,
    title: 'Accounts Receivable, Net',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 1, para 40-52',
    narrative:
      'Accounts receivable represents amounts owed by other federal entities ' +
      '(intragovernmental) and the public. An allowance for uncollectible ' +
      'amounts is established based on historical collection experience.',
    tables: [arTable],
    subnotes: [],
  };
}

/**
 * Note 5: Loans Receivable.
 *
 * @see SFFAS 1, para 68-74 (Direct Loans and Loan Guarantees)
 */
function generateNote5(data: DoDEngagementData): NoteDisclosure {
  const accts = data.ussglAccounts;

  // USSGL 1350-1359: Loans Receivable
  const loansEnd = sumRange(accts, 1350, 1359);
  // Debt records as proxy for loan detail
  const debtTotal = (data.debtRecords ?? []).reduce(
    (s, d) => s + d.totalAmountDue,
    0,
  );

  const rows: NoteTableRow[] = [];
  if (loansEnd > 0) {
    rows.push({ label: 'Direct Loans', values: [loansEnd] });
  }
  if (debtTotal > 0) {
    rows.push({ label: 'Debts Receivable from Public', values: [debtTotal] });
  }

  const table = rows.length > 0
    ? makeTable(
        'Loans and Debts Receivable',
        ['Category', 'Amount'],
        rows,
        { label: 'Total Loans Receivable', values: [round2(loansEnd + debtTotal)] },
      )
    : makeTable(
        'Loans Receivable',
        ['Category', 'Amount'],
        [{ label: 'No loans receivable reported', values: [0] }],
      );

  return {
    id: uuid(),
    noteNumber: 5,
    title: 'Loans Receivable',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 1, para 68-74',
    narrative:
      'Loans receivable represent direct loans made by the entity and debts ' +
      'owed to the federal government. Allowances are established for ' +
      'estimated losses using the present value methodology per the ' +
      'Federal Credit Reform Act.',
    tables: [table],
    subnotes: [],
  };
}

/**
 * Note 6: Inventory and Related Property.
 *
 * @see SFFAS 3: Accounting for Inventory and Related Property
 */
function generateNote6(data: DoDEngagementData): NoteDisclosure {
  const accts = data.ussglAccounts;

  // USSGL 1521-1529: Inventory
  const inventoryEnd = sumRange(accts, 1521, 1529);
  // USSGL 1511-1519: Operating materials and supplies
  const omEnd = sumRange(accts, 1511, 1519);
  // USSGL 1541-1549: Stockpile materials
  const stockpileEnd = sumRange(accts, 1541, 1549);

  const rows: NoteTableRow[] = [
    { label: 'Inventory Held for Sale', values: [inventoryEnd] },
    { label: 'Operating Materials and Supplies', values: [omEnd] },
    { label: 'Stockpile Materials', values: [stockpileEnd] },
  ];

  const inventoryTable = makeTable(
    'Inventory and Related Property',
    ['Category', 'Amount'],
    rows,
    {
      label: 'Total Inventory and Related Property',
      values: [round2(inventoryEnd + omEnd + stockpileEnd)],
    },
  );

  return {
    id: uuid(),
    noteNumber: 6,
    title: 'Inventory and Related Property',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 3',
    narrative:
      'Inventory includes tangible personal property held for sale or ' +
      'consumption. Operating materials and supplies are consumed in ' +
      'operations. Stockpile materials are held in reserve for national ' +
      'defense or emergency purposes.',
    tables: [inventoryTable],
    subnotes: [],
  };
}

/**
 * Note 7: General Property, Plant, and Equipment (PP&E).
 *
 * @see SFFAS 6: Accounting for Property, Plant, and Equipment
 */
function generateNote7(data: DoDEngagementData): NoteDisclosure {
  const properties = data.propertyRecords ?? [];
  const generalPPE = properties.filter(
    (p) => p.category === 'general_ppe' || p.category === 'internal_use_software',
  );

  // Group by category
  const byCategory = new Map<
    string,
    { acqCost: number; accumDepr: number; netBook: number }
  >();
  for (const p of generalPPE) {
    const key =
      p.category === 'internal_use_software'
        ? 'Internal Use Software'
        : 'General PP&E';
    const existing = byCategory.get(key) ?? {
      acqCost: 0,
      accumDepr: 0,
      netBook: 0,
    };
    existing.acqCost += p.acquisitionCost;
    existing.accumDepr += Math.abs(p.accumulatedDepreciation);
    existing.netBook += p.currentBookValue;
    byCategory.set(key, existing);
  }

  // Fallback to USSGL if no property records: 1710-1799 PP&E
  if (byCategory.size === 0) {
    const ppeEnd = sumRange(data.ussglAccounts, 1710, 1799);
    const deprEnd = sumRange(data.ussglAccounts, 1750, 1759);
    byCategory.set('General PP&E (from USSGL)', {
      acqCost: ppeEnd,
      accumDepr: deprEnd,
      netBook: round2(ppeEnd - deprEnd),
    });
  }

  const rows: NoteTableRow[] = [];
  let totalAcq = 0;
  let totalDepr = 0;
  let totalNet = 0;
  for (const [cat, vals] of byCategory.entries()) {
    rows.push({
      label: cat,
      values: [vals.acqCost, vals.accumDepr, vals.netBook],
    });
    totalAcq += vals.acqCost;
    totalDepr += vals.accumDepr;
    totalNet += vals.netBook;
  }

  const ppeTable = makeTable(
    'General Property, Plant, and Equipment, Net',
    ['Category', 'Acquisition Cost', 'Accumulated Depreciation', 'Net Book Value'],
    rows,
    { label: 'Total General PP&E', values: [totalAcq, totalDepr, totalNet] },
  );

  return {
    id: uuid(),
    noteNumber: 7,
    title: 'General Property, Plant, and Equipment, Net',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 6',
    narrative:
      'General PP&E items are used in providing goods or services. PP&E is ' +
      'stated at acquisition cost and depreciated using the straight-line ' +
      'method over the estimated useful life. Land and construction in ' +
      'progress are not depreciated.',
    tables: [ppeTable],
    subnotes: [],
  };
}

/**
 * Note 8: Stewardship Property, Plant, and Equipment.
 *
 * @see SFFAS 29: Heritage Assets and Stewardship Land
 */
function generateNote8(data: DoDEngagementData): NoteDisclosure {
  const properties = data.propertyRecords ?? [];
  const stewardship = properties.filter(
    (p) =>
      p.category === 'national_defense' ||
      p.category === 'heritage' ||
      p.category === 'stewardship_land',
  );

  const categoryLabels: Record<string, string> = {
    national_defense: 'National Defense PP&E',
    heritage: 'Heritage Assets',
    stewardship_land: 'Stewardship Land',
  };

  const byCategory = new Map<string, number>();
  for (const p of stewardship) {
    const label = categoryLabels[p.category] ?? p.category;
    byCategory.set(label, (byCategory.get(label) ?? 0) + 1);
  }

  const rows: NoteTableRow[] = [];
  for (const [cat, count] of byCategory.entries()) {
    rows.push({ label: cat, values: [count] });
  }

  const stewardshipTable = makeTable(
    'Stewardship PP&E (Unit Count)',
    ['Category', 'Number of Units'],
    rows.length > 0
      ? rows
      : [{ label: 'No stewardship PP&E reported', values: [0] }],
  );

  return {
    id: uuid(),
    noteNumber: 8,
    title: 'Stewardship Property, Plant, and Equipment',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 29',
    narrative:
      'Stewardship PP&E consists of assets whose physical properties ' +
      'resemble those of general PP&E but that, due to their nature, ' +
      'are not valued or depreciated. National defense PP&E items ' +
      'are valued at acquisition cost but not depreciated. Heritage ' +
      'assets and stewardship land are reported in units.',
    tables: [stewardshipTable],
    subnotes: [],
  };
}

/**
 * Note 9: Leases.
 *
 * @see SFFAS 54: Leases (effective FY2027)
 * @see SFFAS 5 (prior to SFFAS 54 effective date)
 */
function generateNote9(data: DoDEngagementData): NoteDisclosure {
  const leases = data.leaseRecords ?? [];
  const operating = leases.filter((l) => l.leaseClassification === 'operating');
  const capital = leases.filter((l) => l.leaseClassification === 'capital');
  const intraGov = leases.filter(
    (l) => l.leaseClassification === 'intragovernmental',
  );

  const opRows: NoteTableRow[] = operating.map((l) => ({
    label: `${l.assetDescription} (${l.leaseNumber})`,
    values: [l.annualPayment, l.totalLeasePayments],
  }));

  const opTable = makeTable(
    'Future Payments Under Operating Leases',
    ['Lease', 'Annual Payment', 'Total Remaining'],
    opRows.length > 0
      ? opRows
      : [{ label: 'No operating leases', values: [0, 0] }],
    opRows.length > 0
      ? {
          label: 'Total Operating Leases',
          values: [
            operating.reduce((s, l) => s + l.annualPayment, 0),
            operating.reduce((s, l) => s + l.totalLeasePayments, 0),
          ],
        }
      : undefined,
  );

  const capRows: NoteTableRow[] = capital.map((l) => ({
    label: `${l.assetDescription} (${l.leaseNumber})`,
    values: [l.capitalizedAmount, l.leaseLiabilityBalance],
  }));

  const capTable = makeTable(
    'Assets Under Capital Leases',
    ['Lease', 'Capitalized Amount', 'Liability Balance'],
    capRows.length > 0
      ? capRows
      : [{ label: 'No capital leases', values: [0, 0] }],
    capRows.length > 0
      ? {
          label: 'Total Capital Leases',
          values: [
            capital.reduce((s, l) => s + l.capitalizedAmount, 0),
            capital.reduce((s, l) => s + l.leaseLiabilityBalance, 0),
          ],
        }
      : undefined,
  );

  const subnotes: SubNote[] = [
    { id: uuid(), subtitle: 'Operating Leases', narrative: `The entity has ${operating.length} operating lease(s).`, tables: [opTable] },
    { id: uuid(), subtitle: 'Capital Leases', narrative: `The entity has ${capital.length} capital lease(s).`, tables: [capTable] },
  ];

  if (intraGov.length > 0) {
    subnotes.push({
      id: uuid(),
      subtitle: 'Intragovernmental Leases',
      narrative: `The entity has ${intraGov.length} intragovernmental lease(s) with other federal entities.`,
      tables: [],
    });
  }

  return {
    id: uuid(),
    noteNumber: 9,
    title: 'Leases',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 54; SFFAS 5',
    narrative:
      'The entity enters into leasing arrangements for real property and ' +
      'equipment. Leases are classified as operating or capital per SFFAS 54.',
    tables: [],
    subnotes,
  };
}

/**
 * Note 10: Liabilities Not Covered by Budgetary Resources.
 *
 * @see SFFAS 5: Accounting for Liabilities of the Federal Government
 */
function generateNote10(data: DoDEngagementData): NoteDisclosure {
  const accts = data.ussglAccounts;
  const envLiab = (data.environmentalLiabilities ?? []).reduce(
    (s, e) => s + e.recordedLiability,
    0,
  );
  const actLiab = (data.actuarialLiabilities ?? []).reduce(
    (s, a) => s + a.unfundedPortion,
    0,
  );

  // Unfunded leave: USSGL 2210-2219
  const unfundedLeave = sumRange(accts, 2210, 2219);
  // Other unfunded liabilities: USSGL 2900-2999
  const otherUnfunded = sumRange(accts, 2900, 2999);

  const rows: NoteTableRow[] = [
    { label: 'Unfunded Annual Leave', values: [unfundedLeave] },
    { label: 'Actuarial Liabilities (Unfunded)', values: [actLiab] },
    { label: 'Environmental and Disposal Liabilities', values: [envLiab] },
    { label: 'Other Unfunded Liabilities', values: [otherUnfunded] },
  ];

  const totalUncovered = round2(
    unfundedLeave + actLiab + envLiab + otherUnfunded,
  );

  // Total liabilities from balance sheet USSGL 2000-2999
  const totalLiabilities = sumRange(accts, 2000, 2999);
  const covered = round2(totalLiabilities - totalUncovered);

  rows.push({ label: 'Total Liabilities Not Covered', values: [totalUncovered] });
  rows.push({
    label: 'Total Liabilities Covered by Budgetary Resources',
    values: [covered > 0 ? covered : 0],
  });

  const liabTable = makeTable(
    'Liabilities Not Covered by Budgetary Resources',
    ['Description', 'Amount'],
    rows,
    { label: 'Total Liabilities', values: [totalLiabilities] },
  );

  return {
    id: uuid(),
    noteNumber: 10,
    title: 'Liabilities Not Covered by Budgetary Resources',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 5',
    narrative:
      'Liabilities not covered by budgetary resources require future ' +
      'congressional action for funding. These include unfunded leave, ' +
      'FECA, actuarial liabilities, and environmental cleanup costs.',
    tables: [liabTable],
    subnotes: [],
  };
}

/**
 * Note 11: Accounts Payable.
 *
 * @see SFFAS 1, para 75-81 (Accounts Payable)
 */
function generateNote11(data: DoDEngagementData): NoteDisclosure {
  const accts = data.ussglAccounts;

  // Intragovernmental payables (2110-2119)
  const intraPayable = sumRange(accts, 2110, 2119);
  // Public payables (2120-2199)
  const publicPayable = sumRange(accts, 2120, 2199);

  const rows: NoteTableRow[] = [
    { label: 'Intragovernmental', values: [intraPayable] },
    { label: 'With the Public', values: [publicPayable] },
  ];

  const apTable = makeTable(
    'Accounts Payable',
    ['Category', 'Amount'],
    rows,
    {
      label: 'Total Accounts Payable',
      values: [round2(intraPayable + publicPayable)],
    },
  );

  return {
    id: uuid(),
    noteNumber: 11,
    title: 'Accounts Payable',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 1, para 75-81',
    narrative:
      'Accounts payable represents amounts owed to other federal entities ' +
      '(intragovernmental) and to the public for goods and services received.',
    tables: [apTable],
    subnotes: [],
  };
}

/**
 * Note 12: Federal Employee and Veteran Benefits.
 *
 * @see SFFAS 33: Pensions, Other Retirement Benefits, and Other
 *   Postemployment Benefits
 */
function generateNote12(data: DoDEngagementData): NoteDisclosure {
  const actuarial = data.actuarialLiabilities ?? [];

  const typeLabels: Record<string, string> = {
    military_retirement: 'Military Retirement Pension',
    fers: 'FERS Pension Liability',
    csrs: 'CSRS Pension Liability',
    opeb_health: 'Health Benefits (OPEB)',
    tsp_matching: 'TSP Matching Contributions',
    feca: 'FECA Actuarial Liability',
  };

  const rows: NoteTableRow[] = actuarial.map((a) => ({
    label: typeLabels[a.benefitType] ?? a.benefitType,
    values: [a.totalLiability, a.fundedPortion, a.unfundedPortion],
  }));

  const totalLiab = actuarial.reduce((s, a) => s + a.totalLiability, 0);
  const totalFunded = actuarial.reduce((s, a) => s + a.fundedPortion, 0);
  const totalUnfunded = actuarial.reduce((s, a) => s + a.unfundedPortion, 0);

  const benefitsTable = makeTable(
    'Federal Employee and Veteran Benefits',
    ['Benefit Type', 'Total Liability', 'Funded Portion', 'Unfunded Portion'],
    rows.length > 0
      ? rows
      : [{ label: 'No actuarial liabilities reported', values: [0, 0, 0] }],
    rows.length > 0
      ? {
          label: 'Total Employee Benefits',
          values: [totalLiab, totalFunded, totalUnfunded],
        }
      : undefined,
  );

  return {
    id: uuid(),
    noteNumber: 12,
    title: 'Federal Employee and Veteran Benefits',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 33',
    narrative:
      'Employee benefits liabilities represent the actuarial present value ' +
      'of projected benefits. Pension and health benefit liabilities are ' +
      'calculated by OPM and DoL actuaries.',
    tables: [benefitsTable],
    subnotes: [],
  };
}

/**
 * Note 13: Environmental and Disposal Liabilities.
 *
 * @see SFFAS 5, para 85-102; SFFAS 6, para 29-40
 */
function generateNote13(data: DoDEngagementData): NoteDisclosure {
  const envLiabilities = data.environmentalLiabilities ?? [];

  const siteTypeLabels: Record<string, string> = {
    brac: 'BRAC Sites',
    fuds: 'Formerly Used Defense Sites (FUDS)',
    active_installation: 'Active Installations',
    operational_range: 'Operational Ranges',
    disposal: 'Disposal Sites',
  };

  // Group by site type
  const byType = new Map<string, { count: number; total: number }>();
  for (const env of envLiabilities) {
    const label = siteTypeLabels[env.siteType] ?? env.siteType;
    const existing = byType.get(label) ?? { count: 0, total: 0 };
    existing.count += 1;
    existing.total += env.recordedLiability;
    byType.set(label, existing);
  }

  const rows: NoteTableRow[] = [];
  let grandTotal = 0;
  for (const [type, vals] of byType.entries()) {
    rows.push({ label: `${type} (${vals.count} sites)`, values: [vals.total] });
    grandTotal += vals.total;
  }

  const envTable = makeTable(
    'Environmental and Disposal Liabilities',
    ['Site Category', 'Recorded Liability'],
    rows.length > 0
      ? rows
      : [{ label: 'No environmental liabilities', values: [0] }],
    rows.length > 0
      ? { label: 'Total Environmental Liabilities', values: [grandTotal] }
      : undefined,
  );

  return {
    id: uuid(),
    noteNumber: 13,
    title: 'Environmental and Disposal Liabilities',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 5, para 85-102; SFFAS 6',
    narrative:
      'Environmental liabilities result from past transactions or events ' +
      'where the federal government is legally obligated to clean up ' +
      'contamination. Estimates are based on site-specific studies and ' +
      'engineering assessments.',
    tables: [envTable],
    subnotes: [],
  };
}

/**
 * Note 14: Other Liabilities.
 *
 * @see SFFAS 5: Accounting for Liabilities of the Federal Government
 */
function generateNote14(data: DoDEngagementData): NoteDisclosure {
  const accts = data.ussglAccounts;

  // Deferred revenue (2310-2399)
  const deferredRevenue = sumRange(accts, 2310, 2399);
  // Advances from others (2310-2319)
  const advances = sumRange(accts, 2310, 2319);
  // Deposit fund liabilities (2400-2499)
  const deposits = sumRange(accts, 2400, 2499);
  // Accrued liabilities (2200-2299)
  const accruedLiab = sumRange(accts, 2200, 2299);

  const rows: NoteTableRow[] = [
    { label: 'Accrued Funded Payroll and Benefits', values: [accruedLiab] },
    { label: 'Advances from Others and Deferred Revenue', values: [deferredRevenue] },
    { label: 'Deposit Fund Liabilities', values: [deposits] },
  ];

  const otherLiabTable = makeTable(
    'Other Liabilities',
    ['Description', 'Amount'],
    rows,
    {
      label: 'Total Other Liabilities',
      values: [round2(accruedLiab + deferredRevenue + deposits)],
    },
  );

  return {
    id: uuid(),
    noteNumber: 14,
    title: 'Other Liabilities',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 5',
    narrative:
      'Other liabilities include accrued funded payroll, advances from ' +
      'others, deferred revenue, and deposit fund liabilities.',
    tables: [otherLiabTable],
    subnotes: [],
  };
}

/**
 * Note 15: Commitments and Contingencies.
 *
 * @see SFFAS 5, para 33-44 (Contingencies)
 * @see SFFAS 12: Recognition of Contingent Liabilities from Litigation
 */
function generateNote15(data: DoDEngagementData): NoteDisclosure {
  // Commitments from open contracts
  const openContracts = data.contracts.filter((c) => c.status === 'active');
  const commitmentRows: NoteTableRow[] = openContracts
    .slice(0, 20) // Show top 20
    .map((c) => ({
      label: `${c.contractNumber} - ${c.vendorName}`,
      values: [c.totalValue, c.obligatedAmount, round2(c.totalValue - c.obligatedAmount)],
    }));

  const commitmentTable = makeTable(
    'Commitments (Active Contracts)',
    ['Contract', 'Total Value', 'Obligated', 'Remaining Commitment'],
    commitmentRows.length > 0
      ? commitmentRows
      : [{ label: 'No active commitments', values: [0, 0, 0] }],
    commitmentRows.length > 0
      ? {
          label: 'Total Active Commitments',
          values: [
            openContracts.reduce((s, c) => s + c.totalValue, 0),
            openContracts.reduce((s, c) => s + c.obligatedAmount, 0),
            openContracts.reduce(
              (s, c) => s + (c.totalValue - c.obligatedAmount),
              0,
            ),
          ],
        }
      : undefined,
  );

  const subnotes: SubNote[] = [
    {
      id: uuid(),
      subtitle: 'Contingent Liabilities',
      narrative:
        'Contingent liabilities are potential future losses from pending ' +
        'litigation, claims, and assessments. Per SFFAS 5, losses are accrued ' +
        'when probable and estimable, disclosed when reasonably possible, and ' +
        'not disclosed when remote.',
      tables: [],
    },
  ];

  return {
    id: uuid(),
    noteNumber: 15,
    title: 'Commitments and Contingencies',
    standardReference:
      'OMB A-136, Section II.3.2; SFFAS 5, para 33-44; SFFAS 12',
    narrative:
      'This note discloses commitments arising from binding agreements ' +
      'and contingent liabilities from pending legal matters.',
    tables: [commitmentTable],
    subnotes,
  };
}

/**
 * Note 16: Dedicated Collections.
 *
 * @see SFFAS 27: Identifying and Reporting Earmarked Funds
 */
function generateNote16(data: DoDEngagementData): NoteDisclosure {
  const specialAccounts = data.specialAccounts;
  const rows: NoteTableRow[] = specialAccounts.map((sa) => ({
    label: sa.accountName,
    values: [sa.receipts, sa.disbursements, sa.balance],
  }));

  const dedicatedTable = makeTable(
    'Dedicated Collections (Earmarked Funds)',
    ['Fund Name', 'Receipts', 'Disbursements', 'Balance'],
    rows.length > 0
      ? rows
      : [{ label: 'No dedicated collections', values: [0, 0, 0] }],
    rows.length > 0
      ? {
          label: 'Total Dedicated Collections',
          values: [
            specialAccounts.reduce((s, a) => s + a.receipts, 0),
            specialAccounts.reduce((s, a) => s + a.disbursements, 0),
            specialAccounts.reduce((s, a) => s + a.balance, 0),
          ],
        }
      : undefined,
  );

  return {
    id: uuid(),
    noteNumber: 16,
    title: 'Dedicated Collections',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 27',
    narrative:
      'Dedicated collections (earmarked funds) are financed by specifically ' +
      'identified revenues, often supplemented by other financing sources, ' +
      'which remain available to the entity over time.',
    tables: [dedicatedTable],
    subnotes: [],
  };
}

/**
 * Note 17: Intragovernmental Costs and Exchange Revenue.
 *
 * @see SFFAS 4: Managerial Cost Accounting Standards
 */
function generateNote17(data: DoDEngagementData): NoteDisclosure {
  const accts = data.ussglAccounts;

  // Intra costs: 6100-6199
  const intraCosts = sumRange(accts, 6100, 6199);
  // Public costs: 6200-6999
  const publicCosts = sumRange(accts, 6200, 6999);
  // Intra revenue: 5100-5199
  const intraRevenue = sumRange(accts, 5100, 5199);
  // Public revenue: 5200-5999
  const publicRevenue = sumRange(accts, 5200, 5999);

  const rows: NoteTableRow[] = [
    {
      label: 'Intragovernmental Gross Costs',
      values: [intraCosts],
    },
    { label: 'Public Gross Costs', values: [publicCosts] },
    { label: 'Total Gross Costs', values: [round2(intraCosts + publicCosts)] },
    {
      label: 'Intragovernmental Earned Revenue',
      values: [intraRevenue],
    },
    { label: 'Public Earned Revenue', values: [publicRevenue] },
    {
      label: 'Total Earned Revenue',
      values: [round2(intraRevenue + publicRevenue)],
    },
  ];

  const costTable = makeTable(
    'Intragovernmental Costs and Exchange Revenue',
    ['Category', 'Amount'],
    rows,
    {
      label: 'Net Cost of Operations',
      values: [
        round2(intraCosts + publicCosts - intraRevenue - publicRevenue),
      ],
    },
  );

  return {
    id: uuid(),
    noteNumber: 17,
    title: 'Intragovernmental Costs and Exchange Revenue',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 4',
    narrative:
      'Intragovernmental costs arise from transactions with other federal ' +
      'entities; public costs arise from transactions with non-federal ' +
      'entities. Exchange revenue is earned through the provision of goods ' +
      'and services.',
    tables: [costTable],
    subnotes: [],
  };
}

/**
 * Note 18: Program Costs.
 *
 * @see SFFAS 4: Managerial Cost Accounting Standards
 * @see DoD FMR Vol. 6A, Ch. 4, Table 4-1
 */
function generateNote18(data: DoDEngagementData): NoteDisclosure {
  // Derive from obligations by budget category
  const byCategory = new Map<string, number>();
  for (const ob of data.obligations) {
    const existing = byCategory.get(ob.budgetObjectCode) ?? 0;
    byCategory.set(ob.budgetObjectCode, existing + ob.amount);
  }

  const rows: NoteTableRow[] = [];
  for (const [boc, amount] of byCategory.entries()) {
    rows.push({ label: `BOC ${boc}`, values: [amount] });
  }

  const programTable = makeTable(
    'Program Costs by Budget Object Code',
    ['Budget Object Code', 'Amount'],
    rows.length > 0
      ? rows
      : [{ label: 'No program cost detail available', values: [0] }],
    rows.length > 0
      ? {
          label: 'Total Program Costs',
          values: [
            Array.from(byCategory.values()).reduce((s, v) => s + v, 0),
          ],
        }
      : undefined,
  );

  return {
    id: uuid(),
    noteNumber: 18,
    title: 'Program Costs',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 4',
    narrative:
      'Program costs are presented by major budget object code classification ' +
      'per DoD FMR Vol. 6A, Chapter 4.',
    tables: [programTable],
    subnotes: [],
  };
}

/**
 * Note 19: Inter-Entity Costs.
 *
 * @see FASAB Interpretation 6: Imputed Intragovernmental Costs
 */
function generateNote19(data: DoDEngagementData): NoteDisclosure {
  const actuarial = data.actuarialLiabilities ?? [];
  const imputedCosts = actuarial.reduce(
    (s, a) => s + a.imputedFinancingCost,
    0,
  );

  const rows: NoteTableRow[] = actuarial.map((a) => ({
    label: a.benefitType,
    values: [a.imputedFinancingCost],
  }));

  const imputedTable = makeTable(
    'Imputed Inter-Entity Costs',
    ['Benefit Type', 'Imputed Cost'],
    rows.length > 0
      ? rows
      : [{ label: 'No imputed costs', values: [0] }],
    rows.length > 0
      ? { label: 'Total Imputed Financing Sources', values: [imputedCosts] }
      : undefined,
  );

  return {
    id: uuid(),
    noteNumber: 19,
    title: 'Inter-Entity Costs',
    standardReference: 'OMB A-136, Section II.3.2; FASAB Interpretation 6',
    narrative:
      'Imputed inter-entity costs represent the unreimbursed portion of ' +
      'costs absorbed by other federal entities on behalf of the reporting ' +
      'entity. The imputed financing from costs absorbed by others is ' +
      'recognized as a financing source in the Statement of Changes in ' +
      'Net Position.',
    tables: [imputedTable],
    subnotes: [],
  };
}

/**
 * Note 20: Undelivered Orders at the End of the Period.
 *
 * @see OMB A-136, Section II.3.2
 */
function generateNote20(data: DoDEngagementData): NoteDisclosure {
  // UDO = open obligations where goods/services not yet received
  const openObligations = data.obligations.filter(
    (o) => o.status === 'open' || o.status === 'partially_liquidated',
  );

  const udoPaid = openObligations.reduce(
    (s, o) => s + o.liquidatedAmount,
    0,
  );
  const udoUnpaid = openObligations.reduce(
    (s, o) => s + o.unliquidatedBalance,
    0,
  );

  const rows: NoteTableRow[] = [
    { label: 'Undelivered Orders - Paid (Advances)', values: [udoPaid] },
    { label: 'Undelivered Orders - Unpaid', values: [udoUnpaid] },
  ];

  const udoTable = makeTable(
    'Undelivered Orders at End of Period',
    ['Category', 'Amount'],
    rows,
    {
      label: 'Total Undelivered Orders',
      values: [round2(udoPaid + udoUnpaid)],
    },
  );

  return {
    id: uuid(),
    noteNumber: 20,
    title: 'Undelivered Orders at the End of the Period',
    standardReference: 'OMB A-136, Section II.3.2',
    narrative:
      'Undelivered orders represent the amount of goods and/or services ' +
      'ordered that have not yet been received. This amount includes any ' +
      'orders for which advances have been paid.',
    tables: [udoTable],
    subnotes: [],
  };
}

/**
 * Note 21: Explanation of Differences Between the SBR and the Budget.
 *
 * @see OMB A-136, Section II.3.2
 */
function generateNote21(data: DoDEngagementData): NoteDisclosure {
  const sf133s = data.sf133Data ?? [];

  const rows: NoteTableRow[] = sf133s.map((sf) => ({
    label: sf.treasuryAccountSymbol,
    values: [
      sf.budgetaryResources.totalBudgetaryResources,
      sf.statusOfBudgetaryResources.newObligationsAndUpwardAdjustments,
      sf.outlays.outlaysNet,
    ],
  }));

  const sbrTable = makeTable(
    'SBR vs. Budget of the U.S. Government',
    ['Treasury Account', 'Total Budgetary Resources', 'Obligations Incurred', 'Net Outlays'],
    rows.length > 0
      ? rows
      : [{ label: 'No SF-133 data available', values: [0, 0, 0] }],
  );

  return {
    id: uuid(),
    noteNumber: 21,
    title: 'Explanation of Differences Between the SBR and the Budget',
    standardReference: 'OMB A-136, Section II.3.2',
    narrative:
      'This note explains material differences between the amounts ' +
      'presented on the Statement of Budgetary Resources and the amounts ' +
      'in the Budget of the United States Government. Differences may arise ' +
      'from timing, reporting entity differences, and rounding.',
    tables: [sbrTable],
    subnotes: [],
  };
}

/**
 * Note 22: Custodial Collections and Disposition.
 *
 * @see SFFAS 7, para 38-43 (Nonexchange Revenue)
 * @see SFFAS 7, para 48-51 (Custodial Activity)
 */
function generateNote22(data: DoDEngagementData): NoteDisclosure {
  // Derive from collections
  const collectionsByType = new Map<string, number>();
  for (const c of data.collections) {
    const existing = collectionsByType.get(c.collectionType) ?? 0;
    collectionsByType.set(c.collectionType, existing + c.amount);
  }

  const rows: NoteTableRow[] = [];
  for (const [type, amount] of collectionsByType.entries()) {
    rows.push({ label: type, values: [amount] });
  }

  const collectionTable = makeTable(
    'Custodial Collections by Type',
    ['Collection Type', 'Amount'],
    rows.length > 0
      ? rows
      : [{ label: 'No custodial collections', values: [0] }],
    rows.length > 0
      ? {
          label: 'Total Custodial Collections',
          values: [
            Array.from(collectionsByType.values()).reduce((s, v) => s + v, 0),
          ],
        }
      : undefined,
  );

  return {
    id: uuid(),
    noteNumber: 22,
    title: 'Custodial Collections and Disposition',
    standardReference:
      'OMB A-136, Section II.3.2; SFFAS 7, para 38-43, 48-51',
    narrative:
      'Custodial collections are non-exchange revenues collected on behalf ' +
      'of the sovereign. These collections are transferred to the General ' +
      'Fund of the Treasury or other designated recipients.',
    tables: [collectionTable],
    subnotes: [],
  };
}

/**
 * Note 23: Anti-Deficiency Act Violations.
 *
 * @see 31 U.S.C. 1341, 1342, 1517 (Anti-Deficiency Act)
 * @see DoD FMR 7000.14-R, Vol. 14, Ch. 6
 */
function generateNote23(data: DoDEngagementData): NoteDisclosure {
  const violations = data.adaViolations;

  const violationTypeLabels: Record<string, string> = {
    over_obligation: 'Obligations Exceeding Available Funds (31 USC 1341a)',
    over_expenditure: 'Expenditures Exceeding Available Funds',
    unauthorized_purpose: 'Unauthorized Purpose (31 USC 1301a)',
    advance_without_authority: 'Advance Without Authority',
    voluntary_service: 'Acceptance of Voluntary Services (31 USC 1342)',
    time_violation: 'Time-Based Funding Violation',
  };

  const rows: NoteTableRow[] = violations.map((v) => ({
    label: `${violationTypeLabels[v.violationType] ?? v.violationType} - FY${v.fiscalYear}`,
    values: [v.amount],
  }));

  const adaTable = makeTable(
    'Anti-Deficiency Act Violations',
    ['Violation Description', 'Amount'],
    rows.length > 0
      ? rows
      : [{ label: 'No ADA violations reported', values: [0] }],
    rows.length > 0
      ? {
          label: 'Total ADA Violations',
          values: [violations.reduce((s, v) => s + v.amount, 0)],
        }
      : undefined,
  );

  const subnotes: SubNote[] = violations.map((v) => ({
    id: uuid(),
    subtitle: `Violation: ${v.description}`,
    narrative:
      `Discovered: ${v.discoveredDate}. ` +
      `Status: ${v.investigationStatus}. ` +
      (v.correctiveAction
        ? `Corrective Action: ${v.correctiveAction}`
        : 'Corrective action pending.'),
    tables: [],
  }));

  return {
    id: uuid(),
    noteNumber: 23,
    title: 'Anti-Deficiency Act Violations',
    standardReference:
      'OMB A-136, Section II.3.2; 31 U.S.C. 1341, 1342, 1517; DoD FMR Vol. 14, Ch. 6',
    narrative:
      'The Anti-Deficiency Act prohibits obligations and expenditures in ' +
      'excess of available appropriations or apportionments. Violations must ' +
      'be reported to the President through OMB and to the Congress.',
    tables: [adaTable],
    subnotes,
  };
}

/**
 * Note 24: Subsequent Events.
 *
 * @see SFFAS 47, para 79-82 (Subsequent Events)
 */
function generateNote24(data: DoDEngagementData): NoteDisclosure {
  // Identify corrective action plans as potential subsequent events
  const caps = data.correctiveActionPlans ?? [];
  const recentCAPs = caps.filter(
    (c) => c.status === 'active' || c.status === 'in_progress',
  );

  const subnotes: SubNote[] = recentCAPs.slice(0, 5).map((cap) => ({
    id: uuid(),
    subtitle: `Finding: ${cap.findingDescription}`,
    narrative:
      `Classification: ${cap.findingClassification}. ` +
      `Root cause: ${cap.rootCause}. ` +
      `Target completion: ${cap.targetCompletionDate}. ` +
      `Status: ${cap.status} (${cap.percentComplete}% complete).`,
    tables: [],
  }));

  return {
    id: uuid(),
    noteNumber: 24,
    title: 'Subsequent Events',
    standardReference: 'OMB A-136, Section II.3.2; SFFAS 47, para 79-82',
    narrative:
      'Management has evaluated subsequent events through the date of the ' +
      "auditor's report. Events that provide evidence about conditions " +
      'existing at the balance sheet date are recognized in the financial ' +
      'statements. Events that provide evidence about conditions arising ' +
      'after the balance sheet date are disclosed below.',
    tables: [],
    subnotes,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates the complete set of Note Disclosures per OMB A-136, Section II.3.2.
 *
 * Produces Notes 1-24 as required for federal financial statements:
 *   Note  1: Significant Accounting Policies (SFFAS 47)
 *   Note  2: Fund Balance with Treasury (SFFAS 1)
 *   Note  3: Investments (SFFAS 1)
 *   Note  4: Accounts Receivable (SFFAS 1)
 *   Note  5: Loans Receivable (SFFAS 1)
 *   Note  6: Inventory and Related Property (SFFAS 3)
 *   Note  7: General PP&E (SFFAS 6)
 *   Note  8: Stewardship PP&E (SFFAS 29)
 *   Note  9: Leases (SFFAS 54)
 *   Note 10: Liabilities Not Covered by Budgetary Resources (SFFAS 5)
 *   Note 11: Accounts Payable (SFFAS 1)
 *   Note 12: Federal Employee and Veteran Benefits (SFFAS 33)
 *   Note 13: Environmental and Disposal Liabilities (SFFAS 5, SFFAS 6)
 *   Note 14: Other Liabilities (SFFAS 5)
 *   Note 15: Commitments and Contingencies (SFFAS 5, SFFAS 12)
 *   Note 16: Dedicated Collections (SFFAS 27)
 *   Note 17: Intragovernmental Costs and Exchange Revenue (SFFAS 4)
 *   Note 18: Program Costs (SFFAS 4)
 *   Note 19: Inter-Entity Costs (FASAB Interpretation 6)
 *   Note 20: Undelivered Orders (OMB A-136)
 *   Note 21: SBR vs. Budget Differences (OMB A-136)
 *   Note 22: Custodial Collections (SFFAS 7)
 *   Note 23: Anti-Deficiency Act Violations (31 USC 1341/1342/1517)
 *   Note 24: Subsequent Events (SFFAS 47)
 *
 * All notes are data-driven, pulling directly from the DoDEngagementData
 * arrays (USSGL accounts, property records, environmental liabilities,
 * actuarial liabilities, lease records, obligations, etc.).
 *
 * @param data - Complete DoD engagement dataset
 * @returns NoteDisclosuresReport with all 24 required notes
 *
 * @see OMB Circular A-136, Section II.3.2 (Notes to Financial Statements)
 * @see SFFAS 1, 3, 4, 5, 6, 7, 12, 27, 29, 33, 47, 54
 * @see FASAB Interpretation 6 (Imputed Intragovernmental Costs)
 * @see DoD FMR 7000.14-R, Vol. 6B, Ch. 10-19
 */
export function generateNoteDisclosures(
  data: DoDEngagementData,
): NoteDisclosuresReport {
  const notes: NoteDisclosure[] = [
    generateNote1(data),
    generateNote2(data),
    generateNote3(data),
    generateNote4(data),
    generateNote5(data),
    generateNote6(data),
    generateNote7(data),
    generateNote8(data),
    generateNote9(data),
    generateNote10(data),
    generateNote11(data),
    generateNote12(data),
    generateNote13(data),
    generateNote14(data),
    generateNote15(data),
    generateNote16(data),
    generateNote17(data),
    generateNote18(data),
    generateNote19(data),
    generateNote20(data),
    generateNote21(data),
    generateNote22(data),
    generateNote23(data),
    generateNote24(data),
  ];

  return {
    id: uuid(),
    fiscalYear: data.fiscalYear,
    dodComponent: data.dodComponent,
    reportingPeriodEnd: `${data.fiscalYear}-09-30`,
    notes,
    totalNoteCount: notes.length,
    generatedAt: new Date().toISOString(),
  };
}
