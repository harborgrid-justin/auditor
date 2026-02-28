export interface MaterialityInput {
  totalRevenue?: number;
  totalAssets?: number;
  netIncome?: number;
  totalEquity?: number;
  totalExpenses?: number;
}

export interface MaterialityResult {
  overallMateriality: number;
  performanceMateriality: number;
  trivialThreshold: number;
  basis: string;
  basisAmount: number;
  percentage: number;
  method: string;
}

export function calculateMateriality(input: MaterialityInput): MaterialityResult {
  const benchmarks: { basis: string; amount: number; pctLow: number; pctHigh: number; pctTypical: number }[] = [];

  if (input.totalRevenue && input.totalRevenue > 0) {
    benchmarks.push({
      basis: 'Total Revenue',
      amount: input.totalRevenue,
      pctLow: 0.005,
      pctHigh: 0.02,
      pctTypical: 0.01,
    });
  }

  if (input.totalAssets && input.totalAssets > 0) {
    benchmarks.push({
      basis: 'Total Assets',
      amount: input.totalAssets,
      pctLow: 0.005,
      pctHigh: 0.02,
      pctTypical: 0.01,
    });
  }

  if (input.netIncome && input.netIncome > 0) {
    benchmarks.push({
      basis: 'Net Income (Pre-tax)',
      amount: input.netIncome,
      pctLow: 0.03,
      pctHigh: 0.07,
      pctTypical: 0.05,
    });
  }

  if (input.totalEquity && input.totalEquity > 0) {
    benchmarks.push({
      basis: 'Total Equity',
      amount: input.totalEquity,
      pctLow: 0.01,
      pctHigh: 0.05,
      pctTypical: 0.02,
    });
  }

  if (input.totalExpenses && input.totalExpenses > 0) {
    benchmarks.push({
      basis: 'Total Expenses',
      amount: input.totalExpenses,
      pctLow: 0.005,
      pctHigh: 0.02,
      pctTypical: 0.01,
    });
  }

  if (benchmarks.length === 0) {
    return {
      overallMateriality: 0,
      performanceMateriality: 0,
      trivialThreshold: 0,
      basis: 'None',
      basisAmount: 0,
      percentage: 0,
      method: 'No financial data available',
    };
  }

  // Use the benchmark that produces the most conservative (lowest) materiality
  let bestBenchmark = benchmarks[0];
  let bestMateriality = bestBenchmark.amount * bestBenchmark.pctTypical;

  for (const b of benchmarks) {
    const mat = b.amount * b.pctTypical;
    if (mat < bestMateriality && mat > 0) {
      bestMateriality = mat;
      bestBenchmark = b;
    }
  }

  const overallMateriality = Math.round(bestMateriality);
  const performanceMateriality = Math.round(overallMateriality * 0.75); // 75% of overall
  const trivialThreshold = Math.round(overallMateriality * 0.05); // 5% - clearly trivial

  return {
    overallMateriality,
    performanceMateriality,
    trivialThreshold,
    basis: bestBenchmark.basis,
    basisAmount: bestBenchmark.amount,
    percentage: bestBenchmark.pctTypical,
    method: `${(bestBenchmark.pctTypical * 100).toFixed(1)}% of ${bestBenchmark.basis} ($${bestBenchmark.amount.toLocaleString()})`,
  };
}

export function isAmountMaterial(amount: number, materialityThreshold: number): boolean {
  return Math.abs(amount) >= materialityThreshold;
}

export function getAmountSignificance(amount: number, materiality: MaterialityResult): 'material' | 'significant' | 'trivial' {
  const absAmount = Math.abs(amount);
  if (absAmount >= materiality.overallMateriality) return 'material';
  if (absAmount >= materiality.trivialThreshold) return 'significant';
  return 'trivial';
}
