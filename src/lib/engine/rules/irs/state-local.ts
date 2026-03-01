import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';
import { getParameter } from '../../tax-parameters/registry';
import { getTaxYear } from '../../tax-parameters/utils';

export const stateLocalTaxRules: AuditRule[] = [
  {
    id: 'IRS-SALT-001',
    name: 'State Tax Liability Review',
    framework: 'IRS',
    category: 'State & Local Tax',
    description: 'Identifies state and local tax liabilities that may require additional reporting or deduction analysis',
    citation: 'IRC §164 - Taxes',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const stateTaxAccounts = data.accounts.filter(a => {
        const name = a.accountName.toLowerCase();
        return name.includes('state tax') ||
          name.includes('state income tax') ||
          name.includes('local tax') ||
          name.includes('franchise tax') ||
          name.includes('gross receipts tax');
      });

      if (stateTaxAccounts.length === 0) return findings;

      const totalStateTax = stateTaxAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Check for state tax deduction on federal return
      const stateDeductionData = data.taxData.filter(t =>
        t.description.toLowerCase().includes('state tax') ||
        t.description.toLowerCase().includes('§164') ||
        (t.schedule === 'Schedule C' && t.description.toLowerCase().includes('tax'))
      );

      if (totalStateTax > data.materialityThreshold * 0.05 && stateDeductionData.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-SALT-001',
          'IRS',
          'medium',
          'State Tax Liabilities Without Federal Deduction Reconciliation',
          `${stateTaxAccounts.length} state/local tax accounts total $${(totalStateTax / 1000).toFixed(0)}K, but no corresponding §164 deduction data was found on the federal return. State and local taxes paid or accrued are generally deductible under IRC §164(a).`,
          'IRC §164(a): Except as otherwise provided, the following taxes shall be allowed as a deduction for the taxable year within which paid or accrued: (1) State and local, and foreign, real property taxes; (2) State and local personal property taxes; (3) State and local, and foreign, income, war profits, and excess profits taxes.',
          'Verify that all state and local tax payments are properly reflected as deductions on the federal return. Reconcile state tax expense per books to the federal deduction claimed. Confirm the proper method (cash vs. accrual) is used for the deduction timing. Consider whether any §164(b) limitations apply.',
          totalStateTax,
          stateTaxAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'IRS-SALT-002',
    name: 'Multi-State Nexus Indicators',
    framework: 'IRS',
    category: 'State & Local Tax',
    description: 'Detects indicators of multi-state nexus that may trigger additional state filing obligations',
    citation: 'IRC §164; Public Law 86-272',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Look for multi-state revenue indicators in accounts
      const stateRevenueAccounts = data.accounts.filter(a => {
        const name = a.accountName.toLowerCase();
        return (name.includes('revenue') || name.includes('sales')) &&
          (name.includes('state') || name.includes('region') || name.includes('territory') || name.includes('domestic'));
      });

      // Look for apportionment data in tax records
      const apportionmentData = data.taxData.filter(t => {
        const desc = t.description.toLowerCase();
        return desc.includes('apportionment') ||
          desc.includes('nexus') ||
          desc.includes('allocation') ||
          desc.includes('multi-state') ||
          desc.includes('multistate');
      });

      const totalRevenue = data.accounts
        .filter(a => a.accountType === 'revenue')
        .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Check for property, payroll, or sales in multiple states via journal entries
      const multiStateEntries = data.journalEntries.filter(je => {
        const desc = je.description.toLowerCase();
        return desc.includes('state') && (desc.includes('payroll') || desc.includes('rent') || desc.includes('property'));
      });

      if ((stateRevenueAccounts.length > 1 || multiStateEntries.length > 0) && apportionmentData.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-SALT-002',
          'IRS',
          'medium',
          'Multi-State Nexus Indicators Without Apportionment Documentation',
          `Multi-state activity indicators were detected: ${stateRevenueAccounts.length} state/regional revenue accounts and ${multiStateEntries.length} multi-state journal entries found on total revenue of $${(totalRevenue / 1000000).toFixed(1)}M. No apportionment or nexus documentation was found in the tax workpapers.`,
          'IRC §164; Public Law 86-272: A state may not impose a net income tax on a business whose only in-state activity is the solicitation of sales of tangible personal property. However, economic nexus standards (post-Wayfair) may create filing obligations based on sales volume or transaction count.',
          'Perform a nexus study to identify all states where filing obligations exist. Evaluate physical presence and economic nexus thresholds for each state. Prepare apportionment schedules using the applicable formula (single sales factor, three-factor, etc.). Assess applicability of P.L. 86-272 protection for each state. File returns in all states where nexus has been established.',
          null,
          stateRevenueAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'IRS-SALT-003',
    name: 'SALT Deduction Limitation (§164(b)(6))',
    framework: 'IRS',
    category: 'State & Local Tax',
    description: 'Checks for SALT deduction amounts that may exceed the $10,000 annual limitation for applicable entities',
    citation: 'IRC §164(b)(6) - Limitation on individual deductions for taxable years 2018-2025',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const saltAccounts = data.accounts.filter(a => {
        const name = a.accountName.toLowerCase();
        return name.includes('state income tax') ||
          name.includes('local income tax') ||
          name.includes('property tax') ||
          name.includes('real estate tax') ||
          name.includes('state sales tax');
      });

      if (saltAccounts.length === 0) return findings;

      const totalSALT = saltAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Check if this is a pass-through entity or has individual pass-through characteristics
      const passThrough = data.taxData.filter(t =>
        t.formType === '1065' ||
        t.formType === '1120-S' ||
        t.description.toLowerCase().includes('pass-through') ||
        t.description.toLowerCase().includes('k-1')
      );

      const saltCapData = data.taxData.filter(t =>
        t.description.toLowerCase().includes('salt') && t.description.toLowerCase().includes('limit') ||
        t.description.toLowerCase().includes('§164(b)(6)') ||
        t.description.toLowerCase().includes('state and local tax deduction cap')
      );

      const taxYear = getTaxYear(data.fiscalYearEnd);
      const saltCap = getParameter('SALT_CAP', taxYear, data.entityType ?? undefined, 10000);

      if (totalSALT > saltCap && saltCap !== Infinity && passThrough.length > 0 && saltCapData.length === 0) {
        const excessOverCap = totalSALT - saltCap;
        findings.push(createFinding(
          data.engagementId,
          'IRS-SALT-003',
          'IRS',
          'medium',
          'SALT Deduction May Exceed §164(b)(6) Cap for Pass-Through Owners',
          `Total state and local tax deductions of $${(totalSALT / 1000).toFixed(0)}K exceed the $10,000 SALT deduction cap by $${(excessOverCap / 1000).toFixed(0)}K. Pass-through entity indicators are present (Forms 1065/1120-S/K-1), meaning individual owners may be subject to the §164(b)(6) limitation. No SALT cap analysis was found in the tax workpapers.`,
          'IRC §164(b)(6)(B): In the case of an individual, the aggregate amount of taxes taken into account under subsection (a) for any taxable year shall not exceed $10,000 ($5,000 in the case of a married individual filing a separate return).',
          'Determine whether the entity is a pass-through for tax purposes. If so, evaluate the impact of the $10,000 SALT cap on individual owners\' Schedule A deductions. Consider state-level pass-through entity tax (PTET) elections as a workaround where available, as PTET payments are deductible at the entity level without the §164(b)(6) limitation.',
          excessOverCap,
          saltAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
];
