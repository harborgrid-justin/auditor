import { describe, it, expect } from 'vitest';
import { ThreeWayMatchEngine } from '../three-way-match';
import type { PurchaseOrder, ReceiptAcceptance, Invoice } from '../three-way-match';

describe('ThreeWayMatchEngine', () => {
  const engine = new ThreeWayMatchEngine(2, 10);

  const basePO: PurchaseOrder = {
    id: 'po-1',
    poNumber: 'PO-2026-001',
    vendorId: 'v-1',
    vendorName: 'Acme Corp',
    lineItems: [
      { lineNumber: 1, description: 'Widget A', quantity: 100, unitPrice: 50, totalAmount: 5000 },
      { lineNumber: 2, description: 'Widget B', quantity: 50, unitPrice: 100, totalAmount: 5000 },
    ],
    totalAmount: 10000,
    appropriationId: 'approp-1',
    obligationId: 'obl-1',
    issuedDate: '2026-01-15',
    status: 'issued',
  };

  const baseReceipt: ReceiptAcceptance = {
    id: 'rcpt-1',
    poId: 'po-1',
    lineItems: [
      { poLineNumber: 1, quantityReceived: 100, quantityAccepted: 100, acceptedDate: '2026-02-01' },
      { poLineNumber: 2, quantityReceived: 50, quantityAccepted: 50, acceptedDate: '2026-02-01' },
    ],
    receivedDate: '2026-02-01',
    inspectedBy: 'Inspector Smith',
    status: 'accepted',
  };

  const baseInvoice: Invoice = {
    id: 'inv-1',
    poId: 'po-1',
    vendorInvoiceNumber: 'INV-2026-001',
    lineItems: [
      { poLineNumber: 1, quantityBilled: 100, unitPrice: 50, totalAmount: 5000 },
      { poLineNumber: 2, quantityBilled: 50, unitPrice: 100, totalAmount: 5000 },
    ],
    totalInvoiceAmount: 10000,
    invoiceDate: '2026-02-05',
    dueDate: '2026-03-07',
    status: 'received',
  };

  describe('matchTransaction', () => {
    it('returns full match when PO, receipt, and invoice agree', () => {
      const result = engine.matchTransaction(basePO, baseReceipt, baseInvoice);
      expect(result.status).toBe('matched');
      expect(result.matchType).toBe('full');
      expect(result.discrepancies).toHaveLength(0);
    });

    it('returns partial_match when within tolerance', () => {
      const invoiceWithSmallVariance = {
        ...baseInvoice,
        lineItems: [
          { poLineNumber: 1, quantityBilled: 100, unitPrice: 50.50, totalAmount: 5050 },
          { poLineNumber: 2, quantityBilled: 50, unitPrice: 100, totalAmount: 5000 },
        ],
      };
      const result = engine.matchTransaction(basePO, baseReceipt, invoiceWithSmallVariance);
      expect(result.status).toBe('partial_match');
      expect(result.discrepancies.length).toBeGreaterThan(0);
      const priceDisc = result.discrepancies.find(d => d.field === 'unit_price');
      expect(priceDisc?.withinTolerance).toBe(true);
    });

    it('returns mismatch when outside tolerance', () => {
      const invoiceWithLargeVariance = {
        ...baseInvoice,
        lineItems: [
          { poLineNumber: 1, quantityBilled: 100, unitPrice: 75, totalAmount: 7500 },
          { poLineNumber: 2, quantityBilled: 50, unitPrice: 100, totalAmount: 5000 },
        ],
      };
      const result = engine.matchTransaction(basePO, baseReceipt, invoiceWithLargeVariance);
      expect(result.status).toBe('mismatch');
      const priceDisc = result.discrepancies.find(d => d.field === 'unit_price');
      expect(priceDisc?.withinTolerance).toBe(false);
    });

    it('detects quantity discrepancies from receipt', () => {
      const shortReceipt = {
        ...baseReceipt,
        lineItems: [
          { poLineNumber: 1, quantityReceived: 90, quantityAccepted: 90, acceptedDate: '2026-02-01' },
          { poLineNumber: 2, quantityReceived: 50, quantityAccepted: 50, acceptedDate: '2026-02-01' },
        ],
      };
      const result = engine.matchTransaction(basePO, shortReceipt, baseInvoice);
      expect(result.discrepancies.length).toBeGreaterThan(0);
      const qtyDisc = result.discrepancies.find(d => d.field === 'quantity');
      expect(qtyDisc).toBeDefined();
      expect(qtyDisc?.poValue).toBe(100);
      expect(qtyDisc?.receiptValue).toBe(90);
    });
  });

  describe('getMatchingSummary', () => {
    it('returns correct summary statistics', () => {
      const results = [
        { status: 'matched', discrepancies: [] },
        { status: 'matched', discrepancies: [] },
        { status: 'mismatch', discrepancies: [{ varianceAmount: 500 }] },
      ];
      const summary = engine.getMatchingSummary(results as any);
      expect(summary.total).toBe(3);
      expect(summary.matched).toBe(2);
      expect(summary.exceptions).toBe(0);
    });
  });
});
