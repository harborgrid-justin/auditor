import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DATABASE_TOKEN } from '../../database/database.module';
import { MilitaryPayService } from './military-pay.service';

jest.mock('@shared/lib/db/pg-schema', () => ({
  militaryPayRecords: {
    id: 'id',
    engagementId: 'engagementId',
    memberId: 'memberId',
    payGrade: 'payGrade',
    yearsOfService: 'yearsOfService',
    basicPay: 'basicPay',
    bah: 'bah',
    bas: 'bas',
    specialPaysJson: 'specialPaysJson',
    incentivePaysJson: 'incentivePaysJson',
    combatZoneExclusion: 'combatZoneExclusion',
    tspContribution: 'tspContribution',
    tspMatchAmount: 'tspMatchAmount',
    separationPay: 'separationPay',
    retirementPay: 'retirementPay',
    totalCompensation: 'totalCompensation',
    fiscalYear: 'fiscalYear',
    payPeriod: 'payPeriod',
    status: 'status',
    createdAt: 'createdAt',
  },
}), { virtual: true });

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid'),
}));

describe('MilitaryPayService', () => {
  let service: MilitaryPayService;
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
        MilitaryPayService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<MilitaryPayService>(MilitaryPayService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByEngagement', () => {
    it('should return paginated military pay records for an engagement', async () => {
      const records = [
        { id: '1', engagementId: 'eng-1', memberId: 'MBR-001', payGrade: 'E-5' },
        { id: '2', engagementId: 'eng-1', memberId: 'MBR-002', payGrade: 'O-3' },
      ];
      mockDb.offset.mockResolvedValueOnce(records);
      mockDb.where
        .mockImplementationOnce(() => (mockDb as any)._createWhereResult([]))
        .mockImplementationOnce(() => (mockDb as any)._createWhereResult([{ count: 2 }]));

      const result = await service.findByEngagement('eng-1');

      expect(result.data).toEqual(records);
      expect(result.meta.total).toBe(2);
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a military pay record when found', async () => {
      const record = { id: '1', memberId: 'MBR-001', payGrade: 'E-5', basicPay: 3500 };
      mockDb.where.mockResolvedValueOnce([record]);

      const result = await service.findOne('1');

      expect(result).toEqual(record);
    });

    it('should throw NotFoundException when record not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a military pay record with computed total compensation', async () => {
      const dto = {
        engagementId: 'eng-1',
        memberId: 'MBR-001',
        payGrade: 'E-5',
        yearsOfService: 8,
        basicPay: 3500,
        bah: 1200,
        bas: 400,
        payPeriod: '2025-01',
      };

      const created = {
        id: 'test-uuid',
        ...dto,
        totalCompensation: 5100,
        status: 'active',
      };
      mockDb.where.mockResolvedValueOnce([created]);

      const result = await service.create(dto);

      expect(result).toEqual(created);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should create a military pay record with explicit total compensation', async () => {
      const dto = {
        engagementId: 'eng-1',
        memberId: 'MBR-002',
        payGrade: 'O-3',
        yearsOfService: 4,
        basicPay: 5000,
        bah: 2000,
        bas: 300,
        totalCompensation: 8500,
        payPeriod: '2025-01',
      };

      const created = { id: 'test-uuid', ...dto, status: 'active' };
      mockDb.where.mockResolvedValueOnce([created]);

      const result = await service.create(dto);

      expect(result).toEqual(created);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a military pay record and return it', async () => {
      const existing = { id: '1', basicPay: 3500, status: 'active' };
      const updated = { ...existing, basicPay: 3800 };

      mockDb.where.mockResolvedValueOnce([existing]);
      mockDb.where.mockResolvedValueOnce([updated]);

      const result = await service.update('1', { basicPay: 3800 });

      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when updating non-existent record', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.update('non-existent', { basicPay: 4000 }))
        .rejects.toThrow(NotFoundException);
    });
  });
});
