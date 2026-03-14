import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { IGTReconciliationService } from './igt-reconciliation.service';
import { DATABASE_TOKEN } from '../../database/database.module';

jest.mock('@shared/lib/db/pg-schema', () => ({
  igtReconciliations: { id: 'id', engagementId: 'engagementId' },
}), { virtual: true });

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

describe('IGTReconciliationService', () => {
  let service: IGTReconciliationService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IGTReconciliationService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<IGTReconciliationService>(IGTReconciliationService);
  });

  describe('submitTransaction', () => {
    it('should submit an IGT transaction', async () => {
      const dto = {
        engagementId: 'eng-1',
        transactionType: 'buy',
        tradingPartnerTAS: '097-4930',
        ownTAS: '021-1234',
        amount: 50000,
        period: '2025-Q1',
        fiscalYear: 2025,
      };

      const created = { id: 'test-uuid', ...dto, status: 'pending' };
      mockDb.where.mockResolvedValueOnce([created]);

      const result = await service.submitTransaction(dto as any);
      expect(result).toEqual(created);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a transaction by id', async () => {
      const txn = { id: 'txn-1', transactionType: 'buy' };
      mockDb.where.mockResolvedValueOnce([txn]);

      const result = await service.findOne('txn-1');
      expect(result).toEqual(txn);
    });

    it('should throw NotFoundException when transaction not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByEngagement', () => {
    it('should return transactions for an engagement', async () => {
      const txns = [{ id: '1' }, { id: '2' }];
      mockDb.where.mockResolvedValueOnce(txns);

      const result = await service.findByEngagement('eng-1');
      expect(result).toHaveLength(2);
    });
  });

  describe('runReconciliation', () => {
    it('should match buy and sell transactions', async () => {
      const transactions = [
        { id: 'b1', transactionType: 'buy', tradingPartnerTAS: 'TAS-A', ownTAS: 'TAS-B', amount: 1000, period: 'Q1' },
        { id: 's1', transactionType: 'sell', tradingPartnerTAS: 'TAS-B', ownTAS: 'TAS-A', amount: 1000, period: 'Q1' },
      ];
      mockDb.where.mockResolvedValueOnce(transactions);

      const result = await service.runReconciliation({
        engagementId: 'eng-1',
        period: 'Q1',
        fiscalYear: 2025,
      } as any);

      expect(result.matched).toBe(1);
      expect(result.unmatchedBuys).toBe(0);
      expect(result.unmatchedSells).toBe(0);
      expect(result.matchRate).toBe(100);
    });

    it('should report unmatched transactions', async () => {
      const transactions = [
        { id: 'b1', transactionType: 'buy', tradingPartnerTAS: 'TAS-A', ownTAS: 'TAS-B', amount: 1000, period: 'Q1' },
      ];
      mockDb.where.mockResolvedValueOnce(transactions);

      const result = await service.runReconciliation({
        engagementId: 'eng-1',
        period: 'Q1',
        fiscalYear: 2025,
      } as any);

      expect(result.matched).toBe(0);
      expect(result.unmatchedBuys).toBe(1);
    });
  });

  describe('createDispute', () => {
    it('should create a dispute', async () => {
      const result = await service.createDispute({
        discrepancyId: 'disc-1',
        initiatingAgency: 'DOD',
        description: 'Amount mismatch',
      } as any);

      expect(result.status).toBe('open');
      expect(result.discrepancyId).toBe('disc-1');
    });
  });

  describe('resolveDispute', () => {
    it('should resolve a dispute', async () => {
      const result = await service.resolveDispute({
        disputeId: 'disp-1',
        resolution: 'Adjusted amount',
        resolvedAmount: 1000,
      } as any);

      expect(result.status).toBe('resolved');
      expect(result.disputeId).toBe('disp-1');
    });
  });

  describe('getReconciliationReport', () => {
    it('should generate a reconciliation report', async () => {
      const transactions = [
        { id: '1', transactionType: 'buy', amount: 1000, period: 'Q1' },
        { id: '2', transactionType: 'sell', amount: 500, period: 'Q1' },
        { id: '3', transactionType: 'buy', amount: 200, period: 'Q2' },
      ];
      mockDb.where.mockResolvedValueOnce(transactions);

      const result = await service.getReconciliationReport('eng-1', 'Q1');
      expect(result.totalTransactions).toBe(2);
      expect(result.totalBuyAmount).toBe(1000);
      expect(result.totalSellAmount).toBe(500);
      expect(result.netDifference).toBe(500);
    });
  });
});
