import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { DATABASE_TOKEN } from '../../database/database.module';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

function createMockDb() {
  const mockWhere = jest.fn().mockResolvedValue([]);
  const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = jest.fn().mockReturnValue({ from: mockFrom });
  const mockSet = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
  const mockUpdate = jest.fn().mockReturnValue({ set: mockSet });
  const mockValues = jest.fn().mockResolvedValue(undefined);
  const mockInsert = jest.fn().mockReturnValue({ values: mockValues });

  return { select: mockSelect, from: mockFrom, where: mockWhere, insert: mockInsert, values: mockValues, update: mockUpdate, set: mockSet };
}

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<ReconciliationService>(ReconciliationService);
  });

  describe('submitPO', () => {
    it('should create a purchase order', async () => {
      const dto = {
        engagementId: 'eng-1',
        poNumber: 'PO-001',
        vendorId: 'v-1',
        vendorName: 'Vendor A',
        lineItems: [{ lineNumber: 1, quantity: 10, unitPrice: 100 }],
        totalAmount: 1000,
        appropriationId: 'app-1',
        obligationId: 'obl-1',
      };

      const result = await service.submitPO(dto as any);
      expect(result.id).toBe('test-uuid');
      expect(result.poNumber).toBe('PO-001');
      expect(result.status).toBe('open');
    });
  });

  describe('submitReceipt', () => {
    it('should create a receipt', async () => {
      const dto = {
        engagementId: 'eng-1',
        poId: 'po-1',
        lineItems: [{ poLineNumber: 1, quantityAccepted: 10 }],
        inspectedBy: 'inspector-1',
      };

      const result = await service.submitReceipt(dto as any);
      expect(result.id).toBe('test-uuid');
      expect(result.status).toBe('accepted');
    });
  });

  describe('submitInvoice', () => {
    it('should create an invoice', async () => {
      const dto = {
        engagementId: 'eng-1',
        poId: 'po-1',
        vendorInvoiceNumber: 'INV-001',
        lineItems: [{ poLineNumber: 1, quantityBilled: 10, unitPrice: 100 }],
        totalInvoiceAmount: 1000,
        invoiceDate: '2025-01-15',
        dueDate: '2025-02-15',
      };

      const result = await service.submitInvoice(dto as any);
      expect(result.id).toBe('test-uuid');
      expect(result.status).toBe('pending');
    });
  });

  describe('runMatching', () => {
    it('should return exception when no receipts or invoices', async () => {
      await service.submitPO({
        engagementId: 'eng-1',
        poNumber: 'PO-001',
        vendorId: 'v-1',
        vendorName: 'Vendor A',
        lineItems: [],
        totalAmount: 1000,
        appropriationId: 'app-1',
        obligationId: 'obl-1',
      } as any);

      const result = await service.runMatching({ engagementId: 'eng-1' } as any);
      expect(result.exceptions).toBe(1);
    });
  });

  describe('createSuspenseItem', () => {
    it('should create a suspense item', async () => {
      const dto = {
        engagementId: 'eng-1',
        accountNumber: '1099',
        accountTitle: 'Suspense',
        amount: 5000,
        source: 'unmatched_receipt',
        description: 'Unmatched receipt',
      };

      const result = await service.createSuspenseItem(dto as any);
      expect(result.id).toBe('test-uuid');
      expect(result.status).toBe('open');
      expect(result.agingDays).toBe(0);
    });
  });

  describe('clearSuspenseItem', () => {
    it('should clear a suspense item', async () => {
      const item = await service.createSuspenseItem({
        engagementId: 'eng-1',
        accountNumber: '1099',
        accountTitle: 'Suspense',
        amount: 5000,
        source: 'unmatched_receipt',
        description: 'Test',
      } as any);

      const result = await service.clearSuspenseItem({
        id: item.id,
        clearingAction: 'reclassified',
        comment: 'Applied to correct account',
      } as any);

      expect(result.status).toBe('cleared');
    });

    it('should throw NotFoundException for non-existent suspense item', async () => {
      await expect(
        service.clearSuspenseItem({ id: 'missing', clearingAction: 'reclassified' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSuspenseItems', () => {
    it('should return suspense items for an engagement', async () => {
      await service.createSuspenseItem({
        engagementId: 'eng-1',
        accountNumber: '1099',
        accountTitle: 'Suspense',
        amount: 5000,
        source: 'test',
        description: 'Test',
      } as any);

      const result = await service.getSuspenseItems('eng-1');
      expect(result.items).toHaveLength(1);
    });
  });

  describe('getSuspenseAnalysis', () => {
    it('should return analysis with aging buckets', async () => {
      const result = await service.getSuspenseAnalysis('eng-1');
      expect(result.engagementId).toBe('eng-1');
      expect(result.agingBuckets).toHaveLength(5);
      expect(result.agingBuckets[0].range).toBe('0-30');
    });
  });
});
