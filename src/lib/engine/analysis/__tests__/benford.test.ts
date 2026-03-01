import { describe, it, expect } from 'vitest';
import { performBenfordAnalysis } from '@/lib/engine/analysis/benford-analysis';

describe('performBenfordAnalysis', () => {
  it('returns digit distribution for valid data', () => {
    // Generate data that roughly follows Benford's Law
    // Using a geometric-like distribution to produce natural first-digit frequencies
    const amounts: number[] = [];
    for (let i = 10; i <= 10000; i++) {
      // Powers and multiples create Benford-like distribution
      amounts.push(i);
    }

    const result = performBenfordAnalysis(amounts);

    expect(result.results.length).toBe(9);
    expect(result.totalNumbers).toBeGreaterThan(0);
    expect(result.chiSquare).toBeGreaterThanOrEqual(0);
    expect(result.description).toBeTruthy();
    expect(['pass', 'warning', 'fail']).toContain(result.conclusion);
  });

  it('returns all 9 digits (1-9) with expected proportions', () => {
    // Generate a large dataset of numbers >= 10
    const amounts: number[] = [];
    for (let i = 10; i <= 10000; i++) {
      amounts.push(i);
    }

    const result = performBenfordAnalysis(amounts);

    expect(result.results).toHaveLength(9);

    const digits = result.results.map((r) => r.digit);
    expect(digits).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    // Each digit should have expected, observed, count, and deviation
    for (const r of result.results) {
      expect(r.expected).toBeGreaterThan(0);
      expect(r.observed).toBeGreaterThanOrEqual(0);
      expect(r.count).toBeGreaterThanOrEqual(0);
      expect(r.totalCount).toBeGreaterThan(0);
      expect(typeof r.deviation).toBe('number');
    }

    // Digit 1 should have the highest expected proportion (Benford's Law)
    const digit1 = result.results.find((r) => r.digit === 1)!;
    expect(digit1.expected).toBeCloseTo(0.30103, 3);
  });

  it('returns empty results for an empty array', () => {
    const result = performBenfordAnalysis([]);

    expect(result.results).toHaveLength(0);
    expect(result.chiSquare).toBe(0);
    expect(result.pValue).toBe(1);
    expect(result.conclusion).toBe('pass');
    expect(result.totalNumbers).toBe(0);
    expect(result.description).toContain('Insufficient data');
  });

  it('returns empty results when all values are below 10', () => {
    const amounts = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const result = performBenfordAnalysis(amounts);

    expect(result.results).toHaveLength(0);
    expect(result.totalNumbers).toBe(0);
    expect(result.description).toContain('Insufficient data');
  });

  it('returns empty results when fewer than 50 valid values', () => {
    const amounts = Array.from({ length: 30 }, (_, i) => (i + 1) * 10);
    const result = performBenfordAnalysis(amounts);

    expect(result.results).toHaveLength(0);
    expect(result.totalNumbers).toBe(30);
    expect(result.description).toContain('Insufficient data');
  });
});
