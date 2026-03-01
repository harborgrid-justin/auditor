import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';
import { getParameter } from '../../tax-parameters/registry';
import { getTaxYear } from '../../tax-parameters/utils';

export const deductionLimitRules: AuditRule[] = [
  {
    id: 'IRS-DED-001',
    name: 'Meals & Entertainment Deduction Limit',
    framework: 'IRS',
    category: 'Deduction Limits',
    description: 'Verifies that meals deductions are limited to 50% per IRC §274',
    citation: 'IRC §274(n) - Only 50% of meal expenses are deductible',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const mealsAccounts = data.accounts.filter(a =>
        a.accountName.toLowerCase().includes('meal') ||
        a.accountName.toLowerCase().includes('entertainment') ||
        a.accountName.toLowerCase().includes('travel & entertainment')
      );
      const totalMeals = mealsAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      const scheduleM = data.taxData.find(t =>
        t.description.toLowerCase().includes('meals') && t.schedule.includes('Schedule M')
      );

      if (totalMeals > 0 && scheduleM) {
        const taxYear = getTaxYear(data.fiscalYearEnd);
        const mealsDeductionPct = getParameter('MEALS_DEDUCTION_PCT', taxYear, data.entityType ?? undefined, 0.50);
        const disallowancePct = 1 - mealsDeductionPct;
        const expectedDisallowance = totalMeals * disallowancePct;
        const actualDisallowance = scheduleM.amount;
        const diff = Math.abs(expectedDisallowance - actualDisallowance);

        if (diff > totalMeals * 0.05) {
          findings.push(createFinding(
            data.engagementId,
            'IRS-DED-001',
            'IRS',
            'medium',
            'Meals Deduction Limit Calculation Error',
            `Total meals/entertainment expense: $${(totalMeals / 1000).toFixed(0)}K. Expected 50% disallowance: $${(expectedDisallowance / 1000).toFixed(0)}K. Schedule M adjustment: $${(actualDisallowance / 1000).toFixed(0)}K. Variance: $${(diff / 1000).toFixed(0)}K.`,
            'IRC §274(n)(1): The amount allowable as a deduction for any expense for food or beverages shall not exceed 50 percent of the amount otherwise deductible.',
            'Review the meals and entertainment expense detail to ensure proper 50% limitation is applied. Distinguish between fully deductible business meals (de minimis) and those subject to the 50% limit.',
            diff,
            mealsAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'IRS-DED-002',
    name: 'Business Interest Limitation (§163(j))',
    framework: 'IRS',
    category: 'Deduction Limits',
    description: 'Checks if business interest expense exceeds 30% of adjusted taxable income',
    citation: 'IRC §163(j) - Limitation on business interest',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const interestExpense = data.accounts
        .filter(a => a.subType === 'interest_expense')
        .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      const isStatements = data.financialStatements.filter(fs => fs.statementType === 'IS');
      if (isStatements.length === 0 || interestExpense === 0) return findings;

      const isData = JSON.parse(typeof isStatements[0].data === 'string' ? isStatements[0].data : JSON.stringify(isStatements[0].data));
      const depreciation = data.accounts.filter(a => a.subType === 'depreciation').reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
      const amortization = data.accounts.filter(a => a.subType === 'amortization').reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // ATI = taxable income + interest expense + depreciation + amortization (simplified)
      const taxableIncome = isData.incomeBeforeTax || 0;
      const ati = taxableIncome + interestExpense + depreciation + amortization;
      const taxYear = getTaxYear(data.fiscalYearEnd);
      const atiPct = getParameter('SEC_163J_ATI_PCT', taxYear, data.entityType ?? undefined, 0.30);
      const limit = ati * atiPct;

      if (interestExpense > limit) {
        const disallowed = interestExpense - limit;
        findings.push(createFinding(
          data.engagementId,
          'IRS-DED-002',
          'IRS',
          'high',
          'Business Interest Expense May Exceed §163(j) Limitation',
          `Business interest expense of $${(interestExpense / 1000).toFixed(0)}K exceeds 30% of ATI limitation of $${(limit / 1000).toFixed(0)}K. Potential disallowed interest: $${(disallowed / 1000).toFixed(0)}K. ATI calculated as: taxable income ($${(taxableIncome / 1000000).toFixed(1)}M) + interest ($${(interestExpense / 1000).toFixed(0)}K) + D&A ($${((depreciation + amortization) / 1000).toFixed(0)}K).`,
          'IRC §163(j)(1): The deduction for business interest shall not exceed the sum of business interest income plus 30% of adjusted taxable income.',
          'Prepare detailed §163(j) calculation. Verify ATI computation. Determine if any exceptions apply (small business, real property trade or business, electing farming business). Disallowed interest carries forward indefinitely.',
          disallowed
        ));
      }

      return findings;
    },
  },
  {
    id: 'IRS-DED-003',
    name: 'Executive Compensation Limit (§162(m))',
    framework: 'IRS',
    category: 'Deduction Limits',
    description: 'Checks for deductions of compensation exceeding $1M for covered employees',
    citation: 'IRC §162(m) - $1M deduction limit on covered employee compensation',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const salaryExpense = data.accounts
        .filter(a => a.accountName.toLowerCase().includes('salar') || a.accountName.toLowerCase().includes('wage'))
        .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      const stockComp = data.accounts
        .filter(a => a.accountName.toLowerCase().includes('stock') && a.accountName.toLowerCase().includes('comp'))
        .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // If total comp is high, flag for §162(m) review
      const totalComp = salaryExpense + stockComp;
      if (totalComp > 5000000) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-DED-003',
          'IRS',
          'medium',
          'Potential §162(m) Executive Compensation Limitation',
          `Total compensation expense of $${(totalComp / 1000000).toFixed(1)}M (salaries: $${(salaryExpense / 1000000).toFixed(1)}M, stock comp: $${(stockComp / 1000000).toFixed(1)}M) suggests covered employees may exceed the $1M deduction limit. Post-2017 TCJA rules expanded the definition of covered employees.`,
          'IRC §162(m)(1): No deduction shall be allowed for applicable employee remuneration paid or accrued with respect to any covered employee to the extent that the remuneration exceeds $1,000,000.',
          'Identify all covered employees (CEO, CFO, and next 3 highest-paid officers). Calculate total compensation for each including salary, bonus, stock options, RSUs, and other forms. Compute required Schedule M adjustment for amounts exceeding $1M per covered employee.',
          null
        ));
      }

      return findings;
    },
  },
];
