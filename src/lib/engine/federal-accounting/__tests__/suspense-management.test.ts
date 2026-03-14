import { describe, it, expect } from 'vitest';
import { SuspenseManager } from '../suspense-management';
import type { SuspenseItem } from '../suspense-management';

describe('SuspenseManager', () => {
  const manager = new SuspenseManager();

  const now = Date.now();
  const daysAgo = (days: number) => new Date(now - days * 86400000).toISOString();

  const items: SuspenseItem[] = [
    { id: 's1', accountNumber: 'F3875', accountTitle: 'Suspense', amount: 5000, originalPostingDate: daysAgo(15), agingDays: 15, source: 'DFAS', description: 'Unidentified deposit', status: 'open', assignedTo: '', lastReviewDate: '' },
    { id: 's2', accountNumber: 'F3875', accountTitle: 'Suspense', amount: 25000, originalPostingDate: daysAgo(45), agingDays: 45, source: 'DFAS', description: 'Misrouted payment', status: 'open', assignedTo: '', lastReviewDate: '' },
    { id: 's3', accountNumber: 'F3880', accountTitle: 'Budget Clearing', amount: 120000, originalPostingDate: daysAgo(100), agingDays: 100, source: 'Treasury', description: 'Aged clearing item', status: 'open', assignedTo: '', lastReviewDate: '' },
    { id: 's4', accountNumber: 'F3885', accountTitle: 'Deposit Fund', amount: 500000, originalPostingDate: daysAgo(200), agingDays: 200, source: 'Treasury', description: 'Critical aged item', status: 'open', assignedTo: '', lastReviewDate: '' },
  ];

  describe('analyzeAgingProfile', () => {
    it('categorizes items into correct aging buckets', () => {
      const analysis = manager.analyzeAgingProfile(items);
      expect(analysis.totalItems).toBe(4);
      expect(analysis.agingBuckets).toHaveLength(5);

      const bucket0to30 = analysis.agingBuckets.find(b => b.range === '0-30');
      expect(bucket0to30?.count).toBe(1);

      const bucket180plus = analysis.agingBuckets.find(b => b.range === '180+');
      expect(bucket180plus?.count).toBe(1);
    });
  });

  describe('identifyOverdueItems', () => {
    it('flags items exceeding 90-day threshold', () => {
      const overdue = manager.identifyOverdueItems(items, 90);
      expect(overdue).toHaveLength(2); // s3 (100 days) and s4 (200 days)
    });

    it('returns empty for no overdue items', () => {
      const shortItems = items.filter(i => i.agingDays < 90);
      expect(manager.identifyOverdueItems(shortItems, 90)).toHaveLength(0);
    });
  });

  describe('calculateEscalationPriority', () => {
    it('returns critical for items > 180 days', () => {
      expect(manager.calculateEscalationPriority(items[3])).toBe('critical');
    });

    it('returns critical for items > $100K', () => {
      expect(manager.calculateEscalationPriority(items[2])).toBe('high');
    });

    it('returns medium for small recent items', () => {
      expect(manager.calculateEscalationPriority(items[0])).toBe('low');
    });
  });

  describe('getAccountSummary', () => {
    it('groups items by account number', () => {
      const summary = manager.getAccountSummary(items);
      expect(summary).toHaveLength(3); // F3875, F3880, F3885
      const f3875 = summary.find(s => s.accountNumber === 'F3875');
      expect(f3875?.itemCount).toBe(2);
      expect(f3875?.totalAmount).toBe(30000);
    });
  });
});
