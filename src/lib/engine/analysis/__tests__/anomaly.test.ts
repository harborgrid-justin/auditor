import { describe, it, expect } from 'vitest';
import {
  detectZScoreOutliers,
  detectModifiedZScoreOutliers,
  detectCompositeAnomalies,
} from '@/lib/engine/analysis/anomaly-detection';

function makeItem(id: string, value: number) {
  return { id, description: `Item ${id}`, value, category: 'expense' };
}

describe('detectZScoreOutliers', () => {
  it('returns no outliers for normal data', () => {
    const items = [
      makeItem('1', 100),
      makeItem('2', 102),
      makeItem('3', 98),
      makeItem('4', 101),
      makeItem('5', 99),
      makeItem('6', 100),
      makeItem('7', 103),
    ];

    const result = detectZScoreOutliers(items);

    expect(result.outliers).toHaveLength(0);
    expect(result.totalAnalyzed).toBe(7);
    expect(result.method).toBe('Z-Score');
  });

  it('returns the extreme value as an outlier', () => {
    // Use a larger dataset so the standard deviation stays tight and the outlier
    // clearly exceeds the default 2.5 z-score threshold
    const items = [
      makeItem('1', 100),
      makeItem('2', 102),
      makeItem('3', 98),
      makeItem('4', 101),
      makeItem('5', 99),
      makeItem('6', 100),
      makeItem('7', 101),
      makeItem('8', 99),
      makeItem('9', 100),
      makeItem('10', 102),
      makeItem('11', 98),
      makeItem('12', 101),
      makeItem('outlier', 5000),
    ];

    const result = detectZScoreOutliers(items);

    expect(result.outliers.length).toBeGreaterThanOrEqual(1);
    expect(result.outliers[0].id).toBe('outlier');
    expect(result.outliers[0].value).toBe(5000);
    expect(result.outliers[0].zScore).toBeGreaterThan(2.5);
    expect(['high', 'medium', 'low']).toContain(result.outliers[0].severity);
  });

  it('returns empty outliers for arrays with fewer than 5 items', () => {
    const items = [
      makeItem('1', 100),
      makeItem('2', 200),
      makeItem('3', 300),
    ];

    const result = detectZScoreOutliers(items);

    expect(result.outliers).toHaveLength(0);
    expect(result.totalAnalyzed).toBe(3);
  });

  it('returns empty outliers for an empty array', () => {
    const result = detectZScoreOutliers([]);

    expect(result.outliers).toHaveLength(0);
    expect(result.totalAnalyzed).toBe(0);
    expect(result.mean).toBe(0);
    expect(result.stdDev).toBe(0);
  });
});

describe('detectModifiedZScoreOutliers', () => {
  it('works with skewed data and detects the extreme outlier', () => {
    // Create skewed data: mostly small values with one very large value
    const items = [
      makeItem('1', 10),
      makeItem('2', 12),
      makeItem('3', 11),
      makeItem('4', 13),
      makeItem('5', 9),
      makeItem('6', 10),
      makeItem('7', 11),
      makeItem('8', 10000),
    ];

    const result = detectModifiedZScoreOutliers(items);

    expect(result.method).toBe('Modified Z-Score (MAD)');
    expect(result.totalAnalyzed).toBe(8);
    expect(result.outliers.length).toBeGreaterThanOrEqual(1);

    const outlierIds = result.outliers.map((o) => o.id);
    expect(outlierIds).toContain('8');
  });

  it('returns empty outliers for arrays with fewer than 5 items', () => {
    const items = [makeItem('1', 10), makeItem('2', 20)];

    const result = detectModifiedZScoreOutliers(items);

    expect(result.outliers).toHaveLength(0);
    expect(result.method).toBe('Modified Z-Score (MAD)');
  });
});

describe('detectCompositeAnomalies', () => {
  it('combines multiple methods and returns combined results', () => {
    // Need at least 10 items for isolation method, plus an extreme outlier
    const items = [
      makeItem('1', 100),
      makeItem('2', 102),
      makeItem('3', 98),
      makeItem('4', 101),
      makeItem('5', 99),
      makeItem('6', 100),
      makeItem('7', 103),
      makeItem('8', 97),
      makeItem('9', 101),
      makeItem('10', 99),
      makeItem('11', 50000),
    ];

    const result = detectCompositeAnomalies(items);

    expect(result.byMethod).toHaveProperty('zScore');
    expect(result.byMethod).toHaveProperty('iqr');
    expect(result.byMethod).toHaveProperty('modifiedZScore');
    expect(result.byMethod).toHaveProperty('isolation');

    // The extreme outlier should be flagged by multiple methods
    expect(result.combined.length).toBeGreaterThanOrEqual(1);
    const extremeOutlier = result.combined.find((o) => o.id === '11');
    expect(extremeOutlier).toBeDefined();
    expect(extremeOutlier!.value).toBe(50000);
  });

  it('returns empty combined results for small arrays', () => {
    const items = [makeItem('1', 100), makeItem('2', 200)];

    const result = detectCompositeAnomalies(items);

    expect(result.combined).toHaveLength(0);
    expect(result.byMethod.zScore.outliers).toHaveLength(0);
    expect(result.byMethod.iqr.outliers).toHaveLength(0);
    expect(result.byMethod.modifiedZScore.outliers).toHaveLength(0);
    expect(result.byMethod.isolation.outliers).toHaveLength(0);
  });
});
