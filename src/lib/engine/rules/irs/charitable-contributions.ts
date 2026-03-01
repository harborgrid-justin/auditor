import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';
import { getParameter } from '../../tax-parameters/registry';
import { getTaxYear } from '../../tax-parameters/utils';

export const charitableContributionRules: AuditRule[] = [
  {
    id: 'IRS-CHAR-001',
    name: 'Charitable Contribution Limit',
    framework: 'IRS',
    category: 'Charitable Contributions',
    description: 'Verifies corporate charitable deductions do not exceed 10% of taxable income per IRC §170(b)(2)',
    citation: 'IRC §170(b)(2) - Corporations: limitation on deduction',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);
      const limitPct = getParameter('CHARITABLE_LIMIT_CORP_PCT', taxYear, data.entityType ?? undefined, 0.10);

      // Identify charitable contribution accounts
      const charitableAccounts = data.accounts.filter(a => {
        const name = a.accountName.toLowerCase();
        return a.subType === 'charitable_contribution' ||
          name.includes('charitable') ||
          name.includes('donation') ||
          name.includes('contribution') && (name.includes('charit') || name.includes('donat'));
      });

      const totalCharitable = charitableAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (totalCharitable === 0) return findings;

      // Look for charitable deduction on tax return
      const charitableDeduction = data.taxData.find(t =>
        (t.formType === '1120' && t.lineNumber === '19') ||
        t.description.toLowerCase().includes('charitable contribution') ||
        t.description.toLowerCase().includes('charitable deduction')
      );

      // Determine taxable income before charitable deduction
      const taxableIncomeData = data.taxData.find(t =>
        (t.formType === '1120' && t.schedule === 'main' && t.lineNumber === '30') ||
        t.description.toLowerCase().includes('taxable income')
      );

      // Fallback to income statement if no tax data
      const isStatements = data.financialStatements.filter(fs => fs.statementType === 'IS');
      let taxableIncome = taxableIncomeData?.amount ?? 0;
      if (taxableIncome === 0 && isStatements.length > 0) {
        const isData = JSON.parse(typeof isStatements[0].data === 'string' ? isStatements[0].data : JSON.stringify(isStatements[0].data));
        taxableIncome = isData.incomeBeforeTax || 0;
      }

      if (taxableIncome <= 0) return findings;

      // The §170(b)(2) limit is computed on taxable income BEFORE the charitable deduction
      // Add back the charitable deduction to compute the base
      const deductionClaimed = charitableDeduction?.amount ?? totalCharitable;
      const incomeBeforeCharitable = taxableIncome + deductionClaimed;
      const charitableLimit = incomeBeforeCharitable * limitPct;

      if (deductionClaimed > charitableLimit) {
        const excess = deductionClaimed - charitableLimit;
        findings.push(createFinding(
          data.engagementId,
          'IRS-CHAR-001',
          'IRS',
          'medium',
          'Charitable Contribution Deduction Exceeds 10% Limit',
          `Charitable contributions of $${(deductionClaimed / 1000).toFixed(0)}K exceed the ${(limitPct * 100).toFixed(0)}% of taxable income limitation of $${(charitableLimit / 1000).toFixed(0)}K (based on pre-deduction taxable income of $${(incomeBeforeCharitable / 1000).toFixed(0)}K). Excess of $${(excess / 1000).toFixed(0)}K is not deductible in the current year but may be carried forward for 5 years under §170(d)(2).`,
          'IRC §170(b)(2)(A): In the case of a corporation, the total deductions under subsection (a) for any taxable year shall not exceed 10 percent of the taxpayer\'s taxable income.',
          'Limit the current-year charitable deduction to 10% of taxable income (computed without the charitable deduction and before any NOL carryback). Carry forward the excess amount for up to 5 tax years under §170(d)(2). Verify that all contributions are to qualifying organizations under §170(c).',
          excess,
          charitableAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'IRS-CHAR-002',
    name: 'Charitable Carryforward',
    framework: 'IRS',
    category: 'Charitable Contributions',
    description: 'Detects potential charitable contribution carryforward amounts from prior year excess deductions',
    citation: 'IRC §170(d)(2) - Carryover of excess contributions',
    defaultSeverity: 'low',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);
      const limitPct = getParameter('CHARITABLE_LIMIT_CORP_PCT', taxYear, data.entityType ?? undefined, 0.10);

      // Check for carryforward indicators in tax data
      const carryforwardData = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return (desc.includes('charitable') || desc.includes('contribution')) &&
          (desc.includes('carryover') || desc.includes('carryforward') || desc.includes('carry forward') || desc.includes('prior year'));
      });

      // Also detect from prior period accounts if available
      const priorCharitable = data.priorPeriodAccounts
        ? data.priorPeriodAccounts.filter(a => {
            const name = a.accountName.toLowerCase();
            return a.subType === 'charitable_contribution' ||
              name.includes('charitable') ||
              name.includes('donation');
          })
        : [];

      const priorCharitableTotal = priorCharitable.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Check if current year contributions are well below the limit, which may indicate carryforwards being used
      const currentCharitable = data.accounts
        .filter(a => {
          const name = a.accountName.toLowerCase();
          return a.subType === 'charitable_contribution' ||
            name.includes('charitable') ||
            name.includes('donation');
        })
        .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Look for deduction claimed that exceeds current year contributions (indicates carryforward usage)
      const charitableDeduction = data.taxData.find(t =>
        (t.formType === '1120' && t.lineNumber === '19') ||
        t.description.toLowerCase().includes('charitable deduction')
      );

      if (carryforwardData.length > 0) {
        const carryforwardAmount = carryforwardData.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        findings.push(createFinding(
          data.engagementId,
          'IRS-CHAR-002',
          'IRS',
          'low',
          'Charitable Contribution Carryforward Detected',
          `Charitable contribution carryforward of $${(carryforwardAmount / 1000).toFixed(0)}K was identified in the tax workpapers. Current year contributions: $${(currentCharitable / 1000).toFixed(0)}K. Carryforward amounts must be used on a FIFO basis and expire after 5 years. Verify that the carryforward is from years within the allowable 5-year window.`,
          'IRC §170(d)(2)(A): If the aggregate amount of contributions made in the contribution year exceeds the limitation, such excess shall be treated as a charitable contribution paid by the corporation in each of the 5 succeeding taxable years in order of time.',
          'Prepare a schedule tracking all carryforward amounts by originating year. Verify that no carryforward amounts have expired (5-year limit). Apply carryforward contributions on a FIFO basis. Ensure total deduction (current year + carryforward) does not exceed the 10% limit.',
          carryforwardAmount
        ));
      } else if (charitableDeduction && currentCharitable > 0 && charitableDeduction.amount > currentCharitable * 1.10) {
        // Deduction exceeds current year contributions — likely a carryforward was applied
        const potentialCarryforward = charitableDeduction.amount - currentCharitable;
        findings.push(createFinding(
          data.engagementId,
          'IRS-CHAR-002',
          'IRS',
          'low',
          'Potential Charitable Carryforward — Deduction Exceeds Current Year Contributions',
          `Charitable deduction claimed ($${(charitableDeduction.amount / 1000).toFixed(0)}K) exceeds current year charitable contributions ($${(currentCharitable / 1000).toFixed(0)}K) by $${(potentialCarryforward / 1000).toFixed(0)}K. This suggests prior year carryforward amounts are being utilized. No carryforward schedule was found in the tax workpapers.`,
          'IRC §170(d)(2): Excess charitable contributions by a corporation shall be treated as paid in each of the 5 succeeding taxable years.',
          'Obtain or prepare a charitable contribution carryforward schedule showing originating year, original excess amount, amounts utilized in intervening years, and remaining balance. Verify no amounts have expired and that carryforward usage does not cause the total deduction to exceed the §170(b)(2) limit.',
          potentialCarryforward
        ));
      }

      return findings;
    },
  },
];
