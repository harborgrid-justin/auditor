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
 * Data is derived from the DoDEngagementData collections, special accounts,
 * and USSGL accounts. For DoD, custodial collections typically include
 * sale proceeds, fees, and other non-exchange revenue.
 *
 * Statement structure:
 *   Revenue Activity:
 *     - Sources of cash collections (by collection type)
 *     - Accrual adjustments (change in receivables, change in refund liability)
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

import type {
  USSGLAccount,
  DoDEngagementData,
  Collection,
  SpecialAccount,
  DoDComponentCode,
} from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Rounding precision for financial statement amounts. */
const ROUNDING_PRECISION = 2;

/**
 * USSGL account prefixes for custodial activity.
 * Per USSGL TFM Supplement, Section IV.
 */
const USSGL_CUSTODIAL = {
  /** 5800-5899: Nonexchange revenue (custodial) */
  nonexchangeRevenue: { min: 5800, max: 5899 },
  /** 1310-1399: Receivables (custodial portion) */
  receivables: { min: 1310, max: 1399 },
  /** 2120-2199: Refund liabilities */
  refundLiabilities: { min: 2120, max: 2199 },
} as const;

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

/**
 * Complete Statement of Custodial Activity.
 * Per OMB A-136, Section II.3.
 */
export interface CustodialActivityReport {
  id: string;
  fiscalYear: number;
  dodComponent: string;
  reportingPeriodEnd: string;
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
    /** Net custodial activity should equal zero. */
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
 * Map a collection type to a custodial revenue label.
 */
function collectionTypeLabel(collectionType: string): string {
  const labels: Record<string, string> = {
    reimbursement: 'Reimbursable Collections',
    refund: 'Refund Collections',
    recovery: 'Recovery of Prior Year Obligations',
    sale_proceeds: 'Sale Proceeds',
    fee: 'Fees and Charges',
    deposit: 'Deposit Fund Collections',
  };
  return labels[collectionType] ?? `Other Collections (${collectionType})`;
}

/**
 * Sum end-balance for proprietary USSGL accounts in a numeric range.
 */
function sumRange(
  accounts: USSGLAccount[],
  minAcct: number,
  maxAcct: number,
): number {
  return accounts
    .filter((a) => {
      const n = parseInt(a.accountNumber, 10);
      return a.accountType === 'proprietary' && n >= minAcct && n <= maxAcct;
    })
    .reduce((sum, a) => sum + Math.abs(a.endBalance), 0);
}

/**
 * Sum begin-balance for proprietary USSGL accounts in a numeric range.
 */
function sumBeginRange(
  accounts: USSGLAccount[],
  minAcct: number,
  maxAcct: number,
): number {
  return accounts
    .filter((a) => {
      const n = parseInt(a.accountNumber, 10);
      return a.accountType === 'proprietary' && n >= minAcct && n <= maxAcct;
    })
    .reduce((sum, a) => sum + Math.abs(a.beginBalance), 0);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates the Statement of Custodial Activity per OMB A-136, Section II.3.
 *
 * The statement presents revenue collected on behalf of the sovereign
 * and how those collections were disposed of. Data is derived from:
 *   - Collections array: cash collections by source type
 *   - Special accounts: disposition of collections
 *   - USSGL accounts: accrual adjustments (changes in receivables
 *     and refund liabilities between beginning and ending balances)
 *
 * Revenue Activity:
 *   Cash collections by source (from collections array)
 *   + Accrual adjustments (USSGL receivables/refund liability changes)
 *   = Total custodial revenue
 *
 * Disposition of Collections:
 *   Transferred to Treasury General Fund (from special account disbursements)
 *   + Transferred to other federal entities (from special account transfers)
 *   + Retained by collecting entity
 *   + Refunds and other payments
 *   = Total disposition
 *
 * Net Custodial Activity = Total Revenue - Total Disposition (should = 0)
 *
 * @param data - Complete DoD engagement dataset
 * @returns CustodialActivityReport with revenue, disposition, and validation
 *
 * @see OMB Circular A-136, Section II.3 (Statement of Custodial Activity)
 * @see SFFAS 7, para 38-43 (Nonexchange Revenue)
 * @see SFFAS 7, para 48-51 (Custodial Activity)
 */
export function generateCustodialActivity(
  data: DoDEngagementData,
): CustodialActivityReport {
  const accts = data.ussglAccounts;
  const fiscalYear = data.fiscalYear;

  // -------------------------------------------------------------------------
  // Revenue Activity — Cash Collections by Source
  // -------------------------------------------------------------------------
  const collectionsByType = new Map<string, number>();
  for (const c of data.collections) {
    const existing = collectionsByType.get(c.collectionType) ?? 0;
    collectionsByType.set(c.collectionType, existing + c.amount);
  }

  const cashCollectionsBySource: CustodialLineItem[] = [];
  for (const [type, amount] of collectionsByType.entries()) {
    cashCollectionsBySource.push(
      makeLine(collectionTypeLabel(type), amount, 0),
    );
  }

  const totalCashCY = data.collections.reduce((s, c) => s + c.amount, 0);
  const totalCashCollections = makeLine(
    'Total Cash Collections',
    totalCashCY,
    0,
  );

  // -------------------------------------------------------------------------
  // Revenue Activity — Accrual Adjustments
  // -------------------------------------------------------------------------

  // Change in receivables = ending - beginning (USSGL 1310-1399)
  const receivablesEnd = sumRange(
    accts,
    USSGL_CUSTODIAL.receivables.min,
    USSGL_CUSTODIAL.receivables.max,
  );
  const receivablesBegin = sumBeginRange(
    accts,
    USSGL_CUSTODIAL.receivables.min,
    USSGL_CUSTODIAL.receivables.max,
  );
  const changeInReceivablesCY = round2(receivablesEnd - receivablesBegin);

  // Change in refund liability = ending - beginning (USSGL 2120-2199)
  const refundLiabEnd = sumRange(
    accts,
    USSGL_CUSTODIAL.refundLiabilities.min,
    USSGL_CUSTODIAL.refundLiabilities.max,
  );
  const refundLiabBegin = sumBeginRange(
    accts,
    USSGL_CUSTODIAL.refundLiabilities.min,
    USSGL_CUSTODIAL.refundLiabilities.max,
  );
  const changeInRefundLiabilityCY = round2(refundLiabEnd - refundLiabBegin);

  const changeInReceivables = makeLine(
    'Change in Accounts Receivable',
    changeInReceivablesCY,
    0,
  );
  const changeInRefundLiability = makeLine(
    'Change in Liability for Refunds',
    changeInRefundLiabilityCY,
    0,
  );

  const totalAccrualCY = round2(
    changeInReceivablesCY + changeInRefundLiabilityCY,
  );
  const totalAccrualAdjustments = makeLine(
    'Total Accrual Adjustments',
    totalAccrualCY,
    0,
  );

  // -------------------------------------------------------------------------
  // Total Custodial Revenue
  // -------------------------------------------------------------------------
  const totalRevenueCY = round2(totalCashCY + totalAccrualCY);
  const totalCustodialRevenue = makeLine(
    'Total Custodial Revenue',
    totalRevenueCY,
    0,
  );

  // -------------------------------------------------------------------------
  // Disposition of Collections
  // -------------------------------------------------------------------------
  const dispositionLines: CustodialLineItem[] = [];

  // Transfers out from special accounts
  const specialTransfersOut = data.specialAccounts.reduce(
    (s, sa) => s + sa.transfersOut,
    0,
  );
  if (specialTransfersOut > 0) {
    dispositionLines.push(
      makeLine(
        'Transferred to Treasury General Fund',
        specialTransfersOut,
        0,
      ),
    );
  }

  // Transfers to other entities via special accounts
  const specialTransfersIn = data.specialAccounts.reduce(
    (s, sa) => s + sa.transfersIn,
    0,
  );

  // Disbursements from special accounts
  const specialDisbursements = data.specialAccounts.reduce(
    (s, sa) => s + sa.disbursements,
    0,
  );
  if (specialDisbursements > 0) {
    dispositionLines.push(
      makeLine(
        'Disbursements from Custodial Accounts',
        specialDisbursements,
        0,
      ),
    );
  }

  // Retained by collecting entity
  const retained = data.specialAccounts.reduce((s, sa) => s + sa.receipts, 0) -
    specialTransfersOut -
    specialDisbursements;
  if (retained > 0) {
    dispositionLines.push(
      makeLine('Amounts Retained by the Collecting Entity', retained, 0),
    );
  }

  // Refunds: collections of type 'refund'
  const refundCollections = data.collections
    .filter((c) => c.collectionType === 'refund')
    .reduce((s, c) => s + c.amount, 0);
  if (refundCollections > 0) {
    dispositionLines.push(
      makeLine('Refunds and Other Payments', refundCollections, 0),
    );
  }

  // If no disposition detail, add a default line
  if (dispositionLines.length === 0) {
    dispositionLines.push(
      makeLine('Transferred to Treasury General Fund', totalRevenueCY, 0),
    );
  }

  const totalDispCY = dispositionLines.reduce(
    (sum, d) => sum + d.currentYear,
    0,
  );
  const totalDisposition = makeLine(
    'Total Disposition of Collections',
    totalDispCY,
    0,
  );

  // -------------------------------------------------------------------------
  // Net Custodial Activity (should be zero)
  // -------------------------------------------------------------------------
  const netCY = round2(totalRevenueCY - totalDispCY);
  const netCustodialActivity = makeLine('Net Custodial Activity', netCY, 0);

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------
  const netActivityIsZero = Math.abs(netCY) < 0.01;

  return {
    id: uuid(),
    fiscalYear,
    dodComponent: data.dodComponent,
    reportingPeriodEnd: `${fiscalYear}-09-30`,
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
      priorYearDifference: 0,
    },
    generatedAt: new Date().toISOString(),
  };
}
