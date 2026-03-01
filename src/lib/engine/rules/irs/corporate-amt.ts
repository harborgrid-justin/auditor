import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';
import { getParameter } from '../../tax-parameters/registry';
import { getTaxYear } from '../../tax-parameters/utils';

export const corporateAmtRules: AuditRule[] = [
  {
    id: 'IRS-AMT-001',
    name: 'CAMT Applicability',
    framework: 'IRS',
    category: 'Corporate AMT',
    description: 'Flags entities with revenue suggesting average AFSI may exceed the $1B applicable corporation threshold under the Inflation Reduction Act',
    citation: 'IRC §55/§59(k) - Corporate Alternative Minimum Tax (CAMT) applicability',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);

      // CAMT only applies for tax years beginning after December 31, 2022
      if (taxYear < 2023) return findings;

      const camtThreshold = getParameter('CAMT_THRESHOLD', taxYear, data.entityType ?? undefined, 1000000000);

      // Estimate average AFSI from revenue data as a proxy
      // Revenue is a reasonable indicator of whether a corporation may be an
      // "applicable corporation" under §59(k)
      const totalRevenue = data.accounts
        .filter(a => a.accountType === 'revenue')
        .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Also check financial statements for total revenue / net income
      const isStatements = data.financialStatements.filter(fs => fs.statementType === 'IS');
      let bookNetIncome = 0;
      if (isStatements.length > 0) {
        const isData = typeof isStatements[0].data === 'string'
          ? JSON.parse(isStatements[0].data)
          : isStatements[0].data;
        bookNetIncome = isData.netIncome ?? isData.incomeBeforeTax ?? 0;
      }

      // Use the higher of revenue-based and book income-based indicators
      const afsiIndicator = Math.max(totalRevenue, bookNetIncome);

      if (afsiIndicator >= camtThreshold) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-AMT-001',
          'IRS',
          'high',
          'Entity May Be Subject to Corporate AMT (CAMT)',
          `Revenue of $${(totalRevenue / 1000000000).toFixed(2)}B and/or book income of $${(bookNetIncome / 1000000000).toFixed(2)}B suggest the entity may meet or exceed the $${(camtThreshold / 1000000000).toFixed(0)}B average AFSI threshold for CAMT applicability. Under the Inflation Reduction Act (P.L. 117-169), applicable corporations with 3-year average adjusted financial statement income (AFSI) exceeding $1 billion are subject to a 15% minimum tax on AFSI for tax years beginning after December 31, 2022.`,
          'IRC §59(k)(1): The term applicable corporation means, with respect to any taxable year, any corporation (other than an S corporation, a regulated investment company, or a real estate investment trust) which meets the average annual AFSI test. IRC §55(b)(2): The tentative minimum tax is 15% of AFSI.',
          'Perform a detailed CAMT applicability analysis: (1) compute 3-year average AFSI per §56A, (2) determine if the entity is an applicable corporation under §59(k), (3) if applicable, compute the tentative minimum tax under §55(b)(2). Consider AFSI adjustments under §56A (depreciation, NOL deductions, etc.) and available CAMT foreign tax credits.',
          null,
          ['tax_expense']
        ));
      } else if (afsiIndicator >= camtThreshold * 0.70) {
        // Near-threshold warning
        findings.push(createFinding(
          data.engagementId,
          'IRS-AMT-001',
          'IRS',
          'medium',
          'Entity Approaching CAMT Applicability Threshold',
          `Revenue of $${(totalRevenue / 1000000000).toFixed(2)}B is within 30% of the $${(camtThreshold / 1000000000).toFixed(0)}B CAMT threshold. While the entity may not currently be an applicable corporation, growth, acquisitions, or AFSI adjustments could trigger CAMT applicability in upcoming years. The 3-year average test means a single high-income year can cause CAMT to apply.`,
          'IRC §59(k)(1): The average annual AFSI test is met if the average annual AFSI of such corporation (determined without regard to §56A(d)) for the 3-taxable-year period ending with such taxable year exceeds $1,000,000,000.',
          'Monitor the 3-year average AFSI trend. Model projected AFSI for the next 2-3 years. If the entity is approaching the threshold, begin preparing for CAMT compliance including AFSI computation workpapers and §56A adjustment analysis.',
          null,
          ['tax_expense']
        ));
      }

      return findings;
    },
  },
  {
    id: 'IRS-AMT-002',
    name: 'CAMT Computation Review',
    framework: 'IRS',
    category: 'Corporate AMT',
    description: 'If CAMT is applicable, verifies the 15% minimum tax computation on adjusted financial statement income',
    citation: 'IRC §55(b)(2) - CAMT rate of 15% on AFSI',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const taxYear = getTaxYear(data.fiscalYearEnd);

      // CAMT only applies for tax years beginning after December 31, 2022
      if (taxYear < 2023) return findings;

      const camtRate = getParameter('CAMT_RATE', taxYear, data.entityType ?? undefined, 0.15);
      const camtThreshold = getParameter('CAMT_THRESHOLD', taxYear, data.entityType ?? undefined, 1000000000);

      // Look for CAMT-related tax data
      const camtData = data.taxData.filter(t =>
        t.description.toLowerCase().includes('camt') ||
        t.description.toLowerCase().includes('corporate amt') ||
        t.description.toLowerCase().includes('alternative minimum') ||
        t.description.toLowerCase().includes('afsi') ||
        t.description.toLowerCase().includes('minimum tax')
      );

      // Check if the entity appears to be an applicable corporation
      const totalRevenue = data.accounts
        .filter(a => a.accountType === 'revenue')
        .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (totalRevenue < camtThreshold) return findings;

      // Get book income for AFSI proxy
      const isStatements = data.financialStatements.filter(fs => fs.statementType === 'IS');
      let bookNetIncome = 0;
      if (isStatements.length > 0) {
        const isData = typeof isStatements[0].data === 'string'
          ? JSON.parse(isStatements[0].data)
          : isStatements[0].data;
        bookNetIncome = isData.netIncome ?? isData.incomeBeforeTax ?? 0;
      }

      // Get regular tax liability
      const regularTax = data.taxData.find(t =>
        (t.formType === '1120' && t.schedule === 'main' && t.lineNumber === '31') ||
        t.description.toLowerCase().includes('total tax') ||
        t.description.toLowerCase().includes('regular tax')
      );

      if (bookNetIncome > 0) {
        const tentativeMinimumTax = bookNetIncome * camtRate;
        const regularTaxAmount = regularTax?.amount ?? 0;

        if (camtData.length === 0) {
          // No CAMT computation found — flag for review
          findings.push(createFinding(
            data.engagementId,
            'IRS-AMT-002',
            'IRS',
            'high',
            'CAMT Computation Missing for Applicable Corporation',
            `The entity appears to be an applicable corporation (revenue: $${(totalRevenue / 1000000000).toFixed(2)}B) but no CAMT computation was found. Book net income (AFSI proxy): $${(bookNetIncome / 1000000).toFixed(1)}M. Tentative minimum tax at ${(camtRate * 100).toFixed(0)}%: $${(tentativeMinimumTax / 1000000).toFixed(1)}M. Regular tax: $${(regularTaxAmount / 1000000).toFixed(1)}M. If the tentative minimum tax exceeds regular tax, a CAMT liability of $${(Math.max(0, tentativeMinimumTax - regularTaxAmount) / 1000000).toFixed(1)}M would apply.`,
            'IRC §55(a): There is hereby imposed a tax equal to the excess (if any) of the tentative minimum tax for the taxable year over the regular tax for the taxable year. IRC §55(b)(2): The tentative minimum tax is 15% of the AFSI of the applicable corporation for the taxable year.',
            'Prepare a complete CAMT computation: (1) determine AFSI per §56A, including all required adjustments (depreciation differences, NOL limitations, etc.), (2) compute the tentative minimum tax at 15% of AFSI, (3) compare to regular tax liability, (4) compute any CAMT liability as the excess of TMT over regular tax. File Form 4626 if CAMT applies.',
            tentativeMinimumTax > regularTaxAmount
              ? tentativeMinimumTax - regularTaxAmount
              : null,
            ['tax_expense']
          ));
        } else {
          // CAMT computation exists — verify the rate
          const reportedCamt = camtData.find(t =>
            t.description.toLowerCase().includes('tentative minimum') ||
            t.description.toLowerCase().includes('camt liability') ||
            t.description.toLowerCase().includes('minimum tax')
          );

          if (reportedCamt && reportedCamt.amount > 0) {
            // Verify the computation approximates 15% of AFSI
            const expectedTmt = bookNetIncome * camtRate;
            const diff = Math.abs(reportedCamt.amount - expectedTmt);

            if (diff > expectedTmt * 0.10) {
              findings.push(createFinding(
                data.engagementId,
                'IRS-AMT-002',
                'IRS',
                'medium',
                'CAMT Computation Variance',
                `Reported CAMT/TMT of $${(reportedCamt.amount / 1000000).toFixed(1)}M differs from the expected ${(camtRate * 100).toFixed(0)}% of book income ($${(expectedTmt / 1000000).toFixed(1)}M) by $${(diff / 1000000).toFixed(1)}M. This variance may be attributable to §56A AFSI adjustments, but should be reviewed to ensure all adjustments are properly supported.`,
                'IRC §56A: Adjusted financial statement income is the net income or loss set forth on the applicable financial statement, adjusted as provided in this section.',
                'Reconcile the CAMT computation to the applicable financial statement. Verify all §56A adjustments (depreciation, amortization, stock compensation, etc.) are properly computed and documented. Ensure CAMT foreign tax credits under §59(l) are correctly applied.',
                diff,
                ['tax_expense']
              ));
            }
          }
        }
      }

      return findings;
    },
  },
];
