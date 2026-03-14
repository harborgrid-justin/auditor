import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN, AppDatabase } from '../../database/database.module';
import {
  SubmitPurchaseOrderDto,
  SubmitReceiptDto,
  SubmitInvoiceDto,
  RunMatchingDto,
  CreateSuspenseItemDto,
  ClearSuspenseItemDto,
} from './reconciliation.dto';

@Injectable()
export class ReconciliationService {
  /** In-memory stores – in production, these would use the PG tables. */
  private purchaseOrders = new Map<string, any>();
  private receipts = new Map<string, any>();
  private invoices = new Map<string, any>();
  private matchResults = new Map<string, any>();
  private suspenseItems = new Map<string, any>();

  constructor(@Inject(DATABASE_TOKEN) private readonly db: AppDatabase) {}

  async submitPO(dto: SubmitPurchaseOrderDto) {
    const id = uuid();
    const now = new Date().toISOString();
    const po = {
      id,
      engagementId: dto.engagementId,
      poNumber: dto.poNumber,
      vendorId: dto.vendorId,
      vendorName: dto.vendorName,
      lineItems: dto.lineItems,
      totalAmount: dto.totalAmount,
      appropriationId: dto.appropriationId,
      obligationId: dto.obligationId,
      issuedDate: now,
      status: 'open',
      createdAt: now,
    };
    this.purchaseOrders.set(id, po);
    return po;
  }

  async submitReceipt(dto: SubmitReceiptDto) {
    const id = uuid();
    const now = new Date().toISOString();
    const receipt = {
      id,
      engagementId: dto.engagementId,
      poId: dto.poId,
      lineItems: dto.lineItems,
      inspectedBy: dto.inspectedBy,
      receivedDate: now,
      status: 'accepted',
      createdAt: now,
    };
    this.receipts.set(id, receipt);
    return receipt;
  }

  async submitInvoice(dto: SubmitInvoiceDto) {
    const id = uuid();
    const now = new Date().toISOString();
    const invoice = {
      id,
      engagementId: dto.engagementId,
      poId: dto.poId,
      vendorInvoiceNumber: dto.vendorInvoiceNumber,
      lineItems: dto.lineItems,
      totalInvoiceAmount: dto.totalInvoiceAmount,
      invoiceDate: dto.invoiceDate,
      dueDate: dto.dueDate,
      status: 'pending',
      createdAt: now,
    };
    this.invoices.set(id, invoice);
    return invoice;
  }

  async runMatching(dto: RunMatchingDto) {
    const pos = Array.from(this.purchaseOrders.values()).filter(
      (p: any) => p.engagementId === dto.engagementId && (!dto.poId || p.id === dto.poId),
    );

    const results: any[] = [];

    for (const po of pos) {
      const poReceipts = Array.from(this.receipts.values()).filter(
        (r: any) => r.poId === po.id,
      );
      const poInvoices = Array.from(this.invoices.values()).filter(
        (i: any) => i.poId === po.id,
      );

      if (poReceipts.length === 0 || poInvoices.length === 0) {
        results.push({
          id: uuid(),
          poId: po.id,
          poNumber: po.poNumber,
          receiptId: poReceipts[0]?.id || null,
          invoiceId: poInvoices[0]?.id || null,
          status: 'exception',
          matchType: 'no_match',
          discrepancies: [{
            field: poReceipts.length === 0 ? 'receipt' : 'invoice',
            message: poReceipts.length === 0
              ? 'No receipt/acceptance report found for PO'
              : 'No invoice found for PO',
          }],
          matchedAt: new Date().toISOString(),
        });
        continue;
      }

      const receipt = poReceipts[0];
      const invoice = poInvoices[0];
      const discrepancies: any[] = [];
      const tolerancePercent = 2;

      for (const poLine of po.lineItems) {
        const receiptLine = receipt.lineItems.find(
          (r: any) => r.poLineNumber === poLine.lineNumber,
        );
        const invoiceLine = invoice.lineItems.find(
          (i: any) => i.poLineNumber === poLine.lineNumber,
        );

        if (receiptLine) {
          const qtyVariance = Math.abs(poLine.quantity - receiptLine.quantityAccepted);
          if (qtyVariance > 0) {
            const pct = (qtyVariance / poLine.quantity) * 100;
            discrepancies.push({
              lineNumber: poLine.lineNumber,
              field: 'quantity',
              poValue: poLine.quantity,
              receiptValue: receiptLine.quantityAccepted,
              invoiceValue: invoiceLine?.quantityBilled,
              varianceAmount: qtyVariance,
              variancePercent: Math.round(pct * 100) / 100,
              withinTolerance: pct <= tolerancePercent,
            });
          }
        }

        if (invoiceLine) {
          const priceVariance = Math.abs(poLine.unitPrice - invoiceLine.unitPrice);
          if (priceVariance > 0.01) {
            const pct = (priceVariance / poLine.unitPrice) * 100;
            discrepancies.push({
              lineNumber: poLine.lineNumber,
              field: 'unit_price',
              poValue: poLine.unitPrice,
              receiptValue: null,
              invoiceValue: invoiceLine.unitPrice,
              varianceAmount: priceVariance,
              variancePercent: Math.round(pct * 100) / 100,
              withinTolerance: pct <= tolerancePercent,
            });
          }
        }
      }

      const allWithinTolerance = discrepancies.every((d: any) => d.withinTolerance);
      const hasDiscrepancies = discrepancies.length > 0;

      const result = {
        id: uuid(),
        poId: po.id,
        poNumber: po.poNumber,
        receiptId: receipt.id,
        invoiceId: invoice.id,
        status: !hasDiscrepancies ? 'matched' : allWithinTolerance ? 'partial_match' : 'mismatch',
        matchType: !hasDiscrepancies ? 'full' : 'partial',
        discrepancies,
        matchedAt: new Date().toISOString(),
      };
      this.matchResults.set(result.id, result);
      results.push(result);
    }

    return {
      engagementId: dto.engagementId,
      totalPOs: pos.length,
      matched: results.filter(r => r.status === 'matched').length,
      partialMatch: results.filter(r => r.status === 'partial_match').length,
      mismatched: results.filter(r => r.status === 'mismatch').length,
      exceptions: results.filter(r => r.status === 'exception').length,
      results,
      generatedAt: new Date().toISOString(),
    };
  }

  async getMatchResults(engagementId: string) {
    const results = Array.from(this.matchResults.values()).filter(
      (r: any) => {
        const po = this.purchaseOrders.get(r.poId);
        return po?.engagementId === engagementId;
      },
    );
    return { results };
  }

  async createSuspenseItem(dto: CreateSuspenseItemDto) {
    const id = uuid();
    const now = new Date().toISOString();
    const item = {
      id,
      engagementId: dto.engagementId,
      accountNumber: dto.accountNumber,
      accountTitle: dto.accountTitle,
      amount: dto.amount,
      originalPostingDate: now,
      agingDays: 0,
      source: dto.source,
      description: dto.description,
      status: 'open',
      assignedTo: null,
      lastReviewDate: null,
      createdAt: now,
    };
    this.suspenseItems.set(id, item);
    return item;
  }

  async clearSuspenseItem(dto: ClearSuspenseItemDto) {
    const item = this.suspenseItems.get(dto.id);
    if (!item) {
      throw new NotFoundException(`Suspense item ${dto.id} not found`);
    }
    item.status = dto.clearingAction === 'written_off' ? 'written_off' : 'cleared';
    item.clearingAction = dto.clearingAction;
    item.clearingComment = dto.comment;
    item.clearedAt = new Date().toISOString();
    return item;
  }

  async getSuspenseItems(engagementId: string) {
    const items = Array.from(this.suspenseItems.values()).filter(
      (i: any) => i.engagementId === engagementId,
    );
    const now = Date.now();
    for (const item of items) {
      if (item.status === 'open') {
        item.agingDays = Math.ceil(
          (now - new Date(item.originalPostingDate).getTime()) / (1000 * 60 * 60 * 24),
        );
      }
    }
    return { items };
  }

  async getSuspenseAnalysis(engagementId: string) {
    const { items } = await this.getSuspenseItems(engagementId);
    const openItems = items.filter((i: any) => i.status === 'open');

    const bucketRanges = [
      { range: '0-30', min: 0, max: 30 },
      { range: '31-60', min: 31, max: 60 },
      { range: '61-90', min: 61, max: 90 },
      { range: '91-180', min: 91, max: 180 },
      { range: '180+', min: 181, max: Infinity },
    ];

    const agingBuckets = bucketRanges.map(bucket => {
      const bucketItems = openItems.filter(
        (i: any) => i.agingDays >= bucket.min && i.agingDays <= bucket.max,
      );
      return {
        range: bucket.range,
        count: bucketItems.length,
        totalAmount: bucketItems.reduce((s: number, i: any) => s + Math.abs(i.amount), 0),
      };
    });

    const overdueItems = openItems.filter((i: any) => i.agingDays > 90);
    const totalAmount = openItems.reduce((s: number, i: any) => s + Math.abs(i.amount), 0);
    const avgAge = openItems.length > 0
      ? Math.round(openItems.reduce((s: number, i: any) => s + i.agingDays, 0) / openItems.length)
      : 0;
    const maxAge = openItems.length > 0
      ? Math.max(...openItems.map((i: any) => i.agingDays))
      : 0;

    return {
      engagementId,
      totalItems: openItems.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      agingBuckets,
      overdueItems: overdueItems.length,
      averageAgeDays: avgAge,
      oldestItemDays: maxAge,
      alerts: overdueItems.map((i: any) => ({
        itemId: i.id,
        accountNumber: i.accountNumber,
        amount: i.amount,
        agingDays: i.agingDays,
        priority: i.agingDays > 180 || Math.abs(i.amount) > 100000 ? 'critical'
          : i.agingDays > 90 || Math.abs(i.amount) > 50000 ? 'high'
          : 'medium',
      })),
      generatedAt: new Date().toISOString(),
    };
  }
}
