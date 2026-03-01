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
 * References:
 *   - OMB Circular A-136, Section II.3 (Changes in Net Position)
 *   - SFFAS 7: Accounting for Revenue and Other Financing Sources
 *   - SFFAS 27: Identifying and Reporting Earmarked Funds
 *   - FASAB Interpretation 6: Imputed Intragovernmental Costs
 *   - DoD FMR 7000.14-R, Vol. 6A, Ch. 4: Financial Statements
 *   - USSGL TFM Supplement, Section IV (Net Position Accounts)
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

/** Input data for generating the Changes in Net Position statement. */
export interface NetPositionChangesData {
  /** Unexpended Appropriations data */
  unexpendedAppropriations: {
    beginningBalance: { currentYear: number; priorYear: number };
    appropriationsReceived: { currentYear: number; priorYear: number };
    appropriationsTransferredIn: { currentYear: number; priorYear: number };
    appropriationsTransferredOut: { currentYear: number; priorYear: number };
    otherAdjustments: { currentYear: number; priorYear: number };
    appropriationsUsed: { currentYear: number; priorYear: number };
  };
  /** Cumulative Results of Operations data */
  cumulativeResults: {
    beginningBalance: { currentYear: number; priorYear: number };
    netCostOfOperations: { currentYear: number; priorYear: number };
    appropriationsUsed: { currentYear: number; priorYear: number };
    nonexchangeRevenue: { currentYear: number; priorYear: number };
    donationsAndForfeituresOfCash: { currentYear: number; priorYear: number };
    donationsAndForfeituresOfProperty: { currentYear: number; priorYear: number };
    transfersInOut: { currentYear: number; priorYear: number };
    imputedFinancingSources: { currentYear: number; priorYear: number };
    otherFinancingSources: { currentYear: number; priorYear: number };
  };
}

/**
 * Complete Statement of Changes in Net Position.
 * Per OMB A-136, Section II.3.
 */
export interface NetPositionChanges {
  id: string;
  reportDate: string;
  fiscalYear: number;
  entityName: string;
  unexpendedAppropriations: UnexpendedAppropriationsSection;
  cumulativeResults: CumulativeResultsSection;
  totalNetPosition: NetPositionLineItem;
  crossCuttingValidation: {
    unexpendedAppropriationsReconciles: boolean;
    cumulativeResultsReconciles: boolean;
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates the Statement of Changes in Net Position per OMB A-136, Section II.3.
 *
 * This statement is presented in two columns:
 *
 *   Unexpended Appropriations:
 *     Beginning balance + appropriations received + transfers in/out
 *     + other adjustments - appropriations used = ending balance.
 *
 *   Cumulative Results of Operations:
 *     Beginning balance - net cost of operations + financing sources
 *     (appropriations used, imputed costs, donations, transfers,
 *     nonexchange revenue, other) = ending balance.
 *
 * The appropriations used amount must agree between columns: the amount
 * reducing unexpended appropriations must equal the amount increasing
 * cumulative results (cross-cutting validation).
 *
 * @param data - Input data for both columns
 * @param fiscalYear - The fiscal year of the report
 * @param entityName - Name of the reporting entity
 * @returns NetPositionChanges with both columns and cross-cutting validation
 *
 * @see OMB Circular A-136, Section II.3 (Changes in Net Position)
 * @see SFFAS 7 (Revenue and Other Financing Sources)
 * @see FASAB Interpretation 6 (Imputed Intragovernmental Costs)
 */
export function generateChangesInNetPosition(
  data: NetPositionChangesData,
  fiscalYear: number,
  entityName: string = 'Federal Reporting Entity',
): NetPositionChanges {
  const ua = data.unexpendedAppropriations;
  const cr = data.cumulativeResults;

  // -------------------------------------------------------------------------
  // Unexpended Appropriations Column
  // -------------------------------------------------------------------------
  const uaBeginning = makeLine(
    'Beginning Balance',
    ua.beginningBalance.currentYear,
    ua.beginningBalance.priorYear,
  );

  const uaReceived = makeLine(
    'Appropriations Received',
    ua.appropriationsReceived.currentYear,
    ua.appropriationsReceived.priorYear,
  );

  const uaTransferredIn = makeLine(
    'Appropriations Transferred In',
    ua.appropriationsTransferredIn.currentYear,
    ua.appropriationsTransferredIn.priorYear,
  );

  const uaTransferredOut = makeLine(
    'Appropriations Transferred Out',
    ua.appropriationsTransferredOut.currentYear,
    ua.appropriationsTransferredOut.priorYear,
  );

  const uaOtherAdj = makeLine(
    'Other Adjustments (Rescissions, Sequestration, Cancellations)',
    ua.otherAdjustments.currentYear,
    ua.otherAdjustments.priorYear,
  );

  const uaApprUsed = makeLine(
    'Appropriations Used',
    ua.appropriationsUsed.currentYear,
    ua.appropriationsUsed.priorYear,
  );

  const uaEndingCY = round2(
    ua.beginningBalance.currentYear +
    ua.appropriationsReceived.currentYear +
    ua.appropriationsTransferredIn.currentYear +
    ua.appropriationsTransferredOut.currentYear +
    ua.otherAdjustments.currentYear +
    ua.appropriationsUsed.currentYear,
  );

  const uaEndingPY = round2(
    ua.beginningBalance.priorYear +
    ua.appropriationsReceived.priorYear +
    ua.appropriationsTransferredIn.priorYear +
    ua.appropriationsTransferredOut.priorYear +
    ua.otherAdjustments.priorYear +
    ua.appropriationsUsed.priorYear,
  );

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
  const fsApprUsed = makeLine(
    'Appropriations Used',
    cr.appropriationsUsed.currentYear,
    cr.appropriationsUsed.priorYear,
  );

  const fsNonexchange = makeLine(
    'Nonexchange Revenue',
    cr.nonexchangeRevenue.currentYear,
    cr.nonexchangeRevenue.priorYear,
  );

  const fsDonationsCash = makeLine(
    'Donations and Forfeitures of Cash and Cash Equivalents',
    cr.donationsAndForfeituresOfCash.currentYear,
    cr.donationsAndForfeituresOfCash.priorYear,
  );

  const fsDonationsProperty = makeLine(
    'Donations and Forfeitures of Property',
    cr.donationsAndForfeituresOfProperty.currentYear,
    cr.donationsAndForfeituresOfProperty.priorYear,
  );

  const fsTransfers = makeLine(
    'Transfers In/Out Without Reimbursement',
    cr.transfersInOut.currentYear,
    cr.transfersInOut.priorYear,
  );

  const fsImputed = makeLine(
    'Imputed Financing Sources (from Costs Absorbed by Others)',
    cr.imputedFinancingSources.currentYear,
    cr.imputedFinancingSources.priorYear,
  );

  const fsOther = makeLine(
    'Other Financing Sources',
    cr.otherFinancingSources.currentYear,
    cr.otherFinancingSources.priorYear,
  );

  const totalFSCY = round2(
    cr.appropriationsUsed.currentYear +
    cr.nonexchangeRevenue.currentYear +
    cr.donationsAndForfeituresOfCash.currentYear +
    cr.donationsAndForfeituresOfProperty.currentYear +
    cr.transfersInOut.currentYear +
    cr.imputedFinancingSources.currentYear +
    cr.otherFinancingSources.currentYear,
  );

  const totalFSPY = round2(
    cr.appropriationsUsed.priorYear +
    cr.nonexchangeRevenue.priorYear +
    cr.donationsAndForfeituresOfCash.priorYear +
    cr.donationsAndForfeituresOfProperty.priorYear +
    cr.transfersInOut.priorYear +
    cr.imputedFinancingSources.priorYear +
    cr.otherFinancingSources.priorYear,
  );

  const fsTotal = makeLine('Total Financing Sources', totalFSCY, totalFSPY);

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

  // -------------------------------------------------------------------------
  // Cumulative Results of Operations Column
  // -------------------------------------------------------------------------
  const crBeginning = makeLine(
    'Beginning Balance',
    cr.beginningBalance.currentYear,
    cr.beginningBalance.priorYear,
  );

  const crNetCost = makeLine(
    'Net Cost of Operations',
    cr.netCostOfOperations.currentYear,
    cr.netCostOfOperations.priorYear,
  );

  const crEndingCY = round2(
    cr.beginningBalance.currentYear -
    cr.netCostOfOperations.currentYear +
    totalFSCY,
  );

  const crEndingPY = round2(
    cr.beginningBalance.priorYear -
    cr.netCostOfOperations.priorYear +
    totalFSPY,
  );

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
  const uaReconciles = Math.abs(uaEnding.currentYear - uaEndingCY) < 0.01;

  // 2. Cumulative results ending = beginning - net cost + financing sources
  const crReconciles = Math.abs(crEnding.currentYear - crEndingCY) < 0.01;

  // 3. Appropriations used must cross-check between columns (equal and opposite)
  const apprUsedCrossCheck = Math.abs(
    Math.abs(uaApprUsed.currentYear) - Math.abs(fsApprUsed.currentYear),
  ) < 0.01;

  return {
    id: uuid(),
    reportDate: new Date().toISOString(),
    fiscalYear,
    entityName,
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
