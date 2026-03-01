import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const equityTransactionRules: AuditRule[] = [
  {
    id: 'GAAP-EQ-001',
    name: 'Treasury Stock Accounting',
    framework: 'GAAP',
    category: 'Equity Transactions (ASC 505)',
    description: 'Verifies that treasury stock is properly recorded and checks for unusual treasury stock movements that may indicate improper equity transactions',
    citation: 'ASC 505-30-30-1: Treasury stock transactions and accounting methods',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Identify treasury stock accounts
      const treasuryStockAccounts = data.accounts.filter(a =>
        a.subType === 'treasury_stock' ||
        a.accountName.toLowerCase().includes('treasury stock') ||
        a.accountName.toLowerCase().includes('treasury shares') ||
        a.subType === 'treasury_stock_asset'
      );

      if (treasuryStockAccounts.length === 0) {
        return findings;
      }

      const treasuryBeginning = treasuryStockAccounts.reduce((sum, a) => sum + Math.abs(a.beginningBalance), 0);
      const treasuryEnding = treasuryStockAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
      const treasuryChange = treasuryEnding - treasuryBeginning;

      // Check for treasury stock recorded on the wrong side (as an asset instead of contra-equity)
      const treasuryAsAsset = treasuryStockAccounts.filter(a =>
        a.accountType === 'asset' || a.subType === 'treasury_stock_asset'
      );

      if (treasuryAsAsset.length > 0) {
        const totalAssetBalance = treasuryAsAsset.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
        if (totalAssetBalance > 0) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-EQ-001',
            'GAAP',
            'high',
            'Treasury Stock Improperly Classified as Asset',
            `${treasuryAsAsset.length} treasury stock account(s) with a combined balance of $${(totalAssetBalance / 1000000).toFixed(2)}M are classified as assets. Under ASC 505-30-30-1, treasury stock must be reported as a reduction of stockholders\' equity, not as an asset. An entity\'s own shares are not considered assets because they do not embody probable future economic benefits as defined by the conceptual framework. This classification error overstates both total assets and total equity by $${(totalAssetBalance / 1000000).toFixed(2)}M.`,
            'ASC 505-30-30-1: The cost of treasury shares shall be shown separately as a deduction from equity. A corporation\'s own stock is not an asset.',
            'Reclassify treasury stock from the asset section to the equity section as a contra-equity account. Verify that the presentation method (cost method or par value method) is consistently applied. Adjust all affected financial ratios and ensure the balance sheet properly reflects the contra-equity treatment.',
            totalAssetBalance,
            treasuryAsAsset.map(a => a.accountNumber)
          ));
        }
      }

      // Check for unusual treasury stock movements
      if (Math.abs(treasuryChange) > data.materialityThreshold * 0.25 && treasuryBeginning > 0) {
        const changePct = treasuryChange / treasuryBeginning;

        // Large treasury stock increase (significant buyback activity)
        if (changePct > 0.25) {
          // Check retained earnings for sufficient reserves to support the buyback
          const retainedEarningsAccounts = data.accounts.filter(a =>
            a.subType === 'retained_earnings'
          );
          const totalRetainedEarnings = retainedEarningsAccounts.reduce(
            (sum, a) => sum + a.endingBalance, 0
          );

          // Check if the buyback exceeds retained earnings (possible legal compliance issue)
          if (treasuryEnding > totalRetainedEarnings && totalRetainedEarnings > 0) {
            findings.push(createFinding(
              data.engagementId,
              'GAAP-EQ-001',
              'GAAP',
              'high',
              'Treasury Stock Exceeds Retained Earnings',
              `Treasury stock of $${(treasuryEnding / 1000000).toFixed(2)}M exceeds retained earnings of $${(totalRetainedEarnings / 1000000).toFixed(2)}M. Many state corporate statutes restrict share repurchases to the extent of retained earnings or surplus. Treasury stock increased by ${(changePct * 100).toFixed(1)}% ($${(treasuryChange / 1000000).toFixed(2)}M) during the period. This may indicate: (1) share repurchases in excess of legal limitations, (2) accumulated deficit eroding the repurchase capacity, or (3) the need for board reauthorization of the buyback program. The entity should verify compliance with applicable state law and corporate charter restrictions.`,
              'ASC 505-30-30-1: Treasury stock accounting. State corporate statutes (e.g., DGCL Section 160) restrict share repurchases.',
              'Verify that share repurchases comply with applicable state law and corporate charter limitations. Obtain board authorization for the share repurchase program. Confirm that the cost or par value method is properly applied. Review for any impairment of legal capital resulting from treasury stock transactions.',
              treasuryChange,
              [...treasuryStockAccounts, ...retainedEarningsAccounts].map(a => a.accountNumber)
            ));
          }
        }

        // Large treasury stock decrease (reissuances or retirements)
        if (changePct < -0.25) {
          // Check for gain/loss recognition on reissuance
          const reissuanceJEs = data.journalEntries.filter(je =>
            je.description.toLowerCase().includes('treasury') &&
            (je.description.toLowerCase().includes('reissue') ||
             je.description.toLowerCase().includes('retire') ||
             je.description.toLowerCase().includes('reissuance'))
          );

          findings.push(createFinding(
            data.engagementId,
            'GAAP-EQ-001',
            'GAAP',
            'medium',
            'Significant Treasury Stock Reduction',
            `Treasury stock decreased by ${(Math.abs(changePct) * 100).toFixed(1)}% ($${(Math.abs(treasuryChange) / 1000000).toFixed(2)}M) from $${(treasuryBeginning / 1000000).toFixed(2)}M to $${(treasuryEnding / 1000000).toFixed(2)}M. ${reissuanceJEs.length > 0 ? `${reissuanceJEs.length} journal entry/entries related to treasury stock reissuance or retirement were identified.` : 'No explicit reissuance or retirement journal entries were found.'} Under ASC 505-30-30-8, when treasury shares are reissued at a price above cost, the excess is credited to additional paid-in capital. When reissued below cost, the difference is charged to APIC (to the extent of prior credits from treasury transactions) and then to retained earnings. Gains on treasury stock transactions are never recognized in income.`,
            'ASC 505-30-30-8: Reissuance of treasury stock. Gains and losses on treasury stock transactions are equity transactions, not income statement items.',
            'Obtain a detailed schedule of all treasury stock transactions during the period. For each reissuance or retirement, verify: (1) the cost basis used, (2) proper credit/charge to APIC, (3) that no gain or loss was recognized in the income statement. Verify consistency with the entity\'s stated method (cost vs. par value). Review board authorizations for any share retirement programs.',
            Math.abs(treasuryChange),
            treasuryStockAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'GAAP-EQ-002',
    name: 'Dividend Declarations',
    framework: 'GAAP',
    category: 'Equity Transactions (ASC 505)',
    description: 'Verifies that declared dividends are properly accrued when significant changes in retained earnings indicate dividend activity',
    citation: 'ASC 505-20-25-1: Dividends shall be recognized as a liability when declared',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Identify retained earnings accounts
      const retainedEarningsAccounts = data.accounts.filter(a =>
        a.subType === 'retained_earnings' ||
        a.accountName.toLowerCase().includes('retained earnings') ||
        a.accountName.toLowerCase().includes('accumulated deficit')
      );

      if (retainedEarningsAccounts.length === 0) {
        return findings;
      }

      const reBeginning = retainedEarningsAccounts.reduce((sum, a) => sum + a.beginningBalance, 0);
      const reEnding = retainedEarningsAccounts.reduce((sum, a) => sum + a.endingBalance, 0);
      const reChange = reEnding - reBeginning;

      // Compute net income from the income statement
      const incomeStatement = data.financialStatements.find(fs => fs.statementType === 'IS');
      let netIncome = 0;

      if (incomeStatement) {
        netIncome = incomeStatement.data.netIncome ?? incomeStatement.data.net_income ?? 0;
      }

      if (netIncome === 0) {
        const totalRevenue = data.accounts
          .filter(a => a.accountType === 'revenue')
          .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
        const totalExpenses = data.accounts
          .filter(a => a.accountType === 'expense')
          .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
        netIncome = totalRevenue - totalExpenses;
      }

      // The difference between RE change and net income indicates dividends and other adjustments
      const impliedDistributions = netIncome - reChange;

      if (impliedDistributions <= 0) {
        return findings;
      }

      // Check if dividends are material
      if (impliedDistributions < data.materialityThreshold * 0.1) {
        return findings;
      }

      // Look for dividend payable accounts (indicating proper accrual)
      const dividendPayableAccounts = data.accounts.filter(a =>
        a.accountName.toLowerCase().includes('dividend') &&
        (a.accountType === 'liability' ||
         a.accountName.toLowerCase().includes('payable') ||
         a.accountName.toLowerCase().includes('accrued'))
      );

      const dividendPayableBalance = dividendPayableAccounts.reduce(
        (sum, a) => sum + Math.abs(a.endingBalance), 0
      );

      // Look for dividend-related journal entries
      const dividendJEs = data.journalEntries.filter(je =>
        je.description.toLowerCase().includes('dividend') ||
        je.description.toLowerCase().includes('distribution')
      );

      // Check for dividends declared near year-end that should be accrued
      const yearEndDividendJEs = data.journalEntries.filter(je => {
        const jeDate = new Date(je.date);
        const fyeDate = new Date(data.fiscalYearEnd);
        const daysBeforeEnd = (fyeDate.getTime() - jeDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysBeforeEnd >= 0 && daysBeforeEnd <= 30 &&
          (je.description.toLowerCase().includes('dividend') ||
           je.description.toLowerCase().includes('distribution'));
      });

      // Flag if significant distributions implied but no dividend payable or minimal JE evidence
      if (dividendPayableBalance === 0 && dividendJEs.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'GAAP-EQ-002',
          'GAAP',
          'medium',
          'Implied Dividend Distributions Without Proper Accrual',
          `Retained earnings changed by $${(reChange / 1000000).toFixed(2)}M against estimated net income of $${(netIncome / 1000000).toFixed(2)}M, implying distributions of approximately $${(impliedDistributions / 1000000).toFixed(2)}M. However, no dividend payable accounts or dividend-related journal entries were found. Under ASC 505-20-25-1, cash dividends become a liability of the entity when declared by the board of directors. If dividends were declared before the balance sheet date but paid after, they must be accrued as a liability. The absence of dividend accruals may indicate: (1) dividends declared but not properly recorded, (2) other equity adjustments not separately identified, or (3) errors in the retained earnings rollforward.`,
          'ASC 505-20-25-1: A cash dividend declared by the board of directors becomes a liability at the declaration date. ASC 505-20-45-1: Presentation of dividends in the statement of stockholders\' equity.',
          'Obtain the retained earnings rollforward and board minutes for all dividend declarations. Verify that dividends declared before year-end are properly accrued as current liabilities. Reconcile the retained earnings change to net income, dividends, prior period adjustments, and other comprehensive income reclassifications. Confirm that the statement of stockholders\' equity properly presents all dividend activity.',
          impliedDistributions,
          retainedEarningsAccounts.map(a => a.accountNumber)
        ));
      }

      // Flag year-end dividend declarations for accrual verification
      if (yearEndDividendJEs.length > 0 && dividendPayableBalance === 0) {
        const yearEndDividendTotal = yearEndDividendJEs.reduce((sum, je) =>
          sum + je.lines.filter(l => l.debit > 0).reduce((s, l) => s + l.debit, 0), 0
        );

        if (yearEndDividendTotal > data.materialityThreshold * 0.1) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-EQ-002',
            'GAAP',
            'high',
            'Year-End Dividend Declaration Without Corresponding Liability',
            `${yearEndDividendJEs.length} dividend-related journal entry/entries totaling approximately $${(yearEndDividendTotal / 1000000).toFixed(2)}M were recorded within 30 days of the fiscal year-end, but no dividend payable liability was found on the balance sheet. Under ASC 505-20-25-1, once dividends are declared, the entity has a legal obligation that must be reflected as a current liability. The declaration date, not the payment date, determines the recognition of the liability. Failure to accrue declared dividends understates current liabilities and overstates retained earnings.`,
            'ASC 505-20-25-1: Cash dividends are recognized as a liability at the declaration date. ASC 505-20-50: Disclosure of dividend terms and restrictions.',
            'Review board minutes to confirm the declaration date and record date for all dividends. Verify that dividends declared on or before the balance sheet date are accrued as current liabilities. Confirm the per-share amount and total dividend payable. Ensure proper disclosure of dividend restrictions under loan covenants or preferred stock provisions.',
            yearEndDividendTotal,
            retainedEarningsAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
];
