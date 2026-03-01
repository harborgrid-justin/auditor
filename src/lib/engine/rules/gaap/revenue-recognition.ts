import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const revenueRecognitionRules: AuditRule[] = [
  {
    id: 'GAAP-REV-001',
    name: 'Revenue Concentration Near Period End',
    framework: 'GAAP',
    category: 'Revenue Recognition (ASC 606)',
    description: 'Identifies unusual concentration of revenue recognition in the last month/quarter of the fiscal year',
    citation: 'ASC 606-10-25-1 through 25-5: Revenue recognized when performance obligations are satisfied',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const revenueAccounts = data.accounts.filter(a => a.accountType === 'revenue');
      const totalRevenue = revenueAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Check journal entries for year-end revenue spikes
      const yearEndJEs = data.journalEntries.filter(je => {
        const d = new Date(je.date);
        const fye = new Date(data.fiscalYearEnd);
        const daysBeforeEnd = (fye.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
        return daysBeforeEnd >= 0 && daysBeforeEnd <= 30;
      });

      const yearEndRevenue = yearEndJEs.reduce((sum, je) => {
        return sum + je.lines.filter(l =>
          l.accountName?.toLowerCase().includes('revenue') ||
          l.accountName?.toLowerCase().includes('sales')
        ).reduce((s, l) => s + l.credit, 0);
      }, 0);

      if (totalRevenue > 0 && yearEndRevenue / totalRevenue > 0.35) {
        findings.push(createFinding(
          data.engagementId,
          'GAAP-REV-001',
          'GAAP',
          'high',
          'Unusual Revenue Concentration Near Period End',
          `${((yearEndRevenue / totalRevenue) * 100).toFixed(1)}% of total revenue ($${(yearEndRevenue / 1000000).toFixed(1)}M of $${(totalRevenue / 1000000).toFixed(1)}M) was recognized in the last 30 days of the fiscal year. This concentration may indicate channel stuffing, bill-and-hold arrangements, or premature revenue recognition.`,
          'ASC 606-10-25-1: Revenue is recognized when (or as) the entity satisfies a performance obligation by transferring a promised good or service to a customer.',
          'Obtain and review supporting documentation for all significant revenue transactions in the last 30 days. Verify that performance obligations were satisfied, examine shipping documentation, customer acceptance, and right of return provisions. Consider whether side agreements or contingencies exist.',
          yearEndRevenue,
          revenueAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'GAAP-REV-002',
    name: 'Revenue Without Corresponding Receivables',
    framework: 'GAAP',
    category: 'Revenue Recognition (ASC 606)',
    description: 'Revenue recognized without corresponding increase in receivables or cash may indicate fictitious revenue',
    citation: 'ASC 606-10-32-2: Transaction price allocated to performance obligations',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const revenueAccounts = data.accounts.filter(a => a.accountType === 'revenue');
      const arAccounts = data.accounts.filter(a => a.subType === 'accounts_receivable');
      const cashAccounts = data.accounts.filter(a => a.subType === 'cash');

      const totalRevenue = revenueAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
      const arChange = arAccounts.reduce((sum, a) => sum + (a.endingBalance - a.beginningBalance), 0);
      const cashChange = cashAccounts.reduce((sum, a) => sum + (a.endingBalance - a.beginningBalance), 0);

      if (totalRevenue > 0 && arChange + cashChange < totalRevenue * 0.5) {
        const gap = totalRevenue - (arChange + cashChange);
        findings.push(createFinding(
          data.engagementId,
          'GAAP-REV-002',
          'GAAP',
          'medium',
          'Revenue Growth Outpaces Receivable and Cash Changes',
          `Revenue of $${(totalRevenue / 1000000).toFixed(1)}M is not fully supported by changes in accounts receivable ($${(arChange / 1000000).toFixed(1)}M) and cash ($${(cashChange / 1000000).toFixed(1)}M). The gap of $${(gap / 1000000).toFixed(1)}M requires investigation.`,
          'ASC 606-10-32-2: The transaction price is the amount of consideration to which an entity expects to be entitled in exchange for transferring promised goods or services.',
          'Reconcile revenue to cash collections and receivables. Identify any significant contra-revenue accounts, deferred revenue movements, or non-cash transactions that explain the difference.',
          gap,
          [...revenueAccounts, ...arAccounts].map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'GAAP-REV-003',
    name: 'Deferred Revenue Trend Analysis',
    framework: 'GAAP',
    category: 'Revenue Recognition (ASC 606)',
    description: 'Significant decrease in deferred revenue may indicate aggressive revenue recognition',
    citation: 'ASC 606-10-45-1: Contract liabilities (deferred revenue)',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const deferredRev = data.accounts.filter(a => a.subType === 'deferred_revenue');
      const totalDeferred = deferredRev.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
      const totalDeferredBeginning = deferredRev.reduce((sum, a) => sum + Math.abs(a.beginningBalance), 0);

      if (totalDeferredBeginning > 0) {
        const change = totalDeferred - totalDeferredBeginning;
        const changePct = change / totalDeferredBeginning;

        if (changePct > 0.40) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-REV-003',
            'GAAP',
            'medium',
            'Significant Increase in Deferred Revenue',
            `Deferred revenue increased by ${(changePct * 100).toFixed(1)}% from $${(totalDeferredBeginning / 1000000).toFixed(1)}M to $${(totalDeferred / 1000000).toFixed(1)}M. This may indicate changes in billing practices, contract terms, or timing of revenue recognition under ASC 606.`,
            'ASC 606-10-45-1: An entity shall recognize a contract liability for consideration received before performance obligations are satisfied.',
            'Review significant new contracts and amendments. Evaluate whether the increase is due to new business, changes in performance obligations, or modifications to contract terms.',
            Math.abs(change),
            deferredRev.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'GAAP-REV-004',
    name: 'Allowance for Doubtful Accounts Adequacy',
    framework: 'GAAP',
    category: 'Revenue Recognition / Receivables',
    description: 'Evaluates whether the allowance for doubtful accounts appears adequate relative to receivables',
    citation: 'ASC 326-20: Financial Instruments - Measured at Amortized Cost (CECL)',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const arAccounts = data.accounts.filter(a => a.subType === 'accounts_receivable');
      const grossAR = arAccounts.filter(a => a.endingBalance > 0).reduce((sum, a) => sum + a.endingBalance, 0);
      const allowance = Math.abs(arAccounts.filter(a => a.endingBalance < 0).reduce((sum, a) => sum + a.endingBalance, 0));

      if (grossAR > 0) {
        const allowancePct = allowance / grossAR;
        if (allowancePct < 0.02) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-REV-004',
            'GAAP',
            'medium',
            'Allowance for Doubtful Accounts May Be Inadequate',
            `The allowance for doubtful accounts is only ${(allowancePct * 100).toFixed(2)}% of gross AR ($${(allowance / 1000).toFixed(0)}K allowance against $${(grossAR / 1000000).toFixed(1)}M gross AR). Industry norms typically range from 2-5%. Under ASC 326 (CECL), expected credit losses should be estimated.`,
            'ASC 326-20-30-1: An entity shall measure expected credit losses on financial assets measured at amortized cost on a collective (pool) basis when similar risk characteristics exist.',
            'Perform aging analysis of receivables. Review historical loss rates, current conditions, and reasonable forecasts. Ensure CECL methodology is applied if applicable.',
            grossAR * 0.02 - allowance,
            arAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
];
