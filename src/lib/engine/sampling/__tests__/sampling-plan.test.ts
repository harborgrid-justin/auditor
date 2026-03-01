import { describe, it, expect } from 'vitest';
import {
  calculateAttributeSampleSize,
  calculateMUSSampleSize,
  selectRandomSample,
  selectSystematicSample,
  selectMUSSample,
  evaluateAttributeSample,
  evaluateMUSSample,
} from '../sampling-plan';

describe('calculateAttributeSampleSize', () => {
  it('returns correct sample size for standard parameters (95% confidence, 5% tolerable)', () => {
    const result = calculateAttributeSampleSize({
      populationSize: 5000,
      confidenceLevel: 0.95,
      tolerableRate: 0.05,
      expectedDeviationRate: 0.01,
    });

    expect(result.sampleSize).toBeGreaterThanOrEqual(25);
    expect(result.sampleSize).toBeLessThanOrEqual(150);
    expect(result.method).toBe('attribute');
    expect(result.rationale).toContain('95%');
  });

  it('returns larger sample for lower tolerable rate', () => {
    const low = calculateAttributeSampleSize({
      populationSize: 5000,
      confidenceLevel: 0.95,
      tolerableRate: 0.05,
      expectedDeviationRate: 0.01,
    });
    const high = calculateAttributeSampleSize({
      populationSize: 5000,
      confidenceLevel: 0.95,
      tolerableRate: 0.10,
      expectedDeviationRate: 0.01,
    });

    expect(low.sampleSize).toBeGreaterThan(high.sampleSize);
  });

  it('applies finite population correction for small populations', () => {
    const result = calculateAttributeSampleSize({
      populationSize: 100,
      confidenceLevel: 0.95,
      tolerableRate: 0.05,
      expectedDeviationRate: 0.00,
    });

    expect(result.sampleSize).toBeLessThanOrEqual(100);
  });

  it('enforces minimum sample size of 25', () => {
    const result = calculateAttributeSampleSize({
      populationSize: 30,
      confidenceLevel: 0.90,
      tolerableRate: 0.10,
      expectedDeviationRate: 0.00,
    });

    expect(result.sampleSize).toBeGreaterThanOrEqual(25);
  });
});

describe('calculateMUSSampleSize', () => {
  it('returns correct MUS sample size', () => {
    const result = calculateMUSSampleSize({
      populationSize: 1000,
      populationValue: 10000000,
      confidenceLevel: 0.95,
      tolerableMisstatement: 500000,
      expectedMisstatement: 0,
    });

    expect(result.sampleSize).toBeGreaterThanOrEqual(25);
    expect(result.method).toBe('mus');
    expect(result.parameters.samplingInterval).toBeGreaterThan(0);
  });

  it('increases sample size when expected misstatement increases', () => {
    const noExpected = calculateMUSSampleSize({
      populationSize: 1000,
      populationValue: 10000000,
      confidenceLevel: 0.95,
      tolerableMisstatement: 500000,
      expectedMisstatement: 0,
    });
    const withExpected = calculateMUSSampleSize({
      populationSize: 1000,
      populationValue: 10000000,
      confidenceLevel: 0.95,
      tolerableMisstatement: 500000,
      expectedMisstatement: 100000,
    });

    expect(withExpected.sampleSize).toBeGreaterThanOrEqual(noExpected.sampleSize);
  });
});

describe('selectRandomSample', () => {
  it('returns correct number of items', () => {
    const selected = selectRandomSample(1000, 50, 42);
    expect(selected.length).toBe(50);
  });

  it('returns sorted indices', () => {
    const selected = selectRandomSample(1000, 50, 42);
    for (let i = 1; i < selected.length; i++) {
      expect(selected[i]).toBeGreaterThan(selected[i - 1]);
    }
  });

  it('all indices are within population bounds', () => {
    const selected = selectRandomSample(100, 30, 42);
    for (const idx of selected) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(100);
    }
  });

  it('is deterministic with the same seed', () => {
    const first = selectRandomSample(1000, 50, 42);
    const second = selectRandomSample(1000, 50, 42);
    expect(first).toEqual(second);
  });
});

describe('selectSystematicSample', () => {
  it('returns correct number of items', () => {
    const selected = selectSystematicSample(1000, 50, 5);
    expect(selected.length).toBe(50);
  });

  it('items are evenly spaced', () => {
    const selected = selectSystematicSample(100, 10, 0);
    // With interval of 10 and start of 0, should get 0, 10, 20, ...
    expect(selected[0]).toBe(0);
    expect(selected[1]).toBe(10);
  });
});

describe('selectMUSSample', () => {
  it('selects items proportional to size', () => {
    const items = [
      { index: 0, value: 1000000 },
      { index: 1, value: 100 },
      { index: 2, value: 100 },
      { index: 3, value: 100 },
      { index: 4, value: 100 },
    ];

    const selected = selectMUSSample(items, 3, 0);
    // The large item should always be selected
    expect(selected).toContain(0);
  });
});

describe('evaluateAttributeSample', () => {
  it('supports reliance when no deviations found', () => {
    const result = evaluateAttributeSample(60, 0, 0.05, 0.95);
    expect(result.conclusion).toBe('supports_reliance');
    expect(result.deviationsFound).toBe(0);
  });

  it('does not support reliance when deviation rate exceeds tolerable', () => {
    const result = evaluateAttributeSample(60, 10, 0.05, 0.95);
    expect(result.conclusion).toBe('does_not_support');
    expect(result.rationale).toContain('exceeds');
  });

  it('supports reliance when deviation rate is within tolerance', () => {
    const result = evaluateAttributeSample(100, 1, 0.10, 0.95);
    expect(result.conclusion).toBe('supports_reliance');
  });
});

describe('evaluateMUSSample', () => {
  it('supports reliance with no exceptions', () => {
    const result = evaluateMUSSample(60, 10000000, 500000, 0.95, []);
    expect(result.conclusion).toBe('supports_reliance');
    expect(result.exceptionsFound).toBe(0);
    expect(result.projectedMisstatement).toBe(0);
  });

  it('calculates projected misstatement from exceptions', () => {
    const result = evaluateMUSSample(
      60,
      10000000,
      500000,
      0.95,
      [{ bookValue: 10000, auditValue: 8000 }]
    );

    expect(result.exceptionsFound).toBe(1);
    expect(result.projectedMisstatement).toBeGreaterThan(0);
    expect(result.taintingFactors.length).toBe(1);
    expect(result.taintingFactors[0]).toBeCloseTo(0.2);
  });

  it('does not support reliance when upper limit exceeds tolerable', () => {
    const result = evaluateMUSSample(
      30,
      10000000,
      100000,
      0.95,
      [
        { bookValue: 50000, auditValue: 10000 },
        { bookValue: 30000, auditValue: 5000 },
      ]
    );

    expect(result.conclusion).toBe('does_not_support');
    expect(result.upperMisstatementLimit).toBeGreaterThan(100000);
  });
});
