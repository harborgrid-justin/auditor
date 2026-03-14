import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DATABASE_TOKEN } from '../../database/database.module';
import { ContractsService } from './contracts.service';

jest.mock('@shared/lib/db/pg-schema', () => ({
  dodContracts: {
    id: 'id',
    engagementId: 'engagementId',
    contractNumber: 'contractNumber',
    contractType: 'contractType',
    vendorName: 'vendorName',
    totalValue: 'totalValue',
    obligatedAmount: 'obligatedAmount',
    fundedAmount: 'fundedAmount',
    periodOfPerformance: 'periodOfPerformance',
    contractingOfficer: 'contractingOfficer',
    status: 'status',
    closeoutDate: 'closeoutDate',
    fiscalYear: 'fiscalYear',
    createdAt: 'createdAt',
  },
}), { virtual: true });

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid'),
}));

describe('ContractsService', () => {
  let service: ContractsService;
  let mockDb: Record<string, jest.Mock>;

  beforeEach(async () => {
    // Create a chainable mock that supports both simple .where() and paginated .where().limit().offset()
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
        ContractsService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByEngagement', () => {
    it('should return paginated contracts for an engagement', async () => {
      const contracts = [
        { id: '1', engagementId: 'eng-1', contractNumber: 'W91WAW-24-C-0001' },
        { id: '2', engagementId: 'eng-1', contractNumber: 'W91WAW-24-C-0002' },
      ];
      // First where() call: paginated items via .limit().offset()
      mockDb.offset.mockResolvedValueOnce(contracts);
      // Second where() call: count query resolves directly as a thenable
      mockDb.where
        .mockImplementationOnce(() => (mockDb as any)._createWhereResult([]))  // first call (items - uses .limit().offset())
        .mockImplementationOnce(() => (mockDb as any)._createWhereResult([{ count: 2 }]));  // second call (count - resolves as promise)

      const result = await service.findByEngagement('eng-1');

      expect(result.data).toEqual(contracts);
      expect(result.meta.total).toBe(2);
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a contract when found', async () => {
      const contract = { id: '1', contractNumber: 'W91WAW-24-C-0001', vendorName: 'Acme Corp' };
      mockDb.where.mockResolvedValueOnce([contract]);

      const result = await service.findOne('1');

      expect(result).toEqual(contract);
    });

    it('should throw NotFoundException when contract not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a valid contract and return it', async () => {
      const dto = {
        engagementId: 'eng-1',
        contractNumber: 'W91WAW-24-C-0001',
        contractType: 'firm_fixed_price',
        vendorName: 'Acme Corp',
        totalValue: 500000,
        periodOfPerformance: '12 months',
        contractingOfficer: 'John Smith',
      };

      const createdContract = { id: 'test-uuid', ...dto, status: 'active' };
      mockDb.where.mockResolvedValueOnce([createdContract]);

      const result = await service.create(dto);

      expect(result).toEqual(createdContract);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a contract and return it', async () => {
      const existingContract = {
        id: '1',
        contractNumber: 'W91WAW-24-C-0001',
        totalValue: 500000,
        status: 'active',
      };
      const updatedContract = { ...existingContract, totalValue: 600000 };

      // findOne check (verify exists)
      mockDb.where.mockResolvedValueOnce([existingContract]);
      // findOne after update
      mockDb.where.mockResolvedValueOnce([updatedContract]);

      const result = await service.update('1', { totalValue: 600000 });

      expect(result).toEqual(updatedContract);
    });

    it('should throw NotFoundException when updating non-existent contract', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.update('non-existent', { totalValue: 600000 }))
        .rejects.toThrow(NotFoundException);
    });
  });
});
