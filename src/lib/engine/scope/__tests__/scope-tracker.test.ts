import { describe, it, expect } from 'vitest';
import { evaluateScopeLimitations } from '../scope-tracker';
import type { ScopeLimitation } from '../scope-tracker';

function makeLimitation(overrides: Partial<ScopeLimitation> = {}): ScopeLimitation {
  return {
    id: 'sl-1',
    engagementId: 'eng-1',
    description: 'Access to inventory records denied',
    accountsAffected: 'Inventory',
    estimatedImpact: 50000,
    pervasive: false,
    imposedBy: 'client',
    resolved: false,
    identifiedBy: 'user-1',
    identifiedAt: '2026-01-15',
    ...overrides,
  };
}

describe('evaluateScopeLimitations', () => {
  it('returns no impact when no limitations exist', () => {
    const result = evaluateScopeLimitations([], 100000);
    expect(result.opinionImpact).toBe('none');
    expect(result.unresolvedCount).toBe(0);
  });

  it('returns no impact when all limitations are resolved', () => {
    const limitations = [makeLimitation({ resolved: true })];
    const result = evaluateScopeLimitations(limitations, 100000);
    expect(result.opinionImpact).toBe('none');
    expect(result.unresolvedCount).toBe(0);
  });

  it('returns qualified for client-imposed limitation', () => {
    const limitations = [makeLimitation({ estimatedImpact: 50000 })];
    const result = evaluateScopeLimitations(limitations, 100000);
    expect(result.opinionImpact).toBe('qualified');
    expect(result.clientImposedCount).toBe(1);
  });

  it('returns qualified for material impact limitation', () => {
    const limitations = [makeLimitation({
      imposedBy: 'circumstance',
      estimatedImpact: 150000,
    })];
    const result = evaluateScopeLimitations(limitations, 100000);
    expect(result.opinionImpact).toBe('qualified');
  });

  it('returns disclaimer for pervasive limitation', () => {
    const limitations = [makeLimitation({ pervasive: true })];
    const result = evaluateScopeLimitations(limitations, 100000);
    expect(result.opinionImpact).toBe('disclaimer');
    expect(result.pervasiveCount).toBe(1);
  });

  it('returns no impact for immaterial non-client limitation', () => {
    const limitations = [makeLimitation({
      imposedBy: 'circumstance',
      estimatedImpact: 5000,
    })];
    const result = evaluateScopeLimitations(limitations, 100000);
    expect(result.opinionImpact).toBe('none');
  });
});
