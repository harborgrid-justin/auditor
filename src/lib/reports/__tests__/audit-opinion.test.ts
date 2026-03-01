import { describe, it, expect } from 'vitest';
import { determineOpinion } from '@/lib/reports/audit-opinion';
import type { AuditOpinionData } from '@/lib/reports/audit-opinion';

function makeBaseData(overrides: Partial<AuditOpinionData> = {}): AuditOpinionData {
  return {
    entityName: 'Acme Corporation',
    fiscalYearEnd: '2025-12-31',
    findings: [],
    controls: [],
    materialityThreshold: 100000,
    generatedAt: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

describe('determineOpinion', () => {
  it('returns unqualified when no material weaknesses and no critical findings', () => {
    const data = makeBaseData({
      findings: [
        { severity: 'low', framework: 'GAAP', amountImpact: 500, status: 'resolved' },
      ],
      controls: [
        { status: 'effective' },
        { status: 'effective' },
      ],
    });

    const result = determineOpinion(data);

    expect(result.opinionType).toBe('unqualified');
    expect(result.opinionLabel).toBe('Unqualified (Clean) Opinion');
    expect(result.factors.materialWeaknessCount).toBe(0);
    expect(result.factors.unresolvedCriticalFindings).toBe(0);
  });

  it('returns qualified when there are material weaknesses', () => {
    const data = makeBaseData({
      findings: [
        { severity: 'high', framework: 'GAAP', amountImpact: 50000, status: 'open' },
      ],
      controls: [
        { status: 'material_weakness' },
        { status: 'effective' },
      ],
    });

    const result = determineOpinion(data);

    expect(result.opinionType).toBe('qualified');
    expect(result.opinionLabel).toBe('Qualified Opinion');
    expect(result.factors.materialWeaknessCount).toBe(1);
  });

  it('returns adverse when there are 3 or more material weaknesses', () => {
    const data = makeBaseData({
      findings: [
        { severity: 'critical', framework: 'GAAP', amountImpact: 500000, status: 'open' },
        { severity: 'critical', framework: 'SOX', amountImpact: 300000, status: 'open' },
      ],
      controls: [
        { status: 'material_weakness' },
        { status: 'material_weakness' },
        { status: 'material_weakness' },
      ],
    });

    const result = determineOpinion(data);

    expect(result.opinionType).toBe('adverse');
    expect(result.opinionLabel).toBe('Adverse Opinion');
    expect(result.factors.materialWeaknessCount).toBe(3);
  });

  it('contains the entity name in the draft text', () => {
    const data = makeBaseData({ entityName: 'Test Entity LLC' });

    const result = determineOpinion(data);

    expect(result.draftText).toContain('Test Entity LLC');
  });

  it('returns qualified for unresolved critical findings exceeding materiality', () => {
    const data = makeBaseData({
      findings: [
        { severity: 'critical', framework: 'GAAP', amountImpact: 200000, status: 'open' },
      ],
      controls: [
        { status: 'effective' },
      ],
      materialityThreshold: 100000,
    });

    const result = determineOpinion(data);

    expect(result.opinionType).toBe('qualified');
    expect(result.factors.exceedsMateriality).toBe(true);
    expect(result.factors.unresolvedCriticalFindings).toBe(1);
  });
});
