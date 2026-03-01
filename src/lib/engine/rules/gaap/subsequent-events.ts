import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const subsequentEventsRules: AuditRule[] = [
  {
    id: 'GAAP-SE-001',
    name: 'Fiscal Year End Proximity Risk',
    framework: 'GAAP',
    category: 'Subsequent Events (ASC 855)',
    description: 'Evaluates the proximity to fiscal year end to assess subsequent events risk and the need for extended post-balance sheet date review procedures',
    citation: 'ASC 855-10-25-1: Recognition and disclosure of subsequent events',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const fyeDate = new Date(data.fiscalYearEnd);
      const now = new Date();

      // Calculate days since fiscal year end
      const daysSinceFYE = Math.floor((now.getTime() - fyeDate.getTime()) / (1000 * 60 * 60 * 24));

      // If the fiscal year end is recent (within 90 days), flag for subsequent events review
      if (daysSinceFYE >= 0 && daysSinceFYE <= 90) {
        const totalAssets = data.accounts
          .filter(a => a.accountType === 'asset')
          .reduce((sum, a) => sum + a.endingBalance, 0);

        const totalLiabilities = data.accounts
          .filter(a => a.accountType === 'liability')
          .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

        // Check for indicators that increase subsequent events risk
        const riskFactors: string[] = [];

        // High leverage increases risk of debt covenant violations
        if (totalAssets > 0 && totalLiabilities / totalAssets > 0.70) {
          riskFactors.push(`High leverage ratio of ${((totalLiabilities / totalAssets) * 100).toFixed(1)}% increases the risk of post-year-end debt covenant violations or refinancing events`);
        }

        // Low cash relative to short-term obligations
        const cashAccounts = data.accounts.filter(a => a.subType === 'cash');
        const totalCash = cashAccounts.reduce((sum, a) => sum + a.endingBalance, 0);
        const shortTermDebt = data.accounts
          .filter(a => a.subType === 'short_term_debt')
          .reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

        if (shortTermDebt > 0 && totalCash / shortTermDebt < 0.50) {
          riskFactors.push(`Cash of $${(totalCash / 1000000).toFixed(2)}M covers only ${((totalCash / shortTermDebt) * 100).toFixed(1)}% of short-term debt ($${(shortTermDebt / 1000000).toFixed(2)}M), increasing the risk of post-year-end liquidity events`);
        }

        // Large accounts receivable may indicate subsequent write-offs
        const arAccounts = data.accounts.filter(a => a.subType === 'accounts_receivable');
        const totalAR = arAccounts.reduce((sum, a) => sum + a.endingBalance, 0);
        if (totalAssets > 0 && totalAR / totalAssets > 0.30) {
          riskFactors.push(`Accounts receivable of $${(totalAR / 1000000).toFixed(2)}M represents ${((totalAR / totalAssets) * 100).toFixed(1)}% of total assets, which increases the risk of material post-year-end collection issues or write-offs`);
        }

        const severity = riskFactors.length >= 2 ? 'high' as const : 'medium' as const;

        findings.push(createFinding(
          data.engagementId,
          'GAAP-SE-001',
          'GAAP',
          severity,
          'Subsequent Events Review Required - Recent Fiscal Year End',
          `The fiscal year ended ${daysSinceFYE} day(s) ago (${data.fiscalYearEnd}). Under ASC 855, management must evaluate events through the date the financial statements are issued (or available to be issued). ${riskFactors.length > 0 ? `The following risk factors increase the importance of the subsequent events review: ${riskFactors.join('; ')}.` : 'No specific elevated risk factors were identified, but a thorough subsequent events review is still required.'} The auditor should extend substantive procedures through the report date and inquire about events occurring after the balance sheet date.`,
          'ASC 855-10-25-1: An entity shall recognize in the financial statements the effects of all subsequent events that provide additional evidence about conditions that existed at the date of the balance sheet (Type I events). An entity shall not recognize subsequent events that provide evidence about conditions that did not exist at the balance sheet date but arose after that date (Type II events), but may require disclosure.',
          'Perform subsequent events procedures through the report date including: (1) read minutes of board meetings held after year end, (2) inquire of management about significant events, (3) review subsequent interim financial statements, (4) obtain and evaluate legal representation letters, (5) review subsequent cash receipts for collectibility of year-end receivables, (6) review subsequent period journal entries for material adjustments, (7) inquire about changes in business conditions or litigation matters.',
          null,
          []
        ));
      }

      return findings;
    },
  },
  {
    id: 'GAAP-SE-002',
    name: 'Material Year-End Transactions',
    framework: 'GAAP',
    category: 'Subsequent Events (ASC 855)',
    description: 'Identifies material transactions recorded near fiscal year end that may require subsequent events evaluation or represent potential cutoff issues',
    citation: 'ASC 855-10-25-1A: Type I and Type II subsequent events',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const fyeDate = new Date(data.fiscalYearEnd);

      // Find journal entries in the last 15 days of the fiscal year
      const nearYearEndJEs = data.journalEntries.filter(je => {
        const jeDate = new Date(je.date);
        const daysBefore = (fyeDate.getTime() - jeDate.getTime()) / (1000 * 60 * 60 * 24);
        return daysBefore >= 0 && daysBefore <= 15;
      });

      // Filter for material entries
      const materialYearEndJEs = nearYearEndJEs.filter(je =>
        je.lines.some(l => l.debit > data.materialityThreshold * 0.50 || l.credit > data.materialityThreshold * 0.50)
      );

      if (materialYearEndJEs.length > 0) {
        const totalAmount = materialYearEndJEs.reduce((sum, je) =>
          sum + je.lines.reduce((s, l) => s + Math.max(l.debit, l.credit), 0), 0
        );

        // Categorize the types of material year-end entries
        const categories: string[] = [];
        const affectedAccountNumbers = new Set<string>();

        const hasRevenueEntries = materialYearEndJEs.some(je =>
          je.lines.some(l => (l.accountName || '').toLowerCase().includes('revenue') ||
            (l.accountName || '').toLowerCase().includes('sales'))
        );
        if (hasRevenueEntries) categories.push('revenue recognition');

        const hasLiabilityEntries = materialYearEndJEs.some(je =>
          je.lines.some(l => {
            const name = (l.accountName || '').toLowerCase();
            return name.includes('accrued') || name.includes('payable') || name.includes('reserve') || name.includes('provision');
          })
        );
        if (hasLiabilityEntries) categories.push('accruals and provisions');

        const hasAssetEntries = materialYearEndJEs.some(je =>
          je.lines.some(l => {
            const name = (l.accountName || '').toLowerCase();
            return name.includes('asset') || name.includes('receivable') || name.includes('inventory');
          })
        );
        if (hasAssetEntries) categories.push('asset adjustments');

        materialYearEndJEs.forEach(je =>
          je.lines.forEach(l => affectedAccountNumbers.add(l.accountId))
        );

        // Check for unapproved entries near year end (higher risk)
        const unapprovedCount = materialYearEndJEs.filter(je => !je.approvedBy).length;
        const severity = unapprovedCount > 0 ? 'high' as const : 'medium' as const;

        findings.push(createFinding(
          data.engagementId,
          'GAAP-SE-002',
          'GAAP',
          severity,
          'Material Transactions Recorded Near Fiscal Year End',
          `${materialYearEndJEs.length} material journal entry/entries totaling $${(totalAmount / 1000000).toFixed(2)}M were recorded within the last 15 days of the fiscal year (ending ${data.fiscalYearEnd}). ${categories.length > 0 ? `These entries involve: ${categories.join(', ')}. ` : ''}${unapprovedCount > 0 ? `${unapprovedCount} of these entries lack documented approval, increasing the risk of unauthorized adjustments. ` : ''}Material year-end transactions require careful evaluation for: (1) proper cutoff between periods, (2) whether they represent Type I subsequent events requiring adjustment, (3) whether the transactions reflect actual economic events or potential earnings management, (4) whether adequate supporting documentation exists.`,
          'ASC 855-10-25-1A: Subsequent events that provide additional evidence about conditions that existed at the date of the balance sheet, including estimates inherent in the financial statements, shall be recognized in the financial statements.',
          'For each material year-end entry, obtain and evaluate: (1) supporting documentation and business rationale, (2) management authorization and approval, (3) whether the entry represents a recurring vs. non-recurring adjustment, (4) the proper accounting period for the transaction (cutoff testing), (5) whether the transaction is arms-length if related parties are involved. Pay special attention to manual entries, non-standard entries, and entries recorded by individuals outside their normal responsibilities.',
          totalAmount,
          Array.from(affectedAccountNumbers)
        ));
      }

      return findings;
    },
  },
];
