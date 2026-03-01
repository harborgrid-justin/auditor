export function formatCurrency(amount: number, decimals: number = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatNumber(num: number, decimals: number = 0): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatPercent(value: number, decimals: number = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function classifyAccountType(accountNumber: string, accountName: string): {
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  subType: string;
} {
  const num = parseInt(accountNumber);
  const name = accountName.toLowerCase();

  if (num >= 1000 && num < 2000) {
    if (name.includes('cash')) return { accountType: 'asset', subType: 'cash' };
    if (name.includes('receivable')) return { accountType: 'asset', subType: 'accounts_receivable' };
    if (name.includes('inventory')) return { accountType: 'asset', subType: 'inventory' };
    if (name.includes('prepaid')) return { accountType: 'asset', subType: 'prepaid' };
    if (name.includes('rou') || name.includes('right-of-use') || name.includes('right of use')) return { accountType: 'asset', subType: 'rou_asset' };
    if (name.includes('equipment') || name.includes('property') || name.includes('building') || name.includes('land') || name.includes('furniture'))
      return { accountType: 'asset', subType: 'fixed_asset' };
    if (name.includes('goodwill') || name.includes('patent') || name.includes('intangible'))
      return { accountType: 'asset', subType: 'intangible' };
    return { accountType: 'asset', subType: 'other_asset' };
  }
  if (num >= 2000 && num < 3000) {
    if (name.includes('payable')) return { accountType: 'liability', subType: 'accounts_payable' };
    if (name.includes('accrued')) return { accountType: 'liability', subType: 'accrued_liabilities' };
    if (name.includes('deferred revenue') || name.includes('unearned')) return { accountType: 'liability', subType: 'deferred_revenue' };
    if (name.includes('lease')) return { accountType: 'liability', subType: 'lease_liability' };
    if (name.includes('short-term') || name.includes('current portion')) return { accountType: 'liability', subType: 'short_term_debt' };
    if (name.includes('long-term') || name.includes('note') || name.includes('bond') || name.includes('mortgage'))
      return { accountType: 'liability', subType: 'long_term_debt' };
    return { accountType: 'liability', subType: 'other_liability' };
  }
  if (num >= 3000 && num < 4000) {
    if (name.includes('common') || name.includes('capital')) return { accountType: 'equity', subType: 'common_stock' };
    if (name.includes('retained')) return { accountType: 'equity', subType: 'retained_earnings' };
    if (name.includes('treasury')) return { accountType: 'equity', subType: 'treasury_stock' };
    if (name.includes('comprehensive') || name.includes('aoci')) return { accountType: 'equity', subType: 'aoci' };
    return { accountType: 'equity', subType: 'other_equity' };
  }
  if (num >= 4000 && num < 5000) {
    if (name.includes('interest income') || name.includes('dividend income') || name.includes('gain'))
      return { accountType: 'revenue', subType: 'non_operating_revenue' };
    return { accountType: 'revenue', subType: 'operating_revenue' };
  }
  if (num >= 5000 && num < 6000) {
    return { accountType: 'expense', subType: 'cost_of_goods_sold' };
  }
  if (num >= 6000 && num < 9000) {
    if (name.includes('depreciation')) return { accountType: 'expense', subType: 'depreciation' };
    if (name.includes('amortization')) return { accountType: 'expense', subType: 'amortization' };
    if (name.includes('interest expense')) return { accountType: 'expense', subType: 'interest_expense' };
    if (name.includes('tax expense') || name.includes('income tax')) return { accountType: 'expense', subType: 'tax_expense' };
    return { accountType: 'expense', subType: 'operating_expense' };
  }
  if (num >= 9000) {
    return { accountType: 'expense', subType: 'tax_expense' };
  }

  if (name.includes('revenue') || name.includes('sales') || name.includes('income') && !name.includes('expense'))
    return { accountType: 'revenue', subType: 'operating_revenue' };
  if (name.includes('expense') || name.includes('cost'))
    return { accountType: 'expense', subType: 'operating_expense' };

  return { accountType: 'asset', subType: 'other_asset' };
}
