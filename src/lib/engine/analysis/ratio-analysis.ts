export interface FinancialRatio {
  name: string;
  category: 'liquidity' | 'profitability' | 'leverage' | 'efficiency' | 'coverage';
  value: number;
  benchmark: number;
  unit: string;
  status: 'good' | 'warning' | 'critical';
  description: string;
  formula: string;
}

interface AccountData {
  cash: number;
  accountsReceivable: number;
  inventory: number;
  currentAssets: number;
  totalAssets: number;
  currentLiabilities: number;
  totalLiabilities: number;
  totalEquity: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingIncome: number;
  netIncome: number;
  interestExpense: number;
  depreciation: number;
  operatingCashFlow: number;
  totalDebt: number;
}

export function calculateRatios(data: AccountData): FinancialRatio[] {
  const ratios: FinancialRatio[] = [];

  // LIQUIDITY RATIOS
  if (data.currentLiabilities > 0) {
    const currentRatio = data.currentAssets / data.currentLiabilities;
    ratios.push({
      name: 'Current Ratio',
      category: 'liquidity',
      value: currentRatio,
      benchmark: 2.0,
      unit: 'x',
      status: currentRatio >= 1.5 ? 'good' : currentRatio >= 1.0 ? 'warning' : 'critical',
      description: 'Measures ability to pay short-term obligations',
      formula: 'Current Assets / Current Liabilities',
    });

    const quickRatio = (data.currentAssets - data.inventory) / data.currentLiabilities;
    ratios.push({
      name: 'Quick Ratio (Acid Test)',
      category: 'liquidity',
      value: quickRatio,
      benchmark: 1.0,
      unit: 'x',
      status: quickRatio >= 1.0 ? 'good' : quickRatio >= 0.7 ? 'warning' : 'critical',
      description: 'Measures ability to pay short-term obligations without selling inventory',
      formula: '(Current Assets - Inventory) / Current Liabilities',
    });

    const cashRatio = data.cash / data.currentLiabilities;
    ratios.push({
      name: 'Cash Ratio',
      category: 'liquidity',
      value: cashRatio,
      benchmark: 0.5,
      unit: 'x',
      status: cashRatio >= 0.3 ? 'good' : cashRatio >= 0.1 ? 'warning' : 'critical',
      description: 'Most conservative liquidity measure',
      formula: 'Cash / Current Liabilities',
    });
  }

  // PROFITABILITY RATIOS
  if (data.revenue > 0) {
    const grossMargin = data.grossProfit / data.revenue;
    ratios.push({
      name: 'Gross Profit Margin',
      category: 'profitability',
      value: grossMargin,
      benchmark: 0.40,
      unit: '%',
      status: grossMargin >= 0.35 ? 'good' : grossMargin >= 0.20 ? 'warning' : 'critical',
      description: 'Revenue remaining after COGS',
      formula: 'Gross Profit / Revenue',
    });

    const operatingMargin = data.operatingIncome / data.revenue;
    ratios.push({
      name: 'Operating Profit Margin',
      category: 'profitability',
      value: operatingMargin,
      benchmark: 0.15,
      unit: '%',
      status: operatingMargin >= 0.10 ? 'good' : operatingMargin >= 0.05 ? 'warning' : 'critical',
      description: 'Profitability from core operations',
      formula: 'Operating Income / Revenue',
    });

    const netMargin = data.netIncome / data.revenue;
    ratios.push({
      name: 'Net Profit Margin',
      category: 'profitability',
      value: netMargin,
      benchmark: 0.10,
      unit: '%',
      status: netMargin >= 0.05 ? 'good' : netMargin >= 0.01 ? 'warning' : 'critical',
      description: 'Bottom-line profitability',
      formula: 'Net Income / Revenue',
    });
  }

  if (data.totalAssets > 0) {
    const roa = data.netIncome / data.totalAssets;
    ratios.push({
      name: 'Return on Assets (ROA)',
      category: 'profitability',
      value: roa,
      benchmark: 0.05,
      unit: '%',
      status: roa >= 0.05 ? 'good' : roa >= 0.02 ? 'warning' : 'critical',
      description: 'How efficiently assets generate earnings',
      formula: 'Net Income / Total Assets',
    });
  }

  if (data.totalEquity > 0) {
    const roe = data.netIncome / data.totalEquity;
    ratios.push({
      name: 'Return on Equity (ROE)',
      category: 'profitability',
      value: roe,
      benchmark: 0.15,
      unit: '%',
      status: roe >= 0.10 ? 'good' : roe >= 0.05 ? 'warning' : 'critical',
      description: 'Return generated on shareholder equity',
      formula: 'Net Income / Total Equity',
    });
  }

  // LEVERAGE RATIOS
  if (data.totalEquity > 0) {
    const debtToEquity = data.totalLiabilities / data.totalEquity;
    ratios.push({
      name: 'Debt-to-Equity Ratio',
      category: 'leverage',
      value: debtToEquity,
      benchmark: 1.5,
      unit: 'x',
      status: debtToEquity <= 2.0 ? 'good' : debtToEquity <= 3.0 ? 'warning' : 'critical',
      description: 'Financial leverage measure',
      formula: 'Total Liabilities / Total Equity',
    });
  }

  if (data.totalAssets > 0) {
    const debtRatio = data.totalLiabilities / data.totalAssets;
    ratios.push({
      name: 'Debt Ratio',
      category: 'leverage',
      value: debtRatio,
      benchmark: 0.50,
      unit: '%',
      status: debtRatio <= 0.60 ? 'good' : debtRatio <= 0.75 ? 'warning' : 'critical',
      description: 'Proportion of assets financed by debt',
      formula: 'Total Liabilities / Total Assets',
    });

    const equityMultiplier = data.totalAssets / (data.totalEquity || 1);
    ratios.push({
      name: 'Equity Multiplier',
      category: 'leverage',
      value: equityMultiplier,
      benchmark: 2.0,
      unit: 'x',
      status: equityMultiplier <= 2.5 ? 'good' : equityMultiplier <= 4.0 ? 'warning' : 'critical',
      description: 'Degree of asset financing by equity',
      formula: 'Total Assets / Total Equity',
    });
  }

  // EFFICIENCY RATIOS
  if (data.revenue > 0) {
    if (data.accountsReceivable > 0) {
      const arTurnover = data.revenue / data.accountsReceivable;
      const dso = 365 / arTurnover;
      ratios.push({
        name: 'Accounts Receivable Turnover',
        category: 'efficiency',
        value: arTurnover,
        benchmark: 8.0,
        unit: 'x',
        status: arTurnover >= 6 ? 'good' : arTurnover >= 4 ? 'warning' : 'critical',
        description: 'How quickly receivables are collected',
        formula: 'Revenue / Accounts Receivable',
      });
      ratios.push({
        name: 'Days Sales Outstanding (DSO)',
        category: 'efficiency',
        value: dso,
        benchmark: 45,
        unit: 'days',
        status: dso <= 45 ? 'good' : dso <= 75 ? 'warning' : 'critical',
        description: 'Average days to collect receivables',
        formula: '365 / AR Turnover',
      });
    }

    if (data.inventory > 0 && data.cogs > 0) {
      const invTurnover = data.cogs / data.inventory;
      const dio = 365 / invTurnover;
      ratios.push({
        name: 'Inventory Turnover',
        category: 'efficiency',
        value: invTurnover,
        benchmark: 6.0,
        unit: 'x',
        status: invTurnover >= 5 ? 'good' : invTurnover >= 3 ? 'warning' : 'critical',
        description: 'How quickly inventory sells',
        formula: 'COGS / Inventory',
      });
      ratios.push({
        name: 'Days Inventory Outstanding (DIO)',
        category: 'efficiency',
        value: dio,
        benchmark: 60,
        unit: 'days',
        status: dio <= 60 ? 'good' : dio <= 100 ? 'warning' : 'critical',
        description: 'Average days to sell inventory',
        formula: '365 / Inventory Turnover',
      });
    }

    const assetTurnover = data.revenue / (data.totalAssets || 1);
    ratios.push({
      name: 'Asset Turnover',
      category: 'efficiency',
      value: assetTurnover,
      benchmark: 1.0,
      unit: 'x',
      status: assetTurnover >= 0.8 ? 'good' : assetTurnover >= 0.5 ? 'warning' : 'critical',
      description: 'Revenue generated per dollar of assets',
      formula: 'Revenue / Total Assets',
    });
  }

  // COVERAGE RATIOS
  if (data.interestExpense > 0) {
    const ebit = data.operatingIncome;
    const interestCoverage = ebit / data.interestExpense;
    ratios.push({
      name: 'Interest Coverage Ratio',
      category: 'coverage',
      value: interestCoverage,
      benchmark: 3.0,
      unit: 'x',
      status: interestCoverage >= 3 ? 'good' : interestCoverage >= 1.5 ? 'warning' : 'critical',
      description: 'Ability to pay interest on debt',
      formula: 'EBIT / Interest Expense',
    });

    if (data.operatingCashFlow > 0) {
      const cashCoverage = (data.operatingCashFlow + data.interestExpense) / data.interestExpense;
      ratios.push({
        name: 'Cash Coverage Ratio',
        category: 'coverage',
        value: cashCoverage,
        benchmark: 4.0,
        unit: 'x',
        status: cashCoverage >= 3 ? 'good' : cashCoverage >= 1.5 ? 'warning' : 'critical',
        description: 'Cash-based interest coverage',
        formula: '(Operating CF + Interest) / Interest',
      });
    }
  }

  if (data.totalDebt > 0 && data.operatingCashFlow > 0) {
    const debtServiceCoverage = data.operatingCashFlow / data.totalDebt;
    ratios.push({
      name: 'Debt Service Coverage',
      category: 'coverage',
      value: debtServiceCoverage,
      benchmark: 0.20,
      unit: 'x',
      status: debtServiceCoverage >= 0.15 ? 'good' : debtServiceCoverage >= 0.08 ? 'warning' : 'critical',
      description: 'Cash flow available to service debt',
      formula: 'Operating Cash Flow / Total Debt',
    });
  }

  return ratios;
}
