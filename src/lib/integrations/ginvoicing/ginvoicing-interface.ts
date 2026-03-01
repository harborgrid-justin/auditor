/**
 * G-Invoicing Interface Definition
 *
 * Provides structured pure functions for producing G-Invoicing data
 * objects covering the full order-to-payment lifecycle of intra-
 * governmental buy/sell transactions between federal trading partners.
 *
 * All functions return structured result objects and do NOT make actual
 * API calls — they produce interface-ready data structures for
 * downstream integration layers or unit tests.
 *
 * G-Invoicing lifecycle:
 *   1. General Terms & Conditions (GT&C) — master agreement
 *   2. Order — specific buy/sell order under a GT&C
 *   3. Performance — delivery/acceptance of goods or services
 *   4. Invoice — billing against accepted performance
 *   5. Payment — settlement through IPAC (Intra-Governmental Payment
 *      and Collection)
 *
 * References:
 *   - Treasury Bureau of the Fiscal Service G-Invoicing Policy
 *   - TFM Vol I, Part 2, Ch 4700, Appendix 10
 *   - OMB Memorandum M-22-14 (G-Invoicing Implementation)
 *   - OMB Circular A-11, Section 20 (Reimbursable Agreements)
 *   - DoD FMR Vol. 11A, Ch. 3 (Reimbursable Operations — Policy)
 *   - Economy Act, 31 U.S.C. § 1535
 */

import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Status lifecycle for a G-Invoicing order. */
export type GInvoicingOrderStatus =
  | 'draft'
  | 'pending_buyer_approval'
  | 'pending_seller_approval'
  | 'approved'
  | 'in_performance'
  | 'completed'
  | 'cancelled'
  | 'closed';

/** Funding type for the interagency order. */
export type FundingType =
  | 'reimbursable'
  | 'economy_act'
  | 'franchise_fund'
  | 'revolving_fund'
  | 'other_statutory';

/** A G-Invoicing interagency order. */
export interface GInvoicingOrder {
  id: string;
  /** Treasury-assigned order number. */
  orderNumber: string;
  /** GT&C reference linking to the master agreement. */
  gtcNumber: string;
  buyerAgencyCode: string;
  buyerBureauCode: string;
  buyerTAS: string;
  sellerAgencyCode: string;
  sellerBureauCode: string;
  sellerTAS: string;
  fundingType: FundingType;
  description: string;
  /** Period of performance start (ISO date). */
  periodOfPerformanceStart: string;
  /** Period of performance end (ISO date). */
  periodOfPerformanceEnd: string;
  totalAmount: number;
  obligatedAmount: number;
  status: GInvoicingOrderStatus;
  /** Statutory authority for the agreement. */
  statutoryAuthority: string;
  clauses: string[];
  fiscalYear: number;
  createdAt: string;
}

/** Performance report for delivered goods or services. */
export interface PerformanceReport {
  id: string;
  orderId: string;
  reportNumber: string;
  reportingPeriod: string;
  deliverables: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    deliveryDate: string;
    acceptedBySeller: boolean;
    acceptedByBuyer: boolean;
  }>;
  totalDeliveredAmount: number;
  performanceStatus: 'pending_acceptance' | 'accepted' | 'rejected' | 'partial';
  submittedAt: string;
}

/** A G-Invoice for payment processing. */
export interface GInvoice {
  id: string;
  orderId: string;
  invoiceNumber: string;
  performanceReportId: string;
  invoiceAmount: number;
  adjustments: number;
  netAmount: number;
  invoiceDate: string;
  dueDate: string;
  paymentStatus: 'pending' | 'approved' | 'paid' | 'disputed' | 'cancelled';
  sellerBillingTAS: string;
  buyerPaymentTAS: string;
  /** IPAC (Intra-Governmental Payment and Collection) reference. */
  ipacReference: string;
  processedAt: string;
}

/** Result of reconciling G-Invoicing orders between buyer and seller. */
export interface OrderReconciliation {
  id: string;
  reconciledAt: string;
  totalOrdersReviewed: number;
  matchedOrders: number;
  unmatchedOrders: number;
  amountDiscrepancies: Array<{
    orderId: string;
    orderNumber: string;
    buyerAmount: number;
    sellerAmount: number;
    difference: number;
    recommendation: string;
  }>;
  statusDiscrepancies: Array<{
    orderId: string;
    orderNumber: string;
    buyerStatus: GInvoicingOrderStatus;
    sellerStatus: GInvoicingOrderStatus;
    recommendation: string;
  }>;
  overallStatus: 'reconciled' | 'discrepancies_found';
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// 1. Create G-Invoicing Order
// ---------------------------------------------------------------------------

/**
 * Create a G-Invoicing interagency order.
 *
 * Produces the order data structure for submission to the Treasury
 * G-Invoicing system. Per OMB M-22-14, all new intragovernmental
 * buy/sell agreements must flow through G-Invoicing.
 *
 * The order references a General Terms & Conditions (GT&C) master
 * agreement and captures the specific scope, period of performance,
 * funding, and statutory authority.
 *
 * @param buyerAgency  - Buyer agency identification (code, bureau, TAS)
 * @param sellerAgency - Seller agency identification (code, bureau, TAS)
 * @param orderDetails - Order scope, funding type, amounts, dates, authority, and clauses
 * @returns GInvoicingOrder in draft status, ready for approval workflow
 *
 * @see OMB M-22-14 — G-Invoicing implementation requirements
 * @see Treasury G-Invoicing Policy — order creation procedures
 * @see 31 U.S.C. § 1535 — Economy Act authority
 * @see DoD FMR Vol. 11A, Ch. 3 — reimbursable order policy
 */
export function createGInvoicingOrder(
  buyerAgency: { agencyCode: string; bureauCode: string; tas: string },
  sellerAgency: { agencyCode: string; bureauCode: string; tas: string },
  orderDetails: {
    gtcNumber: string;
    description: string;
    fundingType: FundingType;
    totalAmount: number;
    periodOfPerformanceStart: string;
    periodOfPerformanceEnd: string;
    statutoryAuthority: string;
    clauses?: string[];
    fiscalYear: number;
  },
): GInvoicingOrder {
  const now = new Date().toISOString();

  return {
    id: uuid(),
    orderNumber: `GI-${orderDetails.fiscalYear}-${uuid().slice(0, 8).toUpperCase()}`,
    gtcNumber: orderDetails.gtcNumber,
    buyerAgencyCode: buyerAgency.agencyCode,
    buyerBureauCode: buyerAgency.bureauCode,
    buyerTAS: buyerAgency.tas,
    sellerAgencyCode: sellerAgency.agencyCode,
    sellerBureauCode: sellerAgency.bureauCode,
    sellerTAS: sellerAgency.tas,
    fundingType: orderDetails.fundingType,
    description: orderDetails.description,
    periodOfPerformanceStart: orderDetails.periodOfPerformanceStart,
    periodOfPerformanceEnd: orderDetails.periodOfPerformanceEnd,
    totalAmount: round2(orderDetails.totalAmount),
    obligatedAmount: 0,
    status: 'draft',
    statutoryAuthority: orderDetails.statutoryAuthority,
    clauses: orderDetails.clauses ?? [],
    fiscalYear: orderDetails.fiscalYear,
    createdAt: now,
  };
}

// ---------------------------------------------------------------------------
// 2. Submit Performance Report
// ---------------------------------------------------------------------------

/**
 * Submit a performance report for delivered goods or services.
 *
 * Per G-Invoicing policy, the selling agency must report performance
 * (delivery of goods/services) before an invoice can be generated.
 * The buying agency must then accept or reject the deliverables
 * through the acceptance workflow.
 *
 * @param orderId      - The G-Invoicing order ID this performance is against
 * @param deliverables - Array of delivered items with quantities, prices, and dates
 * @returns PerformanceReport in pending_acceptance status
 *
 * @see Treasury G-Invoicing Policy — performance reporting requirements
 * @see DoD FMR Vol. 11A, Ch. 3 — reimbursable performance documentation
 */
export function submitPerformanceReport(
  orderId: string,
  deliverables: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    deliveryDate: string;
  }>,
): PerformanceReport {
  const reportDeliverables = deliverables.map((d) => ({
    description: d.description,
    quantity: d.quantity,
    unitPrice: round2(d.unitPrice),
    totalPrice: round2(d.quantity * d.unitPrice),
    deliveryDate: d.deliveryDate,
    acceptedBySeller: true,
    acceptedByBuyer: false,
  }));

  const totalDelivered = round2(
    reportDeliverables.reduce((sum, d) => sum + d.totalPrice, 0),
  );

  return {
    id: uuid(),
    orderId,
    reportNumber: `PR-${uuid().slice(0, 8).toUpperCase()}`,
    reportingPeriod: new Date().toISOString().slice(0, 7),
    deliverables: reportDeliverables,
    totalDeliveredAmount: totalDelivered,
    performanceStatus: 'pending_acceptance',
    submittedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 3. Process G-Invoice
// ---------------------------------------------------------------------------

/**
 * Process a G-Invoice for payment.
 *
 * Creates the invoice data structure that the selling agency submits
 * for IPAC (Intra-Governmental Payment and Collection) settlement.
 * The invoice must reference an accepted performance report.
 *
 * Per Treasury G-Invoicing policy, invoices trigger IPAC transactions
 * that settle the buyer-seller balance through the Federal Reserve.
 *
 * @param orderId     - The G-Invoicing order ID
 * @param invoiceData - Invoice amount, adjustments, dates, TAS, and performance report reference
 * @returns GInvoice in pending status, ready for approval and IPAC settlement
 *
 * @see Treasury G-Invoicing Policy — invoicing and IPAC settlement
 * @see TFM Vol I, Part 2, Ch 7000 — IPAC procedures
 * @see OMB M-22-14 — invoice processing requirements
 */
export function processGInvoice(
  orderId: string,
  invoiceData: {
    performanceReportId: string;
    invoiceAmount: number;
    adjustments?: number;
    dueDate: string;
    sellerBillingTAS: string;
    buyerPaymentTAS: string;
  },
): GInvoice {
  const adjustments = round2(invoiceData.adjustments ?? 0);
  const netAmount = round2(invoiceData.invoiceAmount + adjustments);

  return {
    id: uuid(),
    orderId,
    invoiceNumber: `GINV-${uuid().slice(0, 8).toUpperCase()}`,
    performanceReportId: invoiceData.performanceReportId,
    invoiceAmount: round2(invoiceData.invoiceAmount),
    adjustments,
    netAmount,
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: invoiceData.dueDate,
    paymentStatus: 'pending',
    sellerBillingTAS: invoiceData.sellerBillingTAS,
    buyerPaymentTAS: invoiceData.buyerPaymentTAS,
    ipacReference: `IPAC-${uuid().slice(0, 12).toUpperCase()}`,
    processedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 4. Reconcile G-Invoicing Orders
// ---------------------------------------------------------------------------

/**
 * Reconcile G-Invoicing orders between buyer and seller views.
 *
 * Compares order records from both the buyer and seller perspectives
 * to identify amount discrepancies, status mismatches, and unmatched
 * orders. This supports the Treasury requirement for agencies to
 * reconcile their intragovernmental positions quarterly.
 *
 * @param orders - Array of buyer/seller order pairs to reconcile
 * @returns OrderReconciliation with matched counts, discrepancies, and recommendations
 *
 * @see OMB M-22-14 — reconciliation requirements
 * @see OMB Circular A-136 — consolidated financial statement eliminations
 * @see Treasury G-Invoicing Policy — order reconciliation procedures
 */
export function reconcileGInvoicingOrders(
  orders: Array<{
    buyerOrder: GInvoicingOrder;
    sellerOrder: GInvoicingOrder | null;
  }>,
): OrderReconciliation {
  const amountDiscrepancies: OrderReconciliation['amountDiscrepancies'] = [];
  const statusDiscrepancies: OrderReconciliation['statusDiscrepancies'] = [];
  let matchedCount = 0;
  let unmatchedCount = 0;

  for (const pair of orders) {
    if (!pair.sellerOrder) {
      unmatchedCount++;
      amountDiscrepancies.push({
        orderId: pair.buyerOrder.id,
        orderNumber: pair.buyerOrder.orderNumber,
        buyerAmount: pair.buyerOrder.totalAmount,
        sellerAmount: 0,
        difference: pair.buyerOrder.totalAmount,
        recommendation:
          'Seller order not found in G-Invoicing. Coordinate with selling agency ' +
          `(${pair.buyerOrder.sellerAgencyCode}) to confirm order entry per OMB M-22-14.`,
      });
      continue;
    }

    matchedCount++;

    // Check amount discrepancies
    const amountDiff = round2(
      Math.abs(pair.buyerOrder.totalAmount - pair.sellerOrder.totalAmount),
    );
    if (amountDiff > 0.01) {
      amountDiscrepancies.push({
        orderId: pair.buyerOrder.id,
        orderNumber: pair.buyerOrder.orderNumber,
        buyerAmount: pair.buyerOrder.totalAmount,
        sellerAmount: pair.sellerOrder.totalAmount,
        difference: amountDiff,
        recommendation:
          `Amount difference of $${amountDiff.toLocaleString()} on order ` +
          `${pair.buyerOrder.orderNumber}. Review order modifications and ` +
          'ensure both parties have applied the same amendments.',
      });
    }

    // Check status discrepancies
    if (pair.buyerOrder.status !== pair.sellerOrder.status) {
      statusDiscrepancies.push({
        orderId: pair.buyerOrder.id,
        orderNumber: pair.buyerOrder.orderNumber,
        buyerStatus: pair.buyerOrder.status,
        sellerStatus: pair.sellerOrder.status,
        recommendation:
          `Status mismatch on order ${pair.buyerOrder.orderNumber}: buyer shows ` +
          `'${pair.buyerOrder.status}', seller shows '${pair.sellerOrder.status}'. ` +
          'Coordinate to align order status in G-Invoicing.',
      });
    }
  }

  const hasDiscrepancies =
    amountDiscrepancies.length > 0 ||
    statusDiscrepancies.length > 0 ||
    unmatchedCount > 0;

  return {
    id: uuid(),
    reconciledAt: new Date().toISOString(),
    totalOrdersReviewed: orders.length,
    matchedOrders: matchedCount,
    unmatchedOrders: unmatchedCount,
    amountDiscrepancies,
    statusDiscrepancies,
    overallStatus: hasDiscrepancies ? 'discrepancies_found' : 'reconciled',
  };
}
