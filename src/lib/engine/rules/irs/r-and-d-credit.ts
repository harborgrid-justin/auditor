import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const rdCreditRules: AuditRule[] = [
  {
    id: 'IRS-RD-001',
    name: 'R&D Credit Qualification',
    framework: 'IRS',
    category: 'R&D Tax Credit',
    description: 'Validates R&D credit calculations against qualified research expenses',
    citation: 'IRC §41 - Credit for increasing research activities',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const qre = data.taxData.find(t =>
        t.formType === '6765' && t.lineNumber === '1'
      );
      const rdCredit = data.taxData.find(t =>
        t.formType === '6765' && t.lineNumber === '9'
      );
      const rdExpense = data.accounts.filter(a =>
        a.accountName.toLowerCase().includes('research') ||
        a.accountName.toLowerCase().includes('r&d') ||
        a.accountName.toLowerCase().includes('development')
      ).reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (qre && rdCredit) {
        // Typical R&D credit rate is approximately 5-6.5% of QREs (regular method) or ~14% (ASC method simplified)
        const effectiveRate = rdCredit.amount / qre.amount;

        if (effectiveRate > 0.15) {
          findings.push(createFinding(
            data.engagementId,
            'IRS-RD-001',
            'IRS',
            'medium',
            'R&D Credit Rate Appears High',
            `R&D credit of $${(rdCredit.amount / 1000).toFixed(0)}K on QREs of $${(qre.amount / 1000000).toFixed(1)}M implies an effective rate of ${(effectiveRate * 100).toFixed(1)}%. The regular credit rate is 20% of incremental QREs (typically resulting in 5-7% effective rate), or 14% under ASC method (resulting in ~4.7% effective rate after §280C reduction).`,
            'IRC §41(a): The research credit is equal to 20% of the excess of qualified research expenses over the base amount.',
            'Verify credit calculation method (regular vs ASC). Ensure base amount is properly computed for regular method. Verify all QREs meet the four-part test: technological in nature, permitted purpose, elimination of uncertainty, and process of experimentation.',
            null
          ));
        }

        // Cross-check QRE to book R&D expense
        if (rdExpense > 0 && qre.amount > rdExpense) {
          findings.push(createFinding(
            data.engagementId,
            'IRS-RD-001a',
            'IRS',
            'medium',
            'QRE Exceeds Book R&D Expense',
            `Qualified research expenses ($${(qre.amount / 1000000).toFixed(1)}M) exceed book R&D expense ($${(rdExpense / 1000000).toFixed(1)}M). While QREs can include contract research and supply costs not in the R&D line item, this warrants verification.`,
            'IRC §41(b): Qualified research expenses include in-house research expenses and contract research expenses.',
            'Document the reconciliation of QREs to book R&D expense. Identify which additional costs are included (supplies, contract research, employee wages from non-R&D departments). Ensure all QREs meet the four-part test.',
            qre.amount - rdExpense
          ));
        }
      }

      return findings;
    },
  },
];
