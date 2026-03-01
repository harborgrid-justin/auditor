import { describe, it, expect, vi } from 'vitest';
import { antiDeficiencyActRules } from '../vol14-anti-deficiency-act';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { EngagementData, AuditFinding } from '@/types/findings';
import type {
  Appropriation,
  Obligation,
  ADAViolation,
  FundControl,
  DoDEngagementData,
} from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Mock the tax-parameters registry so DOD_ADA_REPORT_DEADLINE_DAYS resolves
// ---------------------------------------------------------------------------
vi.mock('@/lib/engine/tax-parameters/registry', () => ({
  getParameter: (key: string, _fy: number, _ctx: unknown, fallback: number) => {
    if (key === 'DOD_ADA_REPORT_DEADLINE_DAYS') return 30;
    return fallback ?? 0;
  },
}));

// ---------------------------------------------------------------------------
// Helper: look up a rule by its ID
// ---------------------------------------------------------------------------
function getRule(id: string) {
  const rule = antiDeficiencyActRules.find(r => r.id === id);
  if (!rule) throw new Error(`Rule ${id} not found`);
  return rule;
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeAppropriation(overrides: Partial<Appropriation> = {}): Appropriation {
  return {
    id: 'APPROP-001',
    engagementId: 'ENG-001',
    treasuryAccountSymbol: '097-0100',
    appropriationType: 'one_year',
    appropriationTitle: 'Operation and Maintenance, Army',
    budgetCategory: 'om',
    fiscalYearStart: '2025-10-01',
    fiscalYearEnd: '2026-09-30',
    expirationDate: '2026-09-30',
    totalAuthority: 10_000_000,
    apportioned: 10_000_000,
    allotted: 10_000_000,
    committed: 0,
    obligated: 5_000_000,
    disbursed: 2_000_000,
    unobligatedBalance: 5_000_000,
    status: 'current',
    createdAt: '2025-10-01T00:00:00Z',
    ...overrides,
  };
}

function makeObligation(overrides: Partial<Obligation> = {}): Obligation {
  return {
    id: 'OBL-001',
    engagementId: 'ENG-001',
    appropriationId: 'APPROP-001',
    obligationNumber: 'W52P1J-26-F-0001',
    documentType: 'contract',
    vendorOrPayee: 'Acme Corp',
    amount: 100_000,
    obligatedDate: '2026-01-15',
    liquidatedAmount: 0,
    unliquidatedBalance: 100_000,
    adjustmentAmount: 0,
    status: 'open',
    fiscalYear: 2026,
    budgetObjectCode: '2510',
    createdBy: 'john.doe',
    createdAt: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

function makeADAViolation(overrides: Partial<ADAViolation> = {}): ADAViolation {
  return {
    id: 'ADAV-001',
    engagementId: 'ENG-001',
    appropriationId: 'APPROP-001',
    violationType: 'over_obligation',
    statutoryBasis: '31 U.S.C. 1341(a)',
    amount: 50_000,
    description: 'Over-obligation detected',
    discoveredDate: '2026-01-20',
    investigationStatus: 'detected',
    fiscalYear: 2026,
    createdAt: '2026-01-20T00:00:00Z',
    ...overrides,
  };
}

function makeFundControl(overrides: Partial<FundControl> = {}): FundControl {
  return {
    id: 'FC-001',
    appropriationId: 'APPROP-001',
    controlLevel: 'allotment',
    amount: 2_000_000,
    obligatedAgainst: 1_500_000,
    expendedAgainst: 500_000,
    availableBalance: 500_000,
    controlledBy: 'HQ FORSCOM',
    effectiveDate: '2025-10-01',
    ...overrides,
  };
}

function createEmptyDodData(overrides: Partial<DoDEngagementData> = {}): DoDEngagementData {
  return {
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
    fiscalYear: 2026,
    dodComponent: 'Army',
    ...overrides,
  };
}

function createMockEngagementData(
  dodOverrides: Partial<DoDEngagementData> = {},
  engagementOverrides: Partial<EngagementData> = {},
): EngagementData {
  return {
    engagementId: 'ENG-001',
    accounts: [],
    trialBalance: [],
    journalEntries: [],
    financialStatements: [],
    taxData: [],
    soxControls: [],
    materialityThreshold: 100_000,
    fiscalYearEnd: '2026-09-30',
    taxYear: 2026,
    dodData: createEmptyDodData(dodOverrides),
    ...engagementOverrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Vol 14 Anti-Deficiency Act Rules', () => {
  // Ensure we have the expected number of rules
  it('exports 10 ADA rules', () => {
    expect(antiDeficiencyActRules).toHaveLength(10);
  });

  it('all rules belong to DOD_FMR framework', () => {
    for (const rule of antiDeficiencyActRules) {
      expect(rule.framework).toBe('DOD_FMR');
    }
  });

  it('all rules are enabled by default', () => {
    for (const rule of antiDeficiencyActRules) {
      expect(rule.enabled).toBe(true);
    }
  });

  // -----------------------------------------------------------------------
  // No dodData guard
  // -----------------------------------------------------------------------
  describe('guard: missing dodData', () => {
    it('every rule returns [] when dodData is undefined', () => {
      const data = createMockEngagementData();
      delete (data as Record<string, unknown>).dodData;
      for (const rule of antiDeficiencyActRules) {
        expect(rule.check(data)).toEqual([]);
      }
    });
  });

  // -----------------------------------------------------------------------
  // DOD-FMR-V14-001: Over-Obligation Detection
  // -----------------------------------------------------------------------
  describe('DOD-FMR-V14-001 - Over-Obligation Detection', () => {
    const rule = getRule('DOD-FMR-V14-001');

    it('returns no findings when obligations are within authority', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 5_000_000, totalAuthority: 10_000_000 })],
      });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('returns no findings when obligations equal authority', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 10_000_000, totalAuthority: 10_000_000 })],
      });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('detects over-obligation and returns a critical finding', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 12_000_000, totalAuthority: 10_000_000 })],
      });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('critical');
      expect(findings[0].ruleId).toBe('DOD-FMR-V14-001');
      expect(findings[0].amountImpact).toBe(2_000_000);
      expect(findings[0].title).toContain('Obligations Exceed Total Authority');
    });

    it('detects violations in multiple appropriations independently', () => {
      const data = createMockEngagementData({
        appropriations: [
          makeAppropriation({ id: 'A1', obligated: 11_000_000, totalAuthority: 10_000_000 }),
          makeAppropriation({ id: 'A2', obligated: 5_000_000, totalAuthority: 10_000_000 }),
          makeAppropriation({ id: 'A3', obligated: 3_000_001, totalAuthority: 3_000_000 }),
        ],
      });
      const findings = rule.check(data);
      expect(findings).toHaveLength(2);
    });

    it('ignores appropriations with zero total authority', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 100, totalAuthority: 0 })],
      });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('includes the TAS in the affected accounts', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({
          obligated: 15_000_000,
          totalAuthority: 10_000_000,
          treasuryAccountSymbol: '021-1804',
        })],
      });
      const findings = rule.check(data);
      expect(findings[0].affectedAccounts).toContain('021-1804');
    });

    it('boundary: $1 over triggers violation', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 10_000_001, totalAuthority: 10_000_000 })],
      });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].amountImpact).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // DOD-FMR-V14-002: Over-Expenditure Detection
  // -----------------------------------------------------------------------
  describe('DOD-FMR-V14-002 - Over-Expenditure Detection', () => {
    const rule = getRule('DOD-FMR-V14-002');

    it('returns no findings when disbursements are within obligations', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 5_000_000, disbursed: 3_000_000 })],
      });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('returns no findings when disbursed equals obligated', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 5_000_000, disbursed: 5_000_000 })],
      });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('detects over-expenditure with critical severity', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 5_000_000, disbursed: 6_000_000 })],
      });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('critical');
      expect(findings[0].ruleId).toBe('DOD-FMR-V14-002');
      expect(findings[0].amountImpact).toBe(1_000_000);
    });

    it('ignores appropriations with zero obligated amount', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 0, disbursed: 100 })],
      });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('boundary: $1 over triggers a finding', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 1_000_000, disbursed: 1_000_001 })],
      });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].amountImpact).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // DOD-FMR-V14-003: Apportionment Violation
  // -----------------------------------------------------------------------
  describe('DOD-FMR-V14-003 - Apportionment Violation', () => {
    const rule = getRule('DOD-FMR-V14-003');

    it('returns no findings when obligations are within apportionment', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 8_000_000, apportioned: 10_000_000 })],
      });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('detects breach of apportionment ceiling', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 11_000_000, apportioned: 10_000_000 })],
      });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('critical');
      expect(findings[0].amountImpact).toBe(1_000_000);
      expect(findings[0].title).toContain('Apportionment Ceiling Breach');
    });

    it('ignores zero apportionment (guard clause)', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 5_000_000, apportioned: 0 })],
      });
      expect(rule.check(data)).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // DOD-FMR-V14-004: Allotment Violation
  // -----------------------------------------------------------------------
  describe('DOD-FMR-V14-004 - Allotment Violation', () => {
    const rule = getRule('DOD-FMR-V14-004');

    it('returns no findings when obligations are within allotment', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 8_000_000, allotted: 10_000_000 })],
        fundControls: [],
      });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('detects appropriation-level allotment breach', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 11_000_000, allotted: 10_000_000 })],
        fundControls: [],
      });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('critical');
      expect(findings[0].amountImpact).toBe(1_000_000);
    });

    it('ignores zero allotment (guard clause)', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 5_000_000, allotted: 0 })],
        fundControls: [],
      });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('detects fund control point over-obligation at allotment level', () => {
      const fc = makeFundControl({
        controlLevel: 'allotment',
        amount: 2_000_000,
        obligatedAgainst: 2_500_000,
      });
      const data = createMockEngagementData({
        appropriations: [makeAppropriation()],
        fundControls: [fc],
      });
      const findings = rule.check(data);
      expect(findings.some(f => f.title.includes('Fund Control Point'))).toBe(true);
    });

    it('detects fund control point over-obligation at sub_allotment level', () => {
      const fc = makeFundControl({
        controlLevel: 'sub_allotment',
        amount: 500_000,
        obligatedAgainst: 600_000,
      });
      const data = createMockEngagementData({
        appropriations: [makeAppropriation()],
        fundControls: [fc],
      });
      const findings = rule.check(data);
      expect(findings.some(f => f.title.includes('sub allotment'))).toBe(true);
    });

    it('detects fund control point over-obligation at operating_budget level', () => {
      const fc = makeFundControl({
        controlLevel: 'operating_budget',
        amount: 300_000,
        obligatedAgainst: 400_000,
      });
      const data = createMockEngagementData({
        appropriations: [makeAppropriation()],
        fundControls: [fc],
      });
      const findings = rule.check(data);
      expect(findings.some(f => f.title.includes('operating budget'))).toBe(true);
    });

    it('does not flag apportionment-level fund controls', () => {
      const fc = makeFundControl({
        controlLevel: 'apportionment',
        amount: 1_000_000,
        obligatedAgainst: 1_500_000,
      });
      const data = createMockEngagementData({
        appropriations: [makeAppropriation()],
        fundControls: [fc],
      });
      // Only the allotment/sub-allotment/operating_budget levels trigger this rule
      const findings = rule.check(data);
      expect(findings.every(f => !f.title.includes('apportionment'))).toBe(true);
    });

    it('produces multiple findings for multiple fund control breaches', () => {
      const fc1 = makeFundControl({
        id: 'FC-1',
        controlLevel: 'allotment',
        amount: 1_000_000,
        obligatedAgainst: 1_200_000,
        controlledBy: 'HQ-1',
      });
      const fc2 = makeFundControl({
        id: 'FC-2',
        controlLevel: 'sub_allotment',
        amount: 500_000,
        obligatedAgainst: 700_000,
        controlledBy: 'HQ-2',
      });
      const data = createMockEngagementData({
        appropriations: [makeAppropriation()],
        fundControls: [fc1, fc2],
      });
      const findings = rule.check(data);
      // appropriation-level allotment is within limit, but two FC breaches
      expect(findings.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -----------------------------------------------------------------------
  // DOD-FMR-V14-005: Voluntary Service Prohibition
  // -----------------------------------------------------------------------
  describe('DOD-FMR-V14-005 - Voluntary Service Prohibition', () => {
    const rule = getRule('DOD-FMR-V14-005');

    it('returns no findings when there are no voluntary service violations', () => {
      const data = createMockEngagementData({
        adaViolations: [makeADAViolation({ violationType: 'over_obligation' })],
      });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('returns no findings when adaViolations array is empty', () => {
      const data = createMockEngagementData({ adaViolations: [] });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('detects voluntary service violation with critical severity', () => {
      const violation = makeADAViolation({
        violationType: 'voluntary_service',
        amount: 75_000,
        description: 'Accepted services from contractor without funds',
        discoveredDate: '2026-02-01',
        investigationStatus: 'under_investigation',
      });
      const data = createMockEngagementData({ adaViolations: [violation] });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('critical');
      expect(findings[0].ruleId).toBe('DOD-FMR-V14-005');
      expect(findings[0].amountImpact).toBe(75_000);
      expect(findings[0].description).toContain('Voluntary service');
      expect(findings[0].description).toContain('1342');
    });

    it('detects multiple voluntary service violations', () => {
      const v1 = makeADAViolation({ id: 'V1', violationType: 'voluntary_service', amount: 50_000 });
      const v2 = makeADAViolation({ id: 'V2', violationType: 'voluntary_service', amount: 25_000 });
      const data = createMockEngagementData({ adaViolations: [v1, v2] });
      const findings = rule.check(data);
      expect(findings).toHaveLength(2);
    });

    it('filters out non-voluntary-service violations', () => {
      const violations = [
        makeADAViolation({ id: 'V1', violationType: 'voluntary_service' }),
        makeADAViolation({ id: 'V2', violationType: 'over_obligation' }),
        makeADAViolation({ id: 'V3', violationType: 'time_violation' }),
      ];
      const data = createMockEngagementData({ adaViolations: violations });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // DOD-FMR-V14-006: Purpose Restriction Violation
  // -----------------------------------------------------------------------
  describe('DOD-FMR-V14-006 - Purpose Restriction Violation (Expired/Cancelled)', () => {
    const rule = getRule('DOD-FMR-V14-006');

    it('returns no findings when no obligations against expired appropriations', () => {
      const approp = makeAppropriation({ id: 'A1', status: 'current' });
      const obl = makeObligation({ appropriationId: 'A1', fiscalYear: 2026 });
      const data = createMockEngagementData({
        appropriations: [approp],
        obligations: [obl],
        fiscalYear: 2026,
      });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('detects new obligations against expired appropriations', () => {
      const approp = makeAppropriation({ id: 'A1', status: 'expired' });
      const obl = makeObligation({ appropriationId: 'A1', fiscalYear: 2026, amount: 200_000 });
      const data = createMockEngagementData({
        appropriations: [approp],
        obligations: [obl],
        fiscalYear: 2026,
      });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('critical');
      expect(findings[0].description).toContain('expired');
    });

    it('detects new obligations against cancelled appropriations', () => {
      const approp = makeAppropriation({ id: 'A1', status: 'cancelled' });
      const obl = makeObligation({ appropriationId: 'A1', fiscalYear: 2026, amount: 100_000 });
      const data = createMockEngagementData({
        appropriations: [approp],
        obligations: [obl],
        fiscalYear: 2026,
      });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].description).toContain('cancelled');
    });

    it('ignores obligations from prior fiscal years', () => {
      const approp = makeAppropriation({ id: 'A1', status: 'expired' });
      const obl = makeObligation({ appropriationId: 'A1', fiscalYear: 2024 });
      const data = createMockEngagementData({
        appropriations: [approp],
        obligations: [obl],
        fiscalYear: 2026,
      });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('aggregates total amount across multiple violating obligations', () => {
      const approp = makeAppropriation({ id: 'A1', status: 'expired' });
      const obl1 = makeObligation({ id: 'O1', appropriationId: 'A1', fiscalYear: 2026, amount: 100_000, obligationNumber: 'OBL-001' });
      const obl2 = makeObligation({ id: 'O2', appropriationId: 'A1', fiscalYear: 2026, amount: 200_000, obligationNumber: 'OBL-002' });
      const data = createMockEngagementData({
        appropriations: [approp],
        obligations: [obl1, obl2],
        fiscalYear: 2026,
      });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].amountImpact).toBe(300_000);
    });

    it('truncates obligation list when more than 5 violations', () => {
      const approp = makeAppropriation({ id: 'A1', status: 'expired' });
      const obls = Array.from({ length: 7 }, (_, i) =>
        makeObligation({
          id: `O-${i}`,
          appropriationId: 'A1',
          fiscalYear: 2026,
          amount: 10_000,
          obligationNumber: `OBL-${i}`,
        }),
      );
      const data = createMockEngagementData({
        appropriations: [approp],
        obligations: obls,
        fiscalYear: 2026,
      });
      const findings = rule.check(data);
      expect(findings[0].description).toContain('and 2 more');
    });

    it('does not flag obligations against current appropriations', () => {
      const approp = makeAppropriation({ id: 'A1', status: 'current' });
      const obl = makeObligation({ appropriationId: 'A1', fiscalYear: 2026 });
      const data = createMockEngagementData({
        appropriations: [approp],
        obligations: [obl],
        fiscalYear: 2026,
      });
      expect(rule.check(data)).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // DOD-FMR-V14-007: Bona Fide Need Rule Violation
  // -----------------------------------------------------------------------
  describe('DOD-FMR-V14-007 - Bona Fide Need Rule Violation', () => {
    const rule = getRule('DOD-FMR-V14-007');

    it('returns no findings when bona fide need date is within appropriation period', () => {
      const approp = makeAppropriation({
        id: 'A1',
        fiscalYearStart: '2025-10-01',
        fiscalYearEnd: '2026-09-30',
      });
      const obl = makeObligation({
        appropriationId: 'A1',
        bonafideNeedDate: '2026-03-15',
        obligatedDate: '2026-03-15',
      });
      const data = createMockEngagementData({
        appropriations: [approp],
        obligations: [obl],
      });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('detects bona fide need date before appropriation period start', () => {
      const approp = makeAppropriation({
        id: 'A1',
        fiscalYearStart: '2025-10-01',
        fiscalYearEnd: '2026-09-30',
      });
      const obl = makeObligation({
        appropriationId: 'A1',
        bonafideNeedDate: '2025-08-01',
        obligatedDate: '2025-11-01',
      });
      const data = createMockEngagementData({
        appropriations: [approp],
        obligations: [obl],
      });
      const findings = rule.check(data);
      expect(findings.some(f => f.title === 'Bona Fide Need Rule Violation')).toBe(true);
    });

    it('detects bona fide need date after appropriation period end', () => {
      const approp = makeAppropriation({
        id: 'A1',
        fiscalYearStart: '2025-10-01',
        fiscalYearEnd: '2026-09-30',
      });
      const obl = makeObligation({
        appropriationId: 'A1',
        bonafideNeedDate: '2027-01-15',
        obligatedDate: '2026-05-01',
      });
      const data = createMockEngagementData({
        appropriations: [approp],
        obligations: [obl],
      });
      const findings = rule.check(data);
      expect(findings.some(f => f.title === 'Bona Fide Need Rule Violation')).toBe(true);
    });

    it('detects obligation recorded after appropriation expiration', () => {
      const approp = makeAppropriation({
        id: 'A1',
        expirationDate: '2026-09-30',
      });
      const obl = makeObligation({
        appropriationId: 'A1',
        obligatedDate: '2026-10-15',
      });
      const data = createMockEngagementData({
        appropriations: [approp],
        obligations: [obl],
      });
      const findings = rule.check(data);
      expect(findings.some(f => f.title.includes('Obligation Recorded After Appropriation Expiration'))).toBe(true);
    });

    it('does not flag obligations without bona fide need date', () => {
      const approp = makeAppropriation({ id: 'A1' });
      const obl = makeObligation({
        appropriationId: 'A1',
        bonafideNeedDate: undefined,
        obligatedDate: '2026-03-01',
      });
      const data = createMockEngagementData({
        appropriations: [approp],
        obligations: [obl],
      });
      const findings = rule.check(data);
      // No bona fide need finding because bonafideNeedDate is undefined
      expect(findings.every(f => f.title !== 'Bona Fide Need Rule Violation')).toBe(true);
    });

    it('does not flag obligations without appropriation expiration date for expiration check', () => {
      const approp = makeAppropriation({
        id: 'A1',
        expirationDate: undefined,
      });
      const obl = makeObligation({
        appropriationId: 'A1',
        obligatedDate: '2027-05-01',
      });
      const data = createMockEngagementData({
        appropriations: [approp],
        obligations: [obl],
      });
      const findings = rule.check(data);
      expect(findings.every(f => !f.title.includes('Obligation Recorded After Appropriation Expiration'))).toBe(true);
    });

    it('skips obligations with no matching appropriation', () => {
      const approp = makeAppropriation({ id: 'A1' });
      const obl = makeObligation({
        appropriationId: 'NONEXISTENT',
        bonafideNeedDate: '2020-01-01',
        obligatedDate: '2020-01-01',
      });
      const data = createMockEngagementData({
        appropriations: [approp],
        obligations: [obl],
      });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('can produce both bona fide need and expiration findings for the same obligation', () => {
      const approp = makeAppropriation({
        id: 'A1',
        fiscalYearStart: '2025-10-01',
        fiscalYearEnd: '2026-09-30',
        expirationDate: '2026-09-30',
      });
      const obl = makeObligation({
        appropriationId: 'A1',
        bonafideNeedDate: '2025-05-01', // before FY start
        obligatedDate: '2026-10-15',    // after expiration
      });
      const data = createMockEngagementData({
        appropriations: [approp],
        obligations: [obl],
      });
      const findings = rule.check(data);
      expect(findings.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -----------------------------------------------------------------------
  // DOD-FMR-V14-008: ADA Violation Reporting Timeliness
  // -----------------------------------------------------------------------
  describe('DOD-FMR-V14-008 - ADA Violation Reporting Timeliness', () => {
    const rule = getRule('DOD-FMR-V14-008');

    it('returns no findings when violations are reported within deadline', () => {
      const violation = makeADAViolation({
        discoveredDate: '2026-01-01',
        reportedDate: '2026-01-20', // 19 days < 30 day deadline
        investigationStatus: 'confirmed',
      });
      const data = createMockEngagementData({ adaViolations: [violation] });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('detects late reporting with high severity (31-90 days)', () => {
      const violation = makeADAViolation({
        discoveredDate: '2026-01-01',
        reportedDate: '2026-02-15', // 45 days
        investigationStatus: 'confirmed',
      });
      const data = createMockEngagementData({ adaViolations: [violation] });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('high');
      expect(findings[0].title).toContain('Reporting Delay');
    });

    it('escalates to critical severity for > 90 day delays', () => {
      const violation = makeADAViolation({
        discoveredDate: '2025-07-01',
        reportedDate: '2025-12-01', // ~153 days
        investigationStatus: 'reported_to_president',
      });
      const data = createMockEngagementData({ adaViolations: [violation] });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('critical');
    });

    it('flags confirmed violations with no reported date', () => {
      const violation = makeADAViolation({
        discoveredDate: '2026-01-01',
        reportedDate: undefined,
        investigationStatus: 'confirmed',
      });
      const data = createMockEngagementData({ adaViolations: [violation] });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('critical');
      expect(findings[0].title).toContain('Not Reported');
    });

    it('does not flag violations without a discoveredDate', () => {
      const violation = makeADAViolation({
        discoveredDate: undefined as unknown as string,
        investigationStatus: 'confirmed',
      });
      const data = createMockEngagementData({ adaViolations: [violation] });
      // The rule checks for `if (!violation.discoveredDate) continue;`
      expect(rule.check(data)).toHaveLength(0);
    });

    it('does not flag reported violations that are still under investigation', () => {
      const violation = makeADAViolation({
        discoveredDate: '2026-01-01',
        reportedDate: undefined,
        investigationStatus: 'under_investigation',
      });
      const data = createMockEngagementData({ adaViolations: [violation] });
      // Not confirmed and no reportedDate => no finding from the "no reported date" branch
      expect(rule.check(data)).toHaveLength(0);
    });

    it('boundary: exactly 30 days is not a violation', () => {
      const violation = makeADAViolation({
        discoveredDate: '2026-01-01',
        reportedDate: '2026-01-31', // 30 days
        investigationStatus: 'confirmed',
      });
      const data = createMockEngagementData({ adaViolations: [violation] });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('boundary: 31 days triggers a finding', () => {
      const violation = makeADAViolation({
        discoveredDate: '2026-01-01',
        reportedDate: '2026-02-01', // 31 days
        investigationStatus: 'confirmed',
      });
      const data = createMockEngagementData({ adaViolations: [violation] });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // DOD-FMR-V14-009: ADA Investigation Completion
  // -----------------------------------------------------------------------
  describe('DOD-FMR-V14-009 - ADA Investigation Completion', () => {
    const rule = getRule('DOD-FMR-V14-009');

    it('returns no findings when all investigations are resolved', () => {
      const violation = makeADAViolation({ investigationStatus: 'resolved' });
      const data = createMockEngagementData({ adaViolations: [violation] });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('returns no findings for confirmed violations (not open)', () => {
      const violation = makeADAViolation({ investigationStatus: 'confirmed' });
      const data = createMockEngagementData({ adaViolations: [violation] });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('flags violations in detected status', () => {
      const violation = makeADAViolation({
        investigationStatus: 'detected',
        discoveredDate: '2025-06-01',
        amount: 250_000,
      });
      const data = createMockEngagementData({ adaViolations: [violation] });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('DOD-FMR-V14-009');
      expect(findings[0].title).toContain('ADA Investigation Open');
    });

    it('flags violations in under_investigation status', () => {
      const violation = makeADAViolation({
        investigationStatus: 'under_investigation',
        discoveredDate: '2026-01-01',
      });
      const data = createMockEngagementData({ adaViolations: [violation] });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
    });

    it('escalates to critical when investigation open > 180 days', () => {
      // Use a date far enough in the past
      const violation = makeADAViolation({
        investigationStatus: 'detected',
        discoveredDate: '2025-01-01',
      });
      const data = createMockEngagementData({ adaViolations: [violation] });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      // Since test runs "now", the gap from 2025-01-01 to now is > 180 days
      expect(findings[0].severity).toBe('critical');
    });

    it('uses high severity when investigation open <= 180 days', () => {
      // Use a very recent date
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 30);
      const violation = makeADAViolation({
        investigationStatus: 'under_investigation',
        discoveredDate: recentDate.toISOString().split('T')[0],
      });
      const data = createMockEngagementData({ adaViolations: [violation] });
      const findings = rule.check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe('high');
    });

    it('includes responsible officer in description when present', () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 10);
      const violation = makeADAViolation({
        investigationStatus: 'detected',
        discoveredDate: recentDate.toISOString().split('T')[0],
        responsibleOfficer: 'COL Smith',
      });
      const data = createMockEngagementData({ adaViolations: [violation] });
      const findings = rule.check(data);
      expect(findings[0].description).toContain('COL Smith');
    });

    it('handles multiple open investigations', () => {
      const v1 = makeADAViolation({ id: 'V1', investigationStatus: 'detected', discoveredDate: '2026-01-01' });
      const v2 = makeADAViolation({ id: 'V2', investigationStatus: 'under_investigation', discoveredDate: '2026-01-15' });
      const v3 = makeADAViolation({ id: 'V3', investigationStatus: 'resolved', discoveredDate: '2025-06-01' });
      const data = createMockEngagementData({ adaViolations: [v1, v2, v3] });
      const findings = rule.check(data);
      expect(findings).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // DOD-FMR-V14-010: Corrective Action Monitoring
  // -----------------------------------------------------------------------
  describe('DOD-FMR-V14-010 - Corrective Action Monitoring', () => {
    const rule = getRule('DOD-FMR-V14-010');

    it('returns no findings when all confirmed violations have corrective actions', () => {
      const violation = makeADAViolation({
        investigationStatus: 'confirmed',
        correctiveAction: 'Implemented additional fund controls and retrained staff.',
      });
      // Only 1 unresolved => does not hit the >= 3 aggregate threshold
      const data = createMockEngagementData({ adaViolations: [violation] });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('returns no findings when all violations are resolved', () => {
      const v1 = makeADAViolation({ id: 'V1', investigationStatus: 'resolved', correctiveAction: 'Done' });
      const v2 = makeADAViolation({ id: 'V2', investigationStatus: 'resolved', correctiveAction: 'Done' });
      const data = createMockEngagementData({ adaViolations: [v1, v2] });
      expect(rule.check(data)).toHaveLength(0);
    });

    it('flags confirmed violations without corrective action', () => {
      const violation = makeADAViolation({
        investigationStatus: 'confirmed',
        correctiveAction: undefined,
      });
      const data = createMockEngagementData({ adaViolations: [violation] });
      const findings = rule.check(data);
      expect(findings.some(f => f.title.includes('Without Corrective Action'))).toBe(true);
      expect(findings.some(f => f.severity === 'high')).toBe(true);
    });

    it('flags confirmed violations with empty corrective action string', () => {
      const violation = makeADAViolation({
        investigationStatus: 'confirmed',
        correctiveAction: '   ',
      });
      const data = createMockEngagementData({ adaViolations: [violation] });
      const findings = rule.check(data);
      expect(findings.some(f => f.title.includes('Without Corrective Action'))).toBe(true);
    });

    it('flags reported_to_president violations without corrective action', () => {
      const violation = makeADAViolation({
        investigationStatus: 'reported_to_president',
        correctiveAction: undefined,
      });
      const data = createMockEngagementData({ adaViolations: [violation] });
      const findings = rule.check(data);
      expect(findings.some(f => f.title.includes('Without Corrective Action'))).toBe(true);
    });

    it('generates aggregate finding when >= 3 unresolved violations', () => {
      const violations = [
        makeADAViolation({ id: 'V1', investigationStatus: 'detected', correctiveAction: 'Action taken', amount: 100_000 }),
        makeADAViolation({ id: 'V2', investigationStatus: 'under_investigation', correctiveAction: 'Action taken', amount: 200_000 }),
        makeADAViolation({ id: 'V3', investigationStatus: 'confirmed', correctiveAction: 'Action taken', amount: 300_000 }),
      ];
      const data = createMockEngagementData({ adaViolations: violations });
      const findings = rule.check(data);
      const aggregateFinding = findings.find(f => f.title.includes('Multiple Unresolved'));
      expect(aggregateFinding).toBeDefined();
      expect(aggregateFinding!.severity).toBe('medium');
      expect(aggregateFinding!.amountImpact).toBe(600_000);
    });

    it('does not generate aggregate finding with fewer than 3 unresolved violations', () => {
      const violations = [
        makeADAViolation({ id: 'V1', investigationStatus: 'detected', correctiveAction: 'Done' }),
        makeADAViolation({ id: 'V2', investigationStatus: 'resolved', correctiveAction: 'Done' }),
      ];
      const data = createMockEngagementData({ adaViolations: violations });
      const findings = rule.check(data);
      expect(findings.every(f => !f.title.includes('Multiple Unresolved'))).toBe(true);
    });

    it('includes status breakdown in aggregate finding description', () => {
      const violations = [
        makeADAViolation({ id: 'V1', investigationStatus: 'detected' }),
        makeADAViolation({ id: 'V2', investigationStatus: 'detected' }),
        makeADAViolation({ id: 'V3', investigationStatus: 'confirmed', correctiveAction: 'Done' }),
      ];
      const data = createMockEngagementData({ adaViolations: violations });
      const findings = rule.check(data);
      const aggregate = findings.find(f => f.title.includes('Multiple Unresolved'));
      expect(aggregate).toBeDefined();
      expect(aggregate!.description).toContain('detected');
      expect(aggregate!.description).toContain('confirmed');
    });

    it('can produce both corrective action and aggregate findings together', () => {
      const violations = [
        makeADAViolation({ id: 'V1', investigationStatus: 'confirmed', correctiveAction: undefined, amount: 50_000 }),
        makeADAViolation({ id: 'V2', investigationStatus: 'confirmed', correctiveAction: undefined, amount: 75_000 }),
        makeADAViolation({ id: 'V3', investigationStatus: 'detected', amount: 100_000 }),
      ];
      const data = createMockEngagementData({ adaViolations: violations });
      const findings = rule.check(data);
      const correctiveFindings = findings.filter(f => f.title.includes('Without Corrective Action'));
      const aggregateFindings = findings.filter(f => f.title.includes('Multiple Unresolved'));
      expect(correctiveFindings).toHaveLength(2);
      expect(aggregateFindings).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // Cross-cutting: Finding structure validation
  // -----------------------------------------------------------------------
  describe('finding structure validation', () => {
    it('all findings include the correct engagement ID', () => {
      const data = createMockEngagementData(
        {
          appropriations: [makeAppropriation({ obligated: 15_000_000, totalAuthority: 10_000_000 })],
        },
        { engagementId: 'ENG-STRUCT-TEST' },
      );
      const findings = getRule('DOD-FMR-V14-001').check(data);
      expect(findings).toHaveLength(1);
      expect(findings[0].engagementId).toBe('ENG-STRUCT-TEST');
    });

    it('all findings include a citation referencing the DoD FMR', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 15_000_000, totalAuthority: 10_000_000 })],
      });
      const findings = getRule('DOD-FMR-V14-001').check(data);
      expect(findings[0].citation).toContain('DoD FMR');
    });

    it('all findings include a remediation recommendation', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 15_000_000, totalAuthority: 10_000_000 })],
      });
      const findings = getRule('DOD-FMR-V14-001').check(data);
      expect(findings[0].remediation.length).toBeGreaterThan(0);
    });

    it('all findings have framework set to DOD_FMR', () => {
      const data = createMockEngagementData({
        appropriations: [makeAppropriation({ obligated: 15_000_000, totalAuthority: 10_000_000 })],
      });
      const findings = getRule('DOD-FMR-V14-001').check(data);
      expect(findings[0].framework).toBe('DOD_FMR');
    });
  });
});
