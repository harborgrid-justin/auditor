import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const foreignCurrencyRules: AuditRule[] = [
  {
    id: 'GAAP-FC-001',
    name: 'Foreign Currency Translation',
    framework: 'GAAP',
    category: 'Foreign Currency (ASC 830)',
    description: 'Verifies that cumulative translation adjustment (CTA) is properly recorded in AOCI when foreign operations are present',
    citation: 'ASC 830-30-45-12: Translation adjustments shall be reported in other comprehensive income',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const foreignKeywords = ['foreign', 'international', 'translation', 'fx', 'currency'];

      // Identify accounts indicating foreign operations
      const foreignAccounts = data.accounts.filter(a =>
        foreignKeywords.some(kw => a.accountName.toLowerCase().includes(kw)) ||
        a.subType === 'foreign_currency_translation'
      );

      if (foreignAccounts.length === 0) {
        return findings;
      }

      const totalForeignBalance = foreignAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Check for CTA in AOCI
      const aociAccounts = data.accounts.filter(a => a.subType === 'aoci');
      const ctaAccounts = data.accounts.filter(a =>
        a.accountName.toLowerCase().includes('cumulative translation') ||
        a.accountName.toLowerCase().includes('cta') ||
        a.accountName.toLowerCase().includes('translation adjustment') ||
        a.subType === 'foreign_currency_translation'
      );

      const hasCTAInAOCI = ctaAccounts.length > 0 || aociAccounts.some(a =>
        a.accountName.toLowerCase().includes('translation') ||
        a.accountName.toLowerCase().includes('foreign')
      );

      // Check for journal entries that evidence translation activity
      const translationJEs = data.journalEntries.filter(je =>
        je.description.toLowerCase().includes('translation') ||
        je.description.toLowerCase().includes('foreign currency') ||
        je.description.toLowerCase().includes('cta')
      );

      if (!hasCTAInAOCI && totalForeignBalance > data.materialityThreshold * 0.1) {
        const foreignAssets = foreignAccounts
          .filter(a => a.accountType === 'asset')
          .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
        const foreignLiabilities = foreignAccounts
          .filter(a => a.accountType === 'liability')
          .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
        const foreignRevenue = foreignAccounts
          .filter(a => a.accountType === 'revenue')
          .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

        const severity = totalForeignBalance > data.materialityThreshold ? 'high' as const : 'medium' as const;

        findings.push(createFinding(
          data.engagementId,
          'GAAP-FC-001',
          'GAAP',
          severity,
          'Foreign Operations Present Without CTA in AOCI',
          `${foreignAccounts.length} account(s) indicating foreign operations were identified with combined balances of $${(totalForeignBalance / 1000000).toFixed(2)}M (assets: $${(foreignAssets / 1000000).toFixed(2)}M, liabilities: $${(foreignLiabilities / 1000000).toFixed(2)}M, revenue: $${(foreignRevenue / 1000000).toFixed(2)}M), but no cumulative translation adjustment (CTA) was found in accumulated other comprehensive income (AOCI). ${translationJEs.length > 0 ? `${translationJEs.length} translation-related journal entries were found, but the CTA component is not separately identifiable.` : 'No translation-related journal entries were identified.'} Under ASC 830-30-45-12, translation adjustments from remeasuring foreign subsidiary financial statements into the reporting currency must be reported in OCI and accumulated in AOCI. The absence of CTA may indicate: (1) foreign subsidiary financial statements have not been translated, (2) the CTA is embedded in other AOCI components without separate identification, or (3) the functional currency determination is incorrect.`,
          'ASC 830-30-45-12: Translation adjustments shall not be included in determining net income but shall be reported in other comprehensive income. ASC 830-10-45-1: Functional currency determination.',
          'Determine the functional currency of each foreign operation per ASC 830-10-45. Verify that foreign subsidiary financial statements are translated using the current rate method (balance sheet at closing rate, income statement at average rate). Confirm CTA is separately reported in AOCI. Review disclosures required by ASC 830-30-50. If the entity uses the remeasurement method, verify that exchange gains/losses are included in income.',
          totalForeignBalance,
          [...foreignAccounts, ...aociAccounts].map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'GAAP-FC-002',
    name: 'Transaction Gains/Losses',
    framework: 'GAAP',
    category: 'Foreign Currency (ASC 830)',
    description: 'Verifies that foreign currency transaction gains and losses are properly recognized in current earnings',
    citation: 'ASC 830-20-35-1: Transaction gains and losses shall be included in determining net income',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Look for foreign currency transaction gain/loss accounts
      const fxGainLossAccounts = data.accounts.filter(a =>
        (a.accountName.toLowerCase().includes('foreign') ||
         a.accountName.toLowerCase().includes('currency') ||
         a.accountName.toLowerCase().includes('exchange') ||
         a.accountName.toLowerCase().includes('fx')) &&
        (a.accountName.toLowerCase().includes('gain') ||
         a.accountName.toLowerCase().includes('loss') ||
         a.accountType === 'revenue' ||
         a.accountType === 'expense')
      );

      // Check for accounts denominated in foreign currency (indirect indicators)
      const foreignDenominatedAccounts = data.accounts.filter(a =>
        a.accountName.toLowerCase().includes('foreign') ||
        a.accountName.toLowerCase().includes('international')
      );

      const hasForeignTransactionActivity = foreignDenominatedAccounts.some(a =>
        a.accountType === 'asset' &&
        (a.subType === 'accounts_receivable' || a.subType === 'cash')
      ) || foreignDenominatedAccounts.some(a =>
        a.accountType === 'liability' &&
        (a.subType === 'accounts_payable' || a.subType === 'short_term_debt')
      );

      if (hasForeignTransactionActivity && fxGainLossAccounts.length === 0) {
        const foreignAssetAccounts = foreignDenominatedAccounts.filter(a => a.accountType === 'asset');
        const foreignLiabilityAccounts = foreignDenominatedAccounts.filter(a => a.accountType === 'liability');
        const totalForeignAssets = foreignAssetAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
        const totalForeignLiabilities = foreignLiabilityAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

        if (totalForeignAssets + totalForeignLiabilities > data.materialityThreshold * 0.1) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-FC-002',
            'GAAP',
            'medium',
            'Foreign Currency Transaction Gains/Losses Not Recognized',
            `Foreign-denominated monetary accounts were identified (assets: $${(totalForeignAssets / 1000000).toFixed(2)}M, liabilities: $${(totalForeignLiabilities / 1000000).toFixed(2)}M), but no foreign currency transaction gain/loss accounts were found. Under ASC 830-20-35-1, changes in exchange rates between the functional currency and the currency in which a transaction is denominated must be recognized as transaction gains or losses in current period earnings. The absence of FX gain/loss recognition may indicate: (1) foreign-denominated monetary items are not being remeasured at the balance sheet date, (2) gains and losses are netted or embedded in other accounts, or (3) the amounts are immaterial and combined with other income/expense items.`,
            'ASC 830-20-35-1: A change in the exchange rate between the functional currency and the currency in which a transaction is denominated increases or decreases the expected functional currency cash flows. That increase or decrease shall be included in determining net income for the period.',
            'Identify all foreign-denominated monetary assets and liabilities. Verify that these balances have been remeasured at the period-end exchange rate. Confirm that resulting transaction gains or losses are recognized in the income statement. If amounts are netted with other items, ensure proper classification and disclosure. Review hedge designations for any transaction hedging relationships under ASC 815.',
            totalForeignAssets + totalForeignLiabilities,
            [...foreignAssetAccounts, ...foreignLiabilityAccounts].map(a => a.accountNumber)
          ));
        }
      }

      // Check for unusually large FX gains/losses relative to foreign operations
      if (fxGainLossAccounts.length > 0) {
        const totalFxGainLoss = fxGainLossAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
        const totalRevenue = data.accounts
          .filter(a => a.accountType === 'revenue')
          .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

        if (totalRevenue > 0 && totalFxGainLoss / totalRevenue > 0.05) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-FC-002',
            'GAAP',
            'high',
            'Significant Foreign Currency Transaction Gains/Losses',
            `Foreign currency transaction gains/losses total $${(totalFxGainLoss / 1000000).toFixed(2)}M, representing ${((totalFxGainLoss / totalRevenue) * 100).toFixed(1)}% of total revenue. FX gains/losses exceeding 5% of revenue are significant and may indicate: (1) substantial unhedged foreign currency exposure, (2) large exchange rate fluctuations affecting monetary items, (3) potential misclassification of translation adjustments as transaction gains/losses, or (4) the need for a foreign currency risk management strategy. This level of FX impact warrants enhanced disclosure under ASC 830.`,
            'ASC 830-20-35-1: Transaction gains and losses. ASC 830-20-50: Disclosure of the aggregate transaction gain or loss included in determining net income.',
            'Verify the classification of each FX gain/loss as transaction (in earnings) vs. translation (in OCI). Review the entity\'s foreign currency risk management policies. Assess whether hedge accounting should be considered for significant exposures. Ensure adequate financial statement disclosure of foreign currency effects.',
            totalFxGainLoss,
            fxGainLossAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
];
