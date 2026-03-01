import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const incomeMatchingRules: AuditRule[] = [
  {
    id: 'IRS-INC-001',
    name: 'Book vs Tax Income Reconciliation',
    framework: 'IRS',
    category: 'Income Matching',
    description: 'Verifies that book income reconciles to taxable income through Schedule M adjustments',
    citation: 'IRC §446 - General rule for methods of accounting',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const isStatements = data.financialStatements.filter(fs => fs.statementType === 'IS');
      if (isStatements.length === 0) return findings;

      const isData = JSON.parse(typeof isStatements[0].data === 'string' ? isStatements[0].data : JSON.stringify(isStatements[0].data));
      const bookNetIncome = isData.netIncome || 0;

      const taxIncome = data.taxData.filter(t =>
        t.formType === '1120' && t.schedule === 'main' && t.lineNumber === '30'
      );
      const taxableIncome = taxIncome[0]?.amount || 0;

      const scheduleM = data.taxData.filter(t =>
        t.formType === '1120' && t.schedule.includes('Schedule M')
      );

      if (taxableIncome > 0 && bookNetIncome > 0) {
        const diff = taxableIncome - bookNetIncome;
        const bookTaxDiffPct = Math.abs(diff) / bookNetIncome;

        if (bookTaxDiffPct > 0.5 && scheduleM.length === 0) {
          findings.push(createFinding(
            data.engagementId,
            'IRS-INC-001',
            'IRS',
            'high',
            'Book-Tax Difference Without Schedule M Support',
            `Book net income ($${(bookNetIncome / 1000000).toFixed(1)}M) differs from taxable income ($${(taxableIncome / 1000000).toFixed(1)}M) by ${(bookTaxDiffPct * 100).toFixed(1)}%, but no Schedule M reconciliation data is available.`,
            'IRC §446(a): Taxable income shall be computed under the method of accounting on the basis of which the taxpayer regularly computes income.',
            'Prepare or obtain Schedule M-1 or M-3 reconciliation. Verify all book-tax differences are properly identified and classified as permanent or temporary.',
            Math.abs(diff)
          ));
        }

        // Verify Schedule M reconciliation ties
        if (scheduleM.length > 0) {
          const mBookIncome = scheduleM.find(t => t.lineNumber === '1')?.amount || 0;
          const mTaxIncome = scheduleM.find(t => t.lineNumber === '10')?.amount || 0;

          if (Math.abs(mBookIncome - bookNetIncome) > 1000) {
            findings.push(createFinding(
              data.engagementId,
              'IRS-INC-001a',
              'IRS',
              'medium',
              'Schedule M Book Income Does Not Tie to Financial Statements',
              `Schedule M-1 Line 1 (net income per books) of $${(mBookIncome / 1000000).toFixed(2)}M does not agree to financial statement net income of $${(bookNetIncome / 1000000).toFixed(2)}M. Difference: $${((mBookIncome - bookNetIncome) / 1000).toFixed(0)}K.`,
              'IRC §6012: Every corporation subject to taxation shall make a return.',
              'Reconcile the Schedule M-1 starting point to the audited financial statements. Identify and document any legitimate adjustments.',
              Math.abs(mBookIncome - bookNetIncome)
            ));
          }
        }
      }

      return findings;
    },
  },
  {
    id: 'IRS-INC-002',
    name: 'Gross Receipts Consistency',
    framework: 'IRS',
    category: 'Income Matching',
    description: 'Verifies Form 1120 gross receipts match financial statement revenue',
    citation: 'IRC §61 - Gross income defined',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const grossReceipts = data.taxData.find(t =>
        t.formType === '1120' && t.schedule === 'main' && t.lineNumber === '1a'
      );
      const totalRevenue = data.accounts
        .filter(a => a.accountType === 'revenue')
        .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (grossReceipts && totalRevenue > 0) {
        const diff = Math.abs(grossReceipts.amount - totalRevenue);
        if (diff > totalRevenue * 0.01) {
          findings.push(createFinding(
            data.engagementId,
            'IRS-INC-002',
            'IRS',
            'medium',
            'Gross Receipts Do Not Match Book Revenue',
            `Form 1120 gross receipts ($${(grossReceipts.amount / 1000000).toFixed(1)}M) differ from book revenue ($${(totalRevenue / 1000000).toFixed(1)}M) by $${(diff / 1000).toFixed(0)}K. This difference should be explained by identifiable book-tax adjustments.`,
            'IRC §61(a): Gross income means all income from whatever source derived.',
            'Reconcile the difference and document the specific items causing the variance. Common differences include installment sales method, percentage-of-completion adjustments, and mark-to-market adjustments.',
            diff
          ));
        }
      }

      return findings;
    },
  },
];
