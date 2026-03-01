import { describe, it, expect } from 'vitest';
import {
  validateTransaction,
  detectOverObligation,
  detectOverExpenditure,
  detectAugmentation,
  generateADAReport,
} from '../ada-monitor';
import type {
  Appropriation,
  FundControl,
  ADAViolation,
  Obligation,
  Disbursement,
} from '@/types/dod-fmr';

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

function makeExpiredAppropriation(overrides: Partial<Appropriation> = {}): Appropriation {
  return makeAppropriation({
    id: 'APPROP-EXP',
    appropriationTitle: 'Expired O&M',
    fiscalYearStart: '2023-10-01',
    fiscalYearEnd: '2024-09-30',
    expirationDate: '2024-09-30',
    status: 'expired',
    totalAuthority: 5_000_000,
    apportioned: 5_000_000,
    allotted: 5_000_000,
    obligated: 4_000_000,
    disbursed: 3_500_000,
    unobligatedBalance: 1_000_000,
    ...overrides,
  });
}

function makeCancelledAppropriation(overrides: Partial<Appropriation> = {}): Appropriation {
  return makeAppropriation({
    id: 'APPROP-CAN',
    appropriationTitle: 'Cancelled O&M',
    fiscalYearStart: '2018-10-01',
    fiscalYearEnd: '2019-09-30',
    expirationDate: '2019-09-30',
    cancellationDate: '2024-09-30',
    status: 'cancelled',
    totalAuthority: 3_000_000,
    apportioned: 3_000_000,
    allotted: 3_000_000,
    obligated: 2_900_000,
    disbursed: 2_900_000,
    unobligatedBalance: 0,
    ...overrides,
  });
}

function makeNoYearAppropriation(overrides: Partial<Appropriation> = {}): Appropriation {
  return makeAppropriation({
    id: 'APPROP-NOYR',
    appropriationType: 'no_year',
    appropriationTitle: 'MILCON, Army (No-Year)',
    expirationDate: undefined,
    cancellationDate: undefined,
    ...overrides,
  });
}

function makeFundControl(overrides: Partial<FundControl> = {}): FundControl {
  return {
    id: 'FC-001',
    appropriationId: 'APPROP-001',
    controlLevel: 'sub_allotment',
    amount: 2_000_000,
    obligatedAgainst: 1_000_000,
    expendedAgainst: 500_000,
    availableBalance: 1_000_000,
    controlledBy: 'HQ FORSCOM Sub-allotment',
    effectiveDate: '2025-10-01',
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
    liquidatedAmount: 50_000,
    unliquidatedBalance: 50_000,
    adjustmentAmount: 0,
    status: 'partially_liquidated',
    fiscalYear: 2026,
    budgetObjectCode: '2510',
    createdBy: 'john.doe',
    createdAt: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

function makeDisbursement(overrides: Partial<Disbursement> = {}): Disbursement {
  return {
    id: 'DISB-001',
    engagementId: 'ENG-001',
    obligationId: 'OBL-001',
    disbursementNumber: 'DISB-2026-0001',
    amount: 25_000,
    disbursementDate: '2026-02-01',
    paymentMethod: 'eft',
    status: 'released',
    discountAmount: 0,
    interestPenalty: 0,
    createdAt: '2026-02-01T00:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// validateTransaction
// ============================================================================

describe('validateTransaction', () => {
  // -----------------------------------------------------------------------
  // Basic validation and error handling
  // -----------------------------------------------------------------------
  describe('input validation', () => {
    it('throws when amount is zero', () => {
      const approp = makeAppropriation();
      expect(() =>
        validateTransaction(approp, [], 0, 'obligation', '2026-03-01'),
      ).toThrow('Transaction amount must be positive');
    });

    it('throws when amount is negative', () => {
      const approp = makeAppropriation();
      expect(() =>
        validateTransaction(approp, [], -1000, 'obligation', '2026-03-01'),
      ).toThrow('Transaction amount must be positive');
    });

    it('throws when transaction date is invalid', () => {
      const approp = makeAppropriation();
      expect(() =>
        validateTransaction(approp, [], 100, 'obligation', 'not-a-date'),
      ).toThrow('Invalid date string');
    });
  });

  // -----------------------------------------------------------------------
  // Happy path: no violations
  // -----------------------------------------------------------------------
  describe('happy path (no violations)', () => {
    it('allows an obligation within unobligated balance', () => {
      const approp = makeAppropriation({ unobligatedBalance: 5_000_000 });
      const result = validateTransaction(approp, [], 1_000_000, 'obligation', '2026-03-01');
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.availableBalance).toBe(5_000_000);
      expect(result.requestedAmount).toBe(1_000_000);
    });

    it('allows an expenditure within obligated-minus-disbursed balance', () => {
      const approp = makeAppropriation({ obligated: 5_000_000, disbursed: 2_000_000 });
      const result = validateTransaction(approp, [], 1_000_000, 'expenditure', '2026-03-01');
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.availableBalance).toBe(3_000_000);
    });

    it('allows a disbursement within obligated-minus-disbursed balance', () => {
      const approp = makeAppropriation({ obligated: 5_000_000, disbursed: 2_000_000 });
      const result = validateTransaction(approp, [], 500_000, 'disbursement', '2026-03-01');
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('allows obligation against no-year appropriation regardless of date', () => {
      const approp = makeNoYearAppropriation({ unobligatedBalance: 5_000_000 });
      const result = validateTransaction(approp, [], 1_000_000, 'obligation', '2035-06-15');
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Amount violations - ss1341(a)(1)(A)
  // -----------------------------------------------------------------------
  describe('amount violations (ss1341)', () => {
    it('detects obligation exceeding unobligated balance', () => {
      const approp = makeAppropriation({ unobligatedBalance: 1_000_000 });
      const result = validateTransaction(approp, [], 1_500_000, 'obligation', '2026-03-01');
      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.violationType === 'over_obligation')).toBe(true);
      const v = result.violations.find(
        v => v.violationType === 'over_obligation' && v.statutoryBasis.includes('1341'),
      );
      expect(v).toBeDefined();
      expect(v!.amount).toBe(500_000);
    });

    it('detects expenditure exceeding available obligated balance', () => {
      const approp = makeAppropriation({ obligated: 5_000_000, disbursed: 4_800_000 });
      const result = validateTransaction(approp, [], 300_000, 'expenditure', '2026-03-01');
      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.violationType === 'over_expenditure')).toBe(true);
      const v = result.violations.find(v => v.violationType === 'over_expenditure');
      expect(v!.amount).toBe(100_000); // 300k - 200k available
    });

    it('detects disbursement exceeding available obligated balance', () => {
      const approp = makeAppropriation({ obligated: 1_000_000, disbursed: 950_000 });
      const result = validateTransaction(approp, [], 100_000, 'disbursement', '2026-03-01');
      expect(result.allowed).toBe(false);
      expect(result.violations.some(v => v.violationType === 'over_expenditure')).toBe(true);
    });

    it('boundary: obligation exactly equal to unobligated balance is allowed', () => {
      const approp = makeAppropriation({ unobligatedBalance: 500_000, apportioned: 0, allotted: 0 });
      const result = validateTransaction(approp, [], 500_000, 'obligation', '2026-03-01');
      // No amount violation (may have other violations disabled by zero apportioned/allotted)
      expect(result.violations.filter(v => v.statutoryBasis.includes('1341'))).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Voluntary service violations - ss1342
  // -----------------------------------------------------------------------
  describe('voluntary service violations (ss1342)', () => {
    it('detects obligation against cancelled appropriation', () => {
      const approp = makeCancelledAppropriation({ totalAuthority: 3_000_000 });
      const result = validateTransaction(approp, [], 100_000, 'obligation', '2026-03-01');
      expect(result.allowed).toBe(false);
      const v = result.violations.find(v => v.violationType === 'voluntary_service');
      expect(v).toBeDefined();
      expect(v!.statutoryBasis).toContain('1342');
      expect(v!.amount).toBe(100_000);
    });

    it('detects obligation against zero-authority appropriation', () => {
      const approp = makeAppropriation({ totalAuthority: 0, status: 'current', apportioned: 0, allotted: 0, unobligatedBalance: 0 });
      const result = validateTransaction(approp, [], 50_000, 'obligation', '2026-03-01');
      const v = result.violations.find(v => v.violationType === 'voluntary_service');
      expect(v).toBeDefined();
    });

    it('does not flag expenditures against cancelled appropriation for ss1342', () => {
      const approp = makeCancelledAppropriation({ obligated: 100_000, disbursed: 0 });
      const result = validateTransaction(approp, [], 50_000, 'expenditure', '2026-03-01');
      expect(result.violations.every(v => v.violationType !== 'voluntary_service')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Apportionment and allotment violations - ss1517(a)
  // -----------------------------------------------------------------------
  describe('apportionment and allotment violations (ss1517)', () => {
    it('detects obligation exceeding apportionment ceiling', () => {
      const approp = makeAppropriation({
        apportioned: 6_000_000,
        obligated: 5_500_000,
        unobligatedBalance: 4_500_000,
        allotted: 0,
      });
      // available apportionment: 6M - 5.5M = 500k
      const result = validateTransaction(approp, [], 800_000, 'obligation', '2026-03-01');
      const v = result.violations.find(v => v.statutoryBasis.includes('apportionment'));
      expect(v).toBeDefined();
      expect(v!.amount).toBe(300_000);
    });

    it('detects obligation exceeding allotment ceiling', () => {
      const approp = makeAppropriation({
        allotted: 7_000_000,
        obligated: 6_800_000,
        unobligatedBalance: 3_200_000,
        apportioned: 0,
      });
      // available allotment: 7M - 6.8M = 200k
      const result = validateTransaction(approp, [], 500_000, 'obligation', '2026-03-01');
      const v = result.violations.find(v => v.statutoryBasis.includes('allotment'));
      expect(v).toBeDefined();
      expect(v!.amount).toBe(300_000);
    });

    it('detects fund control sub-level ceiling breach', () => {
      const approp = makeAppropriation({ apportioned: 0, allotted: 0 });
      const fc = makeFundControl({
        appropriationId: 'APPROP-001',
        controlLevel: 'sub_allotment',
        availableBalance: 200_000,
      });
      const result = validateTransaction(approp, [fc], 300_000, 'obligation', '2026-03-01');
      const v = result.violations.find(v => v.statutoryBasis.includes('sub_allotment'));
      expect(v).toBeDefined();
      expect(v!.amount).toBe(100_000);
    });

    it('only checks fund controls matching the appropriation ID', () => {
      const approp = makeAppropriation({ id: 'APPROP-001', apportioned: 0, allotted: 0 });
      const fc = makeFundControl({
        appropriationId: 'APPROP-OTHER',
        availableBalance: 100,
      });
      const result = validateTransaction(approp, [fc], 500, 'obligation', '2026-03-01');
      // The fund control should not be checked since it belongs to a different appropriation
      expect(result.violations.filter(v => v.statutoryBasis.includes('sub_allotment'))).toHaveLength(0);
    });

    it('does not check apportionment/allotment for expenditure transactions', () => {
      const approp = makeAppropriation({
        apportioned: 6_000_000,
        obligated: 5_800_000,
        disbursed: 2_000_000,
        allotted: 6_000_000,
      });
      const result = validateTransaction(approp, [], 1_000_000, 'expenditure', '2026-03-01');
      expect(result.violations.filter(v => v.statutoryBasis.includes('1517'))).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Time violations - ss1502 (Bona Fide Need)
  // -----------------------------------------------------------------------
  describe('time violations (ss1502)', () => {
    it('detects obligation before appropriation period start', () => {
      const approp = makeAppropriation({
        fiscalYearStart: '2025-10-01',
        fiscalYearEnd: '2026-09-30',
        apportioned: 0,
        allotted: 0,
      });
      const result = validateTransaction(approp, [], 100_000, 'obligation', '2025-09-15');
      const v = result.violations.find(v => v.violationType === 'time_violation');
      expect(v).toBeDefined();
      expect(v!.statutoryBasis).toContain('1502');
    });

    it('detects obligation after appropriation period end', () => {
      const approp = makeAppropriation({
        fiscalYearStart: '2025-10-01',
        fiscalYearEnd: '2026-09-30',
        apportioned: 0,
        allotted: 0,
      });
      const result = validateTransaction(approp, [], 100_000, 'obligation', '2026-10-15');
      const v = result.violations.find(v => v.violationType === 'time_violation');
      expect(v).toBeDefined();
    });

    it('does not check time for no-year appropriations', () => {
      const approp = makeNoYearAppropriation({ apportioned: 0, allotted: 0 });
      const result = validateTransaction(approp, [], 100_000, 'obligation', '2035-06-15');
      expect(result.violations.filter(v => v.violationType === 'time_violation')).toHaveLength(0);
    });

    it('does not check time for revolving fund appropriations', () => {
      const approp = makeAppropriation({
        appropriationType: 'revolving',
        apportioned: 0,
        allotted: 0,
      });
      const result = validateTransaction(approp, [], 100_000, 'obligation', '2035-06-15');
      expect(result.violations.filter(v => v.violationType === 'time_violation')).toHaveLength(0);
    });

    it('does not check time for expenditure transactions', () => {
      const approp = makeAppropriation({
        fiscalYearStart: '2025-10-01',
        fiscalYearEnd: '2026-09-30',
      });
      const result = validateTransaction(approp, [], 100_000, 'expenditure', '2027-06-15');
      expect(result.violations.filter(v => v.violationType === 'time_violation')).toHaveLength(0);
    });

    it('uses expirationDate if set instead of fiscalYearEnd for time check', () => {
      const approp = makeAppropriation({
        fiscalYearStart: '2025-10-01',
        fiscalYearEnd: '2026-09-30',
        expirationDate: '2027-09-30', // multi-year style
        apportioned: 0,
        allotted: 0,
      });
      // Obligation in 2027 is within expirationDate
      const result = validateTransaction(approp, [], 100_000, 'obligation', '2027-03-15');
      expect(result.violations.filter(v => v.violationType === 'time_violation')).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Purpose violations - expired appropriation
  // -----------------------------------------------------------------------
  describe('purpose violations (expired appropriation)', () => {
    it('detects new obligation against expired appropriation', () => {
      const approp = makeExpiredAppropriation();
      const result = validateTransaction(approp, [], 50_000, 'obligation', '2026-03-01');
      const v = result.violations.find(v => v.violationType === 'unauthorized_purpose');
      expect(v).toBeDefined();
      expect(v!.statutoryBasis).toContain('1502');
      expect(v!.description).toContain('expired');
    });

    it('does not flag expenditure against expired appropriation for purpose', () => {
      const approp = makeExpiredAppropriation({ obligated: 100_000, disbursed: 0 });
      const result = validateTransaction(approp, [], 50_000, 'expenditure', '2026-03-01');
      expect(result.violations.filter(v => v.violationType === 'unauthorized_purpose')).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Multiple violations at once
  // -----------------------------------------------------------------------
  describe('multiple violations in a single transaction', () => {
    it('detects amount + time + purpose for obligation against expired appropriation outside period', () => {
      const approp = makeExpiredAppropriation({
        unobligatedBalance: 100,
        apportioned: 5_000_000,
        obligated: 4_000_000,
        allotted: 0,
      });
      // Large obligation, outside time period, against expired appropriation
      const result = validateTransaction(approp, [], 2_000_000, 'obligation', '2026-03-01');
      expect(result.allowed).toBe(false);
      // Should have at least: over_obligation (amount > unobligated), time_violation, unauthorized_purpose
      const types = result.violations.map(v => v.violationType);
      expect(types).toContain('over_obligation');
      expect(types).toContain('time_violation');
      expect(types).toContain('unauthorized_purpose');
    });

    it('detects voluntary_service + amount violations for cancelled appropriation', () => {
      const approp = makeCancelledAppropriation({
        totalAuthority: 3_000_000,
        unobligatedBalance: 0,
        apportioned: 0,
        allotted: 0,
      });
      const result = validateTransaction(approp, [], 500_000, 'obligation', '2026-03-01');
      expect(result.allowed).toBe(false);
      const types = result.violations.map(v => v.violationType);
      expect(types).toContain('voluntary_service');
      expect(types).toContain('over_obligation');
    });
  });

  // -----------------------------------------------------------------------
  // Result structure
  // -----------------------------------------------------------------------
  describe('result structure', () => {
    it('returns correct availableBalance for obligation', () => {
      const approp = makeAppropriation({ unobligatedBalance: 3_000_000 });
      const result = validateTransaction(approp, [], 1_000_000, 'obligation', '2026-03-01');
      expect(result.availableBalance).toBe(3_000_000);
    });

    it('returns correct availableBalance for expenditure', () => {
      const approp = makeAppropriation({ obligated: 5_000_000, disbursed: 2_000_000 });
      const result = validateTransaction(approp, [], 1_000_000, 'expenditure', '2026-03-01');
      expect(result.availableBalance).toBe(3_000_000);
    });

    it('returns the requested amount', () => {
      const approp = makeAppropriation();
      const result = validateTransaction(approp, [], 777_777, 'obligation', '2026-03-01');
      expect(result.requestedAmount).toBe(777_777);
    });

    it('violations include engagementId and appropriationId', () => {
      const approp = makeAppropriation({ engagementId: 'ENG-X', id: 'APP-Y', unobligatedBalance: 0, apportioned: 0, allotted: 0 });
      const result = validateTransaction(approp, [], 1000, 'obligation', '2026-03-01');
      for (const v of result.violations) {
        expect(v.engagementId).toBe('ENG-X');
        expect(v.appropriationId).toBe('APP-Y');
      }
    });

    it('violations have investigation status of detected', () => {
      const approp = makeAppropriation({ unobligatedBalance: 0, apportioned: 0, allotted: 0 });
      const result = validateTransaction(approp, [], 1000, 'obligation', '2026-03-01');
      for (const v of result.violations) {
        expect(v.investigationStatus).toBe('detected');
      }
    });
  });
});

// ============================================================================
// detectOverObligation
// ============================================================================

describe('detectOverObligation', () => {
  it('returns empty when obligations are within authority', () => {
    const approp = makeAppropriation({ obligated: 5_000_000, totalAuthority: 10_000_000 });
    expect(detectOverObligation(approp)).toHaveLength(0);
  });

  it('returns empty when obligations equal authority exactly', () => {
    const approp = makeAppropriation({ obligated: 10_000_000, totalAuthority: 10_000_000 });
    expect(detectOverObligation(approp)).toHaveLength(0);
  });

  it('detects over-obligation against total authority', () => {
    const approp = makeAppropriation({ obligated: 12_000_000, totalAuthority: 10_000_000 });
    const violations = detectOverObligation(approp);
    expect(violations.some(v => v.statutoryBasis.includes('1341'))).toBe(true);
    const v = violations.find(v => v.statutoryBasis.includes('1341'));
    expect(v!.amount).toBe(2_000_000);
    expect(v!.violationType).toBe('over_obligation');
  });

  it('detects over-obligation against apportionment ceiling', () => {
    const approp = makeAppropriation({
      obligated: 8_000_000,
      totalAuthority: 10_000_000,
      apportioned: 7_000_000,
    });
    const violations = detectOverObligation(approp);
    const v = violations.find(v => v.statutoryBasis.includes('apportionment'));
    expect(v).toBeDefined();
    expect(v!.amount).toBe(1_000_000);
  });

  it('detects over-obligation against allotment ceiling', () => {
    const approp = makeAppropriation({
      obligated: 9_000_000,
      totalAuthority: 10_000_000,
      allotted: 8_000_000,
    });
    const violations = detectOverObligation(approp);
    const v = violations.find(v => v.statutoryBasis.includes('allotment'));
    expect(v).toBeDefined();
    expect(v!.amount).toBe(1_000_000);
  });

  it('can detect violations at all three levels simultaneously', () => {
    const approp = makeAppropriation({
      obligated: 12_000_000,
      totalAuthority: 10_000_000,
      apportioned: 9_000_000,
      allotted: 8_000_000,
    });
    const violations = detectOverObligation(approp);
    expect(violations.length).toBe(3);
  });

  it('does not flag apportionment when apportioned is 0', () => {
    const approp = makeAppropriation({
      obligated: 12_000_000,
      totalAuthority: 10_000_000,
      apportioned: 0,
      allotted: 0,
    });
    const violations = detectOverObligation(approp);
    expect(violations).toHaveLength(1); // only total authority
  });

  it('boundary: $1 over total authority triggers violation', () => {
    const approp = makeAppropriation({ obligated: 10_000_001, totalAuthority: 10_000_000, apportioned: 0, allotted: 0 });
    const violations = detectOverObligation(approp);
    expect(violations).toHaveLength(1);
    expect(violations[0].amount).toBe(1);
  });
});

// ============================================================================
// detectOverExpenditure
// ============================================================================

describe('detectOverExpenditure', () => {
  it('returns empty when liquidated amounts are within obligation amounts', () => {
    const obligations = [
      makeObligation({ amount: 100_000, liquidatedAmount: 50_000 }),
    ];
    expect(detectOverExpenditure(obligations, [])).toHaveLength(0);
  });

  it('detects obligation with liquidated amount exceeding obligation amount', () => {
    const obligations = [
      makeObligation({ id: 'O1', amount: 100_000, liquidatedAmount: 120_000, obligationNumber: 'OBL-001' }),
    ];
    const violations = detectOverExpenditure(obligations, []);
    expect(violations).toHaveLength(1);
    expect(violations[0].violationType).toBe('over_expenditure');
    expect(violations[0].amount).toBe(20_000);
    expect(violations[0].description).toContain('OBL-001');
  });

  it('detects over-disbursement via disbursement cross-reference', () => {
    const obligations = [
      makeObligation({ id: 'O1', amount: 100_000, liquidatedAmount: 80_000, obligationNumber: 'OBL-001' }),
    ];
    const disbursements = [
      makeDisbursement({ obligationId: 'O1', amount: 60_000, status: 'released' }),
      makeDisbursement({ obligationId: 'O1', amount: 50_000, status: 'released' }),
    ];
    // Total disbursed = 110_000 > 100_000 obligation
    const violations = detectOverExpenditure(obligations, disbursements);
    expect(violations.some(v => v.description.includes('disbursements'))).toBe(true);
  });

  it('ignores cancelled disbursements', () => {
    const obligations = [
      makeObligation({ id: 'O1', amount: 100_000, liquidatedAmount: 50_000 }),
    ];
    const disbursements = [
      makeDisbursement({ obligationId: 'O1', amount: 60_000, status: 'released' }),
      makeDisbursement({ obligationId: 'O1', amount: 60_000, status: 'cancelled' }),
    ];
    const violations = detectOverExpenditure(obligations, disbursements);
    // Only 60k released against 100k obligation: no violation
    expect(violations).toHaveLength(0);
  });

  it('ignores returned disbursements', () => {
    const obligations = [
      makeObligation({ id: 'O1', amount: 100_000, liquidatedAmount: 50_000 }),
    ];
    const disbursements = [
      makeDisbursement({ obligationId: 'O1', amount: 80_000, status: 'released' }),
      makeDisbursement({ obligationId: 'O1', amount: 80_000, status: 'returned' }),
    ];
    const violations = detectOverExpenditure(obligations, disbursements);
    expect(violations).toHaveLength(0);
  });

  it('does not double-count when both liquidation and disbursement checks detect the same obligation', () => {
    const obligations = [
      makeObligation({ id: 'O1', amount: 100_000, liquidatedAmount: 120_000, obligationNumber: 'OBL-001' }),
    ];
    const disbursements = [
      makeDisbursement({ obligationId: 'O1', amount: 120_000, status: 'released' }),
    ];
    const violations = detectOverExpenditure(obligations, disbursements);
    // The disbursement check should not duplicate the liquidation check finding
    const overExpenditureViolations = violations.filter(v => v.violationType === 'over_expenditure');
    // Should only be 1 since the de-dup logic checks description for obligationNumber
    expect(overExpenditureViolations).toHaveLength(1);
  });

  it('handles multiple obligations independently', () => {
    const obligations = [
      makeObligation({ id: 'O1', amount: 100_000, liquidatedAmount: 120_000, obligationNumber: 'OBL-001' }),
      makeObligation({ id: 'O2', amount: 200_000, liquidatedAmount: 150_000, obligationNumber: 'OBL-002' }),
      makeObligation({ id: 'O3', amount: 50_000, liquidatedAmount: 80_000, obligationNumber: 'OBL-003' }),
    ];
    const violations = detectOverExpenditure(obligations, []);
    expect(violations).toHaveLength(2); // O1 and O3
  });

  it('handles empty inputs', () => {
    expect(detectOverExpenditure([], [])).toHaveLength(0);
  });

  it('handles disbursements referencing non-existent obligations', () => {
    const disbursements = [
      makeDisbursement({ obligationId: 'NONEXISTENT', amount: 50_000 }),
    ];
    expect(detectOverExpenditure([], disbursements)).toHaveLength(0);
  });
});

// ============================================================================
// detectAugmentation
// ============================================================================

describe('detectAugmentation', () => {
  it('returns empty when collections are within authorized level', () => {
    const approp = makeAppropriation();
    expect(detectAugmentation(approp, 500_000, 1_000_000)).toHaveLength(0);
  });

  it('returns empty when collections equal authorized level', () => {
    const approp = makeAppropriation();
    expect(detectAugmentation(approp, 1_000_000, 1_000_000)).toHaveLength(0);
  });

  it('detects augmentation when collections exceed authorized level', () => {
    const approp = makeAppropriation();
    const violations = detectAugmentation(approp, 1_500_000, 1_000_000);
    expect(violations).toHaveLength(1);
    expect(violations[0].violationType).toBe('unauthorized_purpose');
    expect(violations[0].statutoryBasis).toContain('3302');
    expect(violations[0].amount).toBe(500_000);
  });

  it('throws for negative collections', () => {
    const approp = makeAppropriation();
    expect(() => detectAugmentation(approp, -100, 1_000_000)).toThrow(
      'Collections amount cannot be negative',
    );
  });

  it('throws for negative authorized collections', () => {
    const approp = makeAppropriation();
    expect(() => detectAugmentation(approp, 100, -1)).toThrow(
      'Authorized collections amount cannot be negative',
    );
  });

  it('handles zero collections and zero authorized', () => {
    const approp = makeAppropriation();
    expect(detectAugmentation(approp, 0, 0)).toHaveLength(0);
  });

  it('boundary: $1 over authorized triggers violation', () => {
    const approp = makeAppropriation();
    const violations = detectAugmentation(approp, 1_000_001, 1_000_000);
    expect(violations).toHaveLength(1);
    expect(violations[0].amount).toBe(1);
  });

  it('includes TAS in violation description', () => {
    const approp = makeAppropriation({ treasuryAccountSymbol: '021-1804' });
    const violations = detectAugmentation(approp, 2_000_000, 1_000_000);
    expect(violations[0].description).toContain('021-1804');
  });
});

// ============================================================================
// generateADAReport
// ============================================================================

describe('generateADAReport', () => {
  it('generates a clean report when no violations exist', () => {
    const report = generateADAReport([], 'ENG-001', 2026);
    expect(report.totalViolations).toBe(0);
    expect(report.byType).toEqual({});
    expect(report.totalAmount).toBe(0);
    expect(report.criticalViolations).toHaveLength(0);
    expect(report.summary).toContain('No Anti-Deficiency Act violations detected');
    expect(report.summary).toContain('ENG-001');
    expect(report.summary).toContain('FY2026');
  });

  it('correctly aggregates violations by type', () => {
    const violations: ADAViolation[] = [
      { ...makeViolation('over_obligation', 100_000), engagementId: 'ENG-001', fiscalYear: 2026 },
      { ...makeViolation('over_obligation', 200_000), engagementId: 'ENG-001', fiscalYear: 2026 },
      { ...makeViolation('time_violation', 50_000), engagementId: 'ENG-001', fiscalYear: 2026 },
    ];
    const report = generateADAReport(violations, 'ENG-001', 2026);
    expect(report.totalViolations).toBe(3);
    expect(report.byType['over_obligation']).toBe(2);
    expect(report.byType['time_violation']).toBe(1);
    expect(report.totalAmount).toBe(350_000);
  });

  it('identifies critical violations (over_obligation and over_expenditure)', () => {
    const violations: ADAViolation[] = [
      { ...makeViolation('over_obligation', 100_000), engagementId: 'ENG-001', fiscalYear: 2026 },
      { ...makeViolation('over_expenditure', 200_000), engagementId: 'ENG-001', fiscalYear: 2026 },
      { ...makeViolation('time_violation', 50_000), engagementId: 'ENG-001', fiscalYear: 2026 },
      { ...makeViolation('unauthorized_purpose', 30_000), engagementId: 'ENG-001', fiscalYear: 2026 },
    ];
    const report = generateADAReport(violations, 'ENG-001', 2026);
    expect(report.criticalViolations).toHaveLength(2);
    expect(report.criticalViolations.every(
      v => v.violationType === 'over_obligation' || v.violationType === 'over_expenditure',
    )).toBe(true);
  });

  it('filters by engagement ID', () => {
    const violations: ADAViolation[] = [
      { ...makeViolation('over_obligation', 100_000), engagementId: 'ENG-001', fiscalYear: 2026 },
      { ...makeViolation('over_obligation', 200_000), engagementId: 'ENG-OTHER', fiscalYear: 2026 },
    ];
    const report = generateADAReport(violations, 'ENG-001', 2026);
    expect(report.totalViolations).toBe(1);
    expect(report.totalAmount).toBe(100_000);
  });

  it('filters by fiscal year', () => {
    const violations: ADAViolation[] = [
      { ...makeViolation('over_obligation', 100_000), engagementId: 'ENG-001', fiscalYear: 2026 },
      { ...makeViolation('over_obligation', 200_000), engagementId: 'ENG-001', fiscalYear: 2025 },
    ];
    const report = generateADAReport(violations, 'ENG-001', 2026);
    expect(report.totalViolations).toBe(1);
    expect(report.totalAmount).toBe(100_000);
  });

  it('includes reporting language in summary when critical violations exist', () => {
    const violations: ADAViolation[] = [
      { ...makeViolation('over_obligation', 100_000), engagementId: 'ENG-001', fiscalYear: 2026 },
    ];
    const report = generateADAReport(violations, 'ENG-001', 2026);
    expect(report.summary).toContain('1351');
    expect(report.summary).toContain('critical');
  });

  it('does not include critical-violation language when only non-critical violations exist', () => {
    const violations: ADAViolation[] = [
      { ...makeViolation('time_violation', 50_000), engagementId: 'ENG-001', fiscalYear: 2026 },
    ];
    const report = generateADAReport(violations, 'ENG-001', 2026);
    expect(report.summary).not.toContain('critical violation');
  });

  it('includes type breakdown in summary', () => {
    const violations: ADAViolation[] = [
      { ...makeViolation('over_obligation', 100_000), engagementId: 'ENG-001', fiscalYear: 2026 },
      { ...makeViolation('time_violation', 50_000), engagementId: 'ENG-001', fiscalYear: 2026 },
    ];
    const report = generateADAReport(violations, 'ENG-001', 2026);
    expect(report.summary).toContain('over_obligation: 1');
    expect(report.summary).toContain('time_violation: 1');
  });

  it('always references the ADA reporting chain in summary when violations exist', () => {
    const violations: ADAViolation[] = [
      { ...makeViolation('unauthorized_purpose', 10_000), engagementId: 'ENG-001', fiscalYear: 2026 },
    ];
    const report = generateADAReport(violations, 'ENG-001', 2026);
    expect(report.summary).toContain('Agency Head');
    expect(report.summary).toContain('OMB');
    expect(report.summary).toContain('President');
    expect(report.summary).toContain('Congress');
  });
});

// ---------------------------------------------------------------------------
// Helper for generateADAReport tests
// ---------------------------------------------------------------------------

function makeViolation(
  violationType: ADAViolation['violationType'],
  amount: number,
): ADAViolation {
  return {
    id: `ADAV-${Math.random().toString(36).substring(2, 8)}`,
    engagementId: 'ENG-001',
    appropriationId: 'APPROP-001',
    violationType,
    statutoryBasis: '31 U.S.C.',
    amount,
    description: `Test violation: ${violationType}`,
    discoveredDate: '2026-01-20',
    investigationStatus: 'detected',
    fiscalYear: 2026,
    createdAt: '2026-01-20T00:00:00Z',
  };
}
