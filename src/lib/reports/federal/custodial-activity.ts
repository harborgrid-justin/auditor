/**
 * Statement of Custodial Activity Generator
 *
 * Generates the Statement of Custodial Activity per OMB Circular A-136,
 * Section II.3. This financial statement is required for entities that
 * collect non-exchange revenue (taxes, duties, fees, fines, penalties)
 * on behalf of the sovereign power of the federal government.
 *
 * Custodial activity differs from exchange revenue in that the collections
 * are not earned by the collecting entity but rather are held in trust
 * for the General Fund of the Treasury or other recipient entities.
 *
 * Statement structure:
 *   Revenue Activity:
 *     - Sources of cash collections (taxes, duties, fees, fines, penalties)
 *     - Accrual adjustments (change in receivables, change in revenue refunds)
 *     - Total custodial revenue
 *
 *   Disposition of Collections:
 *     - Transferred to Treasury General Fund
 *     - Transferred to other federal entities
 *     - Retained by the collecting entity
 *     - Net refunds and adjustments
 *     - Total disposition
 *
 *   Net Custodial Activity (should equal zero when all funds disposed)
 *
 * References:
 *   - OMB Circular A-136, Section II.3 (Statement of Custodial Activity)
 *   - SFFAS 7: Accounting for Revenue and Other Financing Sources
 *   - SFFAS 7, para 38-43 (Nonexchange Revenue)
 *   - SFFAS 7, para 48-51 (Custodial Activity)
 *   - USSGL TFM Supplement, Section IV (Custodial Accounts)
 *   - DoD FMR 7000.14-R, Vol. 6A, Ch. 4 (Financial Statements)
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

/** A single line item on the Statement of Custodial Activity. */
export interface CustodialLineItem {
  id: string;
  description: string;
  currentYear: number;
  priorYear: number;
}

/** Classification of custodial revenue by source type. */
export interface CustodialRevenue {
  id: string;
  sourceType: 'taxes' | 'duties' | 'fees' | 'fines' | 'penalties' | 'other';
  description: string;
  cashCollections: { currentYear: number; priorYear: number };
  accrualAdjustments: { currentYear: number; priorYear: number };
}

/** Classification of custodial disposition by transfer type. */
export interface CustodialDisposition {
  id: string;
  dispositionType:
    | 'treasury_general_fund'
    | 'other_federal_entity'
    | 'retained'
    | 'refunds';
  recipientEntity: string;
  amount: { currentYear: number; priorYear: number };
}

/** Input data for generating the Statement of Custodial Activity. */
export interface CustodialActivityData {
  revenueSources: CustodialRevenue[];
  dispositions: CustodialDisposition[];
  /** Change in accounts receivable related to custodial activity. */
  changeInReceivables: { currentYear: number; priorYear: number };
  /** Change in liability for refunds related to custodial activity. */
  changeInRefundLiability: { currentYear: number; priorYear: number };
}

/**
 * Complete Statement of Custodial Activity.
 * Per OMB A-136, Section II.3.
 */
export interface CustodialActivityStatement {
  id: string;
  reportDate: string;
  fiscalYear: number;
  entityName: string;
  revenueActivity: {
    cashCollectionsBySource: CustodialLineItem[];
    totalCashCollections: CustodialLineItem;
    accrualAdjustments: {
      changeInReceivables: CustodialLineItem;
      changeInRefundLiability: CustodialLineItem;
      totalAccrualAdjustments: CustodialLineItem;
    };
    totalCustodialRevenue: CustodialLineItem;
  };
  dispositionOfCollections: {
    dispositionLines: CustodialLineItem[];
    totalDisposition: CustodialLineItem;
  };
  netCustodialActivity: CustodialLineItem;
  validation: {
    netActivityIsZero: boolean;
    currentYearDifference: number;
    priorYearDifference: number;
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
 * Create a CustodialLineItem.
 */
function makeLine(
  description: string,
  currentYear: number,
  priorYear: number,
): CustodialLineItem {
  return {
    id: uuid(),
    description,
    currentYear: round2(currentYear),
    priorYear: round2(priorYear),
  };
}

/**
 * Map a revenue source type to a human-readable label.
 */
function revenueSourceLabel(
  sourceType: CustodialRevenue['sourceType'],
): string {
  const labels: Record<CustodialRevenue['sourceType'], string> = {
    taxes: 'Tax Revenue',
    duties: 'Customs Duties',
    fees: 'User Fees and Charges',
    fines: 'Fines',
    penalties: 'Penalties',
    other: 'Other Custodial Revenue',
  };
  return labels[sourceType];
}

/**
 * Map a disposition type to a human-readable label.
 */
function dispositionLabel(
  dispositionType: CustodialDisposition['dispositionType'],
  recipientEntity: string,
): string {
  const baseLabels: Record<CustodialDisposition['dispositionType'], string> = {
    treasury_general_fund: 'Transferred to Treasury General Fund',
    other_federal_entity: `Transferred to ${recipientEntity}`,
    retained: 'Amounts Retained by the Collecting Entity',
    refunds: 'Refunds and Other Payments',
  };
  return baseLabels[dispositionType];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates the Statement of Custodial Activity per OMB A-136, Section II.3.
 *
 * The statement presents revenue collected on behalf of the sovereign
 * and how those collections were disposed of. The net custodial activity
 * (total revenue less total disposition) should equal zero when all
 * custodial collections have been properly transferred.
 *
 * Revenue Activity:
 *   Cash collections by source (taxes, duties, fees, fines, penalties)
 *   + Accrual adjustments (change in receivables, change in refund liability)
 *   = Total custodial revenue
 *
 * Disposition of Collections:
 *   Transferred to Treasury General Fund
 *   + Transferred to other federal entities
 *   + Retained by collecting entity
 *   + Refunds and other payments
 *   = Total disposition
 *
 * Net Custodial Activity = Total Revenue - Total Disposition (should = 0)
 *
 * @param data - Custodial activity input data
 * @param fiscalYear - The fiscal year of the report
 * @param entityName - Name of the reporting entity
 * @returns CustodialActivityStatement with revenue, disposition, and validation
 *
 * @see OMB Circular A-136, Section II.3 (Statement of Custodial Activity)
 * @see SFFAS 7, para 38-43 (Nonexchange Revenue)
 * @see SFFAS 7, para 48-51 (Custodial Activity)
 */
export function generateCustodialActivity(
  data: CustodialActivityData,
  fiscalYear: number,
  entityName: string = 'Federal Reporting Entity',
): CustodialActivityStatement {
  // -------------------------------------------------------------------------
  // Revenue Activity — Cash Collections by Source
  // -------------------------------------------------------------------------
  const cashCollectionsBySource: CustodialLineItem[] = data.revenueSources.map(
    (source) =>
      makeLine(
        source.description || revenueSourceLabel(source.sourceType),
        source.cashCollections.currentYear,
        source.cashCollections.priorYear,
      ),
  );

  const totalCashCY = data.revenueSources.reduce(
    (sum, s) => sum + s.cashCollections.currentYear,
    0,
  );
  const totalCashPY = data.revenueSources.reduce(
    (sum, s) => sum + s.cashCollections.priorYear,
    0,
  );
  const totalCashCollections = makeLine(
    'Total Cash Collections',
    totalCashCY,
    totalCashPY,
  );

  // -------------------------------------------------------------------------
  // Revenue Activity — Accrual Adjustments
  // -------------------------------------------------------------------------
  const changeInReceivables = makeLine(
    'Change in Accounts Receivable',
    data.changeInReceivables.currentYear,
    data.changeInReceivables.priorYear,
  );

  const changeInRefundLiability = makeLine(
    'Change in Liability for Refunds',
    data.changeInRefundLiability.currentYear,
    data.changeInRefundLiability.priorYear,
  );

  const totalAccrualCY = round2(
    data.changeInReceivables.currentYear +
    data.changeInRefundLiability.currentYear,
  );
  const totalAccrualPY = round2(
    data.changeInReceivables.priorYear +
    data.changeInRefundLiability.priorYear,
  );
  const totalAccrualAdjustments = makeLine(
    'Total Accrual Adjustments',
    totalAccrualCY,
    totalAccrualPY,
  );

  // -------------------------------------------------------------------------
  // Total Custodial Revenue
  // -------------------------------------------------------------------------
  const totalRevenueCY = round2(totalCashCY + totalAccrualCY);
  const totalRevenuePY = round2(totalCashPY + totalAccrualPY);
  const totalCustodialRevenue = makeLine(
    'Total Custodial Revenue',
    totalRevenueCY,
    totalRevenuePY,
  );

  // -------------------------------------------------------------------------
  // Disposition of Collections
  // -------------------------------------------------------------------------
  const dispositionLines: CustodialLineItem[] = data.dispositions.map(
    (disp) =>
      makeLine(
        dispositionLabel(disp.dispositionType, disp.recipientEntity),
        disp.amount.currentYear,
        disp.amount.priorYear,
      ),
  );

  const totalDispCY = data.dispositions.reduce(
    (sum, d) => sum + d.amount.currentYear,
    0,
  );
  const totalDispPY = data.dispositions.reduce(
    (sum, d) => sum + d.amount.priorYear,
    0,
  );
  const totalDisposition = makeLine(
    'Total Disposition of Collections',
    totalDispCY,
    totalDispPY,
  );

  // -------------------------------------------------------------------------
  // Net Custodial Activity (should be zero)
  // -------------------------------------------------------------------------
  const netCY = round2(totalRevenueCY - totalDispCY);
  const netPY = round2(totalRevenuePY - totalDispPY);
  const netCustodialActivity = makeLine(
    'Net Custodial Activity',
    netCY,
    netPY,
  );

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------
  const netActivityIsZero = Math.abs(netCY) < 0.01 && Math.abs(netPY) < 0.01;

  return {
    id: uuid(),
    reportDate: new Date().toISOString(),
    fiscalYear,
    entityName,
    revenueActivity: {
      cashCollectionsBySource,
      totalCashCollections,
      accrualAdjustments: {
        changeInReceivables,
        changeInRefundLiability,
        totalAccrualAdjustments,
      },
      totalCustodialRevenue,
    },
    dispositionOfCollections: {
      dispositionLines,
      totalDisposition,
    },
    netCustodialActivity,
    validation: {
      netActivityIsZero,
      currentYearDifference: netCY,
      priorYearDifference: netPY,
    },
    generatedAt: new Date().toISOString(),
  };
}
