import { describe, it, expect } from 'vitest';
import type { Appropriation, FundControl, Obligation } from '@/types/dod-fmr';
import {
  checkFundAvailability,
  recordCommitment,
  recordObligation,
  recordExpenditure,
  recordDisbursement,
  deobligate,
  checkBonafideNeed,
  checkPurposeRestriction,
  checkAmountRestriction,
} from '../fund-control';

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
    committed: 0,
    obligated: 200_000,
    disbursed: 100_000,
    unobligatedBalance: 800_000,
    status: 'current',
    createdAt: '2024-10-01T00:00:00Z',
    ...overrides,
  };
}

function makeFundControl(overrides?: Partial<FundControl>): FundControl {
  return {
    id: 'fc-001',
    appropriationId: 'approp-001',
    controlLevel: 'allotment',
    amount: 500_000,
    obligatedAgainst: 100_000,
    expendedAgainst: 50_000,
    availableBalance: 400_000,
    controlledBy: 'HQDA G-8',
    effectiveDate: '2024-10-01',
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
    amount: 50_000,
    obligatedDate: '2025-03-15T00:00:00Z',
    liquidatedAmount: 0,
    unliquidatedBalance: 50_000,
    adjustmentAmount: 0,
    status: 'open',
    fiscalYear: 2025,
    budgetObjectCode: '2510',
    createdBy: 'system',
    createdAt: '2025-03-15T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Fund Control Engine', () => {
  // =========================================================================
  // checkFundAvailability
  // =========================================================================

  describe('checkFundAvailability', () => {
    it('returns available when sufficient funds exist', () => {
      const approp = makeAppropriation();
      const controls = [makeFundControl()];

      const result = checkFundAvailability(approp, controls, 100_000);

      expect(result.available).toBe(true);
      expect(result.wouldExceed).toBe(false);
      expect(result.appropriationStatus).toBe('current');
    });

    it('returns unavailable when amount exceeds unobligated balance (ADA risk)', () => {
      const approp = makeAppropriation({ unobligatedBalance: 50_000 });
      const controls = [makeFundControl({ availableBalance: 500_000 })];

      const result = checkFundAvailability(approp, controls, 100_000);

      expect(result.available).toBe(false);
      expect(result.wouldExceed).toBe(true);
    });

    it('returns unavailable when amount exceeds apportioned balance', () => {
      const approp = makeAppropriation({
        apportioned: 250_000,
        obligated: 200_000,
        unobligatedBalance: 800_000,
      });
      const controls: FundControl[] = [];

      const result = checkFundAvailability(approp, controls, 100_000);

      expect(result.available).toBe(false);
      expect(result.wouldExceed).toBe(true);
      expect(result.controlLevel).toBe('apportionment');
    });

    it('returns unavailable when amount exceeds allotted balance', () => {
      const approp = makeAppropriation({
        apportioned: 800_000,
        allotted: 250_000,
        obligated: 200_000,
        unobligatedBalance: 800_000,
      });
      const controls: FundControl[] = [];

      const result = checkFundAvailability(approp, controls, 100_000);

      expect(result.available).toBe(false);
      expect(result.wouldExceed).toBe(true);
      expect(result.controlLevel).toBe('allotment');
    });

    it('returns unavailable for cancelled appropriation', () => {
      const approp = makeAppropriation({ status: 'cancelled' });
      const controls: FundControl[] = [];

      const result = checkFundAvailability(approp, controls, 1);

      expect(result.available).toBe(false);
      expect(result.availableBalance).toBe(0);
      expect(result.appropriationStatus).toBe('cancelled');
    });

    it('returns unavailable for expired appropriation', () => {
      const approp = makeAppropriation({ status: 'expired' });
      const controls: FundControl[] = [];

      const result = checkFundAvailability(approp, controls, 1);

      expect(result.available).toBe(false);
      expect(result.appropriationStatus).toBe('expired');
    });

    it('throws when amount is zero or negative', () => {
      const approp = makeAppropriation();
      expect(() => checkFundAvailability(approp, [], 0)).toThrow('Amount must be positive');
      expect(() => checkFundAvailability(approp, [], -100)).toThrow('Amount must be positive');
    });

    it('checks at the most restrictive fund control level', () => {
      const approp = makeAppropriation();
      const controls: FundControl[] = [
        makeFundControl({ id: 'fc-1', controlLevel: 'allotment', availableBalance: 500_000 }),
        makeFundControl({ id: 'fc-2', controlLevel: 'operating_budget', availableBalance: 10_000 }),
      ];

      // Request exceeds operating budget level (10k) but not allotment (500k)
      const result = checkFundAvailability(approp, controls, 20_000);

      expect(result.available).toBe(false);
      expect(result.wouldExceed).toBe(true);
      expect(result.controlLevel).toBe('operating_budget');
    });

    it('works with no fund controls (checks appropriation-level only)', () => {
      const approp = makeAppropriation({
        apportioned: 1_000_000,
        allotted: 1_000_000,
        obligated: 0,
        unobligatedBalance: 1_000_000,
      });

      const result = checkFundAvailability(approp, [], 500_000);

      expect(result.available).toBe(true);
      expect(result.wouldExceed).toBe(false);
    });
  });

  // =========================================================================
  // checkBonafideNeed (time restriction)
  // =========================================================================

  describe('checkBonafideNeed', () => {
    it('returns valid for transaction within one-year appropriation period', () => {
      const approp = makeAppropriation({
        appropriationType: 'one_year',
        fiscalYearStart: '2024-10-01',
        fiscalYearEnd: '2025-09-30',
      });

      const result = checkBonafideNeed(approp, '2025-03-15');

      expect(result.valid).toBe(true);
    });

    it('returns invalid for transaction after one-year appropriation expires', () => {
      const approp = makeAppropriation({
        appropriationType: 'one_year',
        fiscalYearStart: '2024-10-01',
        fiscalYearEnd: '2025-09-30',
      });

      const result = checkBonafideNeed(approp, '2025-10-15');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('returns invalid for transaction before appropriation period starts', () => {
      const approp = makeAppropriation({
        appropriationType: 'one_year',
        fiscalYearStart: '2024-10-01',
        fiscalYearEnd: '2025-09-30',
      });

      const result = checkBonafideNeed(approp, '2024-09-01');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('before');
    });

    it('returns valid for no-year appropriation regardless of date', () => {
      const approp = makeAppropriation({ appropriationType: 'no_year' });

      const result = checkBonafideNeed(approp, '2030-12-31');

      expect(result.valid).toBe(true);
    });

    it('returns valid for revolving fund regardless of date', () => {
      const approp = makeAppropriation({ appropriationType: 'revolving' });

      const result = checkBonafideNeed(approp, '2030-12-31');

      expect(result.valid).toBe(true);
    });

    it('uses expirationDate for multi-year appropriation when provided', () => {
      const approp = makeAppropriation({
        appropriationType: 'multi_year',
        fiscalYearStart: '2024-10-01',
        fiscalYearEnd: '2025-09-30',
        expirationDate: '2026-09-30',
      });

      // Within the multi-year window
      expect(checkBonafideNeed(approp, '2026-05-01').valid).toBe(true);

      // After expiration
      expect(checkBonafideNeed(approp, '2026-10-01').valid).toBe(false);
    });
  });

  // =========================================================================
  // checkPurposeRestriction
  // =========================================================================

  describe('checkPurposeRestriction', () => {
    it('returns valid for O&M BOC on O&M appropriation', () => {
      const approp = makeAppropriation({ budgetCategory: 'om' });

      const result = checkPurposeRestriction(approp, '2510', 'Office supplies');

      expect(result.valid).toBe(true);
    });

    it('returns invalid for procurement BOC on O&M appropriation', () => {
      const approp = makeAppropriation({ budgetCategory: 'om' });

      const result = checkPurposeRestriction(approp, '3110', 'Major equipment purchase');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('procurement');
      expect(result.reason).toContain('31 U.S.C.');
    });

    it('returns invalid for construction BOC on O&M appropriation', () => {
      const approp = makeAppropriation({ budgetCategory: 'om' });

      const result = checkPurposeRestriction(approp, '3310', 'Building construction');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('MILCON');
    });

    it('returns valid with advisory for O&M BOC on procurement appropriation', () => {
      const approp = makeAppropriation({ budgetCategory: 'procurement' });

      const result = checkPurposeRestriction(approp, '2510', 'Operating expense');

      expect(result.valid).toBe(true);
      expect(result.reason).toContain('Advisory');
    });

    it('returns valid for procurement BOC on procurement appropriation', () => {
      const approp = makeAppropriation({ budgetCategory: 'procurement' });

      const result = checkPurposeRestriction(approp, '3110', 'Equipment procurement');

      expect(result.valid).toBe(true);
    });
  });

  // =========================================================================
  // recordObligation
  // =========================================================================

  describe('recordObligation', () => {
    it('records a valid obligation without violations', () => {
      const approp = makeAppropriation({
        apportioned: 800_000,
        allotted: 750_000,
        obligated: 200_000,
        unobligatedBalance: 800_000,
      });
      const controls = [makeFundControl({ availableBalance: 400_000 })];

      const { obligation, violations } = recordObligation(
        approp,
        {
          amount: 50_000,
          obligatedDate: '2025-03-15T00:00:00Z',
          vendorOrPayee: 'Acme Corp',
          documentType: 'contract',
          budgetObjectCode: '2510',
        },
        controls,
      );

      expect(violations).toHaveLength(0);
      expect(obligation.amount).toBe(50_000);
      expect(obligation.status).toBe('open');
      expect(obligation.unliquidatedBalance).toBe(50_000);
      expect(obligation.liquidatedAmount).toBe(0);
    });

    it('produces ADA violation when obligation exceeds available funds', () => {
      const approp = makeAppropriation({
        apportioned: 800_000,
        allotted: 750_000,
        obligated: 200_000,
        unobligatedBalance: 10_000,
      });
      const controls = [makeFundControl({ availableBalance: 400_000 })];

      const { obligation, violations } = recordObligation(
        approp,
        {
          amount: 50_000,
          obligatedDate: '2025-03-15T00:00:00Z',
        },
        controls,
      );

      expect(violations.length).toBeGreaterThan(0);
      const overObligation = violations.find(v => v.violationType === 'over_obligation');
      expect(overObligation).toBeDefined();
      expect(overObligation!.statutoryBasis).toContain('31 U.S.C.');
      // Obligation is still created for tracking
      expect(obligation.amount).toBe(50_000);
    });

    it('produces time violation when obligation is outside period of availability', () => {
      const approp = makeAppropriation({
        appropriationType: 'one_year',
        fiscalYearStart: '2024-10-01',
        fiscalYearEnd: '2025-09-30',
        apportioned: 800_000,
        allotted: 750_000,
        obligated: 200_000,
        unobligatedBalance: 800_000,
      });
      const controls = [makeFundControl({ availableBalance: 400_000 })];

      const { violations } = recordObligation(
        approp,
        {
          amount: 50_000,
          obligatedDate: '2025-10-15T00:00:00Z',
        },
        controls,
      );

      const timeViolation = violations.find(v => v.violationType === 'time_violation');
      expect(timeViolation).toBeDefined();
      expect(timeViolation!.statutoryBasis).toContain('Bona Fide Need');
    });

    it('updates appropriation balances after recording', () => {
      const approp = makeAppropriation({
        apportioned: 800_000,
        allotted: 750_000,
        obligated: 200_000,
        unobligatedBalance: 800_000,
        totalAuthority: 1_000_000,
      });
      const controls = [makeFundControl({ availableBalance: 400_000 })];

      recordObligation(
        approp,
        {
          amount: 100_000,
          obligatedDate: '2025-03-15T00:00:00Z',
        },
        controls,
      );

      expect(approp.obligated).toBe(300_000);
      expect(approp.unobligatedBalance).toBe(700_000);
    });

    it('throws when amount is zero', () => {
      const approp = makeAppropriation();
      expect(() =>
        recordObligation(approp, { amount: 0 }, []),
      ).toThrow('Obligation amount must be positive');
    });
  });

  // =========================================================================
  // recordExpenditure (disbursement against obligation)
  // =========================================================================

  describe('recordExpenditure', () => {
    it('records a valid expenditure and updates obligation', () => {
      const obligation = makeObligation({ amount: 50_000, unliquidatedBalance: 50_000 });
      const approp = makeAppropriation();

      const { updated, violations } = recordExpenditure(obligation, approp, 20_000);

      expect(violations).toHaveLength(0);
      expect(updated.liquidatedAmount).toBe(20_000);
      expect(updated.unliquidatedBalance).toBe(30_000);
      expect(updated.status).toBe('partially_liquidated');
    });

    it('fully liquidates when expenditure equals remaining balance', () => {
      const obligation = makeObligation({ amount: 50_000, unliquidatedBalance: 50_000 });
      const approp = makeAppropriation();

      const { updated } = recordExpenditure(obligation, approp, 50_000);

      expect(updated.liquidatedAmount).toBe(50_000);
      expect(updated.unliquidatedBalance).toBe(0);
      expect(updated.status).toBe('fully_liquidated');
    });

    it('produces ADA violation when expenditure exceeds unliquidated balance', () => {
      const obligation = makeObligation({ amount: 50_000, unliquidatedBalance: 30_000 });
      const approp = makeAppropriation();

      const { updated, violations } = recordExpenditure(obligation, approp, 50_000);

      expect(violations).toHaveLength(1);
      expect(violations[0].violationType).toBe('over_expenditure');
      expect(violations[0].statutoryBasis).toContain('31 U.S.C.');
      // Applied amount is capped at unliquidated balance
      expect(updated.liquidatedAmount).toBe(30_000);
      expect(updated.unliquidatedBalance).toBe(0);
    });

    it('throws when amount is zero or negative', () => {
      const obligation = makeObligation();
      const approp = makeAppropriation();

      expect(() => recordExpenditure(obligation, approp, 0)).toThrow('Expenditure amount must be positive');
      expect(() => recordExpenditure(obligation, approp, -100)).toThrow('Expenditure amount must be positive');
    });

    it('updates appropriation disbursed total', () => {
      const obligation = makeObligation({ amount: 50_000, unliquidatedBalance: 50_000 });
      const approp = makeAppropriation({ disbursed: 100_000 });

      recordExpenditure(obligation, approp, 25_000);

      expect(approp.disbursed).toBe(125_000);
    });
  });

  // =========================================================================
  // recordDisbursement
  // =========================================================================

  describe('recordDisbursement', () => {
    it('records a disbursement with zero interest when paid on time', () => {
      const obligation = makeObligation({
        obligatedDate: '2025-01-01T00:00:00Z',
        fiscalYear: 2025,
      });

      // Pay within 30 days of obligation date
      const disbursement = recordDisbursement(obligation, {
        amount: 25_000,
        disbursementDate: '2025-01-15T00:00:00Z',
      });

      expect(disbursement.amount).toBe(25_000);
      expect(disbursement.interestPenalty).toBe(0);
      expect(disbursement.status).toBe('certified');
      expect(disbursement.paymentMethod).toBe('eft');
    });

    it('computes interest penalty for late payment', () => {
      const obligation = makeObligation({
        obligatedDate: '2025-01-01T00:00:00Z',
        fiscalYear: 2025,
      });

      // Pay 60 days after due date (due date is 30 days after obligation = Jan 31)
      // So payment on April 1 is ~60 days late
      const disbursement = recordDisbursement(obligation, {
        amount: 100_000,
        disbursementDate: '2025-04-01T00:00:00Z',
      });

      expect(disbursement.interestPenalty).toBeGreaterThan(0);
    });

    it('throws when amount is zero', () => {
      const obligation = makeObligation();

      expect(() => recordDisbursement(obligation, { amount: 0 })).toThrow('Disbursement amount must be positive');
    });

    it('assigns disbursement number when not provided', () => {
      const obligation = makeObligation({ fiscalYear: 2025 });

      const disbursement = recordDisbursement(obligation, {
        amount: 10_000,
        disbursementDate: '2025-03-01T00:00:00Z',
      });

      expect(disbursement.disbursementNumber).toMatch(/^DISB-/);
    });

    it('uses the provided prompt pay due date when given', () => {
      const obligation = makeObligation({
        obligatedDate: '2025-01-01T00:00:00Z',
        fiscalYear: 2025,
      });

      const disbursement = recordDisbursement(obligation, {
        amount: 50_000,
        disbursementDate: '2025-01-20T00:00:00Z',
        promptPayDueDate: '2025-02-15T00:00:00Z',
      });

      expect(disbursement.promptPayDueDate).toContain('2025-02-15');
      expect(disbursement.interestPenalty).toBe(0);
    });
  });

  // =========================================================================
  // Prompt Pay interest calculation
  // =========================================================================

  describe('Prompt Pay interest calculation', () => {
    it('uses parameter-driven interest rate for the fiscal year', () => {
      const obligation = makeObligation({
        obligatedDate: '2025-01-01T00:00:00Z',
        fiscalYear: 2025,
      });

      // Force late payment: due date is ~Jan 31, pay on June 1 (~121 days late)
      const disbursement = recordDisbursement(obligation, {
        amount: 100_000,
        disbursementDate: '2025-06-01T00:00:00Z',
      });

      // FY2025 rate is 0.05 (5%)
      // Interest = 100000 * 0.05 * (daysLate / 365) > 0
      // The exact daysLate depends on the 30-day prompt pay offset
      expect(disbursement.interestPenalty).toBeGreaterThan(0);
    });

    it('calculates zero interest when payment is on or before due date', () => {
      const obligation = makeObligation({
        obligatedDate: '2025-06-01T00:00:00Z',
        fiscalYear: 2025,
      });

      // Pay the same day as obligation (well before 30-day due date)
      const disbursement = recordDisbursement(obligation, {
        amount: 50_000,
        disbursementDate: '2025-06-01T00:00:00Z',
      });

      expect(disbursement.interestPenalty).toBe(0);
    });
  });

  // =========================================================================
  // deobligate
  // =========================================================================

  describe('deobligate', () => {
    it('reduces obligation amount and updates balances', () => {
      const obligation = makeObligation({
        amount: 50_000,
        unliquidatedBalance: 50_000,
      });

      const updated = deobligate(obligation, 20_000, 'Scope reduction');

      expect(updated.amount).toBe(30_000);
      expect(updated.unliquidatedBalance).toBe(30_000);
      expect(updated.adjustmentAmount).toBe(20_000);
    });

    it('fully deobligates when amount equals unliquidated balance', () => {
      const obligation = makeObligation({
        amount: 50_000,
        unliquidatedBalance: 50_000,
        liquidatedAmount: 0,
      });

      const updated = deobligate(obligation, 50_000, 'Contract cancelled');

      expect(updated.status).toBe('deobligated');
      expect(updated.unliquidatedBalance).toBe(0);
    });

    it('throws when deobligation amount exceeds unliquidated balance', () => {
      const obligation = makeObligation({ unliquidatedBalance: 30_000 });

      expect(() => deobligate(obligation, 50_000, 'Too much'))
        .toThrow('exceeds unliquidated balance');
    });

    it('throws when amount is zero or negative', () => {
      const obligation = makeObligation();

      expect(() => deobligate(obligation, 0, 'No amount')).toThrow('Deobligation amount must be positive');
      expect(() => deobligate(obligation, -100, 'Negative')).toThrow('Deobligation amount must be positive');
    });

    it('sets status to adjusted when partial deobligation with prior liquidation', () => {
      const obligation = makeObligation({
        amount: 50_000,
        liquidatedAmount: 20_000,
        unliquidatedBalance: 30_000,
      });

      const updated = deobligate(obligation, 10_000, 'Partial deobligation');

      expect(updated.status).toBe('adjusted');
    });
  });

  // =========================================================================
  // checkAmountRestriction
  // =========================================================================

  describe('checkAmountRestriction', () => {
    it('returns valid when amount is within all limits', () => {
      const approp = makeAppropriation({
        apportioned: 800_000,
        allotted: 750_000,
        obligated: 200_000,
        unobligatedBalance: 800_000,
      });
      const controls = [makeFundControl({ availableBalance: 400_000 })];

      const result = checkAmountRestriction(approp, controls, 100_000);

      expect(result.valid).toBe(true);
      expect(result.violation).toBeUndefined();
    });

    it('returns ADA violation when exceeding apportionment', () => {
      const approp = makeAppropriation({
        apportioned: 250_000,
        allotted: 750_000,
        obligated: 200_000,
        unobligatedBalance: 800_000,
      });

      const result = checkAmountRestriction(approp, [], 100_000);

      expect(result.valid).toBe(false);
      expect(result.violation).toBeDefined();
      expect(result.violation!.statutoryBasis).toContain('ss1517');
    });

    it('returns ADA violation when exceeding allotment', () => {
      const approp = makeAppropriation({
        apportioned: 800_000,
        allotted: 250_000,
        obligated: 200_000,
        unobligatedBalance: 800_000,
      });

      const result = checkAmountRestriction(approp, [], 100_000);

      expect(result.valid).toBe(false);
      expect(result.violation).toBeDefined();
      expect(result.violation!.statutoryBasis).toContain('ss1517');
    });

    it('returns ADA violation when exceeding unobligated balance', () => {
      const approp = makeAppropriation({
        apportioned: 800_000,
        allotted: 750_000,
        obligated: 200_000,
        unobligatedBalance: 50_000,
      });

      const result = checkAmountRestriction(approp, [], 100_000);

      expect(result.valid).toBe(false);
      expect(result.violation).toBeDefined();
      expect(result.violation!.statutoryBasis).toContain('ss1341');
    });

    it('returns ADA violation when exceeding fund control available balance', () => {
      const approp = makeAppropriation({
        apportioned: 800_000,
        allotted: 750_000,
        obligated: 200_000,
        unobligatedBalance: 800_000,
      });
      const controls = [makeFundControl({ availableBalance: 50_000 })];

      const result = checkAmountRestriction(approp, controls, 100_000);

      expect(result.valid).toBe(false);
      expect(result.violation).toBeDefined();
      expect(result.violation!.statutoryBasis).toContain('ss1517');
    });

    it('throws when amount is zero or negative', () => {
      const approp = makeAppropriation();
      expect(() => checkAmountRestriction(approp, [], 0)).toThrow('Amount must be positive');
    });
  });

  // =========================================================================
  // recordCommitment
  // =========================================================================

  describe('recordCommitment', () => {
    it('records a valid commitment and returns updated appropriation', () => {
      const approp = makeAppropriation({
        unobligatedBalance: 800_000,
        committed: 0,
      });

      const { updated, committed } = recordCommitment(approp, 100_000, 'Planned purchase');

      expect(committed).toBe(100_000);
      expect(updated.committed).toBe(100_000);
    });

    it('throws when commitment exceeds uncommitted balance', () => {
      const approp = makeAppropriation({
        unobligatedBalance: 100_000,
        committed: 80_000,
      });

      expect(() => recordCommitment(approp, 50_000, 'Too much'))
        .toThrow('Insufficient funds for commitment');
    });

    it('throws when amount is zero or negative', () => {
      const approp = makeAppropriation();
      expect(() => recordCommitment(approp, 0, 'Zero')).toThrow('Commitment amount must be positive');
      expect(() => recordCommitment(approp, -100, 'Negative')).toThrow('Commitment amount must be positive');
    });
  });

  // =========================================================================
  // Fund control hierarchy traversal
  // =========================================================================

  describe('fund control hierarchy traversal', () => {
    it('selects the most restrictive (smallest available balance) control', () => {
      const approp = makeAppropriation({
        apportioned: 1_000_000,
        allotted: 1_000_000,
        obligated: 0,
        unobligatedBalance: 1_000_000,
      });
      const controls: FundControl[] = [
        makeFundControl({ id: 'fc-1', controlLevel: 'apportionment', availableBalance: 500_000 }),
        makeFundControl({ id: 'fc-2', controlLevel: 'allotment', availableBalance: 200_000 }),
        makeFundControl({ id: 'fc-3', controlLevel: 'sub_allotment', availableBalance: 50_000 }),
        makeFundControl({ id: 'fc-4', controlLevel: 'operating_budget', availableBalance: 100_000 }),
      ];

      // 75k exceeds the sub_allotment (50k) - the most restrictive
      const result = checkFundAvailability(approp, controls, 75_000);

      expect(result.available).toBe(false);
      expect(result.wouldExceed).toBe(true);
      expect(result.controlLevel).toBe('sub_allotment');
    });

    it('allows transaction when amount fits within most restrictive control', () => {
      const approp = makeAppropriation({
        apportioned: 1_000_000,
        allotted: 1_000_000,
        obligated: 0,
        unobligatedBalance: 1_000_000,
      });
      const controls: FundControl[] = [
        makeFundControl({ id: 'fc-1', controlLevel: 'allotment', availableBalance: 500_000 }),
        makeFundControl({ id: 'fc-2', controlLevel: 'operating_budget', availableBalance: 100_000 }),
      ];

      const result = checkFundAvailability(approp, controls, 50_000);

      expect(result.available).toBe(true);
    });

    it('ignores fund controls for different appropriations', () => {
      const approp = makeAppropriation({ id: 'approp-001' });
      const controls: FundControl[] = [
        makeFundControl({ appropriationId: 'approp-002', availableBalance: 0 }),
      ];

      // Should not be affected by the other appropriation's control
      const result = checkFundAvailability(approp, controls, 100_000);

      // Only checks appropriation-level balances
      expect(result.appropriationStatus).toBe('current');
    });
  });

  // =========================================================================
  // Expired appropriation behavior
  // =========================================================================

  describe('expired appropriation behavior', () => {
    it('cannot accept new obligations on expired appropriation', () => {
      const approp = makeAppropriation({
        status: 'expired',
        unobligatedBalance: 500_000,
      });

      const result = checkFundAvailability(approp, [], 1_000);

      expect(result.available).toBe(false);
      expect(result.appropriationStatus).toBe('expired');
    });

    it('bona fide need check fails for expired one-year appropriation', () => {
      const approp = makeAppropriation({
        appropriationType: 'one_year',
        fiscalYearStart: '2023-10-01',
        fiscalYearEnd: '2024-09-30',
        status: 'expired',
      });

      const result = checkBonafideNeed(approp, '2025-03-15');

      expect(result.valid).toBe(false);
    });

    it('cancelled appropriation shows zero available balance', () => {
      const approp = makeAppropriation({
        status: 'cancelled',
        unobligatedBalance: 100_000,
      });

      const result = checkFundAvailability(approp, [], 1);

      expect(result.availableBalance).toBe(0);
      expect(result.appropriationStatus).toBe('cancelled');
    });
  });
});
