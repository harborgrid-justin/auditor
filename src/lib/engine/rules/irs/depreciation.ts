import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';
import { getParameter } from '../../tax-parameters/registry';
import { getTaxYear } from '../../tax-parameters/utils';

export const depreciationRules: AuditRule[] = [
  {
    id: 'IRS-DEP-001',
    name: 'Book vs Tax Depreciation Reconciliation',
    framework: 'IRS',
    category: 'Depreciation',
    description: 'Verifies book depreciation reconciles to tax depreciation through Schedule M',
    citation: 'IRC §167/168 - Depreciation deduction and MACRS',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const bookDepr = data.accounts
        .filter(a => a.subType === 'depreciation')
        .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      const taxDepr = data.taxData.find(t =>
        t.formType === '4562' && t.lineNumber === '22'
      );

      const schedMBookDepr = data.taxData.find(t =>
        t.schedule.includes('Schedule M') && t.lineNumber === '5a'
      );
      const schedMTaxDepr = data.taxData.find(t =>
        t.schedule.includes('Schedule M') && t.lineNumber === '5b'
      );

      if (taxDepr && bookDepr > 0) {
        const diff = taxDepr.amount - bookDepr;
        if (Math.abs(diff) > bookDepr * 0.05) {
          // This is expected - just verify Schedule M picks it up
          if (schedMBookDepr && schedMTaxDepr) {
            const mDiff = schedMTaxDepr.amount - schedMBookDepr.amount;
            if (Math.abs(mDiff - diff) > 1000) {
              findings.push(createFinding(
                data.engagementId,
                'IRS-DEP-001',
                'IRS',
                'medium',
                'Depreciation Book-Tax Difference Not Properly Reconciled',
                `Book depreciation: $${(bookDepr / 1000).toFixed(0)}K. Tax depreciation (Form 4562): $${(taxDepr.amount / 1000).toFixed(0)}K. Difference: $${(diff / 1000).toFixed(0)}K. Schedule M adjustment: $${(mDiff / 1000).toFixed(0)}K. The Schedule M does not fully reconcile the book-tax difference.`,
                'IRC §168(a): The depreciation deduction for any tangible property shall be determined by using the MACRS method.',
                'Reconcile book depreciation to tax depreciation. Ensure all timing differences are captured in Schedule M. Verify MACRS class lives and conventions are properly applied.',
                Math.abs(mDiff - diff)
              ));
            }
          }
        }
      }

      return findings;
    },
  },
  {
    id: 'IRS-DEP-002',
    name: 'Section 179 Expense Limit',
    framework: 'IRS',
    category: 'Depreciation',
    description: 'Verifies §179 deductions do not exceed annual limits',
    citation: 'IRC §179 - Election to expense certain depreciable business assets',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const sec179 = data.taxData.find(t =>
        t.formType === '4562' && t.lineNumber === '14'
      );

      if (sec179 && sec179.amount > 0) {
        const taxYear = getTaxYear(data.fiscalYearEnd);
        const limit = getParameter('SEC_179_LIMIT', taxYear, data.entityType ?? undefined, 1220000);
        if (sec179.amount > limit) {
          findings.push(createFinding(
            data.engagementId,
            'IRS-DEP-002',
            'IRS',
            'high',
            'Section 179 Deduction Exceeds Annual Limit',
            `Section 179 deduction of $${(sec179.amount / 1000).toFixed(0)}K exceeds the annual limit of $${(limit / 1000).toFixed(0)}K. Excess amount of $${((sec179.amount - limit) / 1000).toFixed(0)}K is not deductible in the current year.`,
            'IRC §179(b)(1): The aggregate cost which may be taken into account shall not exceed the dollar limitation.',
            'Reduce §179 deduction to the annual limit. Consider whether excess can be depreciated under regular MACRS. Also verify the investment limitation phase-out threshold.',
            sec179.amount - limit
          ));
        }

        // Check taxable income limitation
        const taxableIncome = data.taxData.find(t =>
          t.formType === '1120' && t.schedule === 'main' && t.lineNumber === '30'
        );
        if (taxableIncome && sec179.amount > taxableIncome.amount) {
          findings.push(createFinding(
            data.engagementId,
            'IRS-DEP-002a',
            'IRS',
            'medium',
            'Section 179 May Be Limited by Taxable Income',
            `Section 179 deduction ($${(sec179.amount / 1000).toFixed(0)}K) exceeds taxable income before §179 ($${(taxableIncome.amount / 1000).toFixed(0)}K). The §179 deduction cannot create or increase a net operating loss.`,
            'IRC §179(b)(3): The amount allowed as a deduction shall not exceed the aggregate amount of taxable income of the taxpayer for such taxable year.',
            'Limit the §179 deduction to taxable income. The excess carries forward to the next tax year.',
            sec179.amount - taxableIncome.amount
          ));
        }
      }

      return findings;
    },
  },
];
