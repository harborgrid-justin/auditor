import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DATABASE_TOKEN } from '../../database/database.module';
import { AppropriationsService } from './appropriations.service';

jest.mock('@shared/lib/db/pg-schema', () => ({
  appropriations: {
    id: 'id',
    engagementId: 'engagementId',
    treasuryAccountSymbol: 'treasuryAccountSymbol',
    appropriationType: 'appropriationType',
    appropriationTitle: 'appropriationTitle',
    budgetCategory: 'budgetCategory',
    fiscalYearStart: 'fiscalYearStart',
    fiscalYearEnd: 'fiscalYearEnd',
    expirationDate: 'expirationDate',
    cancellationDate: 'cancellationDate',
    totalAuthority: 'totalAuthority',
    apportioned: 'apportioned',
    allotted: 'allotted',
    committed: 'committed',
    obligated: 'obligated',
    disbursed: 'disbursed',
    unobligatedBalance: 'unobligatedBalance',
    status: 'status',
    sfisDataJson: 'sfisDataJson',
    createdAt: 'createdAt',
  },
}), { virtual: true });

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid'),
}));

describe('AppropriationsService', () => {
  let service: AppropriationsService;
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
        AppropriationsService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<AppropriationsService>(AppropriationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByEngagement', () => {
    it('should return paginated appropriations for an engagement', async () => {
      const items = [
        { id: '1', engagementId: 'eng-1', appropriationTitle: 'O&M Army', totalAuthority: 1000000 },
        { id: '2', engagementId: 'eng-1', appropriationTitle: 'RDT&E', totalAuthority: 500000 },
      ];
      mockDb.offset.mockResolvedValueOnce(items);
      mockDb.where
        .mockImplementationOnce(() => (mockDb as any)._createWhereResult([]))
        .mockImplementationOnce(() => (mockDb as any)._createWhereResult([{ count: 2 }]));

      const result = await service.findByEngagement('eng-1');

      expect(result.data).toEqual(items);
      expect(result.meta.total).toBe(2);
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return an appropriation when found', async () => {
      const appropriation = { id: '1', appropriationTitle: 'O&M Army', totalAuthority: 1000000 };
      mockDb.where.mockResolvedValueOnce([appropriation]);

      const result = await service.findOne('1');

      expect(result).toEqual(appropriation);
    });

    it('should throw NotFoundException when appropriation not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a valid appropriation', async () => {
      const dto = {
        engagementId: 'eng-1',
        treasuryAccountSymbol: '021-1804',
        appropriationType: 'one_year',
        appropriationTitle: 'Operation and Maintenance, Army',
        budgetCategory: 'om',
        fiscalYearStart: '2025-10-01',
        fiscalYearEnd: '2026-09-30',
        totalAuthority: 1000000,
      };

      const createdApprop = {
        id: 'test-uuid',
        ...dto,
        status: 'current',
        apportioned: 0,
        allotted: 0,
        obligated: 0,
        disbursed: 0,
        unobligatedBalance: 1000000,
      };
      mockDb.where.mockResolvedValueOnce([createdApprop]);

      const result = await service.create(dto);

      expect(result).toEqual(createdApprop);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update an appropriation and return it', async () => {
      const existing = {
        id: '1',
        appropriationTitle: 'O&M Army',
        totalAuthority: 1000000,
        status: 'current',
      };
      const updated = { ...existing, totalAuthority: 1200000 };

      mockDb.where.mockResolvedValueOnce([existing]);
      mockDb.where.mockResolvedValueOnce([updated]);

      const result = await service.update('1', { totalAuthority: 1200000 });

      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when updating non-existent appropriation', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(service.update('non-existent', { totalAuthority: 500000 }))
        .rejects.toThrow(NotFoundException);
    });
  });
});
