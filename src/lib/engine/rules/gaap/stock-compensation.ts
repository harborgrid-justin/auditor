import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const stockCompensationRules: AuditRule[] = [
  {
    id: 'GAAP-SBC-001',
    name: 'Stock-Based Compensation as Percentage of Revenue',
    framework: 'GAAP',
    category: 'Stock Compensation (ASC 718)',
    description: 'Evaluates whether stock-based compensation expense is disproportionately high relative to revenue, which may distort profitability metrics',
    citation: 'ASC 718-10-25-1: Recognition of compensation cost for share-based payment transactions',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const stockCompAccounts = data.accounts.filter(a =>
        a.accountName.toLowerCase().includes('stock') &&
        (a.accountName.toLowerCase().includes('compensation') || a.accountName.toLowerCase().includes('comp')) &&
        a.accountType === 'expense'
      );
      const revenueAccounts = data.accounts.filter(a => a.accountType === 'revenue');

      const totalStockComp = stockCompAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
      const totalRevenue = revenueAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (totalRevenue > 0 && totalStockComp > 0) {
        const sbcPctOfRevenue = totalStockComp / totalRevenue;

        // Also check SBC relative to total operating expenses
        const totalOpex = data.accounts
          .filter(a => a.accountType === 'expense' && a.subType !== 'tax_expense' && a.subType !== 'interest_expense')
          .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
        const sbcPctOfOpex = totalOpex > 0 ? totalStockComp / totalOpex : 0;

        // Check SBC relative to net income
        const incomeStatement = data.financialStatements.find(fs => fs.statementType === 'IS');
        let netIncome = 0;
        if (incomeStatement) {
          netIncome = incomeStatement.data.netIncome ?? incomeStatement.data.net_income ?? 0;
        }
        const sbcToNetIncomeRatio = netIncome > 0 ? totalStockComp / netIncome : 0;

        // Flag if SBC > 5% of revenue (elevated for most industries)
        if (sbcPctOfRevenue > 0.05) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-SBC-001',
            'GAAP',
            'medium',
            'Stock-Based Compensation is Elevated Relative to Revenue',
            `Stock-based compensation expense of $${(totalStockComp / 1000000).toFixed(2)}M represents ${(sbcPctOfRevenue * 100).toFixed(1)}% of total revenue ($${(totalRevenue / 1000000).toFixed(1)}M), ${(sbcPctOfOpex * 100).toFixed(1)}% of operating expenses, and ${sbcToNetIncomeRatio > 0 ? `${(sbcToNetIncomeRatio * 100).toFixed(0)}% of net income ($${(netIncome / 1000000).toFixed(2)}M)` : 'is significant relative to operating results'}. While common in technology companies, elevated SBC requires careful audit attention to: (1) grant-date fair value methodology (Black-Scholes, Monte Carlo, etc.), (2) service and performance condition assessments, (3) forfeiture rate estimates, (4) modification accounting, and (5) proper classification between cost of revenue and operating expenses.`,
            'ASC 718-10-25-1: An entity shall recognize the cost of employee services received in exchange for awards of share-based compensation based on the grant-date fair value of the awards.',
            'Obtain the complete SBC schedule including all outstanding grants. Verify grant-date fair values by reviewing valuation inputs (expected volatility, risk-free rate, expected term, dividend yield). Test a sample of vesting calculations. Review any modifications or cancellations during the period. Verify proper expense allocation across functional categories. Confirm tax treatment under Section 162(m) for covered employees.',
            totalStockComp,
            stockCompAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'GAAP-SBC-002',
    name: 'Stock Compensation Trend Analysis',
    framework: 'GAAP',
    category: 'Stock Compensation (ASC 718)',
    description: 'Analyzes stock-based compensation expense trends and the relationship with APIC to verify completeness and proper recording',
    citation: 'ASC 718-10-35-2: Measurement of compensation cost',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const stockCompAccounts = data.accounts.filter(a =>
        a.accountName.toLowerCase().includes('stock') &&
        (a.accountName.toLowerCase().includes('compensation') || a.accountName.toLowerCase().includes('comp')) &&
        a.accountType === 'expense'
      );
      const totalStockComp = stockCompAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Check the APIC (Additional Paid-in Capital) increase to see if SBC is properly offsetting
      const apicAccounts = data.accounts.filter(a =>
        a.subType === 'other_equity' &&
        (a.accountName.toLowerCase().includes('paid-in') ||
         a.accountName.toLowerCase().includes('paid in') ||
         a.accountName.toLowerCase().includes('apic') ||
         a.accountName.toLowerCase().includes('additional'))
      );

      const apicBeginning = apicAccounts.reduce((sum, a) => sum + a.beginningBalance, 0);
      const apicEnding = apicAccounts.reduce((sum, a) => sum + a.endingBalance, 0);
      const apicIncrease = apicEnding - apicBeginning;

      // Treasury stock changes (stock buybacks)
      const treasuryAccounts = data.accounts.filter(a => a.subType === 'treasury_stock');
      const treasuryChange = treasuryAccounts.reduce((sum, a) =>
        sum + (Math.abs(a.endingBalance) - Math.abs(a.beginningBalance)), 0);

      if (totalStockComp > 0 && apicAccounts.length > 0) {
        // SBC expense should flow through to APIC. If APIC increase is much larger than SBC,
        // there may be equity issuances. If APIC increase is smaller, SBC may be incomplete.
        if (apicIncrease < totalStockComp * 0.5 && apicIncrease >= 0) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-SBC-002',
            'GAAP',
            'medium',
            'Stock Compensation Expense and APIC Increase Inconsistency',
            `Stock-based compensation expense of $${(totalStockComp / 1000000).toFixed(2)}M exceeds the increase in additional paid-in capital of $${(apicIncrease / 1000000).toFixed(2)}M. The difference of $${((totalStockComp - apicIncrease) / 1000).toFixed(0)}K is unexplained. SBC expense should generally result in a corresponding credit to APIC (equity). Possible explanations include: (1) stock option exercises moving amounts from APIC, (2) share repurchases reducing APIC, (3) recording errors in either the expense or equity entry, or (4) net settlement of awards reducing shares and APIC. ${treasuryChange > 0 ? `Treasury stock increased by $${(treasuryChange / 1000).toFixed(0)}K during the period, which partially explains the APIC movement.` : ''}`,
            'ASC 718-10-35-2: Compensation cost for each award shall be recognized in the financial statements with a corresponding credit to equity (typically APIC).',
            'Prepare a roll-forward of APIC showing: beginning balance + SBC expense + stock issuances - exercises net of tax effects - other transactions = ending balance. Verify each component. Reconcile to the equity section of the balance sheet. Review share activity reports from the transfer agent.',
            Math.abs(totalStockComp - apicIncrease),
            [...stockCompAccounts, ...apicAccounts].map(a => a.accountNumber)
          ));
        }
      }

      // Check SBC on the cash flow statement (should be added back as non-cash)
      const cashFlowStatement = data.financialStatements.find(fs => fs.statementType === 'CF');
      if (cashFlowStatement && totalStockComp > 0) {
        const cfData = cashFlowStatement.data;
        const sbcAddback = cfData.stockBasedComp ?? cfData.stock_based_comp ?? cfData.stockCompensation ?? cfData.stock_compensation ?? 0;

        if (Math.abs(sbcAddback) > 0) {
          const cfDifference = Math.abs(totalStockComp - sbcAddback);
          if (cfDifference > data.materialityThreshold * 0.1 && cfDifference > totalStockComp * 0.05) {
            findings.push(createFinding(
              data.engagementId,
              'GAAP-SBC-002',
              'GAAP',
              'low',
              'Stock Compensation Expense and Cash Flow Addback Differ',
              `Stock-based compensation expense per the income statement ($${(totalStockComp / 1000000).toFixed(2)}M) differs from the SBC addback on the cash flow statement ($${(sbcAddback / 1000000).toFixed(2)}M) by $${(cfDifference / 1000).toFixed(0)}K. Since SBC is a non-cash expense, the full amount should be added back in the operating section of the cash flow statement. Differences may arise from: (1) capitalized SBC (e.g., included in inventory or software development costs), (2) SBC related to discontinued operations, or (3) a presentation error.`,
              'ASC 718-10-25-1: Stock-based compensation cost is a non-cash charge that must be reconciled in the cash flow statement.',
              'Reconcile the SBC expense per the income statement to the cash flow statement addback. Identify any SBC that is capitalized rather than expensed. Verify proper presentation in the cash flow statement operating activities section.',
              cfDifference,
              stockCompAccounts.map(a => a.accountNumber)
            ));
          }
        }
      }

      return findings;
    },
  },
];
