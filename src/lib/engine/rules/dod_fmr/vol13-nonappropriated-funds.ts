import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '@/lib/engine/rule-runner';

export const nonappropriatedFundsRules: AuditRule[] = [
  {
    id: 'DOD-FMR-V13-001',
    name: 'NAF Accounting Standards',
    framework: 'DOD_FMR',
    category: 'Nonappropriated Funds (Volume 13)',
    description: 'Verifies that all NAF accounts have complete financial data including revenues, expenses, assets, liabilities, and net assets',
    citation: 'DoD FMR Vol 13, Ch 1; DoD Instruction 1015.15 - NAF accounting standards',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const naf of data.dodData.nafAccounts) {
        const missingFields: string[] = [];

        if (naf.revenues === undefined || naf.revenues === null) missingFields.push('revenues');
        if (naf.expenses === undefined || naf.expenses === null) missingFields.push('expenses');
        if (naf.netIncome === undefined || naf.netIncome === null) missingFields.push('netIncome');
        if (naf.assets === undefined || naf.assets === null) missingFields.push('assets');
        if (naf.liabilities === undefined || naf.liabilities === null) missingFields.push('liabilities');
        if (naf.netAssets === undefined || naf.netAssets === null) missingFields.push('netAssets');

        if (missingFields.length > 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V13-001',
            'DOD_FMR',
            'medium',
            `NAF Account Missing Financial Data`,
            `NAF account "${naf.accountName}" (${naf.accountType}) is missing ${missingFields.length} required financial data field(s): ${missingFields.join(', ')}. Complete financial data is required for NAF accounts to ensure compliance with DoD accounting standards and to support financial statement preparation.`,
            'DoD FMR Vol 13, Ch 1; DoD Instruction 1015.15 - NAF activities must maintain complete financial records in accordance with GAAP as adapted for government NAF operations.',
            'Ensure all required financial data fields are populated for this NAF account. Review the accounting system configuration and data entry procedures. Verify that the chart of accounts captures all required financial elements.',
            null,
            ['NAF - Accounting Standards']
          ));
        }

        // Check for negative assets (data integrity issue)
        if (naf.assets < 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V13-001',
            'DOD_FMR',
            'critical',
            `NAF Negative Total Assets`,
            `NAF account "${naf.accountName}": total assets are reported as $${naf.assets.toLocaleString()}, which is negative. Total assets cannot be negative and this indicates a significant accounting error or data integrity problem.`,
            'DoD FMR Vol 13, Ch 1 - NAF financial statements must accurately reflect the financial position. Assets must be properly valued and reported.',
            'Immediately review all asset accounts for errors. Verify cash balances, receivables, inventory, and fixed assets. Correct any mispostings or classification errors.',
            Math.abs(naf.assets),
            ['NAF - Accounting Standards']
          ));
        }

        // Flag if all financial values are exactly zero (potential data population failure)
        if (naf.revenues === 0 && naf.expenses === 0 && naf.assets === 0 && naf.liabilities === 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V13-001',
            'DOD_FMR',
            'low',
            `NAF Account All Zero Values`,
            `NAF account "${naf.accountName}" (${naf.accountType}) has zero values for all financial fields. This may indicate that financial data has not been populated for the reporting period or the account is inactive.`,
            'DoD FMR Vol 13, Ch 1; DoD Instruction 1015.15 - Active NAF activities must report complete financial data for each fiscal year.',
            'Determine if the NAF account is still active. If active, investigate why no financial activity has been recorded and ensure all transactions are posted. If inactive, initiate closure procedures per DoD guidance.',
            null,
            ['NAF - Accounting Standards']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V13-002',
    name: 'MWR Category Compliance',
    framework: 'DOD_FMR',
    category: 'Nonappropriated Funds (Volume 13)',
    description: 'Verifies proper MWR categorization (Category A, B, or C) by checking financial characteristics against category expectations',
    citation: 'DoD FMR Vol 13, Ch 2; DoD Instruction 1015.10 - MWR category definitions and funding',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      const validMWRTypes = ['mwr_category_a', 'mwr_category_b', 'mwr_category_c', 'lodging', 'other'];

      for (const naf of data.dodData.nafAccounts) {
        // Check for NAF accounts with non-standard category
        if (!validMWRTypes.includes(naf.accountType)) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V13-002',
            'DOD_FMR',
            'low',
            `NAF Account with Non-Standard MWR Category`,
            `NAF account "${naf.accountName}" has account type "${naf.accountType}" which is not a standard MWR category (A, B, or C). All NAF activities must be classified under the correct MWR category for proper funding authorization.`,
            'DoD FMR Vol 13, Ch 2; DoD Instruction 1015.10 - MWR programs are categorized as A (mission sustaining), B (basic community support), or C (revenue generating) to determine APF support levels.',
            'Review the account categorization and determine the appropriate MWR category. Update the classification if needed. Consult with the installation MWR director.',
            null,
            ['NAF - MWR Category']
          ));
        }

        // Category A should receive APF support - flag if generating large profits
        if (naf.accountType === 'mwr_category_a' && naf.revenues > 0 && naf.netIncome > naf.revenues * 0.30) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V13-002',
            'DOD_FMR',
            'low',
            `Category A MWR Activity Generating Significant Profit`,
            `NAF "${naf.accountName}" is classified as Category A (mission sustaining) but generates net income of $${naf.netIncome.toLocaleString()} (${((naf.netIncome / naf.revenues) * 100).toFixed(1)}% of revenue). Category A activities are intended to be primarily APF-supported. A high profit margin may indicate misclassification.`,
            'DoD FMR Vol 13, Ch 2; DoD Instruction 1015.10 - Category A activities are mission sustaining and should receive maximum APF support. They are not expected to generate significant revenue.',
            'Review the classification of this MWR activity. If it operates as a revenue-generating business, it may be more appropriately classified as Category B or C. Consult with the MWR program manager.',
            null,
            ['NAF - MWR Category']
          ));
        }

        // Category C should be self-sustaining - flag if operating at a loss
        if (naf.accountType === 'mwr_category_c' && naf.revenues > 0 && naf.netIncome < 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V13-002',
            'DOD_FMR',
            'medium',
            `Category C MWR Activity Operating at a Loss`,
            `NAF "${naf.accountName}" is classified as Category C (revenue generating, self-sustaining) but reported a net loss of $${Math.abs(naf.netIncome).toLocaleString()} on revenues of $${naf.revenues.toLocaleString()}. Category C activities should be self-sustaining and should not require APF support for operating costs.`,
            'DoD FMR Vol 13, Ch 2; DoD Instruction 1015.10 - Category C activities must be self-sustaining from NAF revenues. Persistent losses may require program restructuring or closure.',
            'Analyze the revenue and cost structure of this Category C activity. Develop a plan to achieve self-sustainability through revenue enhancement or cost reduction. If the activity cannot become self-sustaining, consider reclassification or closure.',
            Math.abs(naf.netIncome),
            ['NAF - MWR Category']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V13-003',
    name: 'NAF Net Asset Verification',
    framework: 'DOD_FMR',
    category: 'Nonappropriated Funds (Volume 13)',
    description: 'Checks that net assets equals assets minus liabilities for each NAF account, verifying the fundamental accounting equation',
    citation: 'DoD FMR Vol 13, Ch 1 - NAF accounting equation requirements',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const naf of data.dodData.nafAccounts) {
        const computedNetAssets = naf.assets - naf.liabilities;
        const difference = Math.abs(naf.netAssets - computedNetAssets);

        if (difference > 0.01) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V13-003',
            'DOD_FMR',
            'high',
            `NAF Accounting Equation Imbalance`,
            `NAF account "${naf.accountName}" (${naf.accountType}): assets ($${naf.assets.toLocaleString()}) minus liabilities ($${naf.liabilities.toLocaleString()}) equals $${computedNetAssets.toLocaleString()}, but reported net assets are $${naf.netAssets.toLocaleString()}. Difference: $${difference.toFixed(2)}. The fundamental accounting equation (Assets - Liabilities = Net Assets) must hold for NAF financial statements to be reliable.`,
            'DoD FMR Vol 13, Ch 1; DoD Instruction 1015.15 - NAF activities must maintain financial records in accordance with GAAP. The accounting equation must balance: Assets - Liabilities = Net Assets.',
            'Investigate the source of the accounting equation imbalance. Review all asset, liability, and net asset accounts for posting errors, unrecorded transactions, or classification mistakes. Prepare adjusting entries to correct the imbalance.',
            difference,
            ['NAF - Net Assets']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V13-004',
    name: 'NAF Revenue-Expense Consistency',
    framework: 'DOD_FMR',
    category: 'Nonappropriated Funds (Volume 13)',
    description: 'Checks that net income equals revenues minus expenses for each NAF account, verifying income statement integrity',
    citation: 'DoD FMR Vol 13, Ch 3 - NAF revenue and expense recognition',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const naf of data.dodData.nafAccounts) {
        const computedNetIncome = naf.revenues - naf.expenses;
        const difference = Math.abs(naf.netIncome - computedNetIncome);

        if (difference > 0.01) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V13-004',
            'DOD_FMR',
            'high',
            `NAF Net Income Does Not Reconcile`,
            `NAF account "${naf.accountName}" (${naf.accountType}): revenues ($${naf.revenues.toLocaleString()}) minus expenses ($${naf.expenses.toLocaleString()}) equals $${computedNetIncome.toLocaleString()}, but reported net income is $${naf.netIncome.toLocaleString()}. Difference: $${difference.toFixed(2)}. The income statement equation (Net Income = Revenues - Expenses) must hold.`,
            'DoD FMR Vol 13, Ch 3 - NAF financial statements must accurately reflect revenue and expense activity with net income properly computed as revenue less expenses.',
            'Investigate the net income discrepancy. Verify all revenue and expense entries for accuracy. Check for unrecorded transactions, timing differences, or other adjustments that should be reflected in the income statement.',
            difference,
            ['NAF - Revenue/Expense']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V13-005',
    name: 'NAF Investment Compliance',
    framework: 'DOD_FMR',
    category: 'Nonappropriated Funds (Volume 13)',
    description: 'Flags NAF accounts with negative net assets, indicating the activity liabilities exceed its assets and threatening financial viability',
    citation: 'DoD FMR Vol 13, Ch 6; DoD Instruction 1015.15 - NAF investment and financial viability',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const naf of data.dodData.nafAccounts) {
        if (naf.netAssets < 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V13-005',
            'DOD_FMR',
            'critical',
            `NAF Account with Negative Net Assets`,
            `NAF account "${naf.accountName}" (${naf.accountType}) has negative net assets of $${Math.abs(naf.netAssets).toLocaleString()}. Assets: $${naf.assets.toLocaleString()}, Liabilities: $${naf.liabilities.toLocaleString()}. Negative net assets indicate the activity's liabilities exceed its assets, threatening its financial viability and potentially requiring appropriated fund support or closure.`,
            'DoD FMR Vol 13, Ch 6; DoD Instruction 1015.15 - NAF activities should maintain positive net asset positions to ensure financial viability. Activities with persistent negative net assets may require restructuring or closure.',
            'Immediately notify the installation commander and MWR oversight chain. Develop a financial recovery plan with specific milestones and timelines. Consider emergency measures including cost reduction, revenue enhancement, or temporary APF support if authorized. If recovery is not feasible, initiate procedures for activity closure or consolidation.',
            Math.abs(naf.netAssets),
            ['NAF - Investment']
          ));
        }
      }

      return findings;
    },
  },
];
