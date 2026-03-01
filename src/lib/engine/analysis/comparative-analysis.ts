/**
 * Multi-Period Comparative Analysis
 *
 * Provides year-over-year variance analysis, rolling averages,
 * seasonality detection, and unusual fluctuation flagging.
 */

import type { Account } from '@/types/financial';

export interface ComparativePeriodData {
  currentPeriod: Account[];
  priorPeriod: Account[];
  materialityThreshold: number;
}

export interface ComparativeResult {
  accountComparisons: AccountComparison[];
  aggregateMetrics: AggregateMetrics;
  unusualFluctuations: UnusualFluctuation[];
  seasonalityIndicators: SeasonalityIndicator[];
}

export interface AccountComparison {
  accountNumber: string;
  accountName: string;
  accountType: string;
  currentBalance: number;
  priorBalance: number;
  absoluteChange: number;
  percentChange: number | null;
  isMaterial: boolean;
  isUnusual: boolean;
}

export interface AggregateMetrics {
  totalCurrentAssets: number;
  totalPriorAssets: number;
  totalCurrentLiabilities: number;
  totalPriorLiabilities: number;
  totalCurrentRevenue: number;
  totalPriorRevenue: number;
  totalCurrentExpenses: number;
  totalPriorExpenses: number;
  revenueGrowthRate: number | null;
  expenseGrowthRate: number | null;
  assetGrowthRate: number | null;
}

export interface UnusualFluctuation {
  accountNumber: string;
  accountName: string;
  percentChange: number;
  absoluteChange: number;
  reason: string;
  severity: 'high' | 'medium' | 'low';
}

export interface SeasonalityIndicator {
  accountType: string;
  pattern: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Perform multi-period comparative analysis.
 */
export function performComparativeAnalysis(
  data: ComparativePeriodData
): ComparativeResult {
  const accountComparisons: AccountComparison[] = [];
  const unusualFluctuations: UnusualFluctuation[] = [];

  // Match current and prior period accounts
  for (const current of data.currentPeriod) {
    const prior = data.priorPeriod.find(
      (p) => p.accountNumber === current.accountNumber
    );

    const priorBalance = prior?.endingBalance || 0;
    const absoluteChange = current.endingBalance - priorBalance;
    const percentChange =
      priorBalance !== 0
        ? ((current.endingBalance - priorBalance) / Math.abs(priorBalance)) * 100
        : null;

    const isMaterial =
      Math.abs(absoluteChange) > data.materialityThreshold;

    // Flag as unusual if >50% change and material, or >100% change
    const isUnusual =
      (percentChange !== null &&
        Math.abs(percentChange) > 50 &&
        isMaterial) ||
      (percentChange !== null && Math.abs(percentChange) > 100);

    accountComparisons.push({
      accountNumber: current.accountNumber,
      accountName: current.accountName,
      accountType: current.accountType,
      currentBalance: current.endingBalance,
      priorBalance,
      absoluteChange,
      percentChange,
      isMaterial,
      isUnusual,
    });

    if (isUnusual) {
      let reason = '';
      let severity: 'high' | 'medium' | 'low' = 'medium';

      if (priorBalance === 0 && current.endingBalance !== 0) {
        reason = 'New account with no prior period balance';
        severity = 'medium';
      } else if (
        percentChange !== null &&
        Math.abs(percentChange) > 200
      ) {
        reason = `Balance changed by ${percentChange!.toFixed(0)}% — significant variance requiring investigation`;
        severity = 'high';
      } else if (
        percentChange !== null &&
        Math.abs(percentChange) > 100
      ) {
        reason = `Balance more than doubled — unusual fluctuation`;
        severity = 'medium';
      } else {
        reason = `Material change of $${Math.abs(absoluteChange).toLocaleString()} (${percentChange?.toFixed(1)}%)`;
        severity = isMaterial ? 'medium' : 'low';
      }

      unusualFluctuations.push({
        accountNumber: current.accountNumber,
        accountName: current.accountName,
        percentChange: percentChange || 0,
        absoluteChange,
        reason,
        severity,
      });
    }
  }

  // Check for accounts in prior period that disappeared
  for (const prior of data.priorPeriod) {
    const exists = data.currentPeriod.find(
      (c) => c.accountNumber === prior.accountNumber
    );
    if (!exists && Math.abs(prior.endingBalance) > data.materialityThreshold) {
      unusualFluctuations.push({
        accountNumber: prior.accountNumber,
        accountName: prior.accountName,
        percentChange: -100,
        absoluteChange: -prior.endingBalance,
        reason: 'Account existed in prior period but not in current period',
        severity: 'high',
      });
    }
  }

  // Aggregate metrics
  const sum = (accts: Account[], type: string) =>
    accts
      .filter((a) => a.accountType === type)
      .reduce((s, a) => s + Math.abs(a.endingBalance), 0);

  const totalCurrentAssets = sum(data.currentPeriod, 'asset');
  const totalPriorAssets = sum(data.priorPeriod, 'asset');
  const totalCurrentLiabilities = sum(data.currentPeriod, 'liability');
  const totalPriorLiabilities = sum(data.priorPeriod, 'liability');
  const totalCurrentRevenue = sum(data.currentPeriod, 'revenue');
  const totalPriorRevenue = sum(data.priorPeriod, 'revenue');
  const totalCurrentExpenses = sum(data.currentPeriod, 'expense');
  const totalPriorExpenses = sum(data.priorPeriod, 'expense');

  const growthRate = (current: number, prior: number) =>
    prior !== 0 ? ((current - prior) / Math.abs(prior)) * 100 : null;

  const aggregateMetrics: AggregateMetrics = {
    totalCurrentAssets,
    totalPriorAssets,
    totalCurrentLiabilities,
    totalPriorLiabilities,
    totalCurrentRevenue,
    totalPriorRevenue,
    totalCurrentExpenses,
    totalPriorExpenses,
    revenueGrowthRate: growthRate(totalCurrentRevenue, totalPriorRevenue),
    expenseGrowthRate: growthRate(totalCurrentExpenses, totalPriorExpenses),
    assetGrowthRate: growthRate(totalCurrentAssets, totalPriorAssets),
  };

  // Seasonality indicators (basic heuristic)
  const seasonalityIndicators: SeasonalityIndicator[] = [];

  if (
    aggregateMetrics.revenueGrowthRate !== null &&
    aggregateMetrics.expenseGrowthRate !== null
  ) {
    const revGrowth = aggregateMetrics.revenueGrowthRate;
    const expGrowth = aggregateMetrics.expenseGrowthRate;

    if (revGrowth > 20 && expGrowth < 5) {
      seasonalityIndicators.push({
        accountType: 'revenue',
        pattern:
          'Revenue growth significantly outpaces expense growth — possible seasonal peak or one-time revenue event',
        confidence: 'medium',
      });
    }

    if (expGrowth > revGrowth + 20) {
      seasonalityIndicators.push({
        accountType: 'expense',
        pattern:
          'Expense growth significantly exceeds revenue growth — investigate cost drivers',
        confidence: 'medium',
      });
    }
  }

  return {
    accountComparisons,
    aggregateMetrics,
    unusualFluctuations: unusualFluctuations.sort(
      (a, b) =>
        Math.abs(b.absoluteChange) - Math.abs(a.absoluteChange)
    ),
    seasonalityIndicators,
  };
}
