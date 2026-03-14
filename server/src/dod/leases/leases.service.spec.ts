import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LeasesService } from './leases.service';
import { DATABASE_TOKEN } from '../../database/database.module';

jest.mock('@shared/lib/db/pg-schema', () => ({
  leaseAmortizationSchedules: { id: 'id', engagementId: 'engagementId' },
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

describe('LeasesService', () => {
  let service: LeasesService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeasesService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<LeasesService>(LeasesService);
  });

  describe('findByEngagement', () => {
    it('should return leases for an engagement', async () => {
      const leases = [{ id: '1', engagementId: 'eng-1' }];
      mockDb.where.mockResolvedValueOnce(leases);

      const result = await service.findByEngagement('eng-1');
      expect(result).toEqual(leases);
    });
  });

  describe('findOne', () => {
    it('should return a lease by id', async () => {
      const lease = { id: 'lease-1', termMonths: 36 };
      mockDb.where.mockResolvedValueOnce([lease]);

      const result = await service.findOne('lease-1');
      expect(result).toEqual(lease);
    });

    it('should throw NotFoundException when lease not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a lease and return it', async () => {
      const dto = {
        engagementId: 'eng-1',
        description: 'Office space',
        lessorName: 'GSA',
        commencementDate: '2025-01-01',
        termMonths: 60,
        monthlyPayment: 5000,
        fiscalYear: 2025,
        isIntragovernmental: false,
      };

      const created = { id: 'test-uuid', ...dto };
      mockDb.where.mockResolvedValueOnce([created]);

      const result = await service.create(dto as any);
      expect(result).toEqual(created);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('classifyLease', () => {
    it('should classify a short-term lease', async () => {
      const lease = { id: 'lease-1', termMonths: 12, isIntragovernmental: 0 };
      mockDb.where.mockResolvedValueOnce([lease]);

      const result = await service.classifyLease('lease-1');
      expect(result.classification).toBe('short_term_exempt');
      expect(result.authority).toBe('SFFAS 54');
    });

    it('should classify an intragovernmental lease', async () => {
      const lease = { id: 'lease-2', termMonths: 36, isIntragovernmental: 1 };
      mockDb.where.mockResolvedValueOnce([lease]);

      const result = await service.classifyLease('lease-2');
      expect(result.classification).toBe('intragovernmental');
    });

    it('should classify an operating lease', async () => {
      const lease = { id: 'lease-3', termMonths: 60, isIntragovernmental: 0 };
      mockDb.where.mockResolvedValueOnce([lease]);

      const result = await service.classifyLease('lease-3');
      expect(result.classification).toBe('operating');
    });

    it('should throw NotFoundException for non-existent lease', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(service.classifyLease('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('generateAmortizationSchedule', () => {
    it('should generate an amortization schedule', async () => {
      const lease = {
        id: 'lease-1',
        termMonths: 3,
        monthlyPayment: 1000,
        discountRate: 0.06,
      };
      mockDb.where.mockResolvedValueOnce([lease]);

      const result = await service.generateAmortizationSchedule('lease-1');
      expect(result.leaseId).toBe('lease-1');
      expect(result.termMonths).toBe(3);
      expect(result.schedule).toHaveLength(3);
      expect(result.authority).toBe('SFFAS 54, paras 18-25');
      expect(result.schedule[0].period).toBe(1);
    });
  });

  describe('getLeaseDisclosureSummary', () => {
    it('should return disclosure summary', async () => {
      const leases = [
        { id: '1', classificationType: 'operating' },
        { id: '2', classificationType: 'operating' },
        { id: '3', classificationType: null },
      ];
      mockDb.where.mockResolvedValueOnce(leases);

      const result = await service.getLeaseDisclosureSummary('eng-1');
      expect(result.totalLeases).toBe(3);
      expect(result.byClassification['operating']).toBe(2);
      expect(result.byClassification['unclassified']).toBe(1);
      expect(result.authority).toBe('OMB A-136, Section II.3.2');
    });
  });
});
