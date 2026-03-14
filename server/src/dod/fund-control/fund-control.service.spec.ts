import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DATABASE_TOKEN } from '../../database/database.module';
import { FundControlService } from './fund-control.service';

jest.mock('@shared/lib/db/pg-schema', () => ({
  fundControls: {
    id: 'id',
    appropriationId: 'appropriationId',
    controlLevel: 'controlLevel',
    authorizedAmount: 'authorizedAmount',
    obligatedAmount: 'obligatedAmount',
    expendedAmount: 'expendedAmount',
    responsibleOrg: 'responsibleOrg',
    fiscalYear: 'fiscalYear',
    createdAt: 'createdAt',
  },
  appropriations: {
    id: 'id',
    status: 'status',
    totalAuthority: 'totalAuthority',
    apportioned: 'apportioned',
    allotted: 'allotted',
    obligated: 'obligated',
    disbursed: 'disbursed',
    unobligatedBalance: 'unobligatedBalance',
  },
}), { virtual: true });

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid'),
}));

describe('FundControlService', () => {
  let service: FundControlService;
  let mockDb: Record<string, jest.Mock>;

  beforeEach(async () => {
    const mockWhere = jest.fn().mockResolvedValue([]);
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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FundControlService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<FundControlService>(FundControlService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkFundAvailability', () => {
    it('should return fund availability details when funds are available', async () => {
      const appropriation = {
        id: 'approp-1',
        status: 'current',
        totalAuthority: 1000000,
        apportioned: 800000,
        allotted: 700000,
        obligated: 200000,
        disbursed: 100000,
        unobligatedBalance: 500000,
      };
      const fundControlRecords = [
        { id: 'fc-1', appropriationId: 'approp-1', controlLevel: 'allotment' },
      ];

      // Appropriation lookup
      mockDb.where.mockResolvedValueOnce([appropriation]);
      // Fund control records lookup
      mockDb.where.mockResolvedValueOnce(fundControlRecords);

      const result = await service.checkFundAvailability('approp-1', 50000);

      expect(result.fundsAvailable).toBe(true);
      expect(result.appropriationId).toBe('approp-1');
      expect(result.unobligatedBalance).toBe(500000);
      expect(result.requestedAmount).toBe(50000);
      expect(result.adaRisk.exceedsAllotment).toBe(false);
      expect(result.adaRisk.appropriationExpired).toBe(false);
    });

    it('should flag ADA risk when amount exceeds allotment', async () => {
      const appropriation = {
        id: 'approp-1',
        status: 'current',
        totalAuthority: 1000000,
        apportioned: 800000,
        allotted: 300000,
        obligated: 250000,
        disbursed: 100000,
        unobligatedBalance: 50000,
      };

      mockDb.where.mockResolvedValueOnce([appropriation]);
      mockDb.where.mockResolvedValueOnce([]);

      const result = await service.checkFundAvailability('approp-1', 100000);

      expect(result.fundsAvailable).toBe(false);
      expect(result.adaRisk.exceedsAllotment).toBe(true);
      expect(result.adaRisk.exceedsTotalAuthority).toBe(true);
    });

    it('should throw NotFoundException when appropriation not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.checkFundAvailability('non-existent', 5000))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('should return a fund control record when found', async () => {
      const record = { id: '1', appropriationId: 'approp-1', controlLevel: 'allotment' };
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
    it('should create a fund control record', async () => {
      const dto = {
        appropriationId: 'approp-1',
        controlLevel: 'allotment',
        authorizedAmount: 500000,
      };

      const created = { id: 'test-uuid', ...dto, obligatedAmount: 0, expendedAmount: 0 };
      mockDb.where.mockResolvedValueOnce([created]);

      const result = await service.create(dto);

      expect(result).toEqual(created);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a fund control record and return it', async () => {
      const existing = { id: '1', authorizedAmount: 500000, obligatedAmount: 100000 };
      const updated = { ...existing, authorizedAmount: 600000 };

      mockDb.where.mockResolvedValueOnce([existing]);
      mockDb.where.mockResolvedValueOnce([updated]);

      const result = await service.update('1', { authorizedAmount: 600000 });

      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when updating non-existent record', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.update('non-existent', { authorizedAmount: 600000 }))
        .rejects.toThrow(NotFoundException);
    });
  });
});
