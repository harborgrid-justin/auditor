import { Test, TestingModule } from '@nestjs/testing';
import { FinancialStatementsService } from './financial-statements.service';

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid'),
}));

describe('FinancialStatementsService', () => {
  let service: FinancialStatementsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FinancialStatementsService],
    }).compile();

    service = module.get<FinancialStatementsService>(FinancialStatementsService);
  });

  describe('generateStatement', () => {
    it('should generate a balance sheet', async () => {
      const result = await service.generateStatement({
        engagementId: 'eng-1',
        fiscalYear: 2025,
        statementType: 'balance_sheet',
      });

      expect(result).toHaveProperty('type', 'balance_sheet');
      expect(result).toHaveProperty('engagementId', 'eng-1');
      expect(result).toHaveProperty('fiscalYear', 2025);
      expect(result).toHaveProperty('assets');
      expect(result).toHaveProperty('liabilities');
      expect(result).toHaveProperty('netPosition');
    });

    it('should generate a net cost statement', async () => {
      const result = await service.generateStatement({
        engagementId: 'eng-1',
        fiscalYear: 2025,
        statementType: 'net_cost',
      });

      expect(result).toHaveProperty('type', 'net_cost');
      expect(result).toHaveProperty('totalGrossCost', 0);
      expect(result).toHaveProperty('totalEarnedRevenue', 0);
      expect(result).toHaveProperty('totalNetCost', 0);
    });

    it('should generate a budgetary resources (SBR) statement', async () => {
      const result = await service.generateStatement({
        engagementId: 'eng-1',
        fiscalYear: 2025,
        statementType: 'budgetary_resources',
      });

      expect(result).toHaveProperty('type', 'budgetary_resources');
      expect(result).toHaveProperty('budgetaryResources');
      expect(result).toHaveProperty('statusOfBudgetaryResources');
    });

    it('should generate a changes in net position statement', async () => {
      const result = await service.generateStatement({
        engagementId: 'eng-1',
        fiscalYear: 2025,
        statementType: 'changes_net_position',
      });

      expect(result).toHaveProperty('type', 'changes_net_position');
      expect(result).toHaveProperty('unexpendedAppropriations');
      expect(result).toHaveProperty('cumulativeResults');
    });

    it('should generate a custodial activity statement', async () => {
      const result = await service.generateStatement({
        engagementId: 'eng-1',
        fiscalYear: 2025,
        statementType: 'custodial_activity',
      });

      expect(result).toHaveProperty('type', 'custodial_activity');
      expect(result).toHaveProperty('revenueCollected', 0);
      expect(result).toHaveProperty('disposition');
    });

    it('should generate a reconciliation statement', async () => {
      const result = await service.generateStatement({
        engagementId: 'eng-1',
        fiscalYear: 2025,
        statementType: 'reconciliation',
      });

      expect(result).toHaveProperty('type', 'reconciliation');
      expect(result).toHaveProperty('netCostOfOperations', 0);
      expect(result).toHaveProperty('adjustments');
    });

    it('should return error for unknown statement type', async () => {
      const result = await service.generateStatement({
        engagementId: 'eng-1',
        fiscalYear: 2025,
        statementType: 'unknown_type',
      });

      expect(result).toHaveProperty('error');
    });
  });

  describe('generateNoteDisclosures', () => {
    it('should generate note disclosures with default notes', async () => {
      const result = await service.generateNoteDisclosures({
        engagementId: 'eng-1',
        fiscalYear: 2025,
      });

      expect(result).toHaveProperty('engagementId', 'eng-1');
      expect(result).toHaveProperty('fiscalYear', 2025);
      expect(result.noteNumbers).toHaveLength(10);
      expect(result.notes).toHaveLength(10);
      expect(result).toHaveProperty('authority', 'OMB A-136, Section II.3.2');
    });

    it('should generate specific note disclosures when note numbers provided', async () => {
      const result = await service.generateNoteDisclosures({
        engagementId: 'eng-1',
        fiscalYear: 2025,
        noteNumbers: [1, 2, 6],
      });

      expect(result.noteNumbers).toEqual([1, 2, 6]);
      expect(result.notes).toHaveLength(3);
      expect(result.notes[0].title).toBe('Significant Accounting Policies');
      expect(result.notes[1].title).toBe('Fund Balance with Treasury');
      expect(result.notes[2].title).toBe('Property, Plant, and Equipment');
    });
  });

  describe('generateFullPackage', () => {
    it('should generate a full financial statement package', async () => {
      const result = await service.generateFullPackage({
        engagementId: 'eng-1',
        fiscalYear: 2025,
      });

      expect(result).toHaveProperty('engagementId', 'eng-1');
      expect(result).toHaveProperty('fiscalYear', 2025);
      expect(result).toHaveProperty('statementsGenerated', 7);
      expect(result).toHaveProperty('authority', 'OMB A-136');
      expect(result.statements).toHaveProperty('balance_sheet');
      expect(result.statements).toHaveProperty('net_cost');
      expect(result.statements).toHaveProperty('changes_net_position');
      expect(result.statements).toHaveProperty('budgetary_resources');
      expect(result.statements).toHaveProperty('custodial_activity');
      expect(result.statements).toHaveProperty('reconciliation');
      expect(result.statements).toHaveProperty('note_disclosures');
    });
  });
});
