import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const internationalTaxRules: AuditRule[] = [
  {
    id: 'IRS-INTL-001',
    name: 'Foreign Income Without Proper Reporting',
    framework: 'IRS',
    category: 'International Tax',
    description: 'Identifies foreign income accounts that may lack required international tax reporting',
    citation: 'IRC §951A - Global Intangible Low-Taxed Income (GILTI)',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const foreignIncomeAccounts = data.accounts.filter(a => {
        const name = a.accountName.toLowerCase();
        return name.includes('foreign') ||
          name.includes('international') ||
          name.includes('overseas') ||
          name.includes('offshore');
      });

      if (foreignIncomeAccounts.length === 0) return findings;

      const totalForeignIncome = foreignIncomeAccounts
        .filter(a => a.accountType === 'revenue')
        .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Check for international tax forms in tax data
      const intlForms = data.taxData.filter(t =>
        t.formType === '5471' ||
        t.formType === '8992' ||
        t.formType === '8993' ||
        t.formType === '1118' ||
        t.description.toLowerCase().includes('gilti') ||
        t.description.toLowerCase().includes('foreign')
      );

      if (totalForeignIncome > data.materialityThreshold && intlForms.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-INTL-001',
          'IRS',
          'high',
          'Foreign Income Detected Without International Tax Reporting',
          `${foreignIncomeAccounts.length} accounts with foreign/international indicators carry total income of $${(totalForeignIncome / 1000000).toFixed(1)}M, exceeding the materiality threshold of $${(data.materialityThreshold / 1000000).toFixed(1)}M. No corresponding international tax forms (5471, 8992, 8993, 1118) were found in the tax data.`,
          'IRC §951A(a): Each person who is a United States shareholder of any controlled foreign corporation shall include in gross income the GILTI amount for such taxable year. IRC §6038: Information reporting with respect to certain foreign corporations.',
          'Determine if the entity owns or controls any foreign corporations triggering Form 5471 filing obligations. Evaluate GILTI inclusion requirements under §951A. Prepare Forms 8992 (GILTI) and 8993 (FDII) as applicable. Assess foreign tax credit availability under §960.',
          totalForeignIncome,
          foreignIncomeAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'IRS-INTL-002',
    name: 'Foreign Tax Credit Review',
    framework: 'IRS',
    category: 'International Tax',
    description: 'Reviews foreign tax credit claims for compliance with IRC §901 and §904 limitations',
    citation: 'IRC §901 - Taxes of foreign countries and of possessions of United States',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const ftcAccounts = data.accounts.filter(a => {
        const name = a.accountName.toLowerCase();
        return name.includes('foreign tax') ||
          name.includes('tax credit') && (name.includes('foreign') || name.includes('international'));
      });

      const ftcTaxData = data.taxData.filter(t =>
        t.formType === '1118' ||
        t.description.toLowerCase().includes('foreign tax credit') ||
        t.description.toLowerCase().includes('§901')
      );

      const ftcAmount = ftcAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
      const ftcClaimed = ftcTaxData.reduce((sum, t) => sum + Math.abs(t.amount), 0);

      if (ftcAmount > 0 || ftcClaimed > 0) {
        const creditAmount = Math.max(ftcAmount, ftcClaimed);

        // Check for §904 limitation computation
        const limitationData = data.taxData.filter(t =>
          t.description.toLowerCase().includes('§904') ||
          t.description.toLowerCase().includes('limitation') && t.description.toLowerCase().includes('foreign')
        );

        if (limitationData.length === 0 && creditAmount > data.materialityThreshold * 0.1) {
          findings.push(createFinding(
            data.engagementId,
            'IRS-INTL-002',
            'IRS',
            'medium',
            'Foreign Tax Credits Claimed Without §904 Limitation Computation',
            `Foreign tax credits of $${(creditAmount / 1000).toFixed(0)}K are indicated but no §904 limitation computation was found. The foreign tax credit is limited to the lesser of foreign taxes paid or the §904 limitation (U.S. tax on foreign source income).`,
            'IRC §904(a): The total amount of the credit shall not exceed the same proportion of the tax against which the credit is taken which the taxpayer\'s taxable income from sources without the United States bears to the entire taxable income.',
            'Prepare Form 1118 (Foreign Tax Credit - Corporations) with proper §904 limitation calculation. Categorize income by basket (general, passive, GILTI). Verify that credits do not exceed the limitation for each category. Consider whether any excess credits should be carried back one year or forward ten years.',
            creditAmount,
            ftcAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'IRS-INTL-003',
    name: 'GILTI Inclusion Indicators',
    framework: 'IRS',
    category: 'International Tax',
    description: 'Identifies indicators that GILTI inclusion under §951A may be required',
    citation: 'IRC §951A - Global Intangible Low-Taxed Income',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Look for CFC / subsidiary indicators in accounts
      const cfcIndicators = data.accounts.filter(a => {
        const name = a.accountName.toLowerCase();
        return name.includes('cfc') ||
          name.includes('controlled foreign') ||
          name.includes('subsidiary') && (name.includes('foreign') || name.includes('international')) ||
          name.includes('investment in foreign');
      });

      // Look for GILTI entries in tax data
      const giltiData = data.taxData.filter(t =>
        t.description.toLowerCase().includes('gilti') ||
        t.formType === '8992' ||
        (t.description.toLowerCase().includes('§951a') || t.description.toLowerCase().includes('951a'))
      );

      const cfcInvestmentTotal = cfcIndicators.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (cfcIndicators.length > 0 && giltiData.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'IRS-INTL-003',
          'IRS',
          'high',
          'CFC Indicators Present Without GILTI Inclusion Computation',
          `${cfcIndicators.length} accounts with CFC/foreign subsidiary indicators were identified with total balances of $${(cfcInvestmentTotal / 1000000).toFixed(1)}M, but no GILTI inclusion data (Form 8992) was found. U.S. shareholders of CFCs must compute and include GILTI in gross income under §951A.`,
          'IRC §951A(a): Each person who is a United States shareholder of any CFC shall include in gross income the GILTI amount. GILTI = net CFC tested income - net deemed tangible income return (10% of QBAI less certain interest expense).',
          'Determine U.S. shareholder status and CFC ownership percentages. Calculate tested income and tested loss for each CFC. Compute qualified business asset investment (QBAI) for the deemed tangible income return. Prepare Form 8992 and include GILTI amount on Form 1120. Evaluate §250 deduction availability (50% GILTI deduction for C corporations).',
          cfcInvestmentTotal,
          cfcIndicators.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
];
