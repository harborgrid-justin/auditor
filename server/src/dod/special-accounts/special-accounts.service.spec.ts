import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SpecialAccountsService } from './special-accounts.service';
import { DATABASE_TOKEN } from '../../database/database.module';

jest.mock('@shared/lib/db/pg-schema', () => ({
  specialAccounts: { id: 'id', engagementId: 'engagementId' },
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

describe('SpecialAccountsService', () => {
  let service: SpecialAccountsService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpecialAccountsService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<SpecialAccountsService>(SpecialAccountsService);
  });

  describe('findByEngagement', () => {
    it('should return special accounts for an engagement', async () => {
      const accounts = [{ id: '1', accountName: 'Trust Fund A' }];
      mockDb.where.mockResolvedValueOnce(accounts);

      const result = await service.findByEngagement('eng-1');
      expect(result).toEqual(accounts);
    });
  });

  describe('findOne', () => {
    it('should return a special account by id', async () => {
      const account = { id: 'sa-1', accountName: 'Trust Fund A' };
      mockDb.where.mockResolvedValueOnce([account]);

      const result = await service.findOne('sa-1');
      expect(result).toEqual(account);
    });

    it('should throw NotFoundException when account not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a special account', async () => {
      const dto = {
        engagementId: 'eng-1',
        accountName: 'FMS Trust Fund',
        accountType: 'fms_trust',
        balance: 1000000,
        receipts: 50000,
        disbursements: 30000,
        transfersIn: 10000,
        transfersOut: 5000,
        fiscalYear: 2025,
      };

      const created = { id: 'test-uuid', ...dto, status: 'active' };
      mockDb.where.mockResolvedValueOnce([created]);

      const result = await service.create(dto as any);
      expect(result).toEqual(created);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a special account', async () => {
      const existing = { id: 'sa-1', balance: 1000000 };
      const updated = { id: 'sa-1', balance: 1200000 };

      mockDb.where
        .mockResolvedValueOnce([existing])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([updated]);

      const result = await service.update({
        id: 'sa-1',
        balance: 1200000,
        receipts: 60000,
        disbursements: 30000,
        transfersIn: 10000,
        transfersOut: 5000,
      } as any);
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when account not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(
        service.update({ id: 'missing', balance: 0 } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('runAnalysis', () => {
    it('should run special accounts analysis', async () => {
      const accounts = [
        {
          id: '1',
          accountName: 'Trust A',
          accountType: 'fms_trust',
          balance: 100000,
          receipts: 50000,
          disbursements: 30000,
          transfersIn: 10000,
          transfersOut: 5000,
          fiscalYear: 2025,
        },
      ];
      mockDb.where.mockResolvedValueOnce(accounts);

      const result = await service.runAnalysis({
        engagementId: 'eng-1',
        fiscalYear: 2025,
      } as any);

      expect(result.totalAccounts).toBe(1);
      expect(result.trust_fund_status).toBeDefined();
      expect(result.balance_reconciliation).toBeDefined();
      expect(result.dormant_accounts).toBeDefined();
      expect(result.authority).toBe('DoD FMR Volume 12, Special Accounts and Trust Funds');
    });

    it('should identify dormant accounts', async () => {
      const accounts = [
        {
          id: '1',
          accountName: 'Dormant Fund',
          accountType: 'other',
          balance: 50000,
          receipts: 0,
          disbursements: 0,
          transfersIn: 0,
          transfersOut: 0,
          fiscalYear: 2025,
        },
      ];
      mockDb.where.mockResolvedValueOnce(accounts);

      const result = await service.runAnalysis({
        engagementId: 'eng-1',
        fiscalYear: 2025,
      } as any);

      expect(result.dormant_accounts.totalDormant).toBe(1);
    });
  });
});
