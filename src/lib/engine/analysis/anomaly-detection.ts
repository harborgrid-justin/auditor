export interface AnomalyResult {
  id: string;
  description: string;
  value: number;
  zScore: number;
  category: string;
  severity: 'high' | 'medium' | 'low';
  details: string;
}

export interface AnomalyAnalysis {
  outliers: AnomalyResult[];
  totalAnalyzed: number;
  mean: number;
  stdDev: number;
  method: string;
}

export function detectZScoreOutliers(
  items: { id: string; description: string; value: number; category: string }[],
  threshold: number = 2.5
): AnomalyAnalysis {
  if (items.length < 5) {
    return { outliers: [], totalAnalyzed: items.length, mean: 0, stdDev: 0, method: 'Z-Score' };
  }

  const values = items.map(i => i.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return { outliers: [], totalAnalyzed: items.length, mean, stdDev, method: 'Z-Score' };
  }

  const outliers: AnomalyResult[] = items
    .map(item => {
      const zScore = Math.abs((item.value - mean) / stdDev);
      return { ...item, zScore };
    })
    .filter(item => item.zScore >= threshold)
    .map(item => ({
      id: item.id,
      description: item.description,
      value: item.value,
      zScore: item.zScore,
      category: item.category,
      severity: item.zScore >= 4.0 ? 'high' as const : item.zScore >= 3.0 ? 'medium' as const : 'low' as const,
      details: `Value of $${item.value.toLocaleString()} is ${item.zScore.toFixed(2)} standard deviations from the mean ($${mean.toLocaleString()})`,
    }))
    .sort((a, b) => b.zScore - a.zScore);

  return { outliers, totalAnalyzed: items.length, mean, stdDev, method: 'Z-Score' };
}

/**
 * Modified Z-Score using Median Absolute Deviation (MAD).
 * More robust to outliers than standard Z-score.
 */
export function detectModifiedZScoreOutliers(
  items: { id: string; description: string; value: number; category: string }[],
  threshold: number = 3.5
): AnomalyAnalysis {
  if (items.length < 5) {
    return { outliers: [], totalAnalyzed: items.length, mean: 0, stdDev: 0, method: 'Modified Z-Score (MAD)' };
  }

  const values = items.map(i => i.value);
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  // Median Absolute Deviation
  const absDeviations = values.map(v => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = absDeviations[Math.floor(absDeviations.length / 2)];

  if (mad === 0) {
    return { outliers: [], totalAnalyzed: items.length, mean: median, stdDev: 0, method: 'Modified Z-Score (MAD)' };
  }

  // 0.6745 is the 0.75th quartile of the standard normal distribution
  const outliers: AnomalyResult[] = items
    .map(item => {
      const modifiedZScore = 0.6745 * (item.value - median) / mad;
      return { ...item, zScore: Math.abs(modifiedZScore) };
    })
    .filter(item => item.zScore >= threshold)
    .map(item => ({
      id: item.id,
      description: item.description,
      value: item.value,
      zScore: item.zScore,
      category: item.category,
      severity: item.zScore >= 5.0 ? 'high' as const : item.zScore >= 4.0 ? 'medium' as const : 'low' as const,
      details: `Value $${item.value.toLocaleString()} has modified Z-score of ${item.zScore.toFixed(2)} (median: $${median.toLocaleString()}, MAD: $${mad.toLocaleString()})`,
    }))
    .sort((a, b) => b.zScore - a.zScore);

  return { outliers, totalAnalyzed: items.length, mean: median, stdDev: mad, method: 'Modified Z-Score (MAD)' };
}

/**
 * Isolation Forest-style anomaly scoring.
 * Simplified implementation that scores based on how isolated a point is.
 */
export function detectIsolationOutliers(
  items: { id: string; description: string; value: number; category: string }[],
  contamination: number = 0.05
): AnomalyAnalysis {
  if (items.length < 10) {
    return { outliers: [], totalAnalyzed: items.length, mean: 0, stdDev: 0, method: 'Isolation Score' };
  }

  const values = items.map(i => i.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Calculate isolation score based on average distance to k nearest neighbors
  const k = Math.min(5, Math.floor(items.length * 0.1));

  const scored = items.map(item => {
    const distances = values
      .filter(v => v !== item.value)
      .map(v => Math.abs(v - item.value))
      .sort((a, b) => a - b);

    const kNearestAvg = distances.slice(0, k).reduce((a, b) => a + b, 0) / k;
    return { ...item, isolationScore: kNearestAvg };
  });

  // Normalize scores
  const maxScore = Math.max(...scored.map(s => s.isolationScore));
  if (maxScore === 0) {
    return { outliers: [], totalAnalyzed: items.length, mean, stdDev, method: 'Isolation Score' };
  }

  const normalized = scored.map(s => ({
    ...s,
    normalizedScore: s.isolationScore / maxScore,
  }));

  // Top contamination% are anomalies
  const sortedByScore = [...normalized].sort((a, b) => b.normalizedScore - a.normalizedScore);
  const anomalyCount = Math.max(1, Math.floor(items.length * contamination));

  const outliers: AnomalyResult[] = sortedByScore
    .slice(0, anomalyCount)
    .filter(item => item.normalizedScore > 0.5) // Only flag if meaningfully isolated
    .map(item => ({
      id: item.id,
      description: item.description,
      value: item.value,
      zScore: item.normalizedScore * 5, // Scale to comparable range
      category: item.category,
      severity: item.normalizedScore >= 0.9 ? 'high' as const : item.normalizedScore >= 0.7 ? 'medium' as const : 'low' as const,
      details: `Value $${item.value.toLocaleString()} has isolation score of ${(item.normalizedScore * 100).toFixed(1)}%`,
    }));

  return { outliers, totalAnalyzed: items.length, mean, stdDev, method: 'Isolation Score' };
}

/**
 * Composite anomaly detection that combines multiple methods.
 */
export function detectCompositeAnomalies(
  items: { id: string; description: string; value: number; category: string }[],
  options?: { zScoreThreshold?: number; iqrMultiplier?: number; madThreshold?: number }
): {
  combined: AnomalyResult[];
  byMethod: { zScore: AnomalyAnalysis; iqr: AnomalyAnalysis; modifiedZScore: AnomalyAnalysis; isolation: AnomalyAnalysis };
} {
  const zScore = detectZScoreOutliers(items, options?.zScoreThreshold);
  const iqr = detectIQROutliers(items, options?.iqrMultiplier);
  const modifiedZScore = detectModifiedZScoreOutliers(items, options?.madThreshold);
  const isolation = detectIsolationOutliers(items);

  // Combine: items flagged by multiple methods get higher severity
  const scoreMap = new Map<string, { count: number; maxZScore: number; item: AnomalyResult }>();

  for (const results of [zScore, iqr, modifiedZScore, isolation]) {
    for (const outlier of results.outliers) {
      const existing = scoreMap.get(outlier.id);
      if (existing) {
        existing.count++;
        existing.maxZScore = Math.max(existing.maxZScore, outlier.zScore);
      } else {
        scoreMap.set(outlier.id, { count: 1, maxZScore: outlier.zScore, item: outlier });
      }
    }
  }

  const combined: AnomalyResult[] = Array.from(scoreMap.values())
    .map(({ count, maxZScore, item }) => ({
      ...item,
      zScore: maxZScore,
      severity: count >= 3 ? 'high' as const : count >= 2 ? 'medium' as const : 'low' as const,
      details: `${item.details} — flagged by ${count}/4 methods`,
    }))
    .sort((a, b) => b.zScore - a.zScore);

  return { combined, byMethod: { zScore, iqr, modifiedZScore, isolation } };
}

export function detectIQROutliers(
  items: { id: string; description: string; value: number; category: string }[],
  multiplier: number = 1.5
): AnomalyAnalysis {
  if (items.length < 5) {
    return { outliers: [], totalAnalyzed: items.length, mean: 0, stdDev: 0, method: 'IQR' };
  }

  const sorted = [...items].sort((a, b) => a.value - b.value);
  const values = sorted.map(i => i.value);

  const q1Index = Math.floor(values.length * 0.25);
  const q3Index = Math.floor(values.length * 0.75);
  const q1 = values[q1Index];
  const q3 = values[q3Index];
  const iqr = q3 - q1;

  const lowerBound = q1 - multiplier * iqr;
  const upperBound = q3 + multiplier * iqr;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  const outliers: AnomalyResult[] = items
    .filter(item => item.value < lowerBound || item.value > upperBound)
    .map(item => {
      const zScore = stdDev > 0 ? Math.abs((item.value - mean) / stdDev) : 0;
      return {
        id: item.id,
        description: item.description,
        value: item.value,
        zScore,
        category: item.category,
        severity: (item.value < q1 - 3 * iqr || item.value > q3 + 3 * iqr) ? 'high' as const :
                  (item.value < q1 - 2 * iqr || item.value > q3 + 2 * iqr) ? 'medium' as const : 'low' as const,
        details: `Value $${item.value.toLocaleString()} is outside IQR bounds [$${lowerBound.toLocaleString()}, $${upperBound.toLocaleString()}]`,
      };
    })
    .sort((a, b) => b.zScore - a.zScore);

  return { outliers, totalAnalyzed: items.length, mean, stdDev, method: 'IQR' };
}
