import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SecurityCooperationService } from './security-cooperation.service';
import { DATABASE_TOKEN } from '../../database/database.module';

jest.mock('@shared/lib/db/pg-schema', () => ({
  fmsCases: { id: 'id', engagementId: 'engagementId' },
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

describe('SecurityCooperationService', () => {
  let service: SecurityCooperationService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityCooperationService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<SecurityCooperationService>(SecurityCooperationService);
  });

  describe('findByEngagement', () => {
    it('should return FMS cases for an engagement', async () => {
      const cases = [{ id: '1', country: 'Israel' }];
      mockDb.where.mockResolvedValueOnce(cases);

      const result = await service.findByEngagement('eng-1');
      expect(result).toEqual(cases);
    });
  });

  describe('findOne', () => {
    it('should return an FMS case by id', async () => {
      const fmsCase = { id: 'case-1', country: 'Japan' };
      mockDb.where.mockResolvedValueOnce([fmsCase]);

      const result = await service.findOne('case-1');
      expect(result).toEqual(fmsCase);
    });

    it('should throw NotFoundException when case not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create an FMS case', async () => {
      const dto = {
        engagementId: 'eng-1',
        caseDesignator: 'JP-D-SAA',
        country: 'Japan',
        description: 'Aircraft sale',
        totalValue: 50000000,
        caseType: 'fms',
      };

      const created = { id: 'test-uuid', ...dto, currentPhase: 'loa_preparation' };
      mockDb.where.mockResolvedValueOnce([created]);

      const result = await service.create(dto as any);
      expect(result).toEqual(created);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('advancePhase', () => {
    it('should advance the case phase', async () => {
      const existing = { id: 'case-1', currentPhase: 'loa_preparation' };
      const updated = { id: 'case-1', currentPhase: 'implementation' };

      mockDb.where
        .mockResolvedValueOnce([existing])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([updated]);

      const result = await service.advancePhase({ caseId: 'case-1', newPhase: 'implementation' } as any);
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException for non-existent case', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(service.advancePhase({ caseId: 'missing', newPhase: 'x' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('recordTrustFundTransaction', () => {
    it('should record a trust fund transaction', async () => {
      const result = await service.recordTrustFundTransaction({
        caseId: 'case-1',
        transactionType: 'deposit',
        amount: 1000000,
        description: 'Initial deposit',
      } as any);

      expect(result.caseId).toBe('case-1');
      expect(result.amount).toBe(1000000);
    });
  });

  describe('checkCongressionalNotification', () => {
    it('should require notification for high-value cases', async () => {
      const fmsCase = { id: 'case-1', totalValue: 30000000 };
      mockDb.where.mockResolvedValueOnce([fmsCase]);

      const result = await service.checkCongressionalNotification('case-1');
      expect(result.requiresNotification).toBe(true);
      expect(result.authority).toBe('22 U.S.C. §2776');
    });

    it('should not require notification for low-value cases', async () => {
      const fmsCase = { id: 'case-2', totalValue: 1000000 };
      mockDb.where.mockResolvedValueOnce([fmsCase]);

      const result = await service.checkCongressionalNotification('case-2');
      expect(result.requiresNotification).toBe(false);
    });
  });

  describe('getCaseStatusReport', () => {
    it('should generate a case status report', async () => {
      const cases = [
        { id: '1', currentPhase: 'loa_preparation', totalValue: 10000000 },
        { id: '2', currentPhase: 'implementation', totalValue: 20000000 },
        { id: '3', currentPhase: 'loa_preparation', totalValue: 5000000 },
      ];
      mockDb.where.mockResolvedValueOnce(cases);

      const result = await service.getCaseStatusReport('eng-1');
      expect(result.totalCases).toBe(3);
      expect(result.totalValue).toBe(35000000);
      expect(result.byPhase['loa_preparation']).toBe(2);
      expect(result.byPhase['implementation']).toBe(1);
    });
  });
});
