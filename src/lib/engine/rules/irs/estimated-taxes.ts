import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';
import { getParameter } from '../../tax-parameters/registry';
import { getTaxYear } from '../../tax-parameters/utils';

export const estimatedTaxRules: AuditRule[] = [
  {
    id: 'IRS-EST-001',
    name: 'Corporate Estimated Tax Payments',
    framework: 'IRS',
    category: 'Estimated Tax',
    description: 'Checks for estimated tax payment data and compares to prior year tax and current year liability',
    citation: 'IRC §6655 - Failure by corporation to pay estimated income tax',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);
      const safeHarborPct = getParameter('EST_TAX_SAFE_HARBOR_PCT', taxYear, data.entityType ?? undefined, 1.00);

      // Look for estimated tax payment data
      const estimatedPayments = data.taxData.filter(t =>
        t.description.toLowerCase().includes('estimated tax') ||
        t.description.toLowerCase().includes('estimated payment') ||
        t.description.toLowerCase().includes('form 4136') ||
        (t.formType === '1120' && t.description.toLowerCase().includes('deposit')) ||
        (t.formType === '1120' && t.lineNumber === '33')
      );

      // Look for current year tax liability
      const currentTaxLiability = data.taxData.find(t =>
        (t.formType === '1120' && t.schedule === 'main' && t.lineNumber === '31') ||
        t.description.toLowerCase().includes('total tax')
      );

      // Look for prior year tax
      const priorYearTax = data.taxData.find(t =>
        t.description.toLowerCase().includes('prior year tax') ||
        t.description.toLowerCase().includes('preceding year') ||
        (t.formType === '1120' && t.description.toLowerCase().includes('prior'))
      );

      // Check tax expense accounts for current year liability estimate
      const taxExpenseAccounts = data.accounts.filter(a =>
        a.subType === 'tax_expense' ||
        a.accountName.toLowerCase().includes('income tax expense') ||
        a.accountName.toLowerCase().includes('federal tax')
      );
      const totalTaxExpense = taxExpenseAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      const currentYearTax = currentTaxLiability?.amount ?? totalTaxExpense;

      if (estimatedPayments.length === 0 && currentYearTax > 0) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-EST-001',
          'IRS',
          'medium',
          'No Estimated Tax Payment Data Found',
          `Current year tax liability is estimated at $${(currentYearTax / 1000).toFixed(0)}K, but no estimated tax payment data was found in the tax workpapers. Corporations are generally required to make quarterly estimated tax payments under IRC §6655 if they expect to owe $500 or more in tax.`,
          'IRC §6655(a): There is added to the tax a penalty for underpayment of estimated tax by corporations. IRC §6655(d)(1)(B): The required annual payment is the lesser of 100% of the current year tax or 100% of the prior year tax.',
          'Obtain records of all estimated tax payments (Forms 1120-W deposits). Verify that quarterly payments were timely (15th day of 4th, 6th, 9th, and 12th months of the tax year). If payments are insufficient, compute potential underpayment penalty using Form 2220.',
          currentYearTax
        ));
      }

      if (estimatedPayments.length > 0 && currentYearTax > 0) {
        const totalEstimated = estimatedPayments.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const priorTax = priorYearTax?.amount ?? 0;
        const safeHarborAmount = priorTax > 0
          ? Math.min(currentYearTax, priorTax * safeHarborPct)
          : currentYearTax;

        if (totalEstimated < safeHarborAmount * 0.90) {
          const shortfall = safeHarborAmount - totalEstimated;
          findings.push(createFinding(
            data.engagementId,
            'IRS-EST-001',
            'IRS',
            'medium',
            'Estimated Tax Payments May Be Insufficient',
            `Total estimated payments of $${(totalEstimated / 1000).toFixed(0)}K appear below the safe harbor requirement. Current year tax: $${(currentYearTax / 1000).toFixed(0)}K. Prior year tax: $${(priorTax / 1000).toFixed(0)}K. Safe harbor (${(safeHarborPct * 100).toFixed(0)}% of prior year): $${(safeHarborAmount / 1000).toFixed(0)}K. Shortfall: $${(shortfall / 1000).toFixed(0)}K.`,
            'IRC §6655(d)(1)(B): The required annual payment is the lesser of 100% of current year tax or 100% of the prior year tax shown on the return for the preceding taxable year.',
            'Prepare Form 2220 to compute underpayment penalty. Evaluate whether the annualized income installment method or adjusted seasonal installment method may reduce or eliminate the penalty. Make additional estimated payments if still within the tax year.',
            shortfall
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'IRS-EST-002',
    name: 'Underpayment Assessment',
    framework: 'IRS',
    category: 'Estimated Tax',
    description: 'Flags estimated payments that appear below safe harbor thresholds, indicating potential underpayment penalties',
    citation: 'IRC §6655(d) - Required installments; safe harbor',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);
      const safeHarborPct = getParameter('EST_TAX_SAFE_HARBOR_PCT', taxYear, data.entityType ?? undefined, 1.00);

      // Look for quarterly payment detail
      const quarterlyPayments = data.taxData.filter(t =>
        t.description.toLowerCase().includes('estimated') &&
        (t.description.toLowerCase().includes('q1') ||
         t.description.toLowerCase().includes('q2') ||
         t.description.toLowerCase().includes('q3') ||
         t.description.toLowerCase().includes('q4') ||
         t.description.toLowerCase().includes('1st quarter') ||
         t.description.toLowerCase().includes('2nd quarter') ||
         t.description.toLowerCase().includes('3rd quarter') ||
         t.description.toLowerCase().includes('4th quarter'))
      );

      // Look for current year tax
      const currentTaxLiability = data.taxData.find(t =>
        (t.formType === '1120' && t.schedule === 'main' && t.lineNumber === '31') ||
        t.description.toLowerCase().includes('total tax')
      );

      if (quarterlyPayments.length === 0 || !currentTaxLiability) return findings;

      const totalTax = currentTaxLiability.amount;
      const requiredPerQuarter = (totalTax * safeHarborPct) / 4;

      // Check if any individual quarter is significantly underpaid
      const underpaidQuarters: string[] = [];
      let totalUnderpayment = 0;

      for (const qp of quarterlyPayments) {
        if (qp.amount < requiredPerQuarter * 0.90) {
          const desc = qp.description;
          const quarterLabel = desc.match(/(q[1-4]|[1-4](?:st|nd|rd|th)\s+quarter)/i)?.[0] ?? desc;
          underpaidQuarters.push(quarterLabel);
          totalUnderpayment += requiredPerQuarter - qp.amount;
        }
      }

      if (underpaidQuarters.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-EST-002',
          'IRS',
          'high',
          'Quarterly Estimated Tax Underpayment Detected',
          `${underpaidQuarters.length} quarter(s) (${underpaidQuarters.join(', ')}) had estimated payments below the required quarterly installment of $${(requiredPerQuarter / 1000).toFixed(0)}K (based on $${(totalTax / 1000).toFixed(0)}K total tax and ${(safeHarborPct * 100).toFixed(0)}% safe harbor). Estimated aggregate underpayment: $${(totalUnderpayment / 1000).toFixed(0)}K. Underpayment penalties accrue interest from each quarterly due date.`,
          'IRC §6655(b): The amount of the underpayment shall be the excess of the required installment over the amount paid on or before the due date for the installment. IRC §6655(d)(1): Each required installment shall be 25% of the required annual payment.',
          'Prepare Form 2220 to compute the exact underpayment penalty for each quarter. Consider whether the annualized income installment method (Schedule A of Form 2220) can reduce the penalty if income was earned unevenly throughout the year. Document any reasonable cause arguments for penalty abatement.',
          totalUnderpayment
        ));
      }

      return findings;
    },
  },
];
