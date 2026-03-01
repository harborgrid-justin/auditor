import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const derivativesHedgingRules: AuditRule[] = [
  {
    id: 'GAAP-DH-001',
    name: 'Derivative Instruments Fair Value',
    framework: 'GAAP',
    category: 'Derivatives and Hedging (ASC 815)',
    description: 'Identifies derivative instrument accounts that lack fair value measurement indicators, which may result in improper valuation under ASC 815',
    citation: 'ASC 815-10-35-1: All derivative instruments shall be measured at fair value',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const derivativeKeywords = ['derivative', 'swap', 'hedge', 'option', 'forward', 'futures'];

      const derivativeAccounts = data.accounts.filter(a =>
        derivativeKeywords.some(kw => a.accountName.toLowerCase().includes(kw)) ||
        a.subType === 'derivative_asset' ||
        a.subType === 'derivative_liability' ||
        a.subType === 'hedge_instrument'
      );

      if (derivativeAccounts.length === 0) {
        return findings;
      }

      const totalDerivativeAssets = derivativeAccounts
        .filter(a => a.accountType === 'asset')
        .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      const totalDerivativeLiabilities = derivativeAccounts
        .filter(a => a.accountType === 'liability')
        .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      const totalNotional = totalDerivativeAssets + totalDerivativeLiabilities;

      // Check for fair value measurement indicators: look for accounts that reference
      // fair value, mark-to-market, unrealized gain/loss alongside derivatives
      const fairValueIndicators = data.accounts.filter(a =>
        a.accountName.toLowerCase().includes('fair value') ||
        a.accountName.toLowerCase().includes('mark-to-market') ||
        a.accountName.toLowerCase().includes('unrealized') ||
        a.accountName.toLowerCase().includes('mtm')
      );

      // Also check journal entries for fair value adjustments related to derivatives
      const fairValueJournalEntries = data.journalEntries.filter(je =>
        je.description.toLowerCase().includes('fair value') ||
        je.description.toLowerCase().includes('mark-to-market') ||
        je.description.toLowerCase().includes('derivative')
      );

      const hasFairValueEvidence = fairValueIndicators.length > 0 || fairValueJournalEntries.length > 0;

      if (!hasFairValueEvidence && totalNotional > 0) {
        const severity = totalNotional > data.materialityThreshold ? 'high' as const : 'medium' as const;

        findings.push(createFinding(
          data.engagementId,
          'GAAP-DH-001',
          'GAAP',
          severity,
          'Derivative Instruments Without Fair Value Measurement Evidence',
          `${derivativeAccounts.length} derivative-related account(s) with a combined balance of $${(totalNotional / 1000000).toFixed(2)}M (assets: $${(totalDerivativeAssets / 1000000).toFixed(2)}M, liabilities: $${(totalDerivativeLiabilities / 1000000).toFixed(2)}M) were identified without corresponding fair value measurement indicators. ASC 815-10-35-1 requires all derivative instruments to be measured at fair value at each reporting date. The absence of fair value adjustment accounts, mark-to-market entries, or unrealized gain/loss recognition suggests that these instruments may not be properly valued. This could result in material misstatement of both the balance sheet carrying amounts and income statement gains/losses.`,
          'ASC 815-10-35-1: An entity shall measure all derivative instruments at fair value. ASC 820-10-35: Fair value measurement framework.',
          'Obtain a schedule of all derivative instruments including notional amounts, counterparties, maturity dates, and fair values. Verify that fair value measurements comply with the ASC 820 hierarchy (Level 1, 2, or 3). Ensure that unrealized gains and losses are properly recognized in earnings (for trading derivatives) or other comprehensive income (for qualifying hedging instruments). Review derivative disclosures required by ASC 815-10-50.',
          totalNotional,
          derivativeAccounts.map(a => a.accountNumber)
        ));
      }

      // Check for derivative accounts with zero balances that had prior period activity
      const zeroBalanceDerivatives = derivativeAccounts.filter(a =>
        a.endingBalance === 0 && a.beginningBalance !== 0
      );

      if (zeroBalanceDerivatives.length > 0) {
        const priorBalances = zeroBalanceDerivatives.reduce((sum, a) => sum + Math.abs(a.beginningBalance), 0);
        if (priorBalances > data.materialityThreshold * 0.25) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-DH-001',
            'GAAP',
            'medium',
            'Derivative Instruments Fully Settled or Derecognized',
            `${zeroBalanceDerivatives.length} derivative account(s) with prior-period balances totaling $${(priorBalances / 1000000).toFixed(2)}M now carry zero balances. This may indicate matured, terminated, or novated instruments. Verify that settlement gains/losses were properly recognized and that any hedge accounting designations were appropriately discontinued under ASC 815-25.`,
            'ASC 815-10-35-1: Derivative instruments must be measured at fair value. ASC 815-25-40: Discontinuation of hedge accounting.',
            'Obtain documentation for each settled or derecognized derivative. Verify proper recognition of realized gains/losses. For hedging instruments, confirm that the effects of hedge accounting discontinuation are properly reflected in earnings and AOCI as applicable.',
            priorBalances,
            zeroBalanceDerivatives.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'GAAP-DH-002',
    name: 'Hedge Effectiveness Documentation',
    framework: 'GAAP',
    category: 'Derivatives and Hedging (ASC 815)',
    description: 'Evaluates whether hedge-related accounts have proper documentation indicators for hedge effectiveness testing as required by ASC 815',
    citation: 'ASC 815-20-25-3: Documentation requirements for hedge accounting',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Identify hedge-related accounts
      const hedgeAccounts = data.accounts.filter(a =>
        a.accountName.toLowerCase().includes('hedge') ||
        a.subType === 'hedge_instrument'
      );

      if (hedgeAccounts.length === 0) {
        return findings;
      }

      const totalHedgeBalance = hedgeAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Look for AOCI balances that may contain hedge-related amounts
      const aociAccounts = data.accounts.filter(a => a.subType === 'aoci');
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const totalAOCI = aociAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Check for hedge effectiveness documentation indicators:
      // Look for accounts or journal entries that reference effectiveness testing
      const effectivenessIndicators = data.accounts.filter(a =>
        a.accountName.toLowerCase().includes('effectiveness') ||
        a.accountName.toLowerCase().includes('ineffectiveness') ||
        a.accountName.toLowerCase().includes('hedge ineffective')
      );

      const effectivenessJEs = data.journalEntries.filter(je =>
        je.description.toLowerCase().includes('hedge effectiveness') ||
        je.description.toLowerCase().includes('hedge ineffectiveness') ||
        je.description.toLowerCase().includes('hedge designation')
      );

      const hasDocumentationEvidence = effectivenessIndicators.length > 0 || effectivenessJEs.length > 0;

      if (!hasDocumentationEvidence && totalHedgeBalance > 0) {
        // Look for OCI entries as indirect evidence of cash flow hedge accounting
        const ociEntries = data.journalEntries.filter(je =>
          je.lines.some(l =>
            l.accountName?.toLowerCase().includes('other comprehensive') ||
            l.accountName?.toLowerCase().includes('aoci') ||
            l.accountName?.toLowerCase().includes('oci')
          ) &&
          je.lines.some(l =>
            l.accountName?.toLowerCase().includes('hedge') ||
            l.accountName?.toLowerCase().includes('swap') ||
            l.accountName?.toLowerCase().includes('derivative')
          )
        );

        const hasOCIHedgeActivity = ociEntries.length > 0;
        const severity = totalHedgeBalance > data.materialityThreshold ? 'high' as const : 'medium' as const;

        findings.push(createFinding(
          data.engagementId,
          'GAAP-DH-002',
          'GAAP',
          severity,
          'Hedge Effectiveness Documentation Not Evidenced',
          `${hedgeAccounts.length} hedge-related account(s) with total balances of $${(totalHedgeBalance / 1000000).toFixed(2)}M were identified, but no hedge effectiveness documentation indicators were found in the accounting records. ${hasOCIHedgeActivity ? 'OCI entries related to hedge instruments were detected, suggesting cash flow hedge accounting is being applied.' : 'No OCI entries related to hedging instruments were detected.'} ASC 815-20-25-3 requires formal documentation at hedge inception of the hedging relationship, the risk management objective, the risk being hedged, the hedging instrument, the hedged item, and how effectiveness will be assessed. Without proper documentation, hedge accounting treatment cannot be applied, and all derivative gains/losses must be recognized in current earnings.`,
          'ASC 815-20-25-3: Hedge accounting may be applied only if, at inception, formal documentation is provided of the hedging relationship, risk management objective, and the method for assessing effectiveness. ASC 815-20-35-1: Effectiveness must be assessed at least quarterly.',
          'Request and review the hedge designation documentation for each hedging relationship. Verify that formal effectiveness testing has been performed at least quarterly using the method specified in the hedge documentation (regression analysis, dollar-offset, etc.). If documentation is insufficient, evaluate whether hedge accounting treatment must be discontinued and the cumulative effect of prior hedge accounting reversed. Review ASC 815-10-50 disclosure requirements.',
          totalHedgeBalance,
          [...hedgeAccounts, ...aociAccounts].map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
];
