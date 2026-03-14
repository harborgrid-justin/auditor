import { describe, it, expect } from 'vitest';
import {
  SuspenseManager,
  type SuspenseItem,
  type EscalationPriority,
} from '../suspense-management';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeSuspenseItem(overrides?: Partial<SuspenseItem>): SuspenseItem {
  return {
    id: 'susp-001',
    accountNumber: 'F3875',
    accountTitle: 'Suspense — Budget Clearing Account',
    amount: 5_000,
    originalPostingDate: '2025-01-15',
    agingDays: 30,
    source: 'Treasury disbursement',
    description: 'Unclassified disbursement pending appropriation assignment',
    status: 'open',
    assignedTo: 'analyst-001',
    lastReviewDate: '2025-02-01',
    ...overrides,
  };
}

function makeItemWithAge(agingDays: number, amount: number = 5_000, overrides?: Partial<SuspenseItem>): SuspenseItem {
  return makeSuspenseItem({
    id: `susp-age-${agingDays}`,
    agingDays,
    amount,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SuspenseManager', () => {
  const manager = new SuspenseManager();

  // =========================================================================
  // analyzeAgingProfile — bucket assignments
  // =========================================================================

  describe('analyzeAgingProfile', () => {
    it('assigns items to correct aging buckets', () => {
      const items: SuspenseItem[] = [
        makeItemWithAge(10, 1_000),   // 0-30 bucket
        makeItemWithAge(25, 2_000),   // 0-30 bucket
        makeItemWithAge(45, 3_000),   // 31-60 bucket
        makeItemWithAge(75, 4_000),   // 61-90 bucket
        makeItemWithAge(120, 5_000),  // 91-180 bucket
        makeItemWithAge(200, 6_000),  // 180+ bucket
      ];

      const analysis = manager.analyzeAgingProfile(items);

      expect(analysis.totalItems).toBe(6);
      expect(analysis.agingBuckets).toHaveLength(5);

      const bucket0to30 = analysis.agingBuckets.find(b => b.range === '0-30');
      expect(bucket0to30!.count).toBe(2);
      expect(bucket0to30!.totalAmount).toBe(3_000);

      const bucket31to60 = analysis.agingBuckets.find(b => b.range === '31-60');
      expect(bucket31to60!.count).toBe(1);
      expect(bucket31to60!.totalAmount).toBe(3_000);

      const bucket61to90 = analysis.agingBuckets.find(b => b.range === '61-90');
      expect(bucket61to90!.count).toBe(1);
      expect(bucket61to90!.totalAmount).toBe(4_000);

      const bucket91to180 = analysis.agingBuckets.find(b => b.range === '91-180');
      expect(bucket91to180!.count).toBe(1);
      expect(bucket91to180!.totalAmount).toBe(5_000);

      const bucket180plus = analysis.agingBuckets.find(b => b.range === '180+');
      expect(bucket180plus!.count).toBe(1);
      expect(bucket180plus!.totalAmount).toBe(6_000);
    });

    it('calculates correct total amount and average age', () => {
      const items = [
        makeItemWithAge(30, 1_000),
        makeItemWithAge(60, 2_000),
        makeItemWithAge(90, 3_000),
      ];

      const analysis = manager.analyzeAgingProfile(items);

      expect(analysis.totalAmount).toBe(6_000);
      expect(analysis.averageAgeDays).toBe(60);
      expect(analysis.oldestItemDays).toBe(90);
    });

    it('excludes cleared and written_off items from analysis', () => {
      const items = [
        makeItemWithAge(30, 1_000),
        makeItemWithAge(60, 2_000, { status: 'cleared' }),
        makeItemWithAge(90, 3_000, { status: 'written_off' }),
      ];

      const analysis = manager.analyzeAgingProfile(items);

      expect(analysis.totalItems).toBe(1);
      expect(analysis.totalAmount).toBe(1_000);
    });

    it('includes escalated items in analysis', () => {
      const items = [
        makeItemWithAge(120, 5_000, { status: 'escalated' }),
        makeItemWithAge(30, 1_000),
      ];

      const analysis = manager.analyzeAgingProfile(items);

      expect(analysis.totalItems).toBe(2);
    });

    it('returns zero statistics for empty item list', () => {
      const analysis = manager.analyzeAgingProfile([]);

      expect(analysis.totalItems).toBe(0);
      expect(analysis.totalAmount).toBe(0);
      expect(analysis.averageAgeDays).toBe(0);
      expect(analysis.oldestItemDays).toBe(0);
      expect(analysis.overdueItems).toBe(0);
    });

    it('generates alerts for items over 180 days', () => {
      const items = [
        makeItemWithAge(200, 10_000),
        makeItemWithAge(250, 20_000),
      ];

      const analysis = manager.analyzeAgingProfile(items);

      const criticalAlert = analysis.alerts.find(
        a => a.severity === 'critical' && a.message.includes('180 days'),
      );
      expect(criticalAlert).toBeDefined();
      expect(criticalAlert!.itemCount).toBe(2);
    });

    it('generates alerts for high-dollar items over $1M', () => {
      const items = [
        makeItemWithAge(30, 2_000_000),
      ];

      const analysis = manager.analyzeAgingProfile(items);

      const dollarAlert = analysis.alerts.find(
        a => a.severity === 'critical' && a.message.includes('$1M'),
      );
      expect(dollarAlert).toBeDefined();
      expect(dollarAlert!.itemCount).toBe(1);
    });
  });

  // =========================================================================
  // identifyOverdueItems (> 90 days)
  // =========================================================================

  describe('identifyOverdueItems', () => {
    it('identifies items exceeding 90-day threshold', () => {
      const items = [
        makeItemWithAge(30),
        makeItemWithAge(60),
        makeItemWithAge(91),
        makeItemWithAge(120),
        makeItemWithAge(200),
      ];

      const overdue = manager.identifyOverdueItems(items);

      expect(overdue).toHaveLength(3);
      expect(overdue.every(item => item.agingDays > 90)).toBe(true);
    });

    it('returns empty array when no items are overdue', () => {
      const items = [
        makeItemWithAge(10),
        makeItemWithAge(45),
        makeItemWithAge(89),
      ];

      const overdue = manager.identifyOverdueItems(items);

      expect(overdue).toHaveLength(0);
    });

    it('accepts custom age threshold', () => {
      const items = [
        makeItemWithAge(30),
        makeItemWithAge(60),
        makeItemWithAge(91),
      ];

      const overdue = manager.identifyOverdueItems(items, 60);

      expect(overdue).toHaveLength(1);
      expect(overdue[0].agingDays).toBe(91);
    });

    it('excludes cleared items', () => {
      const items = [
        makeItemWithAge(120, 5_000, { status: 'cleared' }),
        makeItemWithAge(150, 5_000, { status: 'open' }),
      ];

      const overdue = manager.identifyOverdueItems(items);

      expect(overdue).toHaveLength(1);
      expect(overdue[0].status).toBe('open');
    });

    it('includes escalated items', () => {
      const items = [
        makeItemWithAge(120, 5_000, { status: 'escalated' }),
      ];

      const overdue = manager.identifyOverdueItems(items);

      expect(overdue).toHaveLength(1);
    });
  });

  // =========================================================================
  // calculateEscalationPriority
  // =========================================================================

  describe('calculateEscalationPriority', () => {
    it('returns critical for items over 180 days', () => {
      const item = makeItemWithAge(200, 500);

      const priority = manager.calculateEscalationPriority(item);

      expect(priority).toBe('critical');
    });

    it('returns critical for items over $1M', () => {
      const item = makeItemWithAge(10, 1_500_000);

      const priority = manager.calculateEscalationPriority(item);

      expect(priority).toBe('critical');
    });

    it('returns high for items over $100K', () => {
      const item = makeItemWithAge(10, 150_000);

      const priority = manager.calculateEscalationPriority(item);

      expect(priority).toBe('high');
    });

    it('returns high for items over 120 days', () => {
      const item = makeItemWithAge(130, 5_000);

      const priority = manager.calculateEscalationPriority(item);

      expect(priority).toBe('high');
    });

    it('returns medium for items over $10K', () => {
      const item = makeItemWithAge(10, 25_000);

      const priority = manager.calculateEscalationPriority(item);

      expect(priority).toBe('medium');
    });

    it('returns medium for items over 60 days', () => {
      const item = makeItemWithAge(75, 500);

      const priority = manager.calculateEscalationPriority(item);

      expect(priority).toBe('medium');
    });

    it('returns low for small, recent items', () => {
      const item = makeItemWithAge(15, 500);

      const priority = manager.calculateEscalationPriority(item);

      expect(priority).toBe('low');
    });

    it('uses absolute value for negative amounts', () => {
      const item = makeItemWithAge(10, -200_000);

      const priority = manager.calculateEscalationPriority(item);

      expect(priority).toBe('high');
    });
  });

  // =========================================================================
  // getAccountSummary
  // =========================================================================

  describe('getAccountSummary', () => {
    it('groups items by account number', () => {
      const items = [
        makeSuspenseItem({ id: 'a1', accountNumber: 'F3875', amount: 1_000, agingDays: 30 }),
        makeSuspenseItem({ id: 'a2', accountNumber: 'F3875', amount: 2_000, agingDays: 60 }),
        makeSuspenseItem({ id: 'b1', accountNumber: 'F3880', amount: 5_000, agingDays: 90 }),
      ];

      const summaries = manager.getAccountSummary(items);

      expect(summaries).toHaveLength(2);

      const f3875 = summaries.find(s => s.accountNumber === 'F3875');
      expect(f3875).toBeDefined();
      expect(f3875!.itemCount).toBe(2);
      expect(f3875!.totalAmount).toBe(3_000);
      expect(f3875!.oldestItemDays).toBe(60);
      expect(f3875!.averageAgeDays).toBe(45);

      const f3880 = summaries.find(s => s.accountNumber === 'F3880');
      expect(f3880).toBeDefined();
      expect(f3880!.itemCount).toBe(1);
      expect(f3880!.totalAmount).toBe(5_000);
    });

    it('sorts summaries by total amount descending', () => {
      const items = [
        makeSuspenseItem({ id: 'a1', accountNumber: 'F3875', amount: 1_000 }),
        makeSuspenseItem({ id: 'b1', accountNumber: 'F3880', amount: 10_000 }),
        makeSuspenseItem({ id: 'c1', accountNumber: 'F3885', amount: 5_000 }),
      ];

      const summaries = manager.getAccountSummary(items);

      expect(summaries[0].accountNumber).toBe('F3880');
      expect(summaries[1].accountNumber).toBe('F3885');
      expect(summaries[2].accountNumber).toBe('F3875');
    });

    it('returns empty array for no items', () => {
      const summaries = manager.getAccountSummary([]);

      expect(summaries).toHaveLength(0);
    });
  });

  // =========================================================================
  // generateClearingRecommendations
  // =========================================================================

  describe('generateClearingRecommendations', () => {
    it('recommends write-off for old, small-dollar items', () => {
      const items = [
        makeItemWithAge(200, 5_000), // >180 days and < $10K
      ];

      const recommendations = manager.generateClearingRecommendations(items);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].recommendedAction).toBe('write_off');
      expect(recommendations[0].priority).toBe('critical');
    });

    it('recommends return_to_source for items over 120 days', () => {
      const items = [
        makeItemWithAge(130, 50_000), // >120 days and >= $10K
      ];

      const recommendations = manager.generateClearingRecommendations(items);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].recommendedAction).toBe('return_to_source');
    });

    it('recommends reclassify for moderately aged items', () => {
      const items = [
        makeItemWithAge(75, 5_000), // >60 days
      ];

      const recommendations = manager.generateClearingRecommendations(items);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].recommendedAction).toBe('reclassify');
    });

    it('sorts recommendations by priority (critical first)', () => {
      const items = [
        makeItemWithAge(15, 500),        // low priority
        makeItemWithAge(200, 5_000),     // critical (>180 days)
        makeItemWithAge(75, 25_000),     // medium
        makeItemWithAge(130, 150_000),   // high
      ];

      const recommendations = manager.generateClearingRecommendations(items);

      expect(recommendations[0].priority).toBe('critical');
      expect(recommendations[recommendations.length - 1].priority).toBe('low');
    });

    it('excludes cleared items from recommendations', () => {
      const items = [
        makeItemWithAge(200, 5_000, { status: 'cleared' }),
      ];

      const recommendations = manager.generateClearingRecommendations(items);

      expect(recommendations).toHaveLength(0);
    });
  });
});
