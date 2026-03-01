import { describe, it, expect } from 'vitest';
import type { Appropriation, Obligation } from '@/types/dod-fmr';
import { generateSF133, validateSF133 } from '../sf133-report';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeAppropriation(overrides?: Partial<Appropriation>): Appropriation {
  return {
    id: 'approp-001',
    engagementId: 'eng-001',
    treasuryAccountSymbol: '097-0100',
    appropriationType: 'one_year',
    appropriationTitle: 'Operation and Maintenance, Army',
    budgetCategory: 'om',
    fiscalYearStart: '2024-10-01',
    fiscalYearEnd: '2025-09-30',
    totalAuthority: 1_000_000,
    apportioned: 800_000,
    allotted: 750_000,
    committed: 50_000,
    obligated: 400_000,
    disbursed: 200_000,
    unobligatedBalance: 600_000,
    status: 'current',
    createdAt: '2024-10-01T00:00:00Z',
    ...overrides,
  };
}

function makeObligation(overrides?: Partial<Obligation>): Obligation {
  return {
    id: 'obl-001',
    engagementId: 'eng-001',
    appropriationId: 'approp-001',
    obligationNumber: 'OBL-00000001',
    documentType: 'contract',
    vendorOrPayee: 'Acme Corp',
    amount: 100_000,
    obligatedDate: '2025-01-15T00:00:00Z',
    liquidatedAmount: 50_000,
    unliquidatedBalance: 50_000,
    adjustmentAmount: 0,
    status: 'partially_liquidated',
    fiscalYear: 2025,
    budgetObjectCode: '2510',
    createdBy: 'system',
    createdAt: '2025-01-15T00:00:00Z',
    ...overrides,
  };
}

interface Disbursement {
  id: string;
  engagementId: string;
  obligationId: string;
  disbursementNumber: string;
  amount: number;
  disbursementDate: string;
  status: string;
  [key: string]: unknown;
}

function makeDisbursement(overrides?: Partial<Disbursement>): Disbursement {
  return {
    id: 'disb-001',
    engagementId: 'eng-001',
    obligationId: 'obl-001',
    disbursementNumber: 'DISB-00000001',
    amount: 50_000,
    disbursementDate: '2025-02-15T00:00:00Z',
    status: 'certified',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SF-133 Report Generator', () => {
  // =========================================================================
  // Report generation with valid data
  // =========================================================================

  describe('generateSF133', () => {
    it('generates a report with valid appropriation data', () => {
      const approp = makeAppropriation();
      const obligations = [makeObligation()];
      const disbursements = [makeDisbursement()];

      const report = generateSF133(approp, obligations, disbursements, 2025, '2025-Q2');

      expect(report).toBeDefined();
      expect(report.treasuryAccountSymbol).toBe('097-0100');
      expect(report.fiscalYear).toBe(2025);
      expect(report.period).toBe('2025-Q2');
    });

    it('includes all three sections in the output', () => {
      const approp = makeAppropriation();
      const obligations = [makeObligation()];
      const disbursements = [makeDisbursement()];

      const report = generateSF133(approp, obligations, disbursements, 2025, '2025-Q2');

      expect(report.budgetaryResources).toBeDefined();
      expect(report.statusOfBudgetaryResources).toBeDefined();
      expect(report.outlays).toBeDefined();
    });
  });

  // =========================================================================
  // Section I: Budgetary Resources
  // =========================================================================

  describe('Section A: Budgetary Resources', () => {
    it('computes total budgetary resources as sum of components', () => {
      const approp = makeAppropriation();
      const obligations = [makeObligation()];
      const disbursements = [makeDisbursement()];

      const report = generateSF133(approp, obligations, disbursements, 2025, '2025-Q2');

      const section = report.budgetaryResources;
      const expectedTotal =
        section.unobligatedBalanceBroughtForward +
        section.adjustments +
        section.newBudgetAuthority +
        section.spendingAuthority;

      expect(section.totalBudgetaryResources).toBeCloseTo(expectedTotal, 2);
    });

    it('reports new budget authority from total authority', () => {
      const approp = makeAppropriation({ totalAuthority: 5_000_000 });

      const report = generateSF133(approp, [], [], 2025, '2025-Q2');

      expect(report.budgetaryResources.newBudgetAuthority).toBe(5_000_000);
    });

    it('computes adjustments from deobligated obligations', () => {
      const obligations = [
        makeObligation({ id: 'obl-1', amount: 100_000, status: 'open' }),
        makeObligation({ id: 'obl-2', amount: 20_000, status: 'deobligated' }),
        makeObligation({ id: 'obl-3', amount: 15_000, status: 'deobligated' }),
      ];

      const report = generateSF133(makeAppropriation(), obligations, [], 2025, '2025-Q2');

      // Adjustments = sum of deobligated obligation amounts
      expect(report.budgetaryResources.adjustments).toBe(35_000);
    });

    it('reports spending authority as difference between totalAuthority and allotted', () => {
      const approp = makeAppropriation({
        totalAuthority: 1_000_000,
        allotted: 750_000,
      });

      const report = generateSF133(approp, [], [], 2025, '2025-Q2');

      expect(report.budgetaryResources.spendingAuthority).toBe(250_000);
    });
  });

  // =========================================================================
  // Section II: Status of Budgetary Resources
  // =========================================================================

  describe('Section B: Status of Budgetary Resources', () => {
    it('computes obligations and upward adjustments from active obligations', () => {
      const obligations = [
        makeObligation({ id: 'obl-1', amount: 100_000, adjustmentAmount: 5_000, status: 'open' }),
        makeObligation({ id: 'obl-2', amount: 200_000, adjustmentAmount: 10_000, status: 'partially_liquidated' }),
      ];

      const report = generateSF133(makeAppropriation(), obligations, [], 2025, '2025-Q2');

      // New obligations = sum of active amounts + adjustment amounts
      expect(report.statusOfBudgetaryResources.newObligationsAndUpwardAdjustments).toBe(315_000);
    });

    it('total status equals total budgetary resources (Section A = Section B)', () => {
      const approp = makeAppropriation();
      const obligations = [makeObligation()];
      const disbursements = [makeDisbursement()];

      const report = generateSF133(approp, obligations, disbursements, 2025, '2025-Q2');

      const sectionBTotal =
        report.statusOfBudgetaryResources.newObligationsAndUpwardAdjustments +
        report.statusOfBudgetaryResources.unobligatedBalanceEndOfYear;

      expect(report.budgetaryResources.totalBudgetaryResources).toBeCloseTo(sectionBTotal, 2);
    });

    it('shows apportioned unexpired for current appropriation', () => {
      const approp = makeAppropriation({
        status: 'current',
        apportioned: 800_000,
        obligated: 400_000,
      });

      const report = generateSF133(approp, [], [], 2025, '2025-Q2');

      expect(report.statusOfBudgetaryResources.apportionedUnexpired).toBe(400_000);
    });

    it('shows zero apportioned for expired appropriation', () => {
      const approp = makeAppropriation({
        status: 'expired',
        apportioned: 800_000,
        obligated: 400_000,
      });

      const report = generateSF133(approp, [], [], 2025, '2025-Q2');

      expect(report.statusOfBudgetaryResources.apportionedUnexpired).toBe(0);
    });

    it('shows expired balance for expired appropriation', () => {
      const approp = makeAppropriation({
        status: 'expired',
        unobligatedBalance: 500_000,
      });

      const report = generateSF133(approp, [], [], 2025, '2025-Q2');

      expect(report.statusOfBudgetaryResources.expired).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Section III: Outlays
  // =========================================================================

  describe('Section C: Outlays', () => {
    it('computes outlays from disbursement records', () => {
      const disbursements = [
        makeDisbursement({ id: 'disb-1', amount: 50_000 }),
        makeDisbursement({ id: 'disb-2', amount: 30_000 }),
      ];

      const report = generateSF133(makeAppropriation(), [makeObligation()], disbursements, 2025, '2025-Q2');

      expect(report.outlays.outlaysNet).toBe(80_000);
    });

    it('falls back to appropriation.disbursed when no disbursement records exist', () => {
      const approp = makeAppropriation({ disbursed: 200_000 });

      const report = generateSF133(approp, [makeObligation()], [], 2025, '2025-Q2');

      expect(report.outlays.outlaysNet).toBe(200_000);
    });

    it('computes obligated balance beginning from unliquidated balances', () => {
      const obligations = [
        makeObligation({ id: 'obl-1', unliquidatedBalance: 40_000, status: 'open' }),
        makeObligation({ id: 'obl-2', unliquidatedBalance: 60_000, status: 'partially_liquidated' }),
      ];

      const report = generateSF133(makeAppropriation(), obligations, [], 2025, '2025-Q2');

      expect(report.outlays.obligatedBalanceNetBeginning).toBe(100_000);
    });

    it('obligated balance end = beginning + new obligations - outlays', () => {
      const approp = makeAppropriation();
      const obligations = [makeObligation()];
      const disbursements = [makeDisbursement()];

      const report = generateSF133(approp, obligations, disbursements, 2025, '2025-Q2');

      const expectedEnd =
        report.outlays.obligatedBalanceNetBeginning +
        report.outlays.newObligations -
        report.outlays.outlaysNet;

      expect(report.outlays.obligatedBalanceNetEnd).toBeCloseTo(expectedEnd, 2);
    });

    it('new obligations in Section C matches Section B', () => {
      const approp = makeAppropriation();
      const obligations = [makeObligation()];
      const disbursements = [makeDisbursement()];

      const report = generateSF133(approp, obligations, disbursements, 2025, '2025-Q2');

      expect(report.outlays.newObligations).toBe(
        report.statusOfBudgetaryResources.newObligationsAndUpwardAdjustments,
      );
    });

    it('only includes certified or released disbursements', () => {
      const disbursements = [
        makeDisbursement({ id: 'disb-1', amount: 50_000, status: 'certified' }),
        makeDisbursement({ id: 'disb-2', amount: 30_000, status: 'released' }),
        makeDisbursement({ id: 'disb-3', amount: 20_000, status: 'cancelled' }),
      ];

      const report = generateSF133(makeAppropriation(), [makeObligation()], disbursements, 2025, '2025-Q2');

      // Cancelled disbursement should be excluded
      expect(report.outlays.outlaysNet).toBe(80_000);
    });
  });

  // =========================================================================
  // Multiple appropriations / aggregation
  // =========================================================================

  describe('multiple appropriations aggregation', () => {
    it('generates separate reports for distinct appropriations that can be combined', () => {
      const approp1 = makeAppropriation({
        id: 'approp-001',
        treasuryAccountSymbol: '097-0100',
        totalAuthority: 500_000,
        unobligatedBalance: 300_000,
        apportioned: 500_000,
        allotted: 500_000,
        obligated: 200_000,
        disbursed: 100_000,
      });
      const approp2 = makeAppropriation({
        id: 'approp-002',
        treasuryAccountSymbol: '097-0200',
        totalAuthority: 750_000,
        unobligatedBalance: 450_000,
        apportioned: 750_000,
        allotted: 750_000,
        obligated: 300_000,
        disbursed: 150_000,
      });

      const obl1 = [makeObligation({ appropriationId: 'approp-001', amount: 200_000, unliquidatedBalance: 100_000 })];
      const obl2 = [makeObligation({ id: 'obl-002', appropriationId: 'approp-002', amount: 300_000, unliquidatedBalance: 150_000 })];

      const report1 = generateSF133(approp1, obl1, [], 2025, '2025-Q2');
      const report2 = generateSF133(approp2, obl2, [], 2025, '2025-Q2');

      expect(report1.treasuryAccountSymbol).toBe('097-0100');
      expect(report2.treasuryAccountSymbol).toBe('097-0200');

      // Combined total budgetary resources
      const combinedResources =
        report1.budgetaryResources.totalBudgetaryResources +
        report2.budgetaryResources.totalBudgetaryResources;
      expect(combinedResources).toBeGreaterThan(0);

      // Combined outlays
      const combinedOutlays = report1.outlays.outlaysNet + report2.outlays.outlaysNet;
      expect(combinedOutlays).toBe(250_000); // 100k + 150k disbursed
    });
  });

  // =========================================================================
  // Empty data
  // =========================================================================

  describe('empty data handling', () => {
    it('produces zero-value obligations and outlays when given no obligations or disbursements', () => {
      const approp = makeAppropriation({
        totalAuthority: 1_000_000,
        apportioned: 1_000_000,
        allotted: 1_000_000,
        obligated: 0,
        disbursed: 0,
        committed: 0,
        unobligatedBalance: 1_000_000,
      });

      const report = generateSF133(approp, [], [], 2025, '2025-Q2');

      expect(report.statusOfBudgetaryResources.newObligationsAndUpwardAdjustments).toBe(0);
      expect(report.outlays.outlaysNet).toBe(0);
      expect(report.outlays.obligatedBalanceNetBeginning).toBe(0);
      expect(report.outlays.newObligations).toBe(0);
    });

    it('new budget authority equals total authority even with no obligations', () => {
      const approp = makeAppropriation({
        totalAuthority: 2_000_000,
        allotted: 2_000_000,
        obligated: 0,
        unobligatedBalance: 2_000_000,
      });

      const report = generateSF133(approp, [], [], 2025, '2025-Q2');

      expect(report.budgetaryResources.newBudgetAuthority).toBe(2_000_000);
    });
  });

  // =========================================================================
  // Fiscal year and period reflection
  // =========================================================================

  describe('fiscal year and period', () => {
    it('reflects the provided fiscal year in the report', () => {
      const report = generateSF133(makeAppropriation(), [], [], 2025, '2025-Q3');

      expect(report.fiscalYear).toBe(2025);
    });

    it('reflects the provided period in the report', () => {
      const report = generateSF133(makeAppropriation(), [], [], 2025, '2025-09');

      expect(report.period).toBe('2025-09');
    });

    it('works with different fiscal years', () => {
      const report2024 = generateSF133(makeAppropriation(), [], [], 2024, '2024-Q4');
      const report2026 = generateSF133(makeAppropriation(), [], [], 2026, '2026-Q1');

      expect(report2024.fiscalYear).toBe(2024);
      expect(report2026.fiscalYear).toBe(2026);
    });

    it('reflects TAS from the appropriation', () => {
      const approp = makeAppropriation({ treasuryAccountSymbol: '021-1804' });

      const report = generateSF133(approp, [], [], 2025, '2025-Q2');

      expect(report.treasuryAccountSymbol).toBe('021-1804');
    });
  });

  // =========================================================================
  // validateSF133
  // =========================================================================

  describe('validateSF133', () => {
    it('validates a correctly generated report as valid', () => {
      const approp = makeAppropriation({
        totalAuthority: 1_000_000,
        allotted: 1_000_000,
        apportioned: 1_000_000,
        obligated: 0,
        disbursed: 0,
        committed: 0,
        unobligatedBalance: 1_000_000,
      });

      const report = generateSF133(approp, [], [], 2025, '2025-Q2');
      const validation = validateSF133(report);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('detects Section A total mismatch', () => {
      const report = generateSF133(makeAppropriation(), [], [], 2025, '2025-Q2');

      // Tamper with total
      report.budgetaryResources.totalBudgetaryResources += 999_999;

      const validation = validateSF133(report);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Section A total'))).toBe(true);
    });

    it('detects Section A vs Section B imbalance', () => {
      const report = generateSF133(makeAppropriation(), [], [], 2025, '2025-Q2');

      // Tamper with obligations to break balance
      report.statusOfBudgetaryResources.newObligationsAndUpwardAdjustments += 500_000;

      const validation = validateSF133(report);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Section B total'))).toBe(true);
    });

    it('detects Section C obligated balance continuity error', () => {
      const report = generateSF133(makeAppropriation(), [makeObligation()], [makeDisbursement()], 2025, '2025-Q2');

      // Tamper with end balance
      report.outlays.obligatedBalanceNetEnd += 100_000;

      const validation = validateSF133(report);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Obligated balance end of year'))).toBe(true);
    });

    it('detects negative total budgetary resources', () => {
      const report = generateSF133(makeAppropriation(), [], [], 2025, '2025-Q2');

      report.budgetaryResources.totalBudgetaryResources = -100;
      // Also fix the component sum to match so we only trigger the negativity check
      report.budgetaryResources.unobligatedBalanceBroughtForward = -100;
      report.budgetaryResources.adjustments = 0;
      report.budgetaryResources.newBudgetAuthority = 0;
      report.budgetaryResources.spendingAuthority = 0;

      const validation = validateSF133(report);

      expect(validation.errors.some(e => e.includes('negative'))).toBe(true);
    });

    it('detects obligation consistency between Section B and Section C', () => {
      const report = generateSF133(makeAppropriation(), [makeObligation()], [makeDisbursement()], 2025, '2025-Q2');

      // Make Section C obligations different from Section B
      report.outlays.newObligations += 50_000;

      const validation = validateSF133(report);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some(e => e.includes('Section B obligations') && e.includes('Section C obligations'))).toBe(true);
    });
  });
});
