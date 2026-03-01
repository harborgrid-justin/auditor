import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { budgetExecutionRules } from '../vol03-budget-execution';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { EngagementData, AuditFinding } from '@/types/findings';
import type { DoDEngagementData } from '@/types/dod-fmr';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Appropriation, Obligation, FundControl } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Helper: create mock EngagementData with DoD data
// ---------------------------------------------------------------------------

function createMockEngagementData(dodOverrides?: Partial<DoDEngagementData>): EngagementData {
  return {
    engagementId: 'test-engagement',
    accounts: [],
    trialBalance: [],
    journalEntries: [],
    financialStatements: [],
    taxData: [],
    soxControls: [],
    materialityThreshold: 100000,
    fiscalYearEnd: '2025-09-30',
    taxYear: 2025,
    dodData: {
      appropriations: [],
      obligations: [],
      ussglAccounts: [],
      ussglTransactions: [],
      disbursements: [],
      collections: [],
      militaryPayRecords: [],
      civilianPayRecords: [],
      travelOrders: [],
      travelVouchers: [],
      travelCardTransactions: [],
      contractPayments: [],
      contracts: [],
      interagencyAgreements: [],
      intragovernmentalTransactions: [],
      workingCapitalFunds: [],
      specialAccounts: [],
      nafAccounts: [],
      adaViolations: [],
      fiarAssessments: [],
      fundControls: [],
      budgetObjectCodes: [],
      sfisElements: [],
      fiscalYear: 2025,
      dodComponent: 'Army',
      ...dodOverrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: create a mock Appropriation with sensible defaults
// ---------------------------------------------------------------------------

function createAppropriation(overrides?: Partial<Appropriation>): Appropriation {
  return {
    id: 'approp-001',
    engagementId: 'test-engagement',
    treasuryAccountSymbol: '097-0100',
    appropriationType: 'one_year',
    appropriationTitle: 'Operation and Maintenance, Army',
    budgetCategory: 'om',
    fiscalYearStart: '2024-10-01',
    fiscalYearEnd: '2025-09-30',
    totalAuthority: 50000000,
    apportioned: 50000000,
    allotted: 50000000,
    committed: 30000000,
    obligated: 30000000,
    disbursed: 20000000,
    unobligatedBalance: 20000000,
    status: 'current',
    createdAt: '2024-10-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: create a mock Obligation with sensible defaults
// ---------------------------------------------------------------------------

function createObligation(overrides?: Partial<Obligation>): Obligation {
  return {
    id: 'obl-001',
    engagementId: 'test-engagement',
    appropriationId: 'approp-001',
    obligationNumber: 'W91QV1-25-F-0001',
    documentType: 'contract',
    vendorOrPayee: 'ACME Corp',
    amount: 100000,
    obligatedDate: '2025-01-15',
    liquidatedAmount: 50000,
    unliquidatedBalance: 50000,
    adjustmentAmount: 0,
    status: 'open',
    fiscalYear: 2025,
    budgetObjectCode: '2510',
    createdBy: 'test-user',
    createdAt: '2025-01-15T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: create a mock FundControl with sensible defaults
// ---------------------------------------------------------------------------

function createFundControl(overrides?: Partial<FundControl>): FundControl {
  return {
    id: 'fc-001',
    appropriationId: 'approp-001',
    controlLevel: 'allotment',
    amount: 10000000,
    obligatedAgainst: 5000000,
    expendedAgainst: 3000000,
    availableBalance: 5000000,
    controlledBy: 'G-8 Budget Office',
    effectiveDate: '2024-10-01',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Convenience: find a rule by its id
// ---------------------------------------------------------------------------

function getRule(ruleId: string) {
  const rule = budgetExecutionRules.find(r => r.id === ruleId);
  if (!rule) throw new Error(`Rule ${ruleId} not found`);
  return rule;
}

// ---------------------------------------------------------------------------
// We need to freeze time for the rules that use Date.now() / new Date()
// (V03-007, V03-008, V03-012)
// ---------------------------------------------------------------------------

describe('DoD FMR Volume 3 - Budget Execution Rules', () => {
  const NOW = new Date('2025-06-15T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // V03-001 - Apportionment Compliance
  // =========================================================================

  describe('DOD-FMR-V03-001: Apportionment Compliance', () => {
    const rule = getRule('DOD-FMR-V03-001');

    it('returns no findings when obligations are within the apportioned amount', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({ apportioned: 50000000, obligated: 30000000 }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('returns no findings when obligations exactly equal the apportioned amount', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({ apportioned: 50000000, obligated: 50000000 }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('returns a critical finding when obligations exceed apportionment', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            treasuryAccountSymbol: '097-0100',
            appropriationTitle: 'O&M Army',
            apportioned: 40000000,
            obligated: 45000000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('DOD-FMR-V03-001');
      expect(findings[0].framework).toBe('DOD_FMR');
      expect(findings[0].severity).toBe('critical');
      expect(findings[0].amountImpact).toBe(5000000);
      expect(findings[0].affectedAccounts).toContain('097-0100');
      expect(findings[0].description).toContain('O&M Army');
    });

    it('returns no findings when apportioned is zero (rule skips zero apportionment)', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({ apportioned: 0, obligated: 1000 }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('detects multiple appropriations exceeding apportionment', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            id: 'a1',
            treasuryAccountSymbol: '097-0100',
            apportioned: 10000000,
            obligated: 12000000,
          }),
          createAppropriation({
            id: 'a2',
            treasuryAccountSymbol: '097-0200',
            apportioned: 5000000,
            obligated: 5000001,
          }),
          createAppropriation({
            id: 'a3',
            treasuryAccountSymbol: '097-0300',
            apportioned: 20000000,
            obligated: 15000000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(2);
      expect(findings.every(f => f.severity === 'critical')).toBe(true);
    });

    it('returns empty array when dodData is undefined', () => {
      const data: EngagementData = {
        engagementId: 'test',
        accounts: [],
        trialBalance: [],
        journalEntries: [],
        financialStatements: [],
        taxData: [],
        soxControls: [],
        materialityThreshold: 100000,
        fiscalYearEnd: '2025-09-30',
        taxYear: 2025,
      };

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });
  });

  // =========================================================================
  // V03-002 - Allotment Compliance
  // =========================================================================

  describe('DOD-FMR-V03-002: Allotment Compliance', () => {
    const rule = getRule('DOD-FMR-V03-002');

    it('returns no findings when obligations are within allotment amounts', () => {
      const data = createMockEngagementData({
        fundControls: [
          createFundControl({
            controlLevel: 'allotment',
            amount: 10000000,
            obligatedAgainst: 8000000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('returns a critical finding when obligations exceed allotment', () => {
      const data = createMockEngagementData({
        fundControls: [
          createFundControl({
            controlLevel: 'allotment',
            amount: 10000000,
            obligatedAgainst: 12000000,
            controlledBy: 'DCS G-8',
            appropriationId: 'approp-001',
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('DOD-FMR-V03-002');
      expect(findings[0].severity).toBe('critical');
      expect(findings[0].framework).toBe('DOD_FMR');
      expect(findings[0].amountImpact).toBe(2000000);
      expect(findings[0].affectedAccounts).toContain('approp-001');
      expect(findings[0].description).toContain('DCS G-8');
    });

    it('also flags sub_allotment level violations', () => {
      const data = createMockEngagementData({
        fundControls: [
          createFundControl({
            controlLevel: 'sub_allotment',
            amount: 5000000,
            obligatedAgainst: 5000001,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('critical');
    });

    it('ignores non-allotment fund control levels (apportionment, operating_budget)', () => {
      const data = createMockEngagementData({
        fundControls: [
          createFundControl({
            controlLevel: 'apportionment',
            amount: 1000000,
            obligatedAgainst: 2000000,
          }),
          createFundControl({
            controlLevel: 'operating_budget',
            amount: 500000,
            obligatedAgainst: 1000000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('detects multiple allotment violations', () => {
      const data = createMockEngagementData({
        fundControls: [
          createFundControl({
            id: 'fc-1',
            controlLevel: 'allotment',
            amount: 3000000,
            obligatedAgainst: 4000000,
          }),
          createFundControl({
            id: 'fc-2',
            controlLevel: 'sub_allotment',
            amount: 2000000,
            obligatedAgainst: 2500000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(2);
    });

    it('returns no findings when obligations exactly equal allotment', () => {
      const data = createMockEngagementData({
        fundControls: [
          createFundControl({
            controlLevel: 'allotment',
            amount: 10000000,
            obligatedAgainst: 10000000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });
  });

  // =========================================================================
  // V03-003 - Obligation Validity
  // =========================================================================

  describe('DOD-FMR-V03-003: Obligation Validity', () => {
    const rule = getRule('DOD-FMR-V03-003');

    it('returns no findings for valid obligations with all required fields', () => {
      const data = createMockEngagementData({
        obligations: [
          createObligation({
            obligationNumber: 'W91QV1-25-F-0001',
            obligatedDate: '2025-01-15',
            amount: 100000,
            status: 'open',
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('flags obligations missing obligation numbers', () => {
      const data = createMockEngagementData({
        obligations: [
          createObligation({ obligationNumber: '', amount: 500000 }),
          createObligation({ id: 'obl-002', obligationNumber: '   ', amount: 300000 }),
        ],
      });

      const findings = rule.check(data);
      const missingNumFinding = findings.find(f => f.title === 'Obligations Missing Obligation Numbers');
      expect(missingNumFinding).toBeDefined();
      expect(missingNumFinding!.ruleId).toBe('DOD-FMR-V03-003');
      expect(missingNumFinding!.severity).toBe('medium');
      expect(missingNumFinding!.framework).toBe('DOD_FMR');
      expect(missingNumFinding!.description).toContain('2 obligation(s)');
    });

    it('flags obligations missing obligation dates', () => {
      const data = createMockEngagementData({
        obligations: [
          createObligation({
            obligatedDate: '',
            amount: 200000,
            obligationNumber: 'DOC-001',
          }),
        ],
      });

      const findings = rule.check(data);
      const missingDateFinding = findings.find(f => f.title === 'Obligations Missing Obligation Dates');
      expect(missingDateFinding).toBeDefined();
      expect(missingDateFinding!.severity).toBe('medium');
      expect(missingDateFinding!.description).toContain('1 obligation(s)');
    });

    it('flags non-deobligated obligations with zero or negative amounts', () => {
      const data = createMockEngagementData({
        obligations: [
          createObligation({
            id: 'obl-zero',
            obligationNumber: 'DOC-ZERO',
            amount: 0,
            status: 'open',
          }),
          createObligation({
            id: 'obl-neg',
            obligationNumber: 'DOC-NEG',
            amount: -5000,
            status: 'open',
          }),
        ],
      });

      const findings = rule.check(data);
      const zeroFinding = findings.find(f => f.title === 'Obligations with Zero or Negative Amounts');
      expect(zeroFinding).toBeDefined();
      expect(zeroFinding!.severity).toBe('medium');
      expect(zeroFinding!.description).toContain('2 non-deobligated');
    });

    it('does not flag deobligated obligations with zero or negative amounts', () => {
      const data = createMockEngagementData({
        obligations: [
          createObligation({
            amount: 0,
            status: 'deobligated',
          }),
          createObligation({
            id: 'obl-002',
            amount: -1000,
            status: 'deobligated',
          }),
        ],
      });

      const findings = rule.check(data);
      const zeroFinding = findings.find(f => f.title === 'Obligations with Zero or Negative Amounts');
      expect(zeroFinding).toBeUndefined();
    });

    it('can produce multiple finding types from mixed invalid obligations', () => {
      const data = createMockEngagementData({
        obligations: [
          createObligation({ obligationNumber: '', amount: 100000 }),
          createObligation({
            id: 'obl-002',
            obligationNumber: 'DOC-002',
            obligatedDate: '',
            amount: 200000,
          }),
          createObligation({
            id: 'obl-003',
            obligationNumber: 'DOC-003',
            amount: 0,
            status: 'open',
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings.length).toBe(3);
      expect(findings.every(f => f.ruleId === 'DOD-FMR-V03-003')).toBe(true);
    });
  });

  // =========================================================================
  // V03-004 - Expired Appropriation Usage
  // =========================================================================

  describe('DOD-FMR-V03-004: Expired Appropriation Usage', () => {
    const rule = getRule('DOD-FMR-V03-004');

    it('returns no findings when no obligations are against expired appropriations', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({ id: 'current-1', status: 'current' }),
        ],
        obligations: [
          createObligation({
            appropriationId: 'current-1',
            fiscalYear: 2025,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('flags new obligations recorded against expired appropriations in the current FY', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({ id: 'expired-1', status: 'expired' }),
        ],
        obligations: [
          createObligation({
            obligationNumber: 'EXP-OBL-001',
            appropriationId: 'expired-1',
            fiscalYear: 2025,
            amount: 750000,
          }),
        ],
        fiscalYear: 2025,
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('DOD-FMR-V03-004');
      expect(findings[0].severity).toBe('critical');
      expect(findings[0].framework).toBe('DOD_FMR');
      expect(findings[0].amountImpact).toBe(750000);
      expect(findings[0].description).toContain('expired appropriations');
    });

    it('does not flag obligations from prior fiscal years against expired appropriations', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({ id: 'expired-1', status: 'expired' }),
        ],
        obligations: [
          createObligation({
            appropriationId: 'expired-1',
            fiscalYear: 2023,
          }),
        ],
        fiscalYear: 2025,
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('detects multiple new obligations against expired appropriations', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({ id: 'expired-1', status: 'expired' }),
          createAppropriation({ id: 'expired-2', status: 'expired' }),
        ],
        obligations: [
          createObligation({
            id: 'o1',
            obligationNumber: 'EXP-001',
            appropriationId: 'expired-1',
            fiscalYear: 2025,
            amount: 100000,
          }),
          createObligation({
            id: 'o2',
            obligationNumber: 'EXP-002',
            appropriationId: 'expired-2',
            fiscalYear: 2025,
            amount: 200000,
          }),
          createObligation({
            id: 'o3',
            obligationNumber: 'EXP-003',
            appropriationId: 'expired-1',
            fiscalYear: 2025,
            amount: 50000,
          }),
        ],
        fiscalYear: 2025,
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      // Single finding aggregating all expired-appropriation obligations
      expect(findings[0].amountImpact).toBe(350000);
      expect(findings[0].affectedAccounts).toHaveLength(3);
    });

    it('does not flag obligations against current appropriations', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({ id: 'current-1', status: 'current' }),
          createAppropriation({ id: 'expired-1', status: 'expired' }),
        ],
        obligations: [
          createObligation({
            appropriationId: 'current-1',
            fiscalYear: 2025,
          }),
        ],
        fiscalYear: 2025,
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });
  });

  // =========================================================================
  // V03-005 - Cancelled Appropriation Detection
  // =========================================================================

  describe('DOD-FMR-V03-005: Cancelled Appropriation Detection', () => {
    const rule = getRule('DOD-FMR-V03-005');

    it('returns no findings when cancelled appropriations have zero balances', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            status: 'cancelled',
            unobligatedBalance: 0,
            obligated: 0,
            disbursed: 0,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('flags cancelled appropriations with remaining unobligated balances', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            treasuryAccountSymbol: '097-0100',
            appropriationTitle: 'Cancelled O&M',
            status: 'cancelled',
            unobligatedBalance: 500000,
            obligated: 0,
            disbursed: 0,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('DOD-FMR-V03-005');
      expect(findings[0].severity).toBe('critical');
      expect(findings[0].framework).toBe('DOD_FMR');
      expect(findings[0].affectedAccounts).toContain('097-0100');
    });

    it('flags cancelled appropriations with remaining obligated balances', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            status: 'cancelled',
            unobligatedBalance: 0,
            obligated: 1000000,
            disbursed: 500000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].amountImpact).toBe(500000); // obligated - disbursed
    });

    it('aggregates multiple cancelled appropriations with balances into one finding', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            id: 'c1',
            treasuryAccountSymbol: '097-0100',
            status: 'cancelled',
            unobligatedBalance: 100000,
            obligated: 0,
            disbursed: 0,
          }),
          createAppropriation({
            id: 'c2',
            treasuryAccountSymbol: '097-0200',
            status: 'cancelled',
            unobligatedBalance: 0,
            obligated: 200000,
            disbursed: 100000,
          }),
          createAppropriation({
            id: 'c3',
            treasuryAccountSymbol: '097-0300',
            status: 'cancelled',
            unobligatedBalance: 0,
            obligated: 0,
            disbursed: 0,
          }),
        ],
      });

      const findings = rule.check(data);
      // c3 has no balances so only c1 and c2 are flagged, but aggregated into 1 finding
      expect(findings).toHaveLength(1);
      expect(findings[0].affectedAccounts).toEqual(['097-0100', '097-0200']);
      // totalRemaining = (100000 + 0) + (0 + max(0, 200000 - 100000)) = 100000 + 100000 = 200000
      expect(findings[0].amountImpact).toBe(200000);
    });

    it('does not flag current or expired appropriations', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({ status: 'current', unobligatedBalance: 5000000 }),
          createAppropriation({ id: 'a2', status: 'expired', unobligatedBalance: 2000000 }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });
  });

  // =========================================================================
  // V03-006 - Continuing Resolution Compliance
  // =========================================================================

  describe('DOD-FMR-V03-006: Continuing Resolution Compliance', () => {
    const rule = getRule('DOD-FMR-V03-006');

    it('returns no findings when obligations are within total authority', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            appropriationType: 'one_year',
            status: 'current',
            totalAuthority: 50000000,
            obligated: 40000000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('returns a high finding when one-year current obligations exceed total authority', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            treasuryAccountSymbol: '097-0100',
            appropriationType: 'one_year',
            status: 'current',
            totalAuthority: 30000000,
            obligated: 35000000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('DOD-FMR-V03-006');
      expect(findings[0].severity).toBe('high');
      expect(findings[0].framework).toBe('DOD_FMR');
      expect(findings[0].amountImpact).toBe(5000000);
      expect(findings[0].affectedAccounts).toContain('097-0100');
    });

    it('ignores multi-year and no-year appropriations', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            appropriationType: 'multi_year',
            status: 'current',
            totalAuthority: 10000000,
            obligated: 15000000,
          }),
          createAppropriation({
            id: 'a2',
            appropriationType: 'no_year',
            status: 'current',
            totalAuthority: 5000000,
            obligated: 8000000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('ignores expired one-year appropriations', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            appropriationType: 'one_year',
            status: 'expired',
            totalAuthority: 10000000,
            obligated: 15000000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('returns no findings when totalAuthority is zero', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            appropriationType: 'one_year',
            status: 'current',
            totalAuthority: 0,
            obligated: 0,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('detects multiple one-year appropriations exceeding authority', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            id: 'a1',
            appropriationType: 'one_year',
            status: 'current',
            totalAuthority: 10000000,
            obligated: 12000000,
          }),
          createAppropriation({
            id: 'a2',
            appropriationType: 'one_year',
            status: 'current',
            totalAuthority: 5000000,
            obligated: 7000000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(2);
      expect(findings.every(f => f.severity === 'high')).toBe(true);
    });
  });

  // =========================================================================
  // V03-007 - Obligation Aging
  // =========================================================================

  describe('DOD-FMR-V03-007: Obligation Aging', () => {
    const rule = getRule('DOD-FMR-V03-007');

    it('returns no findings when no obligations are aged beyond threshold', () => {
      const data = createMockEngagementData({
        obligations: [
          createObligation({
            obligatedDate: '2025-03-01',
            unliquidatedBalance: 50000,
            status: 'open',
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('flags obligations with unliquidated balances older than 180 days', () => {
      // NOW = 2025-06-15, so 180 days ago = ~2024-12-17
      const data = createMockEngagementData({
        obligations: [
          createObligation({
            obligationNumber: 'OLD-OBL-001',
            obligatedDate: '2024-10-01',
            unliquidatedBalance: 200000,
            status: 'open',
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('DOD-FMR-V03-007');
      expect(findings[0].severity).toBe('medium');
      expect(findings[0].framework).toBe('DOD_FMR');
      expect(findings[0].amountImpact).toBe(200000);
    });

    it('does not flag obligations with zero or negative unliquidated balance', () => {
      const data = createMockEngagementData({
        obligations: [
          createObligation({
            obligatedDate: '2024-01-01',
            unliquidatedBalance: 0,
            status: 'open',
          }),
          createObligation({
            id: 'obl-002',
            obligatedDate: '2024-01-01',
            unliquidatedBalance: -100,
            status: 'open',
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('does not flag deobligated or fully_liquidated obligations', () => {
      const data = createMockEngagementData({
        obligations: [
          createObligation({
            obligatedDate: '2024-01-01',
            unliquidatedBalance: 50000,
            status: 'deobligated',
          }),
          createObligation({
            id: 'obl-002',
            obligatedDate: '2024-01-01',
            unliquidatedBalance: 30000,
            status: 'fully_liquidated',
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('aggregates multiple aged obligations into a single finding', () => {
      const data = createMockEngagementData({
        obligations: [
          createObligation({
            id: 'o1',
            obligationNumber: 'OLD-001',
            obligatedDate: '2024-06-01',
            unliquidatedBalance: 100000,
            status: 'open',
          }),
          createObligation({
            id: 'o2',
            obligationNumber: 'OLD-002',
            obligatedDate: '2024-08-01',
            unliquidatedBalance: 200000,
            status: 'open',
          }),
          createObligation({
            id: 'o3',
            obligationNumber: 'OLD-003',
            obligatedDate: '2024-09-01',
            unliquidatedBalance: 150000,
            status: 'partially_liquidated',
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].amountImpact).toBe(450000);
      expect(findings[0].description).toContain('3 obligation(s)');
    });
  });

  // =========================================================================
  // V03-008 - Deobligation Timeliness
  // =========================================================================

  describe('DOD-FMR-V03-008: Deobligation Timeliness', () => {
    const rule = getRule('DOD-FMR-V03-008');

    it('returns no findings when no deobligation issues exist', () => {
      const data = createMockEngagementData({
        obligations: [
          createObligation({
            status: 'open',
            unliquidatedBalance: 0,
            liquidatedAmount: 100000,
            obligatedDate: '2025-01-01',
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('flags fully liquidated obligations that still have unliquidated balances', () => {
      const data = createMockEngagementData({
        obligations: [
          createObligation({
            obligationNumber: 'FULL-LIQ-001',
            status: 'fully_liquidated',
            unliquidatedBalance: 25000,
          }),
        ],
      });

      const findings = rule.check(data);
      const fullyLiqFinding = findings.find(f =>
        f.title === 'Fully Liquidated Obligations with Remaining Balances Need Deobligation'
      );
      expect(fullyLiqFinding).toBeDefined();
      expect(fullyLiqFinding!.ruleId).toBe('DOD-FMR-V03-008');
      expect(fullyLiqFinding!.severity).toBe('medium');
      expect(fullyLiqFinding!.amountImpact).toBe(25000);
    });

    it('flags stale open obligations with no liquidation activity after 365 days', () => {
      // NOW = 2025-06-15, 365 days ago = ~2024-06-15
      const data = createMockEngagementData({
        obligations: [
          createObligation({
            obligationNumber: 'STALE-001',
            status: 'open',
            obligatedDate: '2024-01-01',
            liquidatedAmount: 0,
            amount: 500000,
          }),
        ],
      });

      const findings = rule.check(data);
      const staleFinding = findings.find(f =>
        f.title === 'Stale Obligations with No Liquidation Activity'
      );
      expect(staleFinding).toBeDefined();
      expect(staleFinding!.severity).toBe('medium');
      expect(staleFinding!.amountImpact).toBe(500000);
    });

    it('does not flag open obligations with liquidation activity', () => {
      const data = createMockEngagementData({
        obligations: [
          createObligation({
            status: 'open',
            obligatedDate: '2024-01-01',
            liquidatedAmount: 10000,
            amount: 500000,
          }),
        ],
      });

      const findings = rule.check(data);
      const staleFinding = findings.find(f =>
        f.title === 'Stale Obligations with No Liquidation Activity'
      );
      expect(staleFinding).toBeUndefined();
    });

    it('does not flag stale obligations that are not in open status', () => {
      const data = createMockEngagementData({
        obligations: [
          createObligation({
            status: 'partially_liquidated',
            obligatedDate: '2024-01-01',
            liquidatedAmount: 0,
            amount: 500000,
          }),
          createObligation({
            id: 'o2',
            status: 'deobligated',
            obligatedDate: '2024-01-01',
            liquidatedAmount: 0,
            amount: 300000,
          }),
        ],
      });

      const findings = rule.check(data);
      const staleFinding = findings.find(f =>
        f.title === 'Stale Obligations with No Liquidation Activity'
      );
      expect(staleFinding).toBeUndefined();
    });

    it('can produce both fully-liquidated and stale findings simultaneously', () => {
      const data = createMockEngagementData({
        obligations: [
          createObligation({
            id: 'full-liq',
            obligationNumber: 'FL-001',
            status: 'fully_liquidated',
            unliquidatedBalance: 15000,
          }),
          createObligation({
            id: 'stale',
            obligationNumber: 'ST-001',
            status: 'open',
            obligatedDate: '2023-06-01',
            liquidatedAmount: 0,
            amount: 100000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(2);
      expect(findings.some(f => f.title.includes('Fully Liquidated'))).toBe(true);
      expect(findings.some(f => f.title.includes('Stale'))).toBe(true);
    });
  });

  // =========================================================================
  // V03-009 - Fund Balance Reconciliation
  // =========================================================================

  describe('DOD-FMR-V03-009: Fund Balance Reconciliation', () => {
    const rule = getRule('DOD-FMR-V03-009');

    it('returns no findings when unobligated balance equals totalAuthority minus obligated', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            totalAuthority: 50000000,
            obligated: 30000000,
            unobligatedBalance: 20000000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('flags appropriations where unobligated balance does not reconcile', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            treasuryAccountSymbol: '097-0100',
            appropriationTitle: 'O&M Army',
            totalAuthority: 50000000,
            obligated: 30000000,
            unobligatedBalance: 19000000, // should be 20000000
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('DOD-FMR-V03-009');
      expect(findings[0].severity).toBe('medium');
      expect(findings[0].framework).toBe('DOD_FMR');
      expect(findings[0].amountImpact).toBe(1000000);
      expect(findings[0].affectedAccounts).toContain('097-0100');
    });

    it('tolerates differences within the $0.01 threshold', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            totalAuthority: 50000000,
            obligated: 30000000,
            unobligatedBalance: 20000000.005, // difference = 0.005, under 0.01
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('detects discrepancies across multiple appropriations', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            id: 'a1',
            totalAuthority: 10000000,
            obligated: 5000000,
            unobligatedBalance: 4000000, // off by 1M
          }),
          createAppropriation({
            id: 'a2',
            totalAuthority: 20000000,
            obligated: 10000000,
            unobligatedBalance: 10000000, // correct
          }),
          createAppropriation({
            id: 'a3',
            totalAuthority: 30000000,
            obligated: 25000000,
            unobligatedBalance: 6000000, // off by 1M
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(2);
    });

    it('handles zero amounts correctly (no false positive)', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            totalAuthority: 0,
            obligated: 0,
            unobligatedBalance: 0,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });
  });

  // =========================================================================
  // V03-010 - Commitment to Obligation Conversion
  // =========================================================================

  describe('DOD-FMR-V03-010: Commitment to Obligation Conversion', () => {
    const rule = getRule('DOD-FMR-V03-010');

    it('returns no findings when commitments do not exceed obligations', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            status: 'current',
            committed: 20000000,
            obligated: 30000000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('returns no findings when committed equals obligated', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            status: 'current',
            committed: 30000000,
            obligated: 30000000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('flags current appropriations where commitments exceed obligations', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            treasuryAccountSymbol: '097-0100',
            appropriationTitle: 'O&M Army',
            status: 'current',
            committed: 35000000,
            obligated: 25000000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('DOD-FMR-V03-010');
      expect(findings[0].severity).toBe('medium');
      expect(findings[0].framework).toBe('DOD_FMR');
      expect(findings[0].amountImpact).toBe(10000000);
    });

    it('ignores expired or cancelled appropriations', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            status: 'expired',
            committed: 10000000,
            obligated: 5000000,
          }),
          createAppropriation({
            id: 'a2',
            status: 'cancelled',
            committed: 5000000,
            obligated: 1000000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('does not flag when committed is zero', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            status: 'current',
            committed: 0,
            obligated: 10000000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('aggregates multiple appropriations with aged commitments', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            id: 'a1',
            treasuryAccountSymbol: '097-0100',
            status: 'current',
            committed: 10000000,
            obligated: 5000000,
          }),
          createAppropriation({
            id: 'a2',
            treasuryAccountSymbol: '097-0200',
            status: 'current',
            committed: 8000000,
            obligated: 3000000,
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      // totalUnconverted = (10M-5M) + (8M-3M) = 5M + 5M = 10M
      expect(findings[0].amountImpact).toBe(10000000);
      expect(findings[0].affectedAccounts).toEqual(['097-0100', '097-0200']);
    });
  });

  // =========================================================================
  // V03-011 - Budget Execution Rate Analysis
  // =========================================================================

  describe('DOD-FMR-V03-011: Budget Execution Rate Analysis', () => {
    const rule = getRule('DOD-FMR-V03-011');

    it('returns no findings when execution rates are within normal range', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            status: 'current',
            totalAuthority: 50000000,
            obligated: 30000000, // 60% execution rate
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('flags high execution rate (above 98%)', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            treasuryAccountSymbol: '097-0100',
            appropriationTitle: 'O&M Army',
            status: 'current',
            totalAuthority: 50000000,
            obligated: 49500000, // 99% execution rate
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('DOD-FMR-V03-011');
      expect(findings[0].severity).toBe('medium');
      expect(findings[0].title).toContain('High');
    });

    it('flags low execution rate (below 25%) for appropriations over $1M', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            treasuryAccountSymbol: '097-0100',
            status: 'current',
            totalAuthority: 50000000,
            obligated: 5000000, // 10% execution rate
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toContain('Low');
    });

    it('does not flag low execution rate for small appropriations (under $1M)', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            status: 'current',
            totalAuthority: 500000, // under $1M
            obligated: 50000,       // 10% - low but small appropriation
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('ignores expired and cancelled appropriations', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            status: 'expired',
            totalAuthority: 50000000,
            obligated: 49900000, // 99.8% - high but expired
          }),
          createAppropriation({
            id: 'a2',
            status: 'cancelled',
            totalAuthority: 50000000,
            obligated: 1000000, // 2% - low but cancelled
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('does not flag boundary execution rates (exactly 25% and exactly 98%)', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            id: 'a1',
            status: 'current',
            totalAuthority: 100000000,
            obligated: 25000000, // exactly 25%
          }),
          createAppropriation({
            id: 'a2',
            status: 'current',
            totalAuthority: 100000000,
            obligated: 98000000, // exactly 98%
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('detects both high and low in the same dataset', () => {
      const data = createMockEngagementData({
        appropriations: [
          createAppropriation({
            id: 'high-exec',
            status: 'current',
            totalAuthority: 50000000,
            obligated: 49900000, // 99.8%
          }),
          createAppropriation({
            id: 'low-exec',
            status: 'current',
            totalAuthority: 50000000,
            obligated: 2000000, // 4%
          }),
        ],
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(2);
      expect(findings.some(f => f.title.includes('High'))).toBe(true);
      expect(findings.some(f => f.title.includes('Low'))).toBe(true);
    });
  });

  // =========================================================================
  // V03-012 - Year-End Obligation Spike Detection
  // =========================================================================

  describe('DOD-FMR-V03-012: Year-End Obligation Spike Detection', () => {
    const rule = getRule('DOD-FMR-V03-012');

    it('returns no findings when Q4 spending is proportional to Q1-Q3', () => {
      const data = createMockEngagementData({
        obligations: [
          // Q1: Oct-Dec (FY2025 = Oct 2024 - Sep 2025)
          createObligation({ id: 'q1', obligatedDate: '2024-11-15', amount: 1000000 }),
          // Q2: Jan-Mar
          createObligation({ id: 'q2', obligatedDate: '2025-02-15', amount: 1000000 }),
          // Q3: Apr-Jun
          createObligation({ id: 'q3', obligatedDate: '2025-05-15', amount: 1000000 }),
          // Q4: Jul-Sep
          createObligation({ id: 'q4', obligatedDate: '2025-08-15', amount: 1000000 }),
        ],
        fiscalYear: 2025,
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('flags when Q4 spending exceeds 2x the Q1-Q3 quarterly average', () => {
      const data = createMockEngagementData({
        obligations: [
          // Q1-Q3: 1M each quarter => average 1M/quarter
          createObligation({ id: 'q1', obligatedDate: '2024-11-15', amount: 1000000 }),
          createObligation({ id: 'q2', obligatedDate: '2025-02-15', amount: 1000000 }),
          createObligation({ id: 'q3', obligatedDate: '2025-05-15', amount: 1000000 }),
          // Q4: 3M => 3x the average (spike multiplier default = 2.0)
          createObligation({ id: 'q4a', obligatedDate: '2025-07-15', amount: 1500000 }),
          createObligation({ id: 'q4b', obligatedDate: '2025-08-20', amount: 1500000 }),
        ],
        fiscalYear: 2025,
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('DOD-FMR-V03-012');
      expect(findings[0].severity).toBe('medium');
      expect(findings[0].framework).toBe('DOD_FMR');
      expect(findings[0].title).toContain('Year-End');
      expect(findings[0].description).toContain('year-end');
      // Q4 total = 3M, Q1-Q3 avg per quarter = 1M, so amountImpact = Q4 - avgPerQuarter = 3M - 1M = 2M
      expect(findings[0].amountImpact).toBe(2000000);
    });

    it('returns no findings when there are no obligations', () => {
      const data = createMockEngagementData({
        obligations: [],
        fiscalYear: 2025,
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('returns no findings when there are no Q1-Q3 obligations (no baseline)', () => {
      const data = createMockEngagementData({
        obligations: [
          createObligation({ id: 'q4', obligatedDate: '2025-08-15', amount: 5000000 }),
        ],
        fiscalYear: 2025,
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('does not flag when Q4 is exactly at the threshold boundary (2x)', () => {
      const data = createMockEngagementData({
        obligations: [
          // Q1-Q3: 3M total => 1M avg per quarter
          createObligation({ id: 'q1', obligatedDate: '2024-11-15', amount: 1000000 }),
          createObligation({ id: 'q2', obligatedDate: '2025-02-15', amount: 1000000 }),
          createObligation({ id: 'q3', obligatedDate: '2025-05-15', amount: 1000000 }),
          // Q4: exactly 2M = 2.0x avg (not > 2.0, so should not flag)
          createObligation({ id: 'q4', obligatedDate: '2025-08-15', amount: 2000000 }),
        ],
        fiscalYear: 2025,
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(0);
    });

    it('correctly counts Q4 obligations in the spike description', () => {
      const data = createMockEngagementData({
        obligations: [
          // Q1-Q3: small amounts
          createObligation({ id: 'q1', obligatedDate: '2024-11-15', amount: 100000 }),
          createObligation({ id: 'q2', obligatedDate: '2025-02-15', amount: 100000 }),
          createObligation({ id: 'q3', obligatedDate: '2025-05-15', amount: 100000 }),
          // Q4: 5 separate obligations totaling well over 2x the avg
          createObligation({ id: 'q4a', obligatedDate: '2025-07-01', amount: 200000 }),
          createObligation({ id: 'q4b', obligatedDate: '2025-07-15', amount: 200000 }),
          createObligation({ id: 'q4c', obligatedDate: '2025-08-01', amount: 200000 }),
          createObligation({ id: 'q4d', obligatedDate: '2025-08-15', amount: 200000 }),
          createObligation({ id: 'q4e', obligatedDate: '2025-09-15', amount: 200000 }),
        ],
        fiscalYear: 2025,
      });

      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].description).toContain('5 obligation(s) in Q4');
    });
  });

  // =========================================================================
  // General / Cross-cutting tests
  // =========================================================================

  describe('General rule properties', () => {
    it('all rules have DOD_FMR framework', () => {
      for (const rule of budgetExecutionRules) {
        expect(rule.framework).toBe('DOD_FMR');
      }
    });

    it('all rules have Budget Execution category', () => {
      for (const rule of budgetExecutionRules) {
        expect(rule.category).toBe('Budget Execution (Vol 3)');
      }
    });

    it('all rules are enabled by default', () => {
      for (const rule of budgetExecutionRules) {
        expect(rule.enabled).toBe(true);
      }
    });

    it('there are exactly 12 budget execution rules', () => {
      expect(budgetExecutionRules).toHaveLength(12);
    });

    it('all rule IDs follow DOD-FMR-V03-NNN naming convention', () => {
      for (const rule of budgetExecutionRules) {
        expect(rule.id).toMatch(/^DOD-FMR-V03-\d{3}$/);
      }
    });

    it('all rules return empty array when dodData is not present', () => {
      const dataWithoutDod: EngagementData = {
        engagementId: 'test',
        accounts: [],
        trialBalance: [],
        journalEntries: [],
        financialStatements: [],
        taxData: [],
        soxControls: [],
        materialityThreshold: 100000,
        fiscalYearEnd: '2025-09-30',
        taxYear: 2025,
      };

      for (const rule of budgetExecutionRules) {
        const findings = rule.check(dataWithoutDod);
        expect(findings).toHaveLength(0);
      }
    });

    it('all rules return empty array when dodData has empty collections', () => {
      const data = createMockEngagementData();

      for (const rule of budgetExecutionRules) {
        const findings = rule.check(data);
        expect(findings).toHaveLength(0);
      }
    });
  });
});
