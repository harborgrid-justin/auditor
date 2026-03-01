import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const impairmentRules: AuditRule[] = [
  {
    id: 'GAAP-IMP-001',
    name: 'Goodwill Impairment Indicators',
    framework: 'GAAP',
    category: 'Impairment (ASC 350)',
    description: 'Identifies indicators that goodwill may be impaired when goodwill represents a significant portion of total equity',
    citation: 'ASC 350-20-35-3C: Goodwill impairment testing',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const goodwillAccounts = data.accounts.filter(
        a => a.accountName.toLowerCase().includes('goodwill') && a.subType === 'intangible'
      );
      const equityAccounts = data.accounts.filter(a => a.accountType === 'equity');

      const totalGoodwill = goodwillAccounts.reduce((sum, a) => sum + a.endingBalance, 0);
      const totalEquity = equityAccounts.reduce((sum, a) => sum + a.endingBalance, 0);

      if (totalGoodwill > 0 && totalEquity > 0) {
        const goodwillToEquityRatio = totalGoodwill / totalEquity;

        if (goodwillToEquityRatio > 0.50) {
          // Also check for other impairment indicators
          const indicators: string[] = [];

          // Check if goodwill hasn't changed (no impairment taken when ratio is high)
          const goodwillBeginning = goodwillAccounts.reduce((sum, a) => sum + a.beginningBalance, 0);
          if (totalGoodwill === goodwillBeginning) {
            indicators.push('No goodwill impairment has been recorded during the period despite the high concentration');
          }

          // Check operating income from financial statements
          const incomeStatement = data.financialStatements.find(fs => fs.statementType === 'IS');
          if (incomeStatement) {
            const fsData = incomeStatement.data;
            const operatingIncome = fsData.operatingIncome ?? fsData.operating_income ?? 0;
            const totalRevenue = fsData.totalRevenue ?? fsData.total_revenue ?? 0;
            if (totalRevenue > 0 && operatingIncome / totalRevenue < 0.05) {
              indicators.push(`Operating margin is thin at ${((operatingIncome / totalRevenue) * 100).toFixed(1)}%, which may indicate declining reporting unit fair value`);
            }
          }

          findings.push(createFinding(
            data.engagementId,
            'GAAP-IMP-001',
            'GAAP',
            'high',
            'Goodwill Impairment Risk - High Goodwill to Equity Ratio',
            `Goodwill of $${(totalGoodwill / 1000000).toFixed(1)}M represents ${(goodwillToEquityRatio * 100).toFixed(1)}% of total stockholders' equity ($${(totalEquity / 1000000).toFixed(1)}M), exceeding the 50% threshold for heightened impairment risk. ${indicators.length > 0 ? 'Additional impairment indicators identified: ' + indicators.join('. ') + '.' : ''} Under ASC 350, goodwill must be tested for impairment at least annually, and the carrying amount of a reporting unit including goodwill must not exceed its fair value.`,
            'ASC 350-20-35-3C: An entity shall test goodwill for impairment at a level of reporting referred to as a reporting unit. The quantitative impairment test compares the fair value of a reporting unit with its carrying amount, including goodwill.',
            'Obtain management\'s goodwill impairment analysis and assess: (1) the allocation of goodwill to reporting units, (2) the valuation methodology used (DCF, market multiples, or both), (3) key assumptions including revenue growth rates, discount rates, and terminal values, (4) whether a qualitative assessment was performed and its conclusions. Consider engaging a valuation specialist.',
            totalGoodwill,
            goodwillAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'GAAP-IMP-002',
    name: 'Long-Lived Asset Impairment Triggers',
    framework: 'GAAP',
    category: 'Impairment (ASC 360)',
    description: 'Evaluates whether long-lived assets show indicators requiring impairment testing under ASC 360',
    citation: 'ASC 360-10-35-21: Long-lived asset impairment indicators',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const fixedAssetAccounts = data.accounts.filter(a => a.subType === 'fixed_asset');
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const depreciationExpenseAccounts = data.accounts.filter(a => a.subType === 'depreciation');

      // Compute gross fixed assets and accumulated depreciation
      const grossAssets = fixedAssetAccounts
        .filter(a => a.endingBalance > 0)
        .reduce((sum, a) => sum + a.endingBalance, 0);
      const accumDepr = fixedAssetAccounts
        .filter(a => a.endingBalance < 0)
        .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
      const netAssets = grossAssets - accumDepr;

      // Check impairment indicators
      const triggers: string[] = [];

      // 1) High accumulated depreciation ratio (>70%) suggests aging assets
      if (grossAssets > 0 && accumDepr / grossAssets > 0.70) {
        triggers.push(`Accumulated depreciation is ${((accumDepr / grossAssets) * 100).toFixed(1)}% of gross assets, indicating a significantly aged asset base`);
      }

      // 2) Check for declining revenue which could reduce undiscounted future cash flows
      const incomeStatement = data.financialStatements.find(fs => fs.statementType === 'IS');
      if (incomeStatement) {
        const fsData = incomeStatement.data;
        const operatingIncome = fsData.operatingIncome ?? fsData.operating_income ?? 0;
        if (operatingIncome < 0) {
          triggers.push(`Operating losses of $${(Math.abs(operatingIncome) / 1000).toFixed(0)}K may indicate that the carrying amount of long-lived assets is not recoverable`);
        }
      }

      // 3) Significant change in asset use (large additions relative to existing base)
      const grossBeginning = fixedAssetAccounts
        .filter(a => a.beginningBalance > 0)
        .reduce((sum, a) => sum + a.beginningBalance, 0);
      if (grossBeginning > 0) {
        const assetChangePct = (grossAssets - grossBeginning) / grossBeginning;
        if (assetChangePct < -0.15) {
          triggers.push(`Gross fixed assets declined by ${(Math.abs(assetChangePct) * 100).toFixed(1)}%, which may indicate asset disposals or a significant change in the manner of asset use`);
        }
      }

      if (triggers.length > 0 && netAssets > data.materialityThreshold) {
        findings.push(createFinding(
          data.engagementId,
          'GAAP-IMP-002',
          'GAAP',
          'medium',
          'Long-Lived Asset Impairment Indicators Present',
          `Net fixed assets of $${(netAssets / 1000000).toFixed(2)}M (gross $${(grossAssets / 1000000).toFixed(1)}M, accumulated depreciation $${(accumDepr / 1000000).toFixed(1)}M) show the following impairment indicators: ${triggers.join('; ')}. Under ASC 360-10-35-21, a long-lived asset shall be tested for recoverability when events or changes in circumstances indicate that its carrying amount may not be recoverable.`,
          'ASC 360-10-35-21: A long-lived asset (asset group) shall be tested for recoverability whenever events or changes in circumstances indicate that its carrying amount may not be recoverable.',
          'Evaluate whether an impairment test is required. If so, perform the Step 1 recoverability test by comparing the carrying amount to the sum of undiscounted future cash flows. If carrying amount exceeds undiscounted cash flows, measure the impairment as the excess of carrying amount over fair value. Document all significant assumptions.',
          netAssets,
          fixedAssetAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'GAAP-IMP-003',
    name: 'Useful Life Reasonableness - Depreciation Check',
    framework: 'GAAP',
    category: 'Impairment (ASC 360)',
    description: 'Validates that the implied useful life from depreciation expense appears reasonable for the asset base',
    citation: 'ASC 360-10-35-4: Depreciation over useful life',
    defaultSeverity: 'low',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const fixedAssetAccounts = data.accounts.filter(a => a.subType === 'fixed_asset');
      const depreciationExpenseAccounts = data.accounts.filter(a => a.subType === 'depreciation');

      const grossAssets = fixedAssetAccounts
        .filter(a => a.endingBalance > 0)
        .reduce((sum, a) => sum + a.endingBalance, 0);
      const totalDepreciation = depreciationExpenseAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (grossAssets > 0 && totalDepreciation > 0) {
        const impliedUsefulLife = grossAssets / totalDepreciation;

        // Typical useful lives: buildings 20-40 years, equipment 5-15 years, furniture 5-10 years
        // A blended rate should typically be 5-25 years
        if (impliedUsefulLife > 30) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-IMP-003',
            'GAAP',
            'low',
            'Implied Useful Life Appears Excessively Long',
            `Based on annual depreciation of $${(totalDepreciation / 1000).toFixed(0)}K against gross PP&E of $${(grossAssets / 1000000).toFixed(1)}M, the implied average useful life is ${impliedUsefulLife.toFixed(1)} years. This exceeds typical ranges for technology and industrial assets (5-20 years) and may indicate underdepreciation. Overly long useful lives can result in an overstatement of net assets and understatement of expenses.`,
            'ASC 360-10-35-4: The cost of a productive facility is one of the costs of the services it renders during its useful economic life.',
            'Review the fixed asset register and depreciation policies. Verify that useful life estimates are consistent with the actual economic lives of the assets. Consider whether recent technological changes or business shifts warrant revising useful life estimates. Compare to industry benchmarks.',
            null,
            [...fixedAssetAccounts, ...depreciationExpenseAccounts].map(a => a.accountNumber)
          ));
        }

        if (impliedUsefulLife < 3) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-IMP-003',
            'GAAP',
            'medium',
            'Implied Useful Life Appears Excessively Short',
            `Based on annual depreciation of $${(totalDepreciation / 1000).toFixed(0)}K against gross PP&E of $${(grossAssets / 1000000).toFixed(1)}M, the implied average useful life is only ${impliedUsefulLife.toFixed(1)} years. This is unusually short for PP&E and may indicate: (1) accelerated depreciation methods without proper justification, (2) significant asset additions late in the year inflating the denominator, or (3) a depreciation calculation error. The rapid depreciation increases expense and reduces net asset values.`,
            'ASC 360-10-35-4: The cost of a productive facility is one of the costs of the services it renders during its useful economic life.',
            'Review the depreciation calculation for accuracy. Verify asset additions during the year are depreciated from the correct in-service date. Confirm the depreciation method is appropriate for each asset class and that useful life estimates are reasonable.',
            null,
            [...fixedAssetAccounts, ...depreciationExpenseAccounts].map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
];
