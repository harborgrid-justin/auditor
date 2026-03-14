/**
 * Three-Way Matching Engine for DoD Contract Payments
 *
 * Implements the three-way match verification required for DoD contract
 * payments, comparing purchase orders, receipt/acceptance reports, and
 * vendor invoices. This is a critical internal control to prevent
 * erroneous or fraudulent payments.
 *
 * The three-way match ensures:
 *   1. The goods/services invoiced were actually ordered (PO match)
 *   2. The goods/services were received and accepted (receipt match)
 *   3. The invoice amounts agree with the PO terms (price match)
 *
 * Discrepancies beyond configurable tolerance thresholds are flagged
 * for review by the contracting officer or certifying official before
 * payment is authorized.
 *
 * References:
 *   - DoD FMR Vol. 10, Ch. 7  (Commercial Payments)
 *   - DoD FMR Vol. 10, Ch. 9  (Certifying Officers)
 *   - FAR 32.905 (Payment Documentation and Process)
 *   - DFARS 232.905 (DoD-specific payment procedures)
 *   - Prompt Payment Act, 31 U.S.C. ss3901-3907
 */

import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PurchaseOrderStatus = 'draft' | 'issued' | 'partially_received' | 'fully_received' | 'closed' | 'cancelled';
export type ReceiptStatus = 'pending_inspection' | 'partially_accepted' | 'accepted' | 'rejected';
export type InvoiceStatus = 'received' | 'under_review' | 'approved' | 'disputed' | 'paid' | 'rejected';
export type MatchStatus = 'matched' | 'partial_match' | 'mismatch' | 'exception';
export type MatchType = 'full' | 'partial' | 'no_match';
export type DiscrepancyField = 'quantity' | 'unit_price' | 'total_amount';

export interface PurchaseOrderLineItem {
  lineNumber: number;
  description: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendorId: string;
  vendorName: string;
  lineItems: PurchaseOrderLineItem[];
  totalAmount: number;
  appropriationId: string;
  obligationId: string;
  issuedDate: string;
  status: PurchaseOrderStatus;
}

export interface ReceiptLineItem {
  poLineNumber: number;
  quantityReceived: number;
  quantityAccepted: number;
  acceptedDate: string;
}

export interface ReceiptAcceptance {
  id: string;
  poId: string;
  lineItems: ReceiptLineItem[];
  receivedDate: string;
  inspectedBy: string;
  status: ReceiptStatus;
}

export interface InvoiceLineItem {
  poLineNumber: number;
  quantityBilled: number;
  unitPrice: number;
  totalAmount: number;
}

export interface Invoice {
  id: string;
  poId: string;
  vendorInvoiceNumber: string;
  lineItems: InvoiceLineItem[];
  totalInvoiceAmount: number;
  invoiceDate: string;
  dueDate: string;
  status: InvoiceStatus;
}

export interface MatchDiscrepancy {
  lineNumber: number;
  field: DiscrepancyField;
  poValue: number;
  receiptValue: number;
  invoiceValue: number;
  varianceAmount: number;
  variancePercent: number;
  withinTolerance: boolean;
}

export interface MatchResult {
  id: string;
  poId: string;
  receiptId: string;
  invoiceId: string;
  status: MatchStatus;
  matchType: MatchType;
  discrepancies: MatchDiscrepancy[];
  matchedAt: string;
}

export interface MatchingSummary {
  total: number;
  matched: number;
  partial: number;
  exceptions: number;
  totalVariance: number;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Three-way matching engine that compares purchase orders, receipt/acceptance
 * reports, and vendor invoices to identify discrepancies before payment
 * authorization.
 *
 * Tolerance thresholds are configurable to accommodate rounding differences
 * and minor quantity variations per DoD FMR Vol. 10, Ch. 7 guidance.
 */
export class ThreeWayMatchEngine {
  private readonly tolerancePercent: number;
  private readonly toleranceAmount: number;

  /**
   * @param tolerancePercent - Maximum allowable variance as a percentage (default 2%).
   * @param toleranceAmount  - Maximum allowable variance as an absolute dollar amount (default $10).
   */
  constructor(tolerancePercent: number = 2, toleranceAmount: number = 10) {
    this.tolerancePercent = tolerancePercent;
    this.toleranceAmount = toleranceAmount;
  }

  /**
   * Performs a three-way match across a purchase order, receipt/acceptance
   * report, and vendor invoice. Compares quantities and prices at the
   * line-item level and flags discrepancies that exceed tolerance.
   *
   * Ref: DoD FMR Vol. 10, Ch. 7, para 070201
   *
   * @param po      - The purchase order.
   * @param receipt  - The receipt/acceptance report.
   * @param invoice  - The vendor invoice.
   * @returns A MatchResult detailing the match outcome and any discrepancies.
   */
  matchTransaction(
    po: PurchaseOrder,
    receipt: ReceiptAcceptance,
    invoice: Invoice,
  ): MatchResult {
    const discrepancies = this.matchLineItems(
      po.lineItems,
      receipt.lineItems,
      invoice.lineItems,
    );

    const hasDiscrepancies = discrepancies.length > 0;
    const allWithinTolerance = discrepancies.every(d => d.withinTolerance);
    const hasOutOfTolerance = discrepancies.some(d => !d.withinTolerance);

    let status: MatchStatus;
    let matchType: MatchType;

    if (!hasDiscrepancies) {
      status = 'matched';
      matchType = 'full';
    } else if (allWithinTolerance) {
      status = 'partial_match';
      matchType = 'partial';
    } else if (hasOutOfTolerance) {
      // Check whether it is a partial match (some lines ok) or total mismatch
      const outOfToleranceCount = discrepancies.filter(d => !d.withinTolerance).length;
      const totalLineCount = po.lineItems.length;

      if (outOfToleranceCount < totalLineCount) {
        status = 'partial_match';
        matchType = 'partial';
      } else {
        status = 'mismatch';
        matchType = 'no_match';
      }
    } else {
      status = 'exception';
      matchType = 'no_match';
    }

    // Elevate to exception if the total invoice amount deviates significantly
    const totalVariance = Math.abs(po.totalAmount - invoice.totalInvoiceAmount);
    if (totalVariance > 0 && !this.isWithinTolerance(po.totalAmount, invoice.totalInvoiceAmount)) {
      status = 'exception';
    }

    return {
      id: uuid(),
      poId: po.id,
      receiptId: receipt.id,
      invoiceId: invoice.id,
      status,
      matchType,
      discrepancies,
      matchedAt: new Date().toISOString(),
    };
  }

  /**
   * Compares line items across PO, receipt, and invoice to detect
   * quantity and price discrepancies at the line level.
   */
  private matchLineItems(
    poLines: PurchaseOrderLineItem[],
    receiptLines: ReceiptLineItem[],
    invoiceLines: InvoiceLineItem[],
  ): MatchDiscrepancy[] {
    const discrepancies: MatchDiscrepancy[] = [];

    for (const poLine of poLines) {
      const receiptLine = receiptLines.find(r => r.poLineNumber === poLine.lineNumber);
      const invoiceLine = invoiceLines.find(i => i.poLineNumber === poLine.lineNumber);

      const receiptQty = receiptLine?.quantityAccepted ?? 0;
      const invoiceQty = invoiceLine?.quantityBilled ?? 0;
      const invoiceUnitPrice = invoiceLine?.unitPrice ?? 0;
      const invoiceTotal = invoiceLine?.totalAmount ?? 0;

      // Check quantity: PO ordered vs. receipt accepted vs. invoice billed
      if (
        poLine.quantity !== receiptQty ||
        poLine.quantity !== invoiceQty ||
        receiptQty !== invoiceQty
      ) {
        const maxVariance = Math.max(
          Math.abs(poLine.quantity - receiptQty),
          Math.abs(poLine.quantity - invoiceQty),
          Math.abs(receiptQty - invoiceQty),
        );
        discrepancies.push({
          lineNumber: poLine.lineNumber,
          field: 'quantity',
          poValue: poLine.quantity,
          receiptValue: receiptQty,
          invoiceValue: invoiceQty,
          varianceAmount: maxVariance,
          variancePercent: poLine.quantity !== 0
            ? Math.round((maxVariance / poLine.quantity) * 10000) / 100
            : 100,
          withinTolerance: this.isWithinTolerance(poLine.quantity, invoiceQty)
            && this.isWithinTolerance(poLine.quantity, receiptQty),
        });
      }

      // Check unit price: PO vs. invoice
      if (poLine.unitPrice !== invoiceUnitPrice) {
        const priceVariance = Math.abs(poLine.unitPrice - invoiceUnitPrice);
        discrepancies.push({
          lineNumber: poLine.lineNumber,
          field: 'unit_price',
          poValue: poLine.unitPrice,
          receiptValue: poLine.unitPrice, // receipts do not carry price
          invoiceValue: invoiceUnitPrice,
          varianceAmount: Math.round(priceVariance * 100) / 100,
          variancePercent: poLine.unitPrice !== 0
            ? Math.round((priceVariance / poLine.unitPrice) * 10000) / 100
            : 100,
          withinTolerance: this.isWithinTolerance(poLine.unitPrice, invoiceUnitPrice),
        });
      }

      // Check total amount: PO line total vs. invoice line total
      if (poLine.totalAmount !== invoiceTotal) {
        const amtVariance = Math.abs(poLine.totalAmount - invoiceTotal);
        discrepancies.push({
          lineNumber: poLine.lineNumber,
          field: 'total_amount',
          poValue: poLine.totalAmount,
          receiptValue: poLine.totalAmount, // receipts do not carry amount
          invoiceValue: invoiceTotal,
          varianceAmount: Math.round(amtVariance * 100) / 100,
          variancePercent: poLine.totalAmount !== 0
            ? Math.round((amtVariance / poLine.totalAmount) * 10000) / 100
            : 100,
          withinTolerance: this.isWithinTolerance(poLine.totalAmount, invoiceTotal),
        });
      }
    }

    // Check for invoice lines referencing PO lines that do not exist
    for (const invoiceLine of invoiceLines) {
      const poLine = poLines.find(p => p.lineNumber === invoiceLine.poLineNumber);
      if (!poLine) {
        discrepancies.push({
          lineNumber: invoiceLine.poLineNumber,
          field: 'quantity',
          poValue: 0,
          receiptValue: 0,
          invoiceValue: invoiceLine.quantityBilled,
          varianceAmount: invoiceLine.quantityBilled,
          variancePercent: 100,
          withinTolerance: false,
        });
      }
    }

    return discrepancies;
  }

  /**
   * Determines whether the actual value is within the configured tolerance
   * of the expected value. Uses both percentage and absolute thresholds;
   * the value is considered within tolerance if it satisfies either.
   */
  private isWithinTolerance(expected: number, actual: number): boolean {
    if (expected === actual) return true;

    const absoluteVariance = Math.abs(expected - actual);

    // Check absolute tolerance first
    if (absoluteVariance <= this.toleranceAmount) return true;

    // Check percentage tolerance
    if (expected !== 0) {
      const percentVariance = (absoluteVariance / Math.abs(expected)) * 100;
      if (percentVariance <= this.tolerancePercent) return true;
    }

    return false;
  }

  /**
   * Identifies purchase orders that lack matching receipts and/or invoices.
   * Unmatched POs may indicate goods not yet received, invoices not yet
   * submitted, or potential procurement issues requiring follow-up.
   *
   * Ref: DoD FMR Vol. 10, Ch. 7, para 070303
   *
   * @param pos      - All purchase orders.
   * @param receipts - All receipt/acceptance reports.
   * @param invoices - All vendor invoices.
   * @returns Purchase orders without complete matching documentation.
   */
  findUnmatchedPOs(
    pos: PurchaseOrder[],
    receipts: ReceiptAcceptance[],
    invoices: Invoice[],
  ): Array<{ po: PurchaseOrder; hasReceipt: boolean; hasInvoice: boolean }> {
    const receiptsByPO = new Map<string, ReceiptAcceptance[]>();
    for (const receipt of receipts) {
      const existing = receiptsByPO.get(receipt.poId) || [];
      existing.push(receipt);
      receiptsByPO.set(receipt.poId, existing);
    }

    const invoicesByPO = new Map<string, Invoice[]>();
    for (const invoice of invoices) {
      const existing = invoicesByPO.get(invoice.poId) || [];
      existing.push(invoice);
      invoicesByPO.set(invoice.poId, existing);
    }

    const unmatched: Array<{ po: PurchaseOrder; hasReceipt: boolean; hasInvoice: boolean }> = [];

    for (const po of pos) {
      const hasReceipt = receiptsByPO.has(po.id);
      const hasInvoice = invoicesByPO.has(po.id);

      if (!hasReceipt || !hasInvoice) {
        unmatched.push({ po, hasReceipt, hasInvoice });
      }
    }

    return unmatched;
  }

  /**
   * Generates summary statistics across a set of match results.
   *
   * @param results - Array of MatchResult from previous matchTransaction calls.
   * @returns Aggregate counts and total variance amount.
   */
  getMatchingSummary(results: MatchResult[]): MatchingSummary {
    let matched = 0;
    let partial = 0;
    let exceptions = 0;
    let totalVariance = 0;

    for (const result of results) {
      switch (result.status) {
        case 'matched':
          matched++;
          break;
        case 'partial_match':
          partial++;
          break;
        case 'mismatch':
        case 'exception':
          exceptions++;
          break;
      }

      for (const discrepancy of result.discrepancies) {
        totalVariance += discrepancy.varianceAmount;
      }
    }

    return {
      total: results.length,
      matched,
      partial,
      exceptions,
      totalVariance: Math.round(totalVariance * 100) / 100,
    };
  }
}
