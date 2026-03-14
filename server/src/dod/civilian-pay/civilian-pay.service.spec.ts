import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DATABASE_TOKEN } from '../../database/database.module';
import { CivilianPayService } from './civilian-pay.service';

jest.mock('@shared/lib/db/pg-schema', () => ({
  civilianPayRecords: {
    id: 'id',
    engagementId: 'engagementId',
    employeeId: 'employeeId',
    payPlan: 'payPlan',
    grade: 'grade',
    step: 'step',
    locality: 'locality',
    basicPay: 'basicPay',
    localityAdjustment: 'localityAdjustment',
    fehbContribution: 'fehbContribution',
    fegliContribution: 'fegliContribution',
    retirementContribution: 'retirementContribution',
    retirementPlan: 'retirementPlan',
    tspContribution: 'tspContribution',
    tspMatchAmount: 'tspMatchAmount',
    premiumPay: 'premiumPay',
    overtimePay: 'overtimePay',
    leaveHoursAccrued: 'leaveHoursAccrued',
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

describe('CivilianPayService', () => {
  let service: CivilianPayService;
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
        CivilianPayService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<CivilianPayService>(CivilianPayService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByEngagement', () => {
    it('should return paginated civilian pay records for an engagement', async () => {
      const records = [
        { id: '1', engagementId: 'eng-1', employeeId: 'EMP-001', payPlan: 'GS', grade: 12 },
        { id: '2', engagementId: 'eng-1', employeeId: 'EMP-002', payPlan: 'GS', grade: 14 },
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
    it('should return a civilian pay record when found', async () => {
      const record = {
        id: '1',
        employeeId: 'EMP-001',
        payPlan: 'GS',
        grade: 12,
        step: 5,
        basicPay: 85000,
      };
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
    it('should create a civilian pay record with computed total compensation', async () => {
      const dto = {
        engagementId: 'eng-1',
        employeeId: 'EMP-001',
        payPlan: 'GS',
        grade: '12',
        step: '5',
        locality: 'Washington-Baltimore',
        basicPay: 85000,
        localityAdjustment: 25000,
        retirementPlan: 'FERS',
        payPeriod: '2025-01',
      };

      const created = {
        id: 'test-uuid',
        ...dto,
        totalCompensation: 110000,
        status: 'active',
      };
      mockDb.where.mockResolvedValueOnce([created]);

      const result = await service.create(dto);

      expect(result).toEqual(created);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should create a civilian pay record with explicit total compensation', async () => {
      const dto = {
        engagementId: 'eng-1',
        employeeId: 'EMP-002',
        payPlan: 'GS',
        grade: '14',
        step: '10',
        locality: 'San Francisco',
        basicPay: 120000,
        localityAdjustment: 45000,
        premiumPay: 5000,
        overtimePay: 3000,
        totalCompensation: 175000,
        retirementPlan: 'FERS',
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
    it('should update a civilian pay record and return it', async () => {
      const existing = { id: '1', basicPay: 85000, status: 'active' };
      const updated = { ...existing, basicPay: 90000 };

      mockDb.where.mockResolvedValueOnce([existing]);
      mockDb.where.mockResolvedValueOnce([updated]);

      const result = await service.update('1', { basicPay: 90000 });

      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when updating non-existent record', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.update('non-existent', { basicPay: 90000 }))
        .rejects.toThrow(NotFoundException);
    });

    it('should update multiple fields at once', async () => {
      const existing = { id: '1', basicPay: 85000, tspContribution: 5000, status: 'active' };
      const updated = { ...existing, basicPay: 90000, tspContribution: 6000 };

      mockDb.where.mockResolvedValueOnce([existing]);
      mockDb.where.mockResolvedValueOnce([updated]);

      const result = await service.update('1', { basicPay: 90000, tspContribution: 6000 });

      expect(result).toEqual(updated);
    });
  });
});
