/**
 * Suspense Account Management Engine
 *
 * Manages and analyzes transactions posted to suspense accounts pending
 * proper classification. Per DoD FMR Vol. 4, Ch. 3, suspense accounts
 * hold transactions that cannot be immediately classified to the correct
 * appropriation or account. Items in suspense must be resolved promptly
 * to maintain accurate financial reporting.
 *
 * Treasury suspense accounts (F3875, F3880, F3885) are a significant
 * source of FBWT reconciliation differences. Aged suspense items are
 * a recurring audit finding and indicator of internal control weakness.
 *
 * This engine provides:
 *   1. Aging analysis with configurable bucket ranges
 *   2. Overdue item identification per DoD FMR Vol. 4 requirements
 *   3. Clearing recommendations based on age and amount
 *   4. Escalation priority calculation for management attention
 *   5. Account-level summarization for reporting
 *
 * References:
 *   - DoD FMR Vol. 4, Ch. 3  (Deposits and Collections)
 *   - DoD FMR Vol. 4, Ch. 5  (Fund Balance with Treasury)
 *   - Treasury Financial Manual Vol. I, Part 2, Ch. 5100
 *   - USSGL Accounts 2400/2410 (Deposit/Suspense Funds)
 *   - OMB Circular A-136 (Disclosures for suspense activity)
 */

import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SuspenseItemStatus = 'open' | 'cleared' | 'escalated' | 'written_off';
export type EscalationPriority = 'critical' | 'high' | 'medium' | 'low';
export type ClearingAction = 'reclassify' | 'return_to_source' | 'write_off' | 'transfer' | 'apply_to_obligation';

export interface SuspenseItem {
  id: string;
  accountNumber: string;
  accountTitle: string;
  amount: number;
  originalPostingDate: string;
  agingDays: number;
  source: string;
  description: string;
  status: SuspenseItemStatus;
  assignedTo: string;
  lastReviewDate: string;
}

export interface SuspenseAgingBucket {
  range: string;
  count: number;
  totalAmount: number;
}

export interface SuspenseAlert {
  severity: EscalationPriority;
  message: string;
  itemCount: number;
  totalAmount: number;
}

export interface SuspenseAnalysis {
  totalItems: number;
  totalAmount: number;
  agingBuckets: SuspenseAgingBucket[];
  overdueItems: number;
  averageAgeDays: number;
  oldestItemDays: number;
  alerts: SuspenseAlert[];
}

export interface ClearingRecommendation {
  itemId: string;
  accountNumber: string;
  amount: number;
  agingDays: number;
  recommendedAction: ClearingAction;
  reason: string;
  priority: EscalationPriority;
}

export interface AccountSummary {
  accountNumber: string;
  accountTitle: string;
  itemCount: number;
  totalAmount: number;
  oldestItemDays: number;
  averageAgeDays: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Aging bucket definitions for suspense analysis. */
const AGING_BUCKETS: Array<{ range: string; min: number; max: number }> = [
  { range: '0-30', min: 0, max: 30 },
  { range: '31-60', min: 31, max: 60 },
  { range: '61-90', min: 61, max: 90 },
  { range: '91-180', min: 91, max: 180 },
  { range: '180+', min: 181, max: Infinity },
];

/**
 * Default maximum age in days before a suspense item is considered overdue.
 * Per DoD FMR Vol. 4, Ch. 3, suspense items should be cleared within 90 days.
 */
const DEFAULT_MAX_AGE_DAYS = 90;

/**
 * Dollar thresholds for escalation priority classification.
 * Items above these amounts receive higher priority for resolution.
 */
const CRITICAL_AMOUNT_THRESHOLD = 1_000_000;
const HIGH_AMOUNT_THRESHOLD = 100_000;
const MEDIUM_AMOUNT_THRESHOLD = 10_000;

/**
 * Age thresholds (in days) for escalation priority.
 */
const CRITICAL_AGE_DAYS = 180;
const HIGH_AGE_DAYS = 120;
const MEDIUM_AGE_DAYS = 60;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Manages suspense account items, provides aging analysis, and generates
 * clearing recommendations to support timely resolution of unclassified
 * transactions.
 */
export class SuspenseManager {
  /**
   * Categorizes suspense items into aging buckets and produces a
   * comprehensive analysis including alerts for items requiring
   * management attention.
   *
   * Ref: DoD FMR Vol. 4, Ch. 5, para 050302
   *
   * @param items - Suspense items to analyze.
   * @returns A SuspenseAnalysis with aging buckets, statistics, and alerts.
   */
  analyzeAgingProfile(items: SuspenseItem[]): SuspenseAnalysis {
    const openItems = items.filter(item => item.status === 'open' || item.status === 'escalated');

    // Build aging buckets
    const agingBuckets: SuspenseAgingBucket[] = AGING_BUCKETS.map(bucket => {
      const bucketItems = openItems.filter(
        item => item.agingDays >= bucket.min && item.agingDays <= bucket.max,
      );
      return {
        range: bucket.range,
        count: bucketItems.length,
        totalAmount: Math.round(
          bucketItems.reduce((sum, item) => sum + Math.abs(item.amount), 0) * 100,
        ) / 100,
      };
    });

    // Calculate statistics
    const totalAmount = Math.round(
      openItems.reduce((sum, item) => sum + Math.abs(item.amount), 0) * 100,
    ) / 100;

    const overdueItems = openItems.filter(item => item.agingDays > DEFAULT_MAX_AGE_DAYS).length;

    const averageAgeDays = openItems.length > 0
      ? Math.round(openItems.reduce((sum, item) => sum + item.agingDays, 0) / openItems.length)
      : 0;

    const oldestItemDays = openItems.length > 0
      ? Math.max(...openItems.map(item => item.agingDays))
      : 0;

    // Generate alerts
    const alerts: SuspenseAlert[] = [];

    // Alert: items over 180 days (critical)
    const criticalItems = openItems.filter(item => item.agingDays > CRITICAL_AGE_DAYS);
    if (criticalItems.length > 0) {
      alerts.push({
        severity: 'critical',
        message: `${criticalItems.length} suspense item(s) exceed 180 days - immediate resolution required per DoD FMR Vol. 4, Ch. 3`,
        itemCount: criticalItems.length,
        totalAmount: Math.round(
          criticalItems.reduce((sum, item) => sum + Math.abs(item.amount), 0) * 100,
        ) / 100,
      });
    }

    // Alert: high-dollar items
    const highDollarItems = openItems.filter(item => Math.abs(item.amount) >= CRITICAL_AMOUNT_THRESHOLD);
    if (highDollarItems.length > 0) {
      alerts.push({
        severity: 'critical',
        message: `${highDollarItems.length} suspense item(s) exceed $1M threshold - CFO/comptroller review required`,
        itemCount: highDollarItems.length,
        totalAmount: Math.round(
          highDollarItems.reduce((sum, item) => sum + Math.abs(item.amount), 0) * 100,
        ) / 100,
      });
    }

    // Alert: overdue items (over 90 days)
    if (overdueItems > 0) {
      const overdueItemsList = openItems.filter(item => item.agingDays > DEFAULT_MAX_AGE_DAYS);
      alerts.push({
        severity: 'high',
        message: `${overdueItems} suspense item(s) exceed the 90-day clearing threshold`,
        itemCount: overdueItems,
        totalAmount: Math.round(
          overdueItemsList.reduce((sum, item) => sum + Math.abs(item.amount), 0) * 100,
        ) / 100,
      });
    }

    return {
      totalItems: openItems.length,
      totalAmount,
      agingBuckets,
      overdueItems,
      averageAgeDays,
      oldestItemDays,
      alerts,
    };
  }

  /**
   * Identifies suspense items that exceed the maximum age threshold.
   * Per DoD FMR Vol. 4, suspense items should be cleared within 90 days.
   * Items exceeding this threshold are flagged for escalation.
   *
   * @param items      - Suspense items to evaluate.
   * @param maxAgeDays - Maximum allowable age in days (default 90).
   * @returns Items exceeding the age threshold.
   */
  identifyOverdueItems(items: SuspenseItem[], maxAgeDays: number = DEFAULT_MAX_AGE_DAYS): SuspenseItem[] {
    return items.filter(
      item =>
        (item.status === 'open' || item.status === 'escalated') &&
        item.agingDays > maxAgeDays,
    );
  }

  /**
   * Generates clearing recommendations for aged suspense items based on
   * amount, age, and source characteristics. Recommendations follow
   * DoD FMR guidance for suspense resolution.
   *
   * Ref: DoD FMR Vol. 4, Ch. 3, para 030401
   *
   * @param items - Suspense items needing clearing recommendations.
   * @returns An array of clearing recommendations sorted by priority.
   */
  generateClearingRecommendations(items: SuspenseItem[]): ClearingRecommendation[] {
    const openItems = items.filter(item => item.status === 'open' || item.status === 'escalated');
    const recommendations: ClearingRecommendation[] = [];

    for (const item of openItems) {
      const priority = this.calculateEscalationPriority(item);
      let recommendedAction: ClearingAction;
      let reason: string;

      if (item.agingDays > CRITICAL_AGE_DAYS && Math.abs(item.amount) < MEDIUM_AMOUNT_THRESHOLD) {
        // Old, small-dollar items: recommend write-off after due diligence
        recommendedAction = 'write_off';
        reason = `Item aged ${item.agingDays} days with amount below $${MEDIUM_AMOUNT_THRESHOLD.toLocaleString()} - consider write-off after due diligence per DoD FMR Vol. 4, Ch. 3`;
      } else if (item.agingDays > HIGH_AGE_DAYS) {
        // Old items: recommend return to source for reprocessing
        recommendedAction = 'return_to_source';
        reason = `Item aged ${item.agingDays} days exceeds 120-day threshold - return to originating source for proper classification`;
      } else if (item.agingDays > MEDIUM_AGE_DAYS) {
        // Moderately aged: recommend reclassification
        recommendedAction = 'reclassify';
        reason = `Item aged ${item.agingDays} days - research original transaction and reclassify to correct appropriation/account`;
      } else if (item.source.toLowerCase().includes('obligation') || item.source.toLowerCase().includes('contract')) {
        // Source suggests obligation linkage
        recommendedAction = 'apply_to_obligation';
        reason = 'Source indicates contract/obligation context - match to existing obligation and apply';
      } else {
        // Default: reclassify
        recommendedAction = 'reclassify';
        reason = 'Research source documentation and reclassify to correct Treasury account symbol';
      }

      recommendations.push({
        itemId: item.id,
        accountNumber: item.accountNumber,
        amount: item.amount,
        agingDays: item.agingDays,
        recommendedAction,
        reason,
        priority,
      });
    }

    // Sort by priority: critical > high > medium > low
    const priorityOrder: Record<EscalationPriority, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return recommendations;
  }

  /**
   * Calculates the escalation priority for a suspense item based on its
   * dollar amount and age. Higher amounts and older items receive higher
   * priority.
   *
   * Priority levels:
   *   - critical: amount >= $1M OR age > 180 days
   *   - high:     amount >= $100K OR age > 120 days
   *   - medium:   amount >= $10K OR age > 60 days
   *   - low:      all other items
   *
   * @param item - The suspense item to evaluate.
   * @returns The escalation priority level.
   */
  calculateEscalationPriority(item: SuspenseItem): EscalationPriority {
    const absAmount = Math.abs(item.amount);

    // Critical: very high dollar or very old
    if (absAmount >= CRITICAL_AMOUNT_THRESHOLD || item.agingDays > CRITICAL_AGE_DAYS) {
      return 'critical';
    }

    // High: high dollar or old
    if (absAmount >= HIGH_AMOUNT_THRESHOLD || item.agingDays > HIGH_AGE_DAYS) {
      return 'high';
    }

    // Medium: moderate dollar or moderately old
    if (absAmount >= MEDIUM_AMOUNT_THRESHOLD || item.agingDays > MEDIUM_AGE_DAYS) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Groups suspense items by account number and produces subtotals
   * for each account, including item count, total amount, oldest item
   * age, and average age.
   *
   * @param items - All suspense items to summarize.
   * @returns An array of account-level summaries.
   */
  getAccountSummary(items: SuspenseItem[]): AccountSummary[] {
    const accountMap = new Map<string, SuspenseItem[]>();

    for (const item of items) {
      const existing = accountMap.get(item.accountNumber) || [];
      existing.push(item);
      accountMap.set(item.accountNumber, existing);
    }

    const summaries: AccountSummary[] = [];

    for (const [accountNumber, accountItems] of Array.from(accountMap.entries())) {
      const firstItem = accountItems[0];
      const totalAmount = Math.round(
        accountItems.reduce((sum, item) => sum + Math.abs(item.amount), 0) * 100,
      ) / 100;
      const oldestItemDays = Math.max(...accountItems.map(item => item.agingDays));
      const averageAgeDays = Math.round(
        accountItems.reduce((sum, item) => sum + item.agingDays, 0) / accountItems.length,
      );

      summaries.push({
        accountNumber,
        accountTitle: firstItem.accountTitle,
        itemCount: accountItems.length,
        totalAmount,
        oldestItemDays,
        averageAgeDays,
      });
    }

    // Sort by total amount descending
    summaries.sort((a, b) => b.totalAmount - a.totalAmount);

    return summaries;
  }
}
