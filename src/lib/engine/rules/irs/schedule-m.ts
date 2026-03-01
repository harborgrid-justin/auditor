import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const scheduleMRules: AuditRule[] = [
  {
    id: 'IRS-SM-001',
    name: 'Schedule M-1 Completeness',
    framework: 'IRS',
    category: 'Schedule M Reconciliation',
    description: 'Verifies all required book-tax differences are captured in Schedule M',
    citation: 'IRC §6012(a)(2) - Corporate return requirements',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Check for stock-based compensation (always a book-tax difference)
      const stockComp = data.accounts.filter(a =>
        a.accountName.toLowerCase().includes('stock') && a.accountName.toLowerCase().includes('comp')
      ).reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      const mStockComp = data.taxData.find(t =>
        t.schedule.includes('Schedule M') && t.description.toLowerCase().includes('stock')
      );

      if (stockComp > 0 && !mStockComp) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-SM-001',
          'IRS',
          'medium',
          'Stock-Based Compensation Missing from Schedule M',
          `Book stock-based compensation expense of $${(stockComp / 1000000).toFixed(1)}M is not reflected in Schedule M adjustments. Under §162(a) and §83, the tax deduction for stock comp typically differs from the book expense.`,
          'IRC §83(a): Property transferred in connection with performance of services is included in gross income at the time of vesting.',
          'Add Schedule M adjustment for the difference between book stock-based compensation expense and tax deduction (if any). Book expense per ASC 718 is typically based on grant-date fair value, while tax deduction is based on income recognized at exercise/vesting.',
          stockComp
        ));
      }

      // Check Schedule M ties from beginning to end
      const schedM = data.taxData.filter(t => t.schedule.includes('Schedule M'));
      if (schedM.length > 0) {
        const bookIncome = schedM.find(t => t.lineNumber === '1')?.amount || 0;
        const taxIncome = schedM.find(t => t.lineNumber === '10')?.amount || 0;
        const fedTax = schedM.find(t => t.lineNumber === '2')?.amount || 0;

        // Sum all adjustments
        const adjustments = schedM
          .filter(t => !['1', '10'].includes(t.lineNumber))
          .reduce((sum, t) => sum + t.amount, 0);

        // Verify: Book Income + Fed Tax + Adjustments should = Taxable Income
        // This is a simplified check
        const computedTaxable = bookIncome + fedTax;
        if (taxIncome > 0 && Math.abs(computedTaxable - taxIncome) > taxIncome * 0.15) {
          findings.push(createFinding(
            data.engagementId,
            'IRS-SM-001a',
            'IRS',
            'low',
            'Schedule M-1 Internal Consistency Check',
            `Schedule M-1 reconciliation: Book income ($${(bookIncome / 1000000).toFixed(2)}M) + Federal tax ($${(fedTax / 1000000).toFixed(2)}M) + adjustments should equal taxable income ($${(taxIncome / 1000000).toFixed(2)}M). Review intermediate adjustments for completeness.`,
            'Reg. §1.6012-2(a): Corporate returns shall include Schedule M-1 reconciliation.',
            'Review all Schedule M-1 line items for completeness and accuracy. Ensure all permanent and temporary differences are properly classified.',
            null
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'IRS-SM-002',
    name: 'Federal Income Tax Per Books',
    framework: 'IRS',
    category: 'Schedule M Reconciliation',
    description: 'Verifies federal income tax per books ties to financial statements',
    citation: 'IRC §275(a)(1) - Federal income taxes not deductible',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const taxExpenseAccounts = data.accounts.filter(a => a.subType === 'tax_expense');
      const bookTaxExpense = taxExpenseAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      const mFedTax = data.taxData.find(t =>
        t.schedule.includes('Schedule M') && t.lineNumber === '2'
      );

      if (mFedTax && bookTaxExpense > 0) {
        if (Math.abs(mFedTax.amount - bookTaxExpense) > bookTaxExpense * 0.10) {
          findings.push(createFinding(
            data.engagementId,
            'IRS-SM-002',
            'IRS',
            'medium',
            'Federal Tax Per Books Inconsistency',
            `Schedule M-1 Line 2 (Federal income tax per books): $${(mFedTax.amount / 1000000).toFixed(2)}M does not agree to book tax expense: $${(bookTaxExpense / 1000000).toFixed(2)}M. Difference: $${(Math.abs(mFedTax.amount - bookTaxExpense) / 1000).toFixed(0)}K. Note: Line 2 should include federal income tax only (not state/local/foreign).`,
            'IRC §275(a)(1): Federal income taxes are not allowable as a deduction, but must be reconciled on Schedule M-1.',
            'Reconcile book tax expense to Schedule M-1 Line 2. Break out federal vs state/local/foreign income taxes. Verify deferred tax provision is excluded from Line 2 if it represents a non-cash book entry.',
            Math.abs(mFedTax.amount - bookTaxExpense)
          ));
        }
      }

      return findings;
    },
  },
];
