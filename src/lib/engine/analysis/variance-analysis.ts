export interface VarianceResult {
  lineItem: string;
  currentPeriod: number;
  priorPeriod: number;
  variance: number;
  variancePct: number;
  direction: 'increase' | 'decrease' | 'unchanged';
  significance: 'material' | 'significant' | 'normal';
  explanation: string;
}

export function performIncomeStatementVariance(
  currentIS: Record<string, number>,
  priorIS?: Record<string, number>,
  materialityThreshold?: number
): VarianceResult[] {
  if (!priorIS) {
    // Generate simple analysis from current period
    const results: VarianceResult[] = [];
    const lineItems = [
      { key: 'totalRevenue', label: 'Total Revenue' },
      { key: 'costOfGoodsSold', label: 'Cost of Goods Sold' },
      { key: 'grossProfit', label: 'Gross Profit' },
      { key: 'operatingExpenses', label: 'Operating Expenses' },
      { key: 'operatingIncome', label: 'Operating Income' },
      { key: 'interestExpense', label: 'Interest Expense' },
      { key: 'incomeBeforeTax', label: 'Income Before Tax' },
      { key: 'incomeTaxExpense', label: 'Income Tax Expense' },
      { key: 'netIncome', label: 'Net Income' },
    ];

    for (const item of lineItems) {
      const value = currentIS[item.key] || 0;
      const revenue = currentIS.totalRevenue || 1;
      const pctOfRevenue = value / revenue;

      results.push({
        lineItem: item.label,
        currentPeriod: value,
        priorPeriod: 0,
        variance: value,
        variancePct: 0,
        direction: value > 0 ? 'increase' : value < 0 ? 'decrease' : 'unchanged',
        significance: 'normal',
        explanation: `${(pctOfRevenue * 100).toFixed(1)}% of revenue`,
      });
    }

    return results;
  }

  const results: VarianceResult[] = [];
  const keys = Array.from(new Set([...Object.keys(currentIS), ...Object.keys(priorIS)]));
  const mat = materialityThreshold || 100000;

  for (const key of keys) {
    const current = currentIS[key] || 0;
    const prior = priorIS[key] || 0;
    const variance = current - prior;
    const variancePct = prior !== 0 ? variance / Math.abs(prior) : 0;

    let significance: 'material' | 'significant' | 'normal' = 'normal';
    if (Math.abs(variance) >= mat) significance = 'material';
    else if (Math.abs(variancePct) > 0.15 && Math.abs(variance) > mat * 0.1) significance = 'significant';

    results.push({
      lineItem: key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()),
      currentPeriod: current,
      priorPeriod: prior,
      variance,
      variancePct,
      direction: variance > 0 ? 'increase' : variance < 0 ? 'decrease' : 'unchanged',
      significance,
      explanation: '',
    });
  }

  return results.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
}
