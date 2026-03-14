import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ReimbursableService } from './reimbursable.service';
import { DATABASE_TOKEN } from '../../database/database.module';

jest.mock('@shared/lib/db/pg-schema', () => ({
  interagencyAgreements: { id: 'id', engagementId: 'engagementId' },
  workingCapitalFunds: { id: 'id', engagementId: 'engagementId' },
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

describe('ReimbursableService', () => {
  let service: ReimbursableService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReimbursableService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<ReimbursableService>(ReimbursableService);
  });

  describe('findByEngagement', () => {
    it('should return agreements for an engagement', async () => {
      const agreements = [{ id: '1', agreementNumber: 'IAA-001' }];
      mockDb.where.mockResolvedValueOnce(agreements);

      const result = await service.findByEngagement('eng-1');
      expect(result).toEqual(agreements);
    });
  });

  describe('findOne', () => {
    it('should return an agreement by id', async () => {
      const agreement = { id: 'iaa-1', agreementNumber: 'IAA-001' };
      mockDb.where.mockResolvedValueOnce([agreement]);

      const result = await service.findOne('iaa-1');
      expect(result).toEqual(agreement);
    });

    it('should throw NotFoundException when agreement not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('createAgreement', () => {
    it('should create an interagency agreement', async () => {
      const dto = {
        engagementId: 'eng-1',
        agreementNumber: 'IAA-001',
        agreementType: 'economy_act',
        requestingAgency: 'Army',
        servicingAgency: 'Navy',
        authority: '31 USC 1535',
        amount: 500000,
        obligatedAmount: 100000,
        billedAmount: 50000,
        collectedAmount: 50000,
        advanceReceived: 0,
        status: 'active',
        periodOfPerformance: '2025-01-01 to 2025-12-31',
        fiscalYear: 2025,
      };

      const created = { id: 'test-uuid', ...dto };
      mockDb.where.mockResolvedValueOnce([created]);

      const result = await service.createAgreement(dto as any);
      expect(result).toEqual(created);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('should update agreement status', async () => {
      const existing = { id: 'iaa-1', status: 'active' };
      const updated = { id: 'iaa-1', status: 'closed' };

      mockDb.where
        .mockResolvedValueOnce([existing])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([updated]);

      const result = await service.updateStatus({ id: 'iaa-1', status: 'closed' } as any);
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException for non-existent agreement', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(
        service.updateStatus({ id: 'missing', status: 'closed' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('createWorkingCapitalFund', () => {
    it('should create a working capital fund', async () => {
      const dto = {
        engagementId: 'eng-1',
        fundName: 'DLA WCF',
        fundType: 'supply_management',
        revenueFromOperations: 1000000,
        costOfOperations: 950000,
        netOperatingResult: 50000,
        cashBalance: 200000,
        fiscalYear: 2025,
      };

      const created = { id: 'test-uuid', ...dto };
      mockDb.where.mockResolvedValueOnce([created]);

      const result = await service.createWorkingCapitalFund(dto as any);
      expect(result).toEqual(created);
    });
  });

  describe('findWorkingCapitalFunds', () => {
    it('should return WCFs for an engagement', async () => {
      const funds = [{ id: '1', fundName: 'DLA WCF' }];
      mockDb.where.mockResolvedValueOnce(funds);

      const result = await service.findWorkingCapitalFunds('eng-1');
      expect(result).toEqual(funds);
    });
  });

  describe('runAnalysis', () => {
    it('should run IAA analysis', async () => {
      const agreements = [
        {
          id: '1',
          agreementType: 'economy_act',
          authority: '31 USC 1535',
          amount: 100000,
          billedAmount: 95000,
          collectedAmount: 90000,
          obligatedAmount: 80000,
          fiscalYear: 2025,
        },
      ];
      mockDb.where.mockResolvedValueOnce(agreements);

      const result = await service.runAnalysis({
        engagementId: 'eng-1',
        fiscalYear: 2025,
      } as any);

      expect(result.totalAgreements).toBe(1);
      expect(result.metrics.economy_act_compliance).toBe(100);
      expect(result.authority).toBe('DoD FMR Volume 11A, OMB Circular A-11');
    });

    it('should flag over-obligated agreements', async () => {
      const agreements = [
        {
          id: '1',
          agreementType: 'moa',
          authority: 'DoDI 4000.19',
          amount: 100000,
          billedAmount: 90000,
          collectedAmount: 80000,
          obligatedAmount: 150000,
          fiscalYear: 2025,
        },
      ];
      mockDb.where.mockResolvedValueOnce(agreements);

      const result = await service.runAnalysis({
        engagementId: 'eng-1',
        fiscalYear: 2025,
      } as any);

      expect(result.findings).toContain(
        '1 agreement(s) have obligations exceeding the agreement amount.',
      );
    });
  });
});
