import { describe, it, expect } from 'vitest';
import { assessGoingConcern } from '../going-concern-evaluator';
import type { GoingConcernInput } from '../going-concern-evaluator';

function makeBaseInput(overrides: Partial<GoingConcernInput> = {}): GoingConcernInput {
  return {
    currentRatio: 2.0,
    quickRatio: 1.5,
    workingCapital: 500000,
    debtToEquity: 1.0,
    interestCoverage: 5.0,
    totalDebt: 1000000,
    totalEquity: 1000000,
    cashBalance: 500000,
    operatingCashFlow: 200000,
    netIncome: 150000,
    totalRevenue: 5000000,
    totalAssets: 3000000,
    retainedEarnings: 800000,
    ...overrides,
  };
}

describe('assessGoingConcern', () => {
  it('returns no_substantial_doubt for healthy entity', () => {
    const result = assessGoingConcern(makeBaseInput());
    expect(result.conclusion).toBe('no_substantial_doubt');
    expect(result.opinionImpact).toBe('none');
    expect(result.triggeredIndicatorCount).toBe(0);
  });

  it('detects negative working capital', () => {
    const result = assessGoingConcern(makeBaseInput({
      workingCapital: -100000,
      currentRatio: 0.8,
    }));

    const wcIndicator = result.quantitativeIndicators.find(i => i.name === 'Working Capital');
    expect(wcIndicator?.triggered).toBe(true);
    expect(result.triggeredIndicatorCount).toBeGreaterThan(0);
  });

  it('detects high debt-to-equity ratio', () => {
    const result = assessGoingConcern(makeBaseInput({
      debtToEquity: 5.0,
    }));

    const deIndicator = result.quantitativeIndicators.find(i => i.name === 'Debt-to-Equity Ratio');
    expect(deIndicator?.triggered).toBe(true);
  });

  it('detects negative equity as high severity', () => {
    const result = assessGoingConcern(makeBaseInput({
      totalEquity: -500000,
      debtToEquity: -2,
    }));

    const deIndicator = result.quantitativeIndicators.find(i => i.name === 'Debt-to-Equity Ratio');
    expect(deIndicator?.triggered).toBe(true);
    expect(deIndicator?.severity).toBe('high');
  });

  it('detects recurring losses', () => {
    const result = assessGoingConcern(makeBaseInput({
      netIncome: -200000,
      priorYearNetIncome: -100000,
    }));

    const lossIndicator = result.quantitativeIndicators.find(i => i.name === 'Recurring Net Losses');
    expect(lossIndicator?.triggered).toBe(true);
    expect(lossIndicator?.severity).toBe('high');
  });

  it('returns substantial_doubt_exists for distressed entity', () => {
    const result = assessGoingConcern(makeBaseInput({
      workingCapital: -500000,
      currentRatio: 0.3,
      debtToEquity: 8.0,
      operatingCashFlow: -300000,
      netIncome: -400000,
      priorYearNetIncome: -200000,
      interestCoverage: 0.5,
      retainedEarnings: -2000000,
      cashBalance: 50000,
      loanDefaults: true,
    }));

    expect(result.conclusion).toBe('substantial_doubt_exists');
    expect(result.highSeverityCount).toBeGreaterThan(0);
  });

  it('considers management plans for mitigation', () => {
    const result = assessGoingConcern(makeBaseInput({
      workingCapital: -100000,
      currentRatio: 0.8,
      operatingCashFlow: -50000,
      netIncome: -50000,
      cashBalance: 200000,
      managementPlans: [{
        description: 'New equity round',
        category: 'equity_infusion',
        estimatedImpact: 1000000,
        feasibilityAssessment: 'highly_feasible',
        timeframe: '3 months',
        evidenceObtained: 'Letter of intent from investors',
      }],
    }));

    // With a feasible plan, doubt should be mitigated
    expect(['no_substantial_doubt', 'substantial_doubt_mitigated']).toContain(result.conclusion);
  });

  it('generates 12-month cash flow projections', () => {
    const result = assessGoingConcern(makeBaseInput());
    expect(result.cashFlowProjection.length).toBe(12);
    expect(result.cashFlowProjection[0].month).toBe(1);
    expect(result.cashFlowProjection[11].month).toBe(12);
  });

  it('detects cash shortfall in projections', () => {
    const result = assessGoingConcern(makeBaseInput({
      cashBalance: 10000,
      operatingCashFlow: -500000,
      totalDebt: 2000000,
    }));

    expect(result.cashShortfallProjected).toBe(true);
  });

  it('evaluates qualitative indicators', () => {
    const result = assessGoingConcern(makeBaseInput({
      loanDefaults: true,
      lossOfKeyCustomer: true,
      regulatoryActions: false,
    }));

    expect(result.qualitativeIndicators.length).toBeGreaterThan(0);
    const defaults = result.qualitativeIndicators.find(i => i.name === 'Loan Defaults / Covenant Violations');
    expect(defaults?.present).toBe(true);
    expect(defaults?.severity).toBe('high');
  });
});
