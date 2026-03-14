import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BudgetFormulationService } from './budget-formulation.service';
import { DATABASE_TOKEN } from '../../database/database.module';

jest.mock('@shared/lib/db/pg-schema', () => ({
  budgetFormulations: { id: 'id', engagementId: 'engagementId' },
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

describe('BudgetFormulationService', () => {
  let service: BudgetFormulationService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BudgetFormulationService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<BudgetFormulationService>(BudgetFormulationService);
  });

  describe('findByEngagement', () => {
    it('should return budget formulations for an engagement', async () => {
      const formulations = [{ id: '1', programElement: 'PE-001' }];
      mockDb.where.mockResolvedValueOnce(formulations);

      const result = await service.findByEngagement('eng-1');
      expect(result).toEqual(formulations);
    });
  });

  describe('findOne', () => {
    it('should return a budget formulation by id', async () => {
      const formulation = { id: 'bf-1', programElement: 'PE-001' };
      mockDb.where.mockResolvedValueOnce([formulation]);

      const result = await service.findOne('bf-1');
      expect(result).toEqual(formulation);
    });

    it('should throw NotFoundException when formulation not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a budget formulation', async () => {
      const dto = {
        engagementId: 'eng-1',
        fiscalYear: 2026,
        ppbePhase: 'program_review',
        programElement: 'PE-0604',
        budgetActivity: 'BA-01',
        budgetSubActivity: 'BSA-01',
        requestedAmount: 5000000,
      };

      const created = { id: 'test-uuid', ...dto, status: 'draft' };
      mockDb.where.mockResolvedValueOnce([created]);

      const result = await service.create(dto as any);
      expect(result).toEqual(created);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('submitUnfundedRequirement', () => {
    it('should submit an unfunded requirement', async () => {
      const dto = {
        engagementId: 'eng-1',
        fiscalYear: 2026,
        title: 'Critical system upgrade',
        description: 'ERP upgrade needed',
        amount: 2000000,
        priority: 1,
        missionImpact: 'High',
      };

      const result = await service.submitUnfundedRequirement(dto as any);
      expect(result.status).toBe('submitted');
      expect(result.title).toBe('Critical system upgrade');
      expect(result.priority).toBe(1);
    });
  });

  describe('getPPBESummary', () => {
    it('should return PPBE summary', async () => {
      const formulations = [
        { ppbePhase: 'program_review', requestedAmount: 1000000 },
        { ppbePhase: 'program_review', requestedAmount: 2000000 },
        { ppbePhase: 'budget_review', requestedAmount: 500000 },
      ];
      mockDb.where.mockResolvedValueOnce(formulations);

      const result = await service.getPPBESummary('eng-1', 2026);
      expect(result.totalFormulations).toBe(3);
      expect(result.byPhase['program_review'].count).toBe(2);
      expect(result.byPhase['program_review'].totalAmount).toBe(3000000);
    });
  });
});
