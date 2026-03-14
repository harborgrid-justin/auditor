import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DATABASE_TOKEN } from '../../database/database.module';
import { ObligationsService } from './obligations.service';

jest.mock('@shared/lib/db/pg-schema', () => ({
  dodObligations: {
    id: 'id',
    engagementId: 'engagementId',
    appropriationId: 'appropriationId',
    obligationNumber: 'obligationNumber',
    documentType: 'documentType',
    vendorOrPayee: 'vendorOrPayee',
    amount: 'amount',
    obligatedDate: 'obligatedDate',
    liquidatedAmount: 'liquidatedAmount',
    unliquidatedBalance: 'unliquidatedBalance',
    adjustmentAmount: 'adjustmentAmount',
    status: 'status',
    bonafideNeedDate: 'bonafideNeedDate',
    fiscalYear: 'fiscalYear',
    budgetObjectCode: 'budgetObjectCode',
    budgetActivityCode: 'budgetActivityCode',
    programElement: 'programElement',
    createdAt: 'createdAt',
  },
  appropriations: {
    id: 'id',
    engagementId: 'engagementId',
    status: 'status',
    allotted: 'allotted',
    obligated: 'obligated',
    unobligatedBalance: 'unobligatedBalance',
  },
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
    createdAt: 'createdAt',
  },
}), { virtual: true });

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid'),
}));

describe('ObligationsService', () => {
  let service: ObligationsService;
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
    const mockUpdateWhere = jest.fn().mockResolvedValue(undefined);
    const mockSet = jest.fn().mockReturnValue({ where: mockUpdateWhere });
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
        ObligationsService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<ObligationsService>(ObligationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByEngagement', () => {
    it('should return paginated obligations for an engagement', async () => {
      const obligations = [
        { id: '1', engagementId: 'eng-1', amount: 10000 },
        { id: '2', engagementId: 'eng-1', amount: 20000 },
      ];
      mockDb.offset.mockResolvedValueOnce(obligations);
      mockDb.where
        .mockImplementationOnce(() => (mockDb as any)._createWhereResult([]))
        .mockImplementationOnce(() => (mockDb as any)._createWhereResult([{ count: 2 }]));

      const result = await service.findByEngagement('eng-1');

      expect(result.data).toEqual(obligations);
      expect(result.meta.total).toBe(2);
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return an obligation when found', async () => {
      const obligation = { id: '1', amount: 10000, status: 'open' };
      mockDb.where.mockResolvedValueOnce([obligation]);

      const result = await service.findOne('1');

      expect(result).toEqual(obligation);
    });

    it('should throw NotFoundException when obligation not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const validDto = {
      engagementId: 'eng-1',
      appropriationId: 'approp-1',
      obligationNumber: 'OBL-001',
      documentType: 'purchase_order',
      amount: 5000,
      budgetObjectCode: '2101',
    };

    it('should create a valid obligation', async () => {
      const appropriation = {
        id: 'approp-1',
        status: 'current',
        allotted: 100000,
        obligated: 20000,
        unobligatedBalance: 80000,
      };

      // Appropriation lookup
      mockDb.where.mockResolvedValueOnce([appropriation]);
      // findOne after create
      const createdObligation = { id: 'test-uuid', ...validDto, status: 'open' };
      mockDb.where.mockResolvedValueOnce([createdObligation]);

      const result = await service.create(validDto);

      expect(result).toEqual(createdObligation);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw UnprocessableEntityException for insufficient funds (ADA violation)', async () => {
      const appropriation = {
        id: 'approp-1',
        status: 'current',
        allotted: 100000,
        obligated: 98000,
        unobligatedBalance: 2000,
      };

      mockDb.where.mockResolvedValueOnce([appropriation]);

      const dtoExceedingFunds = { ...validDto, amount: 50000 };

      await expect(service.create(dtoExceedingFunds))
        .rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw UnprocessableEntityException for non-current appropriation', async () => {
      const expiredAppropriation = {
        id: 'approp-1',
        status: 'expired',
        allotted: 100000,
        obligated: 20000,
        unobligatedBalance: 80000,
      };

      mockDb.where.mockResolvedValueOnce([expiredAppropriation]);

      await expect(service.create(validDto))
        .rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw NotFoundException when appropriation not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.create(validDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update an obligation and return it', async () => {
      const existing = { id: '1', amount: 10000, status: 'open' };
      const updated = { ...existing, status: 'partially_liquidated' };

      mockDb.where.mockResolvedValueOnce([existing]);
      mockDb.where.mockResolvedValueOnce([updated]);

      const result = await service.update('1', { status: 'partially_liquidated' });

      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when updating non-existent obligation', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.update('non-existent', { status: 'closed' }))
        .rejects.toThrow(NotFoundException);
    });
  });
});
