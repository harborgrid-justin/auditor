import { describe, it, expect } from 'vitest';
import {
  ThreeWayMatchEngine,
  type PurchaseOrder,
  type ReceiptAcceptance,
  type Invoice,
} from '../three-way-match';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makePurchaseOrder(overrides?: Partial<PurchaseOrder>): PurchaseOrder {
  return {
    id: 'po-001',
    poNumber: 'PO-2025-00001',
    vendorId: 'vendor-001',
    vendorName: 'Acme Defense Supplies',
    lineItems: [
      {
        lineNumber: 1,
        description: 'Office supplies',
        quantity: 100,
        unitPrice: 10.0,
        totalAmount: 1000.0,
      },
    ],
    totalAmount: 1000.0,
    appropriationId: 'approp-001',
    obligationId: 'obl-001',
    issuedDate: '2025-01-15',
    status: 'issued',
    ...overrides,
  };
}

function makeReceipt(overrides?: Partial<ReceiptAcceptance>): ReceiptAcceptance {
  return {
    id: 'receipt-001',
    poId: 'po-001',
    lineItems: [
      {
        poLineNumber: 1,
        quantityReceived: 100,
        quantityAccepted: 100,
        acceptedDate: '2025-02-01',
      },
    ],
    receivedDate: '2025-02-01',
    inspectedBy: 'inspector-001',
    status: 'accepted',
    ...overrides,
  };
}

function makeInvoice(overrides?: Partial<Invoice>): Invoice {
  return {
    id: 'invoice-001',
    poId: 'po-001',
    vendorInvoiceNumber: 'INV-2025-001',
    lineItems: [
      {
        poLineNumber: 1,
        quantityBilled: 100,
        unitPrice: 10.0,
        totalAmount: 1000.0,
      },
    ],
    totalInvoiceAmount: 1000.0,
    invoiceDate: '2025-02-05',
    dueDate: '2025-03-07',
    status: 'received',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ThreeWayMatchEngine', () => {
  const engine = new ThreeWayMatchEngine(2, 10); // 2% or $10 tolerance

  // =========================================================================
  // Full match
  // =========================================================================

  describe('full match', () => {
    it('returns matched status when PO, receipt, and invoice all agree', () => {
      const po = makePurchaseOrder();
      const receipt = makeReceipt();
      const invoice = makeInvoice();

      const result = engine.matchTransaction(po, receipt, invoice);

      expect(result.status).toBe('matched');
      expect(result.matchType).toBe('full');
      expect(result.discrepancies).toHaveLength(0);
      expect(result.poId).toBe('po-001');
      expect(result.receiptId).toBe('receipt-001');
      expect(result.invoiceId).toBe('invoice-001');
      expect(result.matchedAt).toBeDefined();
    });

    it('returns matched for multi-line PO where all lines agree', () => {
      const po = makePurchaseOrder({
        lineItems: [
          { lineNumber: 1, description: 'Item A', quantity: 50, unitPrice: 20.0, totalAmount: 1000.0 },
          { lineNumber: 2, description: 'Item B', quantity: 200, unitPrice: 5.0, totalAmount: 1000.0 },
        ],
        totalAmount: 2000.0,
      });
      const receipt = makeReceipt({
        lineItems: [
          { poLineNumber: 1, quantityReceived: 50, quantityAccepted: 50, acceptedDate: '2025-02-01' },
          { poLineNumber: 2, quantityReceived: 200, quantityAccepted: 200, acceptedDate: '2025-02-01' },
        ],
      });
      const invoice = makeInvoice({
        lineItems: [
          { poLineNumber: 1, quantityBilled: 50, unitPrice: 20.0, totalAmount: 1000.0 },
          { poLineNumber: 2, quantityBilled: 200, unitPrice: 5.0, totalAmount: 1000.0 },
        ],
        totalInvoiceAmount: 2000.0,
      });

      const result = engine.matchTransaction(po, receipt, invoice);

      expect(result.status).toBe('matched');
      expect(result.matchType).toBe('full');
      expect(result.discrepancies).toHaveLength(0);
    });
  });

  // =========================================================================
  // Partial match (within tolerance)
  // =========================================================================

  describe('partial match (within tolerance)', () => {
    it('returns partial_match when price variance is within tolerance', () => {
      const po = makePurchaseOrder({
        lineItems: [
          { lineNumber: 1, description: 'Item A', quantity: 100, unitPrice: 10.0, totalAmount: 1000.0 },
        ],
        totalAmount: 1000.0,
      });
      const receipt = makeReceipt();
      // Invoice unit price is $10.05 — $0.05 variance is within $10 absolute tolerance
      const invoice = makeInvoice({
        lineItems: [
          { poLineNumber: 1, quantityBilled: 100, unitPrice: 10.05, totalAmount: 1005.0 },
        ],
        totalInvoiceAmount: 1005.0,
      });

      const result = engine.matchTransaction(po, receipt, invoice);

      expect(result.status).toBe('partial_match');
      expect(result.matchType).toBe('partial');
      expect(result.discrepancies.length).toBeGreaterThan(0);
      // All discrepancies within tolerance
      expect(result.discrepancies.every(d => d.withinTolerance)).toBe(true);
    });

    it('identifies discrepancy details for partial match', () => {
      const po = makePurchaseOrder({
        lineItems: [
          { lineNumber: 1, description: 'Item A', quantity: 100, unitPrice: 10.0, totalAmount: 1000.0 },
        ],
        totalAmount: 1000.0,
      });
      const receipt = makeReceipt();
      const invoice = makeInvoice({
        lineItems: [
          { poLineNumber: 1, quantityBilled: 100, unitPrice: 10.05, totalAmount: 1005.0 },
        ],
        totalInvoiceAmount: 1005.0,
      });

      const result = engine.matchTransaction(po, receipt, invoice);

      const priceDisc = result.discrepancies.find(d => d.field === 'unit_price');
      expect(priceDisc).toBeDefined();
      expect(priceDisc!.poValue).toBe(10.0);
      expect(priceDisc!.invoiceValue).toBe(10.05);
      expect(priceDisc!.varianceAmount).toBeCloseTo(0.05, 2);
      expect(priceDisc!.withinTolerance).toBe(true);
    });
  });

  // =========================================================================
  // Mismatch (outside tolerance)
  // =========================================================================

  describe('mismatch (outside tolerance)', () => {
    it('returns mismatch when all lines have variances outside tolerance', () => {
      const po = makePurchaseOrder({
        lineItems: [
          { lineNumber: 1, description: 'Item A', quantity: 100, unitPrice: 10.0, totalAmount: 1000.0 },
        ],
        totalAmount: 1000.0,
      });
      const receipt = makeReceipt({
        lineItems: [
          { poLineNumber: 1, quantityReceived: 50, quantityAccepted: 50, acceptedDate: '2025-02-01' },
        ],
      });
      // Invoice shows only 50 units at double the price
      const invoice = makeInvoice({
        lineItems: [
          { poLineNumber: 1, quantityBilled: 50, unitPrice: 20.0, totalAmount: 1000.0 },
        ],
        totalInvoiceAmount: 1000.0,
      });

      const result = engine.matchTransaction(po, receipt, invoice);

      // Quantity mismatch is outside tolerance (100 vs 50 = 50% variance)
      expect(result.discrepancies.some(d => !d.withinTolerance)).toBe(true);
    });

    it('flags quantity discrepancy when invoice quantity differs from PO', () => {
      const po = makePurchaseOrder({
        lineItems: [
          { lineNumber: 1, description: 'Item A', quantity: 100, unitPrice: 10.0, totalAmount: 1000.0 },
        ],
        totalAmount: 1000.0,
      });
      const receipt = makeReceipt(); // 100 accepted
      const invoice = makeInvoice({
        lineItems: [
          { poLineNumber: 1, quantityBilled: 120, unitPrice: 10.0, totalAmount: 1200.0 },
        ],
        totalInvoiceAmount: 1200.0,
      });

      const result = engine.matchTransaction(po, receipt, invoice);

      const qtyDisc = result.discrepancies.find(d => d.field === 'quantity');
      expect(qtyDisc).toBeDefined();
      expect(qtyDisc!.poValue).toBe(100);
      expect(qtyDisc!.invoiceValue).toBe(120);
      expect(qtyDisc!.withinTolerance).toBe(false);
    });
  });

  // =========================================================================
  // Exception cases (missing receipt or invoice)
  // =========================================================================

  describe('exception cases', () => {
    it('flags exception when receipt is missing for a PO line', () => {
      const po = makePurchaseOrder();
      const receipt = makeReceipt({
        lineItems: [], // no receipt lines
      });
      const invoice = makeInvoice();

      const result = engine.matchTransaction(po, receipt, invoice);

      // Should have a quantity discrepancy since receiptQty = 0
      const qtyDisc = result.discrepancies.find(d => d.field === 'quantity');
      expect(qtyDisc).toBeDefined();
      expect(qtyDisc!.receiptValue).toBe(0);
      expect(qtyDisc!.poValue).toBe(100);
    });

    it('flags exception when invoice has lines not on PO', () => {
      const po = makePurchaseOrder({
        lineItems: [
          { lineNumber: 1, description: 'Item A', quantity: 100, unitPrice: 10.0, totalAmount: 1000.0 },
        ],
        totalAmount: 1000.0,
      });
      const receipt = makeReceipt();
      // Invoice includes a line item not on the PO
      const invoice = makeInvoice({
        lineItems: [
          { poLineNumber: 1, quantityBilled: 100, unitPrice: 10.0, totalAmount: 1000.0 },
          { poLineNumber: 99, quantityBilled: 50, unitPrice: 25.0, totalAmount: 1250.0 },
        ],
        totalInvoiceAmount: 2250.0,
      });

      const result = engine.matchTransaction(po, receipt, invoice);

      // Should flag the unknown line 99
      const unknownLineDisc = result.discrepancies.find(d => d.lineNumber === 99);
      expect(unknownLineDisc).toBeDefined();
      expect(unknownLineDisc!.poValue).toBe(0);
      expect(unknownLineDisc!.withinTolerance).toBe(false);
    });

    it('elevates to exception status when total amount deviates significantly', () => {
      const po = makePurchaseOrder({
        lineItems: [
          { lineNumber: 1, description: 'Item A', quantity: 100, unitPrice: 10.0, totalAmount: 1000.0 },
        ],
        totalAmount: 1000.0,
      });
      const receipt = makeReceipt();
      const invoice = makeInvoice({
        lineItems: [
          { poLineNumber: 1, quantityBilled: 100, unitPrice: 50.0, totalAmount: 5000.0 },
        ],
        totalInvoiceAmount: 5000.0, // way more than PO total of $1000
      });

      const result = engine.matchTransaction(po, receipt, invoice);

      expect(result.status).toBe('exception');
    });
  });

  // =========================================================================
  // Tolerance configuration
  // =========================================================================

  describe('tolerance configuration', () => {
    it('uses custom tolerance percentages', () => {
      const strictEngine = new ThreeWayMatchEngine(0, 0); // zero tolerance
      const po = makePurchaseOrder();
      const receipt = makeReceipt();
      // $0.01 difference
      const invoice = makeInvoice({
        lineItems: [
          { poLineNumber: 1, quantityBilled: 100, unitPrice: 10.01, totalAmount: 1001.0 },
        ],
        totalInvoiceAmount: 1001.0,
      });

      const result = strictEngine.matchTransaction(po, receipt, invoice);

      // Even tiny difference should not be within tolerance
      const priceDisc = result.discrepancies.find(d => d.field === 'unit_price');
      expect(priceDisc).toBeDefined();
      expect(priceDisc!.withinTolerance).toBe(false);
    });

    it('uses generous tolerance to accept larger variances', () => {
      const lenientEngine = new ThreeWayMatchEngine(10, 100); // 10% or $100
      const po = makePurchaseOrder({
        lineItems: [
          { lineNumber: 1, description: 'Item A', quantity: 100, unitPrice: 10.0, totalAmount: 1000.0 },
        ],
        totalAmount: 1000.0,
      });
      const receipt = makeReceipt();
      const invoice = makeInvoice({
        lineItems: [
          { poLineNumber: 1, quantityBilled: 100, unitPrice: 10.50, totalAmount: 1050.0 },
        ],
        totalInvoiceAmount: 1050.0,
      });

      const result = lenientEngine.matchTransaction(po, receipt, invoice);

      // 5% price variance is within 10% tolerance
      expect(result.discrepancies.every(d => d.withinTolerance)).toBe(true);
      expect(result.status).toBe('partial_match');
    });

    it('applies default tolerances (2% / $10)', () => {
      const defaultEngine = new ThreeWayMatchEngine();
      const po = makePurchaseOrder({
        lineItems: [
          { lineNumber: 1, description: 'Item A', quantity: 100, unitPrice: 10.0, totalAmount: 1000.0 },
        ],
        totalAmount: 1000.0,
      });
      const receipt = makeReceipt();
      // $5 variance on a $1000 item — within $10 absolute tolerance
      const invoice = makeInvoice({
        lineItems: [
          { poLineNumber: 1, quantityBilled: 100, unitPrice: 10.0, totalAmount: 1005.0 },
        ],
        totalInvoiceAmount: 1005.0,
      });

      const result = defaultEngine.matchTransaction(po, receipt, invoice);

      const amtDisc = result.discrepancies.find(d => d.field === 'total_amount');
      expect(amtDisc).toBeDefined();
      expect(amtDisc!.withinTolerance).toBe(true);
    });
  });

  // =========================================================================
  // findUnmatchedPOs
  // =========================================================================

  describe('findUnmatchedPOs', () => {
    it('identifies POs missing receipts', () => {
      const pos = [makePurchaseOrder()];
      const receipts: ReceiptAcceptance[] = []; // no receipts
      const invoices = [makeInvoice()];

      const unmatched = engine.findUnmatchedPOs(pos, receipts, invoices);

      expect(unmatched).toHaveLength(1);
      expect(unmatched[0].hasReceipt).toBe(false);
      expect(unmatched[0].hasInvoice).toBe(true);
    });

    it('identifies POs missing invoices', () => {
      const pos = [makePurchaseOrder()];
      const receipts = [makeReceipt()];
      const invoices: Invoice[] = []; // no invoices

      const unmatched = engine.findUnmatchedPOs(pos, receipts, invoices);

      expect(unmatched).toHaveLength(1);
      expect(unmatched[0].hasReceipt).toBe(true);
      expect(unmatched[0].hasInvoice).toBe(false);
    });

    it('returns empty when all POs have matching documents', () => {
      const pos = [makePurchaseOrder()];
      const receipts = [makeReceipt()];
      const invoices = [makeInvoice()];

      const unmatched = engine.findUnmatchedPOs(pos, receipts, invoices);

      expect(unmatched).toHaveLength(0);
    });
  });

  // =========================================================================
  // getMatchingSummary
  // =========================================================================

  describe('getMatchingSummary', () => {
    it('aggregates match results correctly', () => {
      const po = makePurchaseOrder();
      const receipt = makeReceipt();
      const invoice = makeInvoice();

      // Generate a few results
      const fullMatch = engine.matchTransaction(po, receipt, invoice);

      const partialInvoice = makeInvoice({
        lineItems: [
          { poLineNumber: 1, quantityBilled: 100, unitPrice: 10.05, totalAmount: 1005.0 },
        ],
        totalInvoiceAmount: 1005.0,
      });
      const partialMatch = engine.matchTransaction(po, receipt, partialInvoice);

      const summary = engine.getMatchingSummary([fullMatch, partialMatch]);

      expect(summary.total).toBe(2);
      expect(summary.matched).toBe(1);
      expect(summary.partial).toBe(1);
      expect(summary.exceptions).toBe(0);
    });
  });
});
