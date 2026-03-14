import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DebtManagementService } from './debt-management.service';
import { DATABASE_TOKEN } from '../../database/database.module';

jest.mock('@shared/lib/db/pg-schema', () => ({
  debtDemandLetters: { id: 'id', engagementId: 'engagementId' },
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

describe('DebtManagementService', () => {
  let service: DebtManagementService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DebtManagementService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<DebtManagementService>(DebtManagementService);
  });

  describe('findByEngagement', () => {
    it('should return debt records for an engagement', async () => {
      const debts = [{ id: '1', debtorName: 'Debtor A' }];
      mockDb.where.mockResolvedValueOnce(debts);

      const result = await service.findByEngagement('eng-1');
      expect(result).toEqual(debts);
    });
  });

  describe('findOne', () => {
    it('should return a debt record by id', async () => {
      const debt = { id: 'debt-1', debtorName: 'Test' };
      mockDb.where.mockResolvedValueOnce([debt]);

      const result = await service.findOne('debt-1');
      expect(result).toEqual(debt);
    });

    it('should throw NotFoundException when debt record not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a debt record', async () => {
      const dto = {
        engagementId: 'eng-1',
        debtorName: 'John Doe',
        originalAmount: 10000,
        currentBalance: 10000,
        debtType: 'overpayment',
        delinquencyDate: '2025-01-01',
      };

      const created = { id: 'test-uuid', ...dto, status: 'active' };
      mockDb.where.mockResolvedValueOnce([created]);

      const result = await service.create(dto as any);
      expect(result).toEqual(created);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('generateDemandLetter', () => {
    it('should generate a demand letter', async () => {
      const debt = { id: 'debt-1', debtorName: 'John Doe', currentBalance: 5000 };
      mockDb.where.mockResolvedValueOnce([debt]);

      const result = await service.generateDemandLetter({
        debtId: 'debt-1',
        letterType: 'initial',
      } as any);

      expect(result.debtId).toBe('debt-1');
      expect(result.debtorName).toBe('John Doe');
      expect(result.principalAmount).toBe(5000);
      expect(result.authority).toBe('31 CFR 901.2');
    });

    it('should throw NotFoundException for non-existent debt', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(
        service.generateDemandLetter({ debtId: 'missing', letterType: 'initial' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('evaluateCompromise', () => {
    it('should evaluate a compromise offer', async () => {
      const debt = { id: 'debt-1', currentBalance: 50000 };
      mockDb.where.mockResolvedValueOnce([debt]);

      const result = await service.evaluateCompromise({
        debtId: 'debt-1',
        offeredAmount: 35000,
      } as any);

      expect(result.withinAgencyAuthority).toBe(true);
      expect(result.recommendation).toBe('approve');
      expect(result.authority).toBe('31 U.S.C. §3711');
    });

    it('should require Treasury approval for large debts', async () => {
      const debt = { id: 'debt-2', currentBalance: 200000 };
      mockDb.where.mockResolvedValueOnce([debt]);

      const result = await service.evaluateCompromise({
        debtId: 'debt-2',
        offeredAmount: 50000,
      } as any);

      expect(result.requiresTreasuryApproval).toBe(true);
      expect(result.withinAgencyAuthority).toBe(false);
    });
  });

  describe('initiateSalaryOffset', () => {
    it('should initiate a salary offset', async () => {
      const debt = { id: 'debt-1', currentBalance: 10000 };
      mockDb.where.mockResolvedValueOnce([debt]);

      const result = await service.initiateSalaryOffset({
        debtId: 'debt-1',
        employeeId: 'emp-1',
        disposablePay: 5000,
      } as any);

      expect(result.maxOffsetPercentage).toBe(0.15);
      expect(result.maxAmountPerPeriod).toBe(750);
      expect(result.hearingRightsNotified).toBe(true);
      expect(result.authority).toBe('5 U.S.C. §5514');
    });
  });

  describe('getDebtAgingReport', () => {
    it('should generate a debt aging report', async () => {
      const debts = [
        { id: '1', currentBalance: 5000, delinquencyDate: new Date().toISOString() },
      ];
      mockDb.where.mockResolvedValueOnce(debts);

      const result = await service.getDebtAgingReport('eng-1');
      expect(result.totalDebts).toBe(1);
      expect(result.agingBuckets).toBeDefined();
    });
  });

  describe('checkReferralDeadlines', () => {
    it('should check referral deadlines', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 100);

      const debts = [
        { id: '1', delinquencyDate: pastDate.toISOString() },
      ];
      mockDb.where.mockResolvedValueOnce(debts);

      const result = await service.checkReferralDeadlines('eng-1');
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].status).toBe('approaching');
      expect(result.authority).toBe('31 U.S.C. §3711(g)');
    });
  });
});
