import { describe, it, expect } from 'vitest';
import { evaluateSUD, evaluateRolloverEffect, generateSUDSchedule } from '../adjustment-tracker';
import type { AuditAdjustment } from '../adjustment-tracker';

function makeAdjustment(overrides: Partial<AuditAdjustment> = {}): AuditAdjustment {
  return {
    id: 'adj-1',
    engagementId: 'eng-1',
    adjustmentNumber: 'AJE-001',
    type: 'passed',
    category: 'factual',
    description: 'Test adjustment',
    debitAccountName: 'Accounts Receivable',
    creditAccountName: 'Revenue',
    amount: 10000,
    effectOnIncome: -10000,
    effectOnAssets: -10000,
    effectOnLiabilities: 0,
    effectOnEquity: -10000,
    status: 'waived',
    ...overrides,
  };
}

describe('evaluateSUD', () => {
  it('returns acceptable when no passed adjustments', () => {
    const result = evaluateSUD([], 100000);
    expect(result.conclusion).toBe('acceptable');
    expect(result.totalPassed).toBe(0);
  });

  it('returns acceptable when passed adjustments are below materiality', () => {
    const adjustments = [
      makeAdjustment({ effectOnIncome: -5000 }),
      makeAdjustment({ id: 'adj-2', effectOnIncome: -3000 }),
    ];
    const result = evaluateSUD(adjustments, 100000);
    expect(result.conclusion).toBe('acceptable');
    expect(result.aggregateImpactOnIncome).toBe(8000);
  });

  it('returns material when passed adjustments exceed materiality', () => {
    const adjustments = [
      makeAdjustment({ effectOnIncome: -60000 }),
      makeAdjustment({ id: 'adj-2', effectOnIncome: -50000 }),
    ];
    const result = evaluateSUD(adjustments, 100000);
    expect(result.conclusion).toBe('material');
    expect(result.exceedsMateriality).toBe(true);
  });

  it('returns requires_attention when above performance materiality', () => {
    const adjustments = [
      makeAdjustment({ effectOnIncome: -80000 }),
    ];
    const result = evaluateSUD(adjustments, 100000);
    // 80000 > 75000 (performance mat) but < 100000 (overall)
    expect(result.conclusion).toBe('requires_attention');
    expect(result.exceedsPerformanceMateriality).toBe(true);
    expect(result.exceedsMateriality).toBe(false);
  });

  it('separates adjustments by type correctly', () => {
    const adjustments = [
      makeAdjustment({ type: 'proposed' }),
      makeAdjustment({ id: 'adj-2', type: 'recorded' }),
      makeAdjustment({ id: 'adj-3', type: 'passed' }),
    ];
    const result = evaluateSUD(adjustments, 100000);
    expect(result.totalProposed).toBe(1);
    expect(result.totalRecorded).toBe(1);
    expect(result.totalPassed).toBe(1);
  });

  it('categorizes misstatements by type', () => {
    const adjustments = [
      makeAdjustment({ category: 'factual', amount: 5000 }),
      makeAdjustment({ id: 'adj-2', category: 'judgmental', amount: 3000 }),
      makeAdjustment({ id: 'adj-3', category: 'projected', amount: 7000 }),
    ];
    const result = evaluateSUD(adjustments, 100000);
    expect(result.byCategory.factual.count).toBe(1);
    expect(result.byCategory.judgmental.count).toBe(1);
    expect(result.byCategory.projected.count).toBe(1);
  });
});

describe('evaluateRolloverEffect', () => {
  it('shows no issue when both methods are below materiality', () => {
    const current = [makeAdjustment({ effectOnIncome: -5000 })];
    const prior = [makeAdjustment({ effectOnIncome: -3000 })];
    const result = evaluateRolloverEffect(current, prior, 100000);

    expect(result.rolloverMethod.exceedsMateriality).toBe(false);
    expect(result.ironCurtainMethod.exceedsMateriality).toBe(false);
  });

  it('detects iron curtain issue when cumulative exceeds materiality', () => {
    const current = [makeAdjustment({ effectOnIncome: -60000 })];
    const prior = [makeAdjustment({ effectOnIncome: -50000 })];
    const result = evaluateRolloverEffect(current, prior, 100000);

    expect(result.rolloverMethod.exceedsMateriality).toBe(false);
    expect(result.ironCurtainMethod.exceedsMateriality).toBe(true);
  });
});

describe('generateSUDSchedule', () => {
  it('generates schedule with no passed adjustments', () => {
    const schedule = generateSUDSchedule([], 100000, 'Test Corp', '2025-12-31');
    expect(schedule).toContain('No uncorrected misstatements');
    expect(schedule).toContain('Test Corp');
  });

  it('includes adjustments in schedule', () => {
    const adjustments = [makeAdjustment({ description: 'Revenue overstatement' })];
    const schedule = generateSUDSchedule(adjustments, 100000, 'Test Corp', '2025-12-31');
    expect(schedule).toContain('Revenue overstatement');
    expect(schedule).toContain('Test Corp');
  });
});
