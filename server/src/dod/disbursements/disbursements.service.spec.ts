import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { DATABASE_TOKEN } from '../../database/database.module';
import { DisbursementsService } from './disbursements.service';

jest.mock('@shared/lib/db/pg-schema', () => ({
  dodDisbursements: {
    id: 'id',
    engagementId: 'engagementId',
    obligationId: 'obligationId',
    disbursementNumber: 'disbursementNumber',
    voucherNumber: 'voucherNumber',
    payeeId: 'payeeId',
    amount: 'amount',
    disbursementDate: 'disbursementDate',
    paymentMethod: 'paymentMethod',
    certifiedBy: 'certifiedBy',
    status: 'status',
    promptPayDueDate: 'promptPayDueDate',
    discountDate: 'discountDate',
    discountAmount: 'discountAmount',
    interestPenalty: 'interestPenalty',
    createdAt: 'createdAt',
  },
  dodObligations: {
    id: 'id',
    appropriationId: 'appropriationId',
    status: 'status',
    amount: 'amount',
    liquidatedAmount: 'liquidatedAmount',
    unliquidatedBalance: 'unliquidatedBalance',
  },
  appropriations: {
    id: 'id',
    status: 'status',
    disbursed: 'disbursed',
  },
}), { virtual: true });

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid'),
}));

describe('DisbursementsService', () => {
  let service: DisbursementsService;
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
        DisbursementsService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<DisbursementsService>(DisbursementsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByEngagement', () => {
    it('should return paginated disbursements for an engagement', async () => {
      const disbursements = [
        { id: '1', engagementId: 'eng-1', amount: 5000 },
        { id: '2', engagementId: 'eng-1', amount: 3000 },
      ];
      mockDb.offset.mockResolvedValueOnce(disbursements);
      mockDb.where
        .mockImplementationOnce(() => (mockDb as any)._createWhereResult([]))
        .mockImplementationOnce(() => (mockDb as any)._createWhereResult([{ count: 2 }]));

      const result = await service.findByEngagement('eng-1');

      expect(result.data).toEqual(disbursements);
      expect(result.meta.total).toBe(2);
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a disbursement when found', async () => {
      const disbursement = { id: '1', amount: 5000, status: 'pending' };
      mockDb.where.mockResolvedValueOnce([disbursement]);

      const result = await service.findOne('1');

      expect(result).toEqual(disbursement);
    });

    it('should throw NotFoundException when disbursement not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const validDto = {
      engagementId: 'eng-1',
      obligationId: 'obl-1',
      disbursementNumber: 'DISB-001',
      amount: 5000,
      paymentMethod: 'eft',
    };

    it('should create a valid disbursement', async () => {
      const obligation = {
        id: 'obl-1',
        appropriationId: 'approp-1',
        status: 'open',
        amount: 10000,
        liquidatedAmount: 0,
        unliquidatedBalance: 10000,
      };
      const appropriation = {
        id: 'approp-1',
        status: 'current',
        disbursed: 50000,
      };

      // Obligation lookup
      mockDb.where.mockResolvedValueOnce([obligation]);
      // Appropriation lookup
      mockDb.where.mockResolvedValueOnce([appropriation]);
      // findOne after create
      const createdDisbursement = { id: 'test-uuid', ...validDto, status: 'pending' };
      mockDb.where.mockResolvedValueOnce([createdDisbursement]);

      const result = await service.create(validDto);

      expect(result).toEqual(createdDisbursement);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw NotFoundException when obligation not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.create(validDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw UnprocessableEntityException for deobligated obligation', async () => {
      const deobligatedObligation = {
        id: 'obl-1',
        appropriationId: 'approp-1',
        status: 'deobligated',
        amount: 10000,
        liquidatedAmount: 0,
        unliquidatedBalance: 10000,
      };
      mockDb.where.mockResolvedValueOnce([deobligatedObligation]);

      await expect(service.create(validDto)).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw UnprocessableEntityException when amount exceeds unliquidated balance', async () => {
      const obligation = {
        id: 'obl-1',
        appropriationId: 'approp-1',
        status: 'open',
        amount: 10000,
        liquidatedAmount: 8000,
        unliquidatedBalance: 2000,
      };
      mockDb.where.mockResolvedValueOnce([obligation]);

      const excessDto = { ...validDto, amount: 5000 };

      await expect(service.create(excessDto)).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw UnprocessableEntityException for cancelled appropriation', async () => {
      const obligation = {
        id: 'obl-1',
        appropriationId: 'approp-1',
        status: 'open',
        amount: 10000,
        liquidatedAmount: 0,
        unliquidatedBalance: 10000,
      };
      const cancelledApprop = {
        id: 'approp-1',
        status: 'cancelled',
        disbursed: 0,
      };

      mockDb.where.mockResolvedValueOnce([obligation]);
      mockDb.where.mockResolvedValueOnce([cancelledApprop]);

      await expect(service.create(validDto)).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('update', () => {
    it('should update a disbursement and return it', async () => {
      const existing = { id: '1', amount: 5000, status: 'pending' };
      const updated = { ...existing, status: 'completed', certifiedBy: 'Jane Doe' };

      mockDb.where.mockResolvedValueOnce([existing]);
      mockDb.where.mockResolvedValueOnce([updated]);

      const result = await service.update('1', { status: 'completed', certifiedBy: 'Jane Doe' });

      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when updating non-existent disbursement', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.update('non-existent', { status: 'completed' }))
        .rejects.toThrow(NotFoundException);
    });
  });
});
