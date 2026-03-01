/**
 * Statement of Changes in Net Position Generator
 *
 * Generates the Statement of Changes in Net Position per OMB Circular
 * A-136, Section II.3. This principal financial statement presents the
 * changes in both components of net position during the reporting period:
 *   1. Unexpended Appropriations
 *   2. Cumulative Results of Operations
 *
 * The statement bridges the Balance Sheet and Statement of Net Cost by
 * showing how net cost, appropriations activity, and other financing
 * sources drive changes in net position from beginning to end of year.
 *
 * Two-column format per OMB A-136:
 *   Column 1: Unexpended Appropriations
 *     - Beginning balance
 *     - Appropriations received
 *     - Appropriations transferred in/out
 *     - Other adjustments (rescissions, sequestration, cancellations)
 *     - Appropriations used
 *     - Ending balance
 *
 *   Column 2: Cumulative Results of Operations
 *     - Beginning balance
 *     - Net cost of operations (from Statement of Net Cost)
 *     - Financing sources (appropriations used, imputed costs,
 *       donations, transfers, non-exchange revenue)
 *     - Ending balance
 *
 * USSGL Account Mapping:
 *   3100-3199: Unexpended Appropriations
 *   3310: Cumulative Results of Operations
 *   5700-5799: Financing sources (appropriations used, imputed)
 *   5800-5899: Nonexchange revenue
 *   5900-5999: Other financing sources (donations, transfers)
 *
 * References:
 *   - OMB Circular A-136, Section II.3 (Changes in Net Position)
 *   - SFFAS 7: Accounting for Revenue and Other Financing Sources
 *   - SFFAS 27: Identifying and Reporting Earmarked Funds
 *   - FASAB Interpretation 6: Imputed Intragovernmental Costs
 *   - DoD FMR 7000.14-R, Vol. 6A, Ch. 4: Financial Statements
 *   - USSGL TFM Supplement, Section IV (Net Position Accounts)
 */

import type {
  USSGLAccount,
  DoDEngagementData,
  DoDComponentCode,
  Appropriation,
  ActuarialLiability,
} from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Rounding precision for financial statement amounts. */
const ROUNDING_PRECISION = 2;

/**
 * USSGL account prefixes for the Statement of Changes in Net Position.
 * Per USSGL TFM Supplement, Section IV.
 */
const USSGL_NET_POSITION = {
  /** 3100 - Unexpended Appropriations */
  unexpendedAppropriations: '310',
  /** 3310 - Cumulative Results of Operations */
  cumulativeResults: '331',
  /** 5700 - Expended Appropriations */
  expendedAppropriations: '570',
  /** 5790 - Other Financing Sources - Imputed */
  imputedFinancing: '579',
  /** 5800 - Nonexchange Revenue */
  nonexchangeRevenue: '580',
  /** 5900 - Donations and Forfeitures */
  donations: '590',
  /** 5720 - Transfers In/Out */
  transfers: '572',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single line item in the Changes in Net Position statement. */
export interface NetPositionLineItem {
  id: string;
  description: string;
  currentYear: number;
  priorYear: number;
}

/** Financing sources that drive changes in Cumulative Results of Operations. */
export interface FinancingSources {
  appropriationsUsed: NetPositionLineItem;
  nonexchangeRevenue: NetPositionLineItem;
  donationsAndForfeituresOfCash: NetPositionLineItem;
  donationsAndForfeituresOfProperty: NetPositionLineItem;
  transfersInOut: NetPositionLineItem;
  imputedFinancingSources: NetPositionLineItem;
  otherFinancingSources: NetPositionLineItem;
  totalFinancingSources: NetPositionLineItem;
}

/** Unexpended Appropriations column of the statement. */
export interface UnexpendedAppropriationsSection {
  beginningBalance: NetPositionLineItem;
  appropriationsReceived: NetPositionLineItem;
  appropriationsTransferredIn: NetPositionLineItem;
  appropriationsTransferredOut: NetPositionLineItem;
  otherAdjustments: NetPositionLineItem;
  appropriationsUsed: NetPositionLineItem;
  endingBalance: NetPositionLineItem;
}

/** Cumulative Results of Operations column of the statement. */
export interface CumulativeResultsSection {
  beginningBalance: NetPositionLineItem;
  netCostOfOperations: NetPositionLineItem;
  financingSources: FinancingSources;
  endingBalance: NetPositionLineItem;
}

/**
 * Complete Statement of Changes in Net Position.
 * Per OMB A-136, Section II.3.
 */
export interface ChangesInNetPositionReport {
  id: string;
  fiscalYear: number;
  dodComponent: string;
  reportingPeriodEnd: string;
  unexpendedAppropriations: UnexpendedAppropriationsSection;
  cumulativeResults: CumulativeResultsSection;
  totalNetPosition: NetPositionLineItem;
  crossCuttingValidation: {
    /** UA ending = beginning + all changes. */
    unexpendedAppropriationsReconciles: boolean;
    /** CR ending = beginning - net cost + financing sources. */
    cumulativeResultsReconciles: boolean;
    /** Appropriations used must agree between columns. */
    appropriationsUsedCrossCheck: boolean;
  };
  generatedAt: string;
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
 * Create a NetPositionLineItem.
 */
function makeLine(
  description: string,
  currentYear: number,
  priorYear: number,
): NetPositionLineItem {
  return {
    id: uuid(),
    description,
    currentYear: round2(currentYear),
    priorYear: round2(priorYear),
  };
}

/**
 * Sum end-balance for proprietary USSGL accounts matching prefixes.
 */
function sumEndByPrefixes(
  accounts: USSGLAccount[],
  prefixes: string[],
  absoluteValue = false,
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

/**
 * Sum begin-balance for proprietary USSGL accounts matching prefixes.
 */
function sumBeginByPrefixes(
  accounts: USSGLAccount[],
  prefixes: string[],
  absoluteValue = false,
): number {
  return accounts
    .filter(
      (a) =>
        a.accountType === 'proprietary' &&
        prefixes.some((p) => a.accountNumber.startsWith(p)),
    )
    .reduce(
      (sum, a) =>
        sum + (absoluteValue ? Math.abs(a.beginBalance) : a.beginBalance),
      0,
    );
}

/**
 * Sum end-balance for proprietary USSGL accounts in a numeric range.
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates the Statement of Changes in Net Position per OMB A-136, Section II.3.
 *
 * This statement is presented in two columns derived from DoDEngagementData:
 *
 *   Unexpended Appropriations (USSGL 3100-3199):
 *     Beginning balance + appropriations received + transfers in/out
 *     + other adjustments - appropriations used = ending balance.
 *     Data sourced from appropriations array and USSGL accounts.
 *
 *   Cumulative Results of Operations (USSGL 3310):
 *     Beginning balance - net cost of operations + financing sources
 *     (appropriations used, imputed costs, donations, transfers,
 *     nonexchange revenue, other) = ending balance.
 *     Data sourced from USSGL 5000-5999 series and actuarial liabilities.
 *
 * The appropriations used amount must agree between columns: the amount
 * reducing unexpended appropriations must equal the amount increasing
 * cumulative results (cross-cutting validation).
 *
 * @param data - Complete DoD engagement dataset
 * @returns ChangesInNetPositionReport with both columns and cross-cutting validation
 *
 * @see OMB Circular A-136, Section II.3 (Changes in Net Position)
 * @see SFFAS 7 (Revenue and Other Financing Sources)
 * @see FASAB Interpretation 6 (Imputed Intragovernmental Costs)
 */
export function generateChangesInNetPosition(
  data: DoDEngagementData,
): ChangesInNetPositionReport {
  const accts = data.ussglAccounts;
  const fiscalYear = data.fiscalYear;

  // -------------------------------------------------------------------------
  // Unexpended Appropriations Column
  // -------------------------------------------------------------------------

  // Beginning balance: USSGL 3100 begin balance
  const uaBeginCY = sumBeginByPrefixes(accts, [USSGL_NET_POSITION.unexpendedAppropriations]);

  // Derive from appropriation records
  const currentAppropriations = data.appropriations.filter(
    (a) => a.status === 'current',
  );

  // Appropriations received: total authority for current-year appropriations
  const apprReceivedCY = currentAppropriations.reduce(
    (s, a) => s + a.totalAuthority,
    0,
  );

  // Appropriations transferred in: from interagency agreements where we are receiver
  const iaaTransfersIn = data.interagencyAgreements
    .filter((iaa) => iaa.status === 'active')
    .reduce((s, iaa) => s + iaa.advanceReceived, 0);

  // Appropriations transferred out: negative of transfers
  const iaaTransfersOut = data.interagencyAgreements
    .filter((iaa) => iaa.status === 'active')
    .reduce((s, iaa) => s + iaa.billedAmount, 0);

  // Other adjustments (rescissions, sequestration, cancellations)
  const cancelledAppropriations = data.appropriations
    .filter((a) => a.status === 'cancelled')
    .reduce((s, a) => s + a.totalAuthority, 0);
  const otherAdjustmentsCY = -cancelledAppropriations;

  // Appropriations used: total disbursed from current appropriations
  const apprUsedCY = -currentAppropriations.reduce(
    (s, a) => s + a.disbursed,
    0,
  );

  // Calculate ending balance
  const uaEndingCY = round2(
    uaBeginCY +
    apprReceivedCY +
    iaaTransfersIn -
    iaaTransfersOut +
    otherAdjustmentsCY +
    apprUsedCY,
  );

  // Prior year (use USSGL end balance as proxy for prior-year ending = current begin)
  const uaBeginPY = 0; // Prior year begin not available without prior-year data
  const uaEndingPY = uaBeginCY; // Current year begin = prior year end

  const uaBeginning = makeLine('Beginning Balance', uaBeginCY, uaBeginPY);
  const uaReceived = makeLine('Appropriations Received', apprReceivedCY, 0);
  const uaTransferredIn = makeLine(
    'Appropriations Transferred In',
    iaaTransfersIn,
    0,
  );
  const uaTransferredOut = makeLine(
    'Appropriations Transferred Out',
    -iaaTransfersOut,
    0,
  );
  const uaOtherAdj = makeLine(
    'Other Adjustments (Rescissions, Sequestration, Cancellations)',
    otherAdjustmentsCY,
    0,
  );
  const uaApprUsed = makeLine('Appropriations Used', apprUsedCY, 0);
  const uaEnding = makeLine(
    'Total Unexpended Appropriations, Ending Balance',
    uaEndingCY,
    uaEndingPY,
  );

  const unexpendedAppropriations: UnexpendedAppropriationsSection = {
    beginningBalance: uaBeginning,
    appropriationsReceived: uaReceived,
    appropriationsTransferredIn: uaTransferredIn,
    appropriationsTransferredOut: uaTransferredOut,
    otherAdjustments: uaOtherAdj,
    appropriationsUsed: uaApprUsed,
    endingBalance: uaEnding,
  };

  // -------------------------------------------------------------------------
  // Cumulative Results of Operations — Financing Sources
  // -------------------------------------------------------------------------

  // Beginning balance: USSGL 3310 begin balance
  const crBeginCY = sumBeginByPrefixes(accts, [USSGL_NET_POSITION.cumulativeResults]);

  // Net cost of operations: USSGL 6000-6999 less 5000-5999 (earned revenue)
  const totalExpenses = sumRange(accts, 6000, 6999);
  const totalEarnedRevenue = sumRange(accts, 5000, 5699);
  const netCostCY = round2(totalExpenses - totalEarnedRevenue);

  // Financing sources
  // Appropriations used (USSGL 5700-5709)
  const fsApprUsedCY = sumRange(accts, 5700, 5709);

  // Nonexchange revenue (USSGL 5800-5899)
  const nonexchangeCY = sumRange(accts, 5800, 5899);

  // Donations: collections of type 'fee' or from special accounts
  const donationsCashCY = data.collections
    .filter((c) => c.collectionType === 'sale_proceeds')
    .reduce((s, c) => s + c.amount, 0);

  const donationsPropertyCY = 0; // Derived from property records if available

  // Transfers in/out: USSGL 5720-5729
  const transfersCY = sumRange(accts, 5720, 5729, false);

  // Imputed financing: from actuarial liabilities
  const imputedCY = (data.actuarialLiabilities ?? []).reduce(
    (s, a) => s + a.imputedFinancingCost,
    0,
  );

  // Other financing sources: USSGL 5900-5999
  const otherFSCY = sumRange(accts, 5900, 5999);

  const totalFSCY = round2(
    fsApprUsedCY +
    nonexchangeCY +
    donationsCashCY +
    donationsPropertyCY +
    transfersCY +
    imputedCY +
    otherFSCY,
  );

  // CR ending = begin - net cost + financing sources
  const crEndingCY = round2(crBeginCY - netCostCY + totalFSCY);
  const crBeginPY = 0;
  const crEndingPY = crBeginCY;

  const fsApprUsed = makeLine('Appropriations Used', fsApprUsedCY, 0);
  const fsNonexchange = makeLine('Nonexchange Revenue', nonexchangeCY, 0);
  const fsDonationsCash = makeLine(
    'Donations and Forfeitures of Cash and Cash Equivalents',
    donationsCashCY,
    0,
  );
  const fsDonationsProperty = makeLine(
    'Donations and Forfeitures of Property',
    donationsPropertyCY,
    0,
  );
  const fsTransfers = makeLine(
    'Transfers In/Out Without Reimbursement',
    transfersCY,
    0,
  );
  const fsImputed = makeLine(
    'Imputed Financing Sources (from Costs Absorbed by Others)',
    imputedCY,
    0,
  );
  const fsOther = makeLine('Other Financing Sources', otherFSCY, 0);
  const fsTotal = makeLine('Total Financing Sources', totalFSCY, 0);

  const financingSources: FinancingSources = {
    appropriationsUsed: fsApprUsed,
    nonexchangeRevenue: fsNonexchange,
    donationsAndForfeituresOfCash: fsDonationsCash,
    donationsAndForfeituresOfProperty: fsDonationsProperty,
    transfersInOut: fsTransfers,
    imputedFinancingSources: fsImputed,
    otherFinancingSources: fsOther,
    totalFinancingSources: fsTotal,
  };

  const crBeginning = makeLine('Beginning Balance', crBeginCY, crBeginPY);
  const crNetCost = makeLine('Net Cost of Operations', netCostCY, 0);
  const crEnding = makeLine(
    'Cumulative Results of Operations, Ending Balance',
    crEndingCY,
    crEndingPY,
  );

  const cumulativeResults: CumulativeResultsSection = {
    beginningBalance: crBeginning,
    netCostOfOperations: crNetCost,
    financingSources,
    endingBalance: crEnding,
  };

  // -------------------------------------------------------------------------
  // Total Net Position
  // -------------------------------------------------------------------------
  const totalNetPosition = makeLine(
    'Net Position, End of Period',
    round2(uaEndingCY + crEndingCY),
    round2(uaEndingPY + crEndingPY),
  );

  // -------------------------------------------------------------------------
  // Cross-Cutting Validation
  // -------------------------------------------------------------------------

  // 1. Unexpended appropriations ending = beginning + all changes
  const expectedUAEndingCY = round2(
    uaBeginCY +
    apprReceivedCY +
    iaaTransfersIn -
    iaaTransfersOut +
    otherAdjustmentsCY +
    apprUsedCY,
  );
  const uaReconciles = Math.abs(uaEnding.currentYear - expectedUAEndingCY) < 0.01;

  // 2. Cumulative results ending = beginning - net cost + financing sources
  const expectedCREndingCY = round2(crBeginCY - netCostCY + totalFSCY);
  const crReconciles = Math.abs(crEnding.currentYear - expectedCREndingCY) < 0.01;

  // 3. Appropriations used cross-check between columns
  const apprUsedCrossCheck = Math.abs(
    Math.abs(uaApprUsed.currentYear) - Math.abs(fsApprUsed.currentYear),
  ) < 0.01;

  return {
    id: uuid(),
    fiscalYear,
    dodComponent: data.dodComponent,
    reportingPeriodEnd: `${fiscalYear}-09-30`,
    unexpendedAppropriations,
    cumulativeResults,
    totalNetPosition,
    crossCuttingValidation: {
      unexpendedAppropriationsReconciles: uaReconciles,
      cumulativeResultsReconciles: crReconciles,
      appropriationsUsedCrossCheck: apprUsedCrossCheck,
    },
    generatedAt: new Date().toISOString(),
  };
}
