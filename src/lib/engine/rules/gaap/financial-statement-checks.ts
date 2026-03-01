import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const financialStatementCheckRules: AuditRule[] = [
  {
    id: 'GAAP-FS-001',
    name: 'Balance Sheet Equation Check',
    framework: 'GAAP',
    category: 'Financial Statement Cross-Checks',
    description: 'Verifies the fundamental accounting equation: Assets = Liabilities + Stockholders\' Equity',
    citation: 'ASC 210-10-45: Balance sheet classification and presentation',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Check from financial statements first
      const balanceSheet = data.financialStatements.find(fs => fs.statementType === 'BS');

      if (balanceSheet) {
        const fsData = balanceSheet.data;
        const totalAssets = fsData.totalAssets ?? fsData.total_assets ?? 0;
        const totalLiabilities = fsData.totalLiabilities ?? fsData.total_liabilities ?? 0;
        const totalEquity = fsData.totalEquity ?? fsData.total_equity ?? 0;
        const difference = totalAssets - (totalLiabilities + totalEquity);

        if (Math.abs(difference) > 1) { // Allow $1 rounding tolerance
          findings.push(createFinding(
            data.engagementId,
            'GAAP-FS-001',
            'GAAP',
            'critical',
            'Balance Sheet Does Not Balance (A ≠ L + E)',
            `Total assets ($${(totalAssets / 1000000).toFixed(2)}M) do not equal total liabilities ($${(totalLiabilities / 1000000).toFixed(2)}M) plus stockholders' equity ($${(totalEquity / 1000000).toFixed(2)}M). The difference is $${(difference / 1000000).toFixed(2)}M. This fundamental violation of the accounting equation indicates a material error in the financial statements. Possible causes include: (1) incorrect account classification, (2) missing accounts or omitted balances, (3) mathematical errors in consolidation or summation, (4) intercompany elimination errors, or (5) data extraction or system errors.`,
            'ASC 210-10-45: The balance sheet shall present the financial position of the entity, with assets equaling liabilities plus equity.',
            'Immediately investigate the source of the imbalance. Reconcile total assets, liabilities, and equity to the trial balance. Review all account classifications. Check for accounts that may have been omitted from the financial statement compilation. Verify any consolidation entries or intercompany eliminations.',
            Math.abs(difference),
            []
          ));
        }
      }

      // Also cross-check the financial statement totals against the account-level data
      const totalAssetsFromAccounts = data.accounts
        .filter(a => a.accountType === 'asset')
        .reduce((sum, a) => sum + a.endingBalance, 0);
      const totalLiabilitiesFromAccounts = data.accounts
        .filter(a => a.accountType === 'liability')
        .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
      const totalEquityFromAccounts = data.accounts
        .filter(a => a.accountType === 'equity')
        .reduce((sum, a) => sum + a.endingBalance, 0);
      const accountDifference = totalAssetsFromAccounts - (totalLiabilitiesFromAccounts + totalEquityFromAccounts);

      if (Math.abs(accountDifference) > data.materialityThreshold * 0.1 && Math.abs(accountDifference) > 1) {
        findings.push(createFinding(
          data.engagementId,
          'GAAP-FS-001',
          'GAAP',
          'high',
          'Trial Balance Does Not Balance by Account Type',
          `The sum of all asset accounts ($${(totalAssetsFromAccounts / 1000000).toFixed(2)}M) does not equal the sum of liability accounts ($${(totalLiabilitiesFromAccounts / 1000000).toFixed(2)}M) plus equity accounts ($${(totalEquityFromAccounts / 1000000).toFixed(2)}M). The imbalance is $${(accountDifference / 1000000).toFixed(2)}M. This may indicate misclassified accounts, missing accounts from the chart of accounts, or errors in the trial balance import.`,
          'ASC 210-10-45: The balance sheet shall present a classified balance sheet where assets equal liabilities plus equity.',
          'Reconcile the trial balance to the financial statements. Identify any accounts not properly classified into asset, liability, or equity. Verify that all accounts in the chart of accounts have been included.',
          Math.abs(accountDifference),
          []
        ));
      }

      return findings;
    },
  },
  {
    id: 'GAAP-FS-002',
    name: 'Net Income to Retained Earnings Roll-Forward',
    framework: 'GAAP',
    category: 'Financial Statement Cross-Checks',
    description: 'Verifies that the change in retained earnings is consistent with net income, dividends, and other equity adjustments',
    citation: 'ASC 505-10-50: Stockholders\' equity disclosure requirements',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const retainedEarningsAccounts = data.accounts.filter(a => a.subType === 'retained_earnings');

      const reBeginning = retainedEarningsAccounts.reduce((sum, a) => sum + a.beginningBalance, 0);
      const reEnding = retainedEarningsAccounts.reduce((sum, a) => sum + a.endingBalance, 0);
      const reChange = reEnding - reBeginning;

      // Get net income from financial statements
      const incomeStatement = data.financialStatements.find(fs => fs.statementType === 'IS');
      let netIncome = 0;

      if (incomeStatement) {
        const fsData = incomeStatement.data;
        netIncome = fsData.netIncome ?? fsData.net_income ?? 0;
      }

      // Fallback: calculate net income from accounts
      if (netIncome === 0) {
        const totalRevenue = data.accounts
          .filter(a => a.accountType === 'revenue')
          .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
        const totalExpenses = data.accounts
          .filter(a => a.accountType === 'expense')
          .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
        netIncome = totalRevenue - totalExpenses;
      }

      if (Math.abs(netIncome) > 0 || Math.abs(reChange) > 0) {
        const rollForwardDiff = reChange - netIncome;

        // The difference should be explainable by dividends, stock repurchases, etc.
        // Flag if the unexplained difference is material
        if (Math.abs(rollForwardDiff) > data.materialityThreshold * 0.25) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-FS-002',
            'GAAP',
            'high',
            'Retained Earnings Roll-Forward Does Not Reconcile to Net Income',
            `Retained earnings changed by $${(reChange / 1000000).toFixed(2)}M (from $${(reBeginning / 1000000).toFixed(2)}M to $${(reEnding / 1000000).toFixed(2)}M), but net income was $${(netIncome / 1000000).toFixed(2)}M. The difference of $${(rollForwardDiff / 1000000).toFixed(2)}M is not explained by the available data. Expected reconciling items include: (1) dividends declared, (2) prior period adjustments, (3) cumulative effect of accounting changes, or (4) other comprehensive income reclassifications. If none of these explain the difference, it may indicate an error in closing entries or a direct equity charge that was not properly disclosed.`,
            'ASC 505-10-50-2: An entity shall disclose changes in the separate accounts comprising stockholders\' equity.',
            'Prepare a complete retained earnings roll-forward: Beginning RE + Net Income - Dividends +/- Prior Period Adjustments +/- Other = Ending RE. Identify and document all items impacting retained earnings beyond net income. Review board minutes for declared dividends and other equity transactions.',
            Math.abs(rollForwardDiff),
            retainedEarningsAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'GAAP-FS-003',
    name: 'Cash Flow Reconciliation to Balance Sheet',
    framework: 'GAAP',
    category: 'Financial Statement Cross-Checks',
    description: 'Verifies that the net change in cash per the cash flow statement agrees with the change in cash on the balance sheet',
    citation: 'ASC 230-10-45: Cash flow statement presentation',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const cashFlowStatement = data.financialStatements.find(fs => fs.statementType === 'CF');
      const cashAccounts = data.accounts.filter(a => a.subType === 'cash');

      const cashBeginning = cashAccounts.reduce((sum, a) => sum + a.beginningBalance, 0);
      const cashEnding = cashAccounts.reduce((sum, a) => sum + a.endingBalance, 0);
      const bsCashChange = cashEnding - cashBeginning;

      if (cashFlowStatement) {
        const cfData = cashFlowStatement.data;
        const netChangeInCash = cfData.netChangeInCash ?? cfData.net_change_in_cash ?? 0;
        const operatingCF = cfData.operatingCashFlow ?? cfData.operating_cash_flow ?? 0;
        const investingCF = cfData.investingCashFlow ?? cfData.investing_cash_flow ?? 0;
        const financingCF = cfData.financingCashFlow ?? cfData.financing_cash_flow ?? 0;

        // Check if the three sections sum to net change
        const sectionTotal = operatingCF + investingCF + financingCF;
        const sectionDiff = Math.abs(sectionTotal - netChangeInCash);

        if (sectionDiff > 1) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-FS-003',
            'GAAP',
            'high',
            'Cash Flow Statement Sections Do Not Sum to Net Change',
            `The sum of operating ($${(operatingCF / 1000000).toFixed(2)}M), investing ($${(investingCF / 1000000).toFixed(2)}M), and financing ($${(financingCF / 1000000).toFixed(2)}M) cash flows equals $${(sectionTotal / 1000000).toFixed(2)}M, but the reported net change in cash is $${(netChangeInCash / 1000000).toFixed(2)}M. The difference of $${(sectionDiff / 1000).toFixed(0)}K indicates a computational or classification error in the cash flow statement, or a missing effect of foreign currency translation on cash.`,
            'ASC 230-10-45-1: The statement of cash flows shall report the net effect of cash flows on cash and cash equivalents during the period in a manner that reconciles beginning and ending balances.',
            'Reconcile each section of the cash flow statement. Verify that non-cash items are properly excluded. Check for effects of exchange rate changes on cash held in foreign currencies. Ensure supplemental disclosures are complete.',
            sectionDiff,
            []
          ));
        }

        // Check net change in cash per CF statement vs balance sheet
        const cfToBsDiff = Math.abs(netChangeInCash - bsCashChange);

        if (cfToBsDiff > 1 && cfToBsDiff > data.materialityThreshold * 0.05) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-FS-003',
            'GAAP',
            'critical',
            'Cash Flow Net Change Does Not Agree to Balance Sheet',
            `The net change in cash per the cash flow statement ($${(netChangeInCash / 1000000).toFixed(2)}M) does not agree with the change in cash per the balance sheet ($${(bsCashChange / 1000000).toFixed(2)}M). The difference is $${(cfToBsDiff / 1000).toFixed(0)}K. This cross-check failure indicates either: (1) the cash flow statement was not properly derived from balance sheet changes, (2) the definition of "cash and cash equivalents" differs between statements, (3) restricted cash is included or excluded inconsistently, or (4) a computational error exists in one or both statements.`,
            'ASC 230-10-45-1: The statement of cash flows explains the change during the period in cash and cash equivalents.',
            'Verify the definition of cash and cash equivalents is consistent between the balance sheet and cash flow statement. Determine whether restricted cash should be included (per ASU 2016-18). Reconcile each line item on the cash flow statement back to the corresponding balance sheet or income statement changes.',
            cfToBsDiff,
            cashAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
];
