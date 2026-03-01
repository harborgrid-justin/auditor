import { describe, it, expect } from 'vitest';
import { generateCoverageMatrix, getDefaultCoverageEntries } from '../assertion-coverage';
import type { AssertionCoverageEntry } from '../assertion-coverage';

describe('generateCoverageMatrix', () => {
  const accounts = [
    { accountName: 'Cash', accountType: 'asset', endingBalance: 500000 },
    { accountName: 'Revenue', accountType: 'revenue', endingBalance: 2000000 },
    { accountName: 'Supplies', accountType: 'asset', endingBalance: 1000 },
  ];

  it('identifies gaps in material accounts with no coverage', () => {
    const result = generateCoverageMatrix(accounts, [], 100000);

    // Cash and Revenue are material (above 100k), Supplies is not
    expect(result.gaps.length).toBe(2);
    expect(result.readyForOpinion).toBe(false);
    expect(result.materialAccountCoverageRate).toBe(0);
  });

  it('reports ready when all material accounts are covered', () => {
    const entries: AssertionCoverageEntry[] = [];
    // Generate coverage for Cash (asset) and Revenue (revenue)
    const cashEntries = getDefaultCoverageEntries('Cash', 'asset', 'Auditor');
    const revenueEntries = getDefaultCoverageEntries('Revenue', 'revenue', 'Auditor');

    // Mark all as completed
    for (const e of [...cashEntries, ...revenueEntries]) {
      entries.push({ ...e, status: 'completed' });
    }

    const result = generateCoverageMatrix(accounts, entries, 100000);
    expect(result.gaps.length).toBe(0);
    expect(result.readyForOpinion).toBe(true);
    expect(result.materialAccountCoverageRate).toBe(1);
  });

  it('handles accounts with zero balance as non-material', () => {
    const zeroAccounts = [
      { accountName: 'Goodwill', accountType: 'asset', endingBalance: 0 },
    ];
    const result = generateCoverageMatrix(zeroAccounts, [], 100000);
    expect(result.gaps.length).toBe(0); // Non-material accounts don't create gaps
  });
});

describe('getDefaultCoverageEntries', () => {
  it('generates entries for all required assertions for asset accounts', () => {
    const entries = getDefaultCoverageEntries('Cash', 'asset', 'Auditor');
    // Asset should have: existence, completeness, valuation, rights_obligations, presentation_disclosure
    expect(entries.length).toBe(5);
    expect(entries.every(e => e.status === 'planned')).toBe(true);
    expect(entries.every(e => e.coveredBy === 'Auditor')).toBe(true);
  });

  it('generates entries for revenue accounts', () => {
    const entries = getDefaultCoverageEntries('Sales Revenue', 'revenue', 'Auditor');
    // Revenue should have: existence, completeness, accuracy, cutoff, classification
    expect(entries.length).toBe(5);
    const assertions = entries.map(e => e.assertion);
    expect(assertions).toContain('existence');
    expect(assertions).toContain('completeness');
    expect(assertions).toContain('accuracy');
    expect(assertions).toContain('cutoff');
    expect(assertions).toContain('classification');
  });
});
