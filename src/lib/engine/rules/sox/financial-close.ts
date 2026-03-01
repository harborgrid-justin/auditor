import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const financialCloseRules: AuditRule[] = [
  {
    id: 'SOX-FC-001',
    name: 'Year-End Adjusting Entry Volume',
    framework: 'SOX',
    category: 'Financial Close',
    description: 'Flags excessive number of adjusting entries at year-end',
    citation: 'SOX 404 - Effective financial close controls',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const fyeDate = new Date(data.fiscalYearEnd);
      const lastMonth = data.journalEntries.filter(je => {
        const d = new Date(je.date);
        const diff = (fyeDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 7;
      });

      const manualEntries = lastMonth.filter(je => je.source === 'manual');
      if (manualEntries.length > 3) {
        const totalAmount = manualEntries.reduce((sum, je) =>
          sum + je.lines.reduce((s, l) => s + l.debit, 0), 0
        );

        findings.push(createFinding(
          data.engagementId,
          'SOX-FC-001',
          'SOX',
          'medium',
          'High Volume of Manual Year-End Adjustments',
          `${manualEntries.length} manual journal entries were posted in the last 7 days of the fiscal year, totaling $${(totalAmount / 1000000).toFixed(1)}M. High volume of manual entries near period-end may indicate weak financial close controls or earnings management.`,
          'SOX 404: Management must assess the effectiveness of the financial close process. COSO Principle 13: Relevant information should be identified, captured, and communicated in a timely manner.',
          'Review all year-end manual entries for proper authorization and business purpose. Evaluate whether the volume indicates weaknesses in the monthly/quarterly close process. Consider whether additional automation would reduce year-end adjustments.',
          totalAmount,
          manualEntries.map(m => m.entryNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'SOX-FC-002',
    name: 'Unreconciled Balance Sheet Accounts',
    framework: 'SOX',
    category: 'Financial Close',
    description: 'Identifies balance sheet accounts with unusual variances suggesting lack of reconciliation',
    citation: 'SOX 404 - Account reconciliation controls',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const bsAccounts = data.accounts.filter(a =>
        ['asset', 'liability', 'equity'].includes(a.accountType) &&
        a.subType !== 'retained_earnings'
      );

      const largeChanges = bsAccounts.filter(a => {
        if (a.beginningBalance === 0) return false;
        const changePct = Math.abs((a.endingBalance - a.beginningBalance) / a.beginningBalance);
        return changePct > 0.5 && Math.abs(a.endingBalance - a.beginningBalance) > data.materialityThreshold * 0.5;
      });

      if (largeChanges.length > 3) {
        findings.push(createFinding(
          data.engagementId,
          'SOX-FC-002',
          'SOX',
          'medium',
          'Multiple Balance Sheet Accounts with Large Unexplained Variances',
          `${largeChanges.length} balance sheet accounts show changes exceeding 50% of beginning balance: ${largeChanges.map(a => `${a.accountNumber} ${a.accountName} (${((a.endingBalance - a.beginningBalance) / a.beginningBalance * 100).toFixed(0)}%)`).join('; ')}. These may indicate inadequate monthly reconciliation procedures.`,
          'SOX 404: Key controls include monthly account reconciliations with management review. Significant variances should be investigated and documented.',
          'Obtain reconciliations for all flagged accounts. Verify that the changes are supported by underlying transactions. Evaluate whether the monthly reconciliation process is operating effectively.',
          null,
          largeChanges.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
];
