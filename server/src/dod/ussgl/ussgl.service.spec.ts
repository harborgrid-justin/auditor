import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UssglService } from './ussgl.service';
import { DATABASE_TOKEN } from '../../database/database.module';

jest.mock('@shared/lib/db/pg-schema', () => ({
  ussglAccounts: { id: 'id', engagementId: 'engagementId', fiscalYear: 'fiscalYear', accountType: 'accountType' },
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

describe('UssglService', () => {
  let service: UssglService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UssglService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<UssglService>(UssglService);
  });

  describe('findByEngagement', () => {
    it('should return accounts with trial balance', async () => {
      const accounts = [
        { id: '1', normalBalance: 'debit', endBalance: 1000, accountType: 'proprietary' },
        { id: '2', normalBalance: 'credit', endBalance: 1000, accountType: 'budgetary' },
      ];
      mockDb.where.mockResolvedValueOnce(accounts);

      const result = await service.findByEngagement('eng-1');
      expect(result.accounts).toHaveLength(2);
      expect(result.trialBalance.totalDebits).toBe(1000);
      expect(result.trialBalance.totalCredits).toBe(1000);
      expect(result.trialBalance.isBalanced).toBe(true);
      expect(result.proprietary.count).toBe(1);
      expect(result.budgetary.count).toBe(1);
    });

    it('should detect unbalanced trial balance', async () => {
      const accounts = [
        { id: '1', normalBalance: 'debit', endBalance: 1000, accountType: 'proprietary' },
        { id: '2', normalBalance: 'credit', endBalance: 500, accountType: 'proprietary' },
      ];
      mockDb.where.mockResolvedValueOnce(accounts);

      const result = await service.findByEngagement('eng-1');
      expect(result.trialBalance.isBalanced).toBe(false);
      expect(result.trialBalance.difference).toBe(500);
    });
  });

  describe('findOne', () => {
    it('should return a USSGL account by id', async () => {
      const account = { id: 'acc-1', accountNumber: '101000' };
      mockDb.where.mockResolvedValueOnce([account]);

      const result = await service.findOne('acc-1');
      expect(result).toEqual(account);
    });

    it('should throw NotFoundException when account not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a USSGL account', async () => {
      const dto = {
        engagementId: 'eng-1',
        accountNumber: '101000',
        accountTitle: 'Fund Balance',
        accountType: 'proprietary',
        normalBalance: 'debit',
        endBalance: 5000,
      };

      const created = { id: 'test-uuid', ...dto };
      mockDb.where.mockResolvedValueOnce([created]);

      const result = await service.create(dto as any);
      expect(result).toEqual(created);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a USSGL account', async () => {
      const existing = { id: 'acc-1', endBalance: 1000 };
      const updated = { id: 'acc-1', endBalance: 2000 };

      mockDb.where
        .mockResolvedValueOnce([existing])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([updated]);

      const result = await service.update('acc-1', { endBalance: 2000 } as any);
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when updating non-existent account', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(service.update('missing', { endBalance: 0 } as any)).rejects.toThrow(NotFoundException);
    });
  });
});
