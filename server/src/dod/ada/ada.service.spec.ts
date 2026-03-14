import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DATABASE_TOKEN } from '../../database/database.module';
import { AdaService } from './ada.service';

jest.mock('@shared/lib/db/pg-schema', () => ({
  adaViolations: {
    id: 'id',
    engagementId: 'engagementId',
    appropriationId: 'appropriationId',
    violationType: 'violationType',
    statutoryBasis: 'statutoryBasis',
    amount: 'amount',
    description: 'description',
    discoveredDate: 'discoveredDate',
    investigationStatus: 'investigationStatus',
    fiscalYear: 'fiscalYear',
    correctiveAction: 'correctiveAction',
    reportedDate: 'reportedDate',
    createdAt: 'createdAt',
  },
  appropriations: {
    id: 'id',
    status: 'status',
    allotted: 'allotted',
    obligated: 'obligated',
    apportioned: 'apportioned',
    unobligatedBalance: 'unobligatedBalance',
  },
}), { virtual: true });

jest.mock('@shared/lib/engine/federal-accounting/ada-monitor', () => ({
  validateObligation: jest.fn().mockReturnValue({ valid: true }),
}), { virtual: true });

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid'),
}));

describe('AdaService', () => {
  let service: AdaService;
  let mockDb: Record<string, jest.Mock>;

  beforeEach(async () => {
    const mockOffset = jest.fn().mockResolvedValue([]);
    const mockLimit = jest.fn().mockReturnValue({ offset: mockOffset });
    const createWhereResult = (resolvedValue: unknown[] = []) => {
      const result = Promise.resolve(resolvedValue);
      (result as any).limit = mockLimit;
      return result;
    };
    const mockWhere = jest.fn().mockImplementation(() => createWhereResult([]));
    const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = jest.fn().mockReturnValue({ from: mockFrom });
    const mockSet = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
    const mockUpdate = jest.fn().mockReturnValue({ set: mockSet });
    const mockValues = jest.fn().mockResolvedValue(undefined);
    const mockInsert = jest.fn().mockReturnValue({ values: mockValues });

    mockDb = {
      select: mockSelect,
      from: mockFrom,
      where: mockWhere,
      insert: mockInsert,
      values: mockValues,
      update: mockUpdate,
      set: mockSet,
      limit: mockLimit,
      offset: mockOffset,
      _createWhereResult: createWhereResult,
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdaService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<AdaService>(AdaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByEngagement', () => {
    it('should return paginated ADA violations for an engagement', async () => {
      const violations = [
        { id: '1', engagementId: 'eng-1', violationType: 'over_obligation' },
        { id: '2', engagementId: 'eng-1', violationType: 'over_expenditure' },
      ];
      mockDb.offset.mockResolvedValueOnce(violations);
      mockDb.where
        .mockImplementationOnce(() => (mockDb as any)._createWhereResult([]))
        .mockImplementationOnce(() => (mockDb as any)._createWhereResult([{ count: 2 }]));

      const result = await service.findByEngagement('eng-1');

      expect(result.data).toEqual(violations);
      expect(result.meta.total).toBe(2);
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return an ADA violation when found', async () => {
      const violation = { id: '1', violationType: 'over_obligation', amount: 5000 };
      mockDb.where.mockResolvedValueOnce([violation]);

      const result = await service.findOne('1');

      expect(result).toEqual(violation);
    });

    it('should throw NotFoundException when violation not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a valid ADA violation', async () => {
      const dto = {
        engagementId: 'eng-1',
        appropriationId: 'approp-1',
        violationType: 'over_obligation' as const,
        statutoryBasis: '31 U.S.C. 1341(a)',
        amount: 50000,
        description: 'Obligation exceeded available balance',
      };

      const createdViolation = {
        id: 'test-uuid',
        ...dto,
        investigationStatus: 'detected',
      };
      mockDb.where.mockResolvedValueOnce([createdViolation]);

      const result = await service.create(dto);

      expect(result).toEqual(createdViolation);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update an ADA violation and return it', async () => {
      const existing = {
        id: '1',
        violationType: 'over_obligation',
        investigationStatus: 'detected',
      };
      const updated = { ...existing, investigationStatus: 'confirmed' };

      mockDb.where.mockResolvedValueOnce([existing]);
      mockDb.where.mockResolvedValueOnce([updated]);

      const result = await service.update('1', { investigationStatus: 'confirmed' });

      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when updating non-existent violation', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.update('non-existent', { investigationStatus: 'confirmed' }))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('validate', () => {
    it('should return valid for obligation within limits', async () => {
      const appropriation = {
        id: 'approp-1',
        status: 'current',
        allotted: 100000,
        obligated: 20000,
        apportioned: 100000,
        unobligatedBalance: 80000,
      };
      mockDb.where.mockResolvedValueOnce([appropriation]);

      const result = await service.validate({
        appropriationId: 'approp-1',
        amount: 5000,
      });

      expect(result.valid).toBe(true);
      expect(result.adaRisk.exceedsAllotment).toBe(false);
      expect(result.adaRisk.exceedsApportionment).toBe(false);
      expect(result.adaRisk.appropriationExpired).toBe(false);
      expect(result.availableBalance).toBe(80000);
    });

    it('should flag exceeds allotment risk', async () => {
      const appropriation = {
        id: 'approp-1',
        status: 'current',
        allotted: 100000,
        obligated: 95000,
        apportioned: 100000,
        unobligatedBalance: 5000,
      };
      mockDb.where.mockResolvedValueOnce([appropriation]);

      const result = await service.validate({
        appropriationId: 'approp-1',
        amount: 10000,
      });

      expect(result.valid).toBe(false);
      expect(result.adaRisk.exceedsAllotment).toBe(true);
      expect(result.requestedAmount).toBe(10000);
      expect(result.availableBalance).toBe(5000);
    });

    it('should flag expired appropriation', async () => {
      const appropriation = {
        id: 'approp-1',
        status: 'expired',
        allotted: 100000,
        obligated: 20000,
        apportioned: 100000,
        unobligatedBalance: 80000,
      };
      mockDb.where.mockResolvedValueOnce([appropriation]);

      const result = await service.validate({
        appropriationId: 'approp-1',
        amount: 5000,
      });

      expect(result.valid).toBe(false);
      expect(result.adaRisk.appropriationExpired).toBe(true);
      expect(result.appropriationStatus).toBe('expired');
    });

    it('should throw NotFoundException when appropriation not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.validate({
        appropriationId: 'non-existent',
        amount: 5000,
      })).rejects.toThrow(NotFoundException);
    });
  });
});
