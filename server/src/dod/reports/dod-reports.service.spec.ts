import { Test, TestingModule } from '@nestjs/testing';
import { DodReportsService } from './dod-reports.service';
import { DATABASE_TOKEN } from '../../database/database.module';

jest.mock('@shared/lib/db/pg-schema', () => ({
  appropriations: { id: 'id', engagementId: 'engagementId' },
  dodObligations: { id: 'id', engagementId: 'engagementId', fiscalYear: 'fiscalYear' },
  dodDisbursements: { id: 'id', engagementId: 'engagementId' },
  ussglAccounts: { id: 'id', engagementId: 'engagementId', fiscalYear: 'fiscalYear' },
}), { virtual: true });

jest.mock('@shared/lib/reports/federal/sf133-report', () => {
  throw new Error('Not available');
}, { virtual: true });

jest.mock('@shared/lib/reports/federal/gtas-report', () => {
  throw new Error('Not available');
}, { virtual: true });

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

describe('DodReportsService', () => {
  let service: DodReportsService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DodReportsService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<DodReportsService>(DodReportsService);
  });

  describe('generateSf133', () => {
    it('should generate an SF-133 report', async () => {
      const appropriations = [
        {
          id: 'app-1',
          treasuryAccountSymbol: '097-4930',
          appropriationTitle: 'O&M Army',
          budgetCategory: 'direct',
          totalAuthority: 1000000,
          apportioned: 900000,
          allotted: 800000,
          obligated: 500000,
          unobligatedBalance: 500000,
          disbursed: 300000,
          status: 'active',
        },
      ];
      const obligations = [
        { id: 'obl-1', amount: 500000, appropriationId: 'app-1' },
      ];
      const disbursements = [
        { id: 'dis-1', amount: 300000 },
      ];

      mockDb.where
        .mockResolvedValueOnce(appropriations)
        .mockResolvedValueOnce(obligations)
        .mockResolvedValueOnce(disbursements);

      const result = await service.generateSf133('eng-1', 2025);
      expect(result.report).toBe('SF-133');
      expect(result.section1_budgetaryResources.totalBudgetaryResources).toBe(1000000);
      expect(result.section2_statusOfBudgetaryResources.obligationsIncurred).toBe(500000);
      expect(result.section3_outlays.grossDisbursements).toBe(300000);
      expect(result.lineItems).toHaveLength(1);
    });

    it('should handle empty data', async () => {
      mockDb.where
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.generateSf133('eng-1', 2025);
      expect(result.report).toBe('SF-133');
      expect(result.section1_budgetaryResources.totalBudgetaryResources).toBe(0);
      expect(result.lineItems).toHaveLength(0);
    });
  });

  describe('generateGtas', () => {
    it('should generate a GTAS report', async () => {
      const accounts = [
        { id: '1', normalBalance: 'debit', endBalance: 1000, accountType: 'budgetary' },
        { id: '2', normalBalance: 'credit', endBalance: 1000, accountType: 'proprietary' },
      ];
      const appropriations = [
        {
          id: 'app-1',
          treasuryAccountSymbol: '097-4930',
          appropriationTitle: 'O&M',
          totalAuthority: 500000,
          obligated: 200000,
          disbursed: 100000,
        },
      ];
      const obligations = [{ id: 'obl-1', amount: 200000 }];
      const disbursements = [{ id: 'dis-1', amount: 100000 }];

      mockDb.where
        .mockResolvedValueOnce(accounts)
        .mockResolvedValueOnce(appropriations)
        .mockResolvedValueOnce(obligations)
        .mockResolvedValueOnce(disbursements);

      const result = await service.generateGtas('eng-1', 2025);
      expect(result.report).toBe('GTAS');
      expect(result.trialBalance.totalDebits).toBe(1000);
      expect(result.trialBalance.totalCredits).toBe(1000);
      expect(result.trialBalance.isBalanced).toBe(true);
      expect(result.budgetaryAccounts.count).toBe(1);
      expect(result.proprietaryAccounts.count).toBe(1);
    });
  });
});
