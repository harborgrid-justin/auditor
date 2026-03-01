import type { Account } from '@/types/financial';

export interface TrendResult {
  accountNumber: string;
  accountName: string;
  accountType: string;
  beginningBalance: number;
  endingBalance: number;
  change: number;
  changePercent: number;
  significance: 'material' | 'significant' | 'normal';
}

export interface TrendAnalysis {
  results: TrendResult[];
  totalAccounts: number;
  materialChanges: number;
  significantChanges: number;
}

export function performTrendAnalysis(
  accounts: Account[],
  materialityThreshold: number
): TrendAnalysis {
  const results: TrendResult[] = accounts
    .filter(a => a.beginningBalance !== 0 || a.endingBalance !== 0)
    .map(a => {
      const change = a.endingBalance - a.beginningBalance;
      const changePercent = a.beginningBalance !== 0
        ? change / Math.abs(a.beginningBalance)
        : (a.endingBalance !== 0 ? 1 : 0);

      let significance: 'material' | 'significant' | 'normal' = 'normal';
      if (Math.abs(change) >= materialityThreshold) {
        significance = 'material';
      } else if (Math.abs(changePercent) > 0.25 && Math.abs(change) > materialityThreshold * 0.1) {
        significance = 'significant';
      }

      return {
        accountNumber: a.accountNumber,
        accountName: a.accountName,
        accountType: a.accountType,
        beginningBalance: a.beginningBalance,
        endingBalance: a.endingBalance,
        change,
        changePercent,
        significance,
      };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  return {
    results,
    totalAccounts: results.length,
    materialChanges: results.filter(r => r.significance === 'material').length,
    significantChanges: results.filter(r => r.significance === 'significant').length,
  };
}
