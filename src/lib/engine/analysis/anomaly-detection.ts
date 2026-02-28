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
