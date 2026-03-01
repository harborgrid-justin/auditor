import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const incomeTaxProvisionRules: AuditRule[] = [
  {
    id: 'GAAP-TAX-001',
    name: 'Effective Tax Rate Reasonableness',
    framework: 'GAAP',
    category: 'Income Taxes (ASC 740)',
    description: 'Evaluates whether the effective tax rate is within a reasonable range of the statutory federal rate, identifying potential provision errors or undisclosed items',
    citation: 'ASC 740-10-50-12: Rate reconciliation disclosure requirements',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxExpenseAccounts = data.accounts.filter(a => a.subType === 'tax_expense');
      const totalTaxExpense = taxExpenseAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Get pre-tax income from financial statements
      const incomeStatement = data.financialStatements.find(fs => fs.statementType === 'IS');
      let preTaxIncome = 0;

      if (incomeStatement) {
        const fsData = incomeStatement.data;
        preTaxIncome = fsData.incomeBeforeTax ?? fsData.income_before_tax ?? 0;
      }

      // Fallback: calculate from revenue minus expenses excluding tax
      if (preTaxIncome === 0) {
        const totalRevenue = data.accounts
          .filter(a => a.accountType === 'revenue')
          .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
        const totalExpensesExTax = data.accounts
          .filter(a => a.accountType === 'expense' && a.subType !== 'tax_expense')
          .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
        preTaxIncome = totalRevenue - totalExpensesExTax;
      }

      if (preTaxIncome > 0 && totalTaxExpense > 0) {
        const effectiveRate = totalTaxExpense / preTaxIncome;
        const federalStatutoryRate = 0.21;
        const expectedRangeHigh = 0.30; // Allow for state taxes and permanent differences
        const expectedRangeLow = 0.15;  // Allow for credits and incentives

        if (effectiveRate > expectedRangeHigh || effectiveRate < expectedRangeLow) {
          const deviation = effectiveRate - federalStatutoryRate;
          const rateDescription = effectiveRate > expectedRangeHigh
            ? `The effective tax rate of ${(effectiveRate * 100).toFixed(1)}% significantly exceeds the federal statutory rate of 21%. This ${((deviation) * 100).toFixed(1)} percentage point excess may be caused by: (1) non-deductible expenses (e.g., stock-based compensation under Section 162(m)), (2) state and local income taxes, (3) valuation allowance increases, (4) uncertain tax position reserves (FIN 48), or (5) provision calculation errors.`
            : `The effective tax rate of ${(effectiveRate * 100).toFixed(1)}% is significantly below the federal statutory rate of 21%. This ${(Math.abs(deviation) * 100).toFixed(1)} percentage point shortfall may be caused by: (1) excess tax benefits from stock compensation, (2) R&D tax credits, (3) foreign earnings taxed at lower rates, (4) valuation allowance releases, or (5) provision understatement.`;

          findings.push(createFinding(
            data.engagementId,
            'GAAP-TAX-001',
            'GAAP',
            'high',
            `Effective Tax Rate ${effectiveRate > expectedRangeHigh ? 'Exceeds' : 'Below'} Expected Range`,
            `${rateDescription} Tax expense is $${(totalTaxExpense / 1000000).toFixed(2)}M on pre-tax income of $${(preTaxIncome / 1000000).toFixed(2)}M. A detailed rate reconciliation should be performed to identify and document all reconciling items between the statutory rate and effective rate.`,
            'ASC 740-10-50-12: A public entity shall disclose a reconciliation of the reported amount of income tax expense to the amount of income tax expense that would result from applying domestic federal statutory rates to pretax income.',
            'Obtain the tax provision workpapers and detailed effective tax rate reconciliation. Verify each reconciling item (permanent differences, state taxes, credits, foreign rate differentials, uncertain tax positions). Compare the provision to the actual or estimated tax return. Assess whether ASC 740-10 uncertain tax position reserves are adequate.',
            totalTaxExpense - (preTaxIncome * federalStatutoryRate),
            taxExpenseAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'GAAP-TAX-002',
    name: 'Deferred Tax Liability Growth',
    framework: 'GAAP',
    category: 'Income Taxes (ASC 740)',
    description: 'Monitors significant growth in deferred tax liabilities that may indicate aggressive tax positions or timing difference accumulation',
    citation: 'ASC 740-10-25-20: Recognition of deferred tax liabilities',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Look for deferred tax liability accounts
      const dtlAccounts = data.accounts.filter(a =>
        a.accountName.toLowerCase().includes('deferred tax') &&
        (a.accountType === 'liability' || a.subType === 'other_liability')
      );

      if (dtlAccounts.length === 0) {
        // Also check for any liability account with deferred tax characteristics
        const otherLiabilityAccounts = data.accounts.filter(a =>
          a.subType === 'other_liability' &&
          a.accountName.toLowerCase().includes('tax')
        );
        dtlAccounts.push(...otherLiabilityAccounts);
      }

      const dtlBeginning = dtlAccounts.reduce((sum, a) => sum + Math.abs(a.beginningBalance), 0);
      const dtlEnding = dtlAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (dtlBeginning > 0) {
        const dtlGrowth = dtlEnding - dtlBeginning;
        const dtlGrowthPct = dtlGrowth / dtlBeginning;

        if (dtlGrowthPct > 0.15 && dtlGrowth > data.materialityThreshold * 0.25) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-TAX-002',
            'GAAP',
            'medium',
            'Significant Growth in Deferred Tax Liabilities',
            `Deferred tax liabilities increased by ${(dtlGrowthPct * 100).toFixed(1)}% ($${(dtlGrowth / 1000).toFixed(0)}K) from $${(dtlBeginning / 1000).toFixed(0)}K to $${(dtlEnding / 1000).toFixed(0)}K. Growing DTLs indicate an expanding gap between book and tax reporting. Key drivers often include: (1) accelerated tax depreciation (Section 179/bonus depreciation) vs. straight-line book depreciation, (2) revenue recognition timing differences, (3) capitalized R&D costs under Section 174, or (4) unrealized gains on investments. If these temporary differences are not expected to reverse, the DTL may effectively become permanent, potentially overstating or understating the deferred tax position.`,
            'ASC 740-10-25-20: A deferred tax liability shall be recognized for taxable temporary differences.',
            'Obtain the deferred tax rollforward and reconciliation. Identify the nature and expected reversal period for each significant temporary difference. Verify that the DTL computation is consistent with the tax return positions. Assess whether any temporary differences should be reclassified as permanent.',
            dtlGrowth,
            dtlAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'GAAP-TAX-003',
    name: 'Tax Provision vs Taxable Income Consistency',
    framework: 'GAAP',
    category: 'Income Taxes (ASC 740)',
    description: 'Cross-checks the book tax provision against tax return data to identify inconsistencies',
    citation: 'ASC 740-10-30-5: Measurement of current and deferred tax',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Get book tax expense
      const taxExpenseAccounts = data.accounts.filter(a => a.subType === 'tax_expense');
      const bookTaxExpense = taxExpenseAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Get tax return data
      const taxableIncome = data.taxData.find(
        t => t.formType === '1120' && t.lineNumber === '30' && t.description.toLowerCase().includes('taxable income')
      );
      const totalTaxPerReturn = data.taxData.find(
        t => t.formType === '1120' && t.lineNumber === '31' && t.description.toLowerCase().includes('total tax')
      );

      if (bookTaxExpense > 0 && totalTaxPerReturn) {
        const returnTax = totalTaxPerReturn.amount;
        const difference = bookTaxExpense - returnTax;
        const diffPct = Math.abs(difference) / bookTaxExpense;

        // The book-tax difference should be explainable by deferred tax provision changes
        // A very large difference without corresponding DTL/DTA changes is concerning
        if (diffPct > 0.30 && Math.abs(difference) > data.materialityThreshold * 0.5) {
          // Check if deferred tax change explains the difference
          const dtlAccounts = data.accounts.filter(a =>
            a.accountName.toLowerCase().includes('deferred tax') ||
            (a.subType === 'other_liability' && a.accountName.toLowerCase().includes('tax'))
          );
          const dtlChange = dtlAccounts.reduce((sum, a) => sum + (Math.abs(a.endingBalance) - Math.abs(a.beginningBalance)), 0);

          const unexplainedDiff = Math.abs(difference) - Math.abs(dtlChange);

          if (unexplainedDiff > data.materialityThreshold * 0.25) {
            findings.push(createFinding(
              data.engagementId,
              'GAAP-TAX-003',
              'GAAP',
              'medium',
              'Tax Provision and Tax Return Inconsistency',
              `Book income tax expense of $${(bookTaxExpense / 1000000).toFixed(2)}M differs from the tax per return of $${(returnTax / 1000).toFixed(0)}K by $${(Math.abs(difference) / 1000).toFixed(0)}K (${(diffPct * 100).toFixed(1)}%). The deferred tax liability change of $${(dtlChange / 1000).toFixed(0)}K only partially explains this gap, leaving $${(unexplainedDiff / 1000).toFixed(0)}K unexplained. This inconsistency may indicate: (1) provision-to-return adjustments not yet recorded, (2) errors in the current or deferred tax computation, (3) discrete items affecting the provision, or (4) uncertain tax position reserves.`,
              'ASC 740-10-30-5: The objective is to measure current and deferred tax based on provisions of the enacted tax law.',
              'Reconcile the total tax provision to the sum of current tax expense (per the tax return or estimate) and deferred tax expense (change in deferred tax balances). Investigate unexplained differences. Review the provision-to-return true-up from the prior year. Verify that all book-tax differences are identified and properly classified.',
              Math.abs(unexplainedDiff),
              taxExpenseAccounts.map(a => a.accountNumber)
            ));
          }
        }
      }

      // Additional check: verify book income per M-1 reconciles to financial statements
      if (taxableIncome) {
        const bookIncomePerM1 = data.taxData.find(
          t => t.schedule === 'Schedule M-1' && t.lineNumber === '1'
        );
        if (bookIncomePerM1) {
          const incomeStatement = data.financialStatements.find(fs => fs.statementType === 'IS');
          if (incomeStatement) {
            const netIncomeFS = incomeStatement.data.netIncome ?? incomeStatement.data.net_income ?? 0;
            const netIncomeM1 = bookIncomePerM1.amount;
            const m1Diff = Math.abs(netIncomeFS - netIncomeM1);

            if (m1Diff > data.materialityThreshold * 0.1 && m1Diff > 0) {
              findings.push(createFinding(
                data.engagementId,
                'GAAP-TAX-003',
                'GAAP',
                'low',
                'Net Income Discrepancy Between Financial Statements and Tax Return',
                `Net income per financial statements ($${(netIncomeFS / 1000000).toFixed(2)}M) differs from net income per books on Schedule M-1 ($${(netIncomeM1 / 1000000).toFixed(2)}M) by $${(m1Diff / 1000).toFixed(0)}K. While small differences may arise from timing of adjustments, material differences indicate a reconciliation error that could affect both the financial statements and the tax return.`,
                'ASC 740-10-30-5: The measurement of current and deferred tax is based on provisions of the enacted tax law.',
                'Reconcile the net income per financial statements to Schedule M-1, Line 1. Identify any post-financial-statement adjustments or errors. Ensure the tax return starting point is consistent with the final audited financial statements.',
                m1Diff,
                taxExpenseAccounts.map(a => a.accountNumber)
              ));
            }
          }
        }
      }

      return findings;
    },
  },
];
