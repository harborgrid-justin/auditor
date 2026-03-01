import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const relatedPartyRules: AuditRule[] = [
  {
    id: 'IRS-RP-001',
    name: 'Related Party Transaction Indicators',
    framework: 'IRS',
    category: 'Related Party',
    description: 'Identifies potential related party transactions that require IRC §267/§482 analysis',
    citation: 'IRC §267 - Losses, expenses, and interest with respect to transactions between related taxpayers',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Look for intercompany/related party indicators in journal entries
      const rpEntries = data.journalEntries.filter(je =>
        je.description.toLowerCase().includes('intercompany') ||
        je.description.toLowerCase().includes('related party') ||
        je.description.toLowerCase().includes('affiliated') ||
        je.description.toLowerCase().includes('management fee') ||
        je.description.toLowerCase().includes('transfer')
      );

      if (rpEntries.length > 0) {
        const totalAmount = rpEntries.reduce((sum, je) =>
          sum + je.lines.reduce((s, l) => s + l.debit, 0), 0
        );

        findings.push(createFinding(
          data.engagementId,
          'IRS-RP-001',
          'IRS',
          'medium',
          'Related Party Transactions Identified - §267/§482 Review Required',
          `${rpEntries.length} journal entries totaling $${(totalAmount / 1000000).toFixed(1)}M contain indicators of related party transactions. These require review under IRC §267 (loss disallowance) and §482 (arm's length pricing).`,
          'IRC §267(a): No deduction shall be allowed for losses from sales or exchanges of property between related persons. IRC §482: The Secretary may distribute, apportion, or allocate gross income, deductions, credits, or allowances between related organizations.',
          'Identify all related parties per §267(b) definition. Verify arm\'s length pricing for all intercompany transactions. Document transfer pricing methodology. Ensure §267 loss disallowance rules are applied. Consider §482 documentation requirements.',
          totalAmount
        ));
      }

      return findings;
    },
  },
];
