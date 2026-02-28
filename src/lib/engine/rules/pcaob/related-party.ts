import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const relatedPartyRules: AuditRule[] = [
  {
    id: 'PCAOB-RP-001',
    name: 'Related Party Transaction Risk',
    framework: 'PCAOB',
    category: 'Related Party (AS 2410)',
    description: 'Identifies indicators of significant related party transactions requiring enhanced audit procedures',
    citation: 'AS 2410 - Related Parties',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Check for unusual large single-party transactions
      const largeEntries = data.journalEntries.filter(je => {
        const maxAmount = Math.max(...je.lines.map(l => Math.max(l.debit, l.credit)));
        return maxAmount > data.materialityThreshold * 0.5;
      });

      const unusualLargeEntries = largeEntries.filter(je =>
        je.description.toLowerCase().includes('transfer') ||
        je.description.toLowerCase().includes('reclassification') ||
        je.description.toLowerCase().includes('adjustment')
      );

      if (unusualLargeEntries.length > 0) {
        const totalAmount = unusualLargeEntries.reduce((sum, je) =>
          sum + Math.max(...je.lines.map(l => Math.max(l.debit, l.credit))), 0
        );

        findings.push(createFinding(
          data.engagementId,
          'PCAOB-RP-001',
          'PCAOB',
          'medium',
          'Large Unusual Transactions Require Related Party Assessment',
          `${unusualLargeEntries.length} large unusual transactions identified totaling $${(totalAmount / 1000000).toFixed(1)}M that should be evaluated for potential related party implications: ${unusualLargeEntries.map(e => `${e.entryNumber}: "${e.description}" ($${(Math.max(...e.lines.map(l => Math.max(l.debit, l.credit))) / 1000000).toFixed(1)}M)`).join('; ')}.`,
          'AS 2410.04: The auditor should perform procedures to identify related party relationships and transactions. AS 2410.11: The auditor should evaluate significant unusual transactions.',
          'Inquire of management about the nature and business purpose of each transaction. Obtain and review supporting documentation. Evaluate whether the transactions were conducted at arm\'s length. Consider whether disclosure is required under ASC 850.',
          totalAmount,
          unusualLargeEntries.map(e => e.entryNumber)
        ));
      }

      return findings;
    },
  },
];
