import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const researchDevelopmentRules: AuditRule[] = [
  {
    id: 'GAAP-RD-001',
    name: 'R&D Cost Treatment',
    framework: 'GAAP',
    category: 'Research and Development (ASC 730)',
    description: 'Verifies that research and development costs are expensed as incurred under GAAP and flags significant R&D balances improperly capitalized in asset accounts',
    citation: 'ASC 730-10-25-1: Research and development costs shall be charged to expense when incurred',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const rdKeywords = ['research', 'development', 'r&d', 'r & d', 'rd expense', 'experimental'];

      // Identify R&D expense accounts (proper treatment under GAAP)
      const rdExpenseAccounts = data.accounts.filter(a =>
        a.accountType === 'expense' &&
        (rdKeywords.some(kw => a.accountName.toLowerCase().includes(kw)) ||
         a.subType === 'rd_expense')
      );

      const totalRdExpense = rdExpenseAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Identify R&D balances improperly sitting in asset accounts
      const rdAssetAccounts = data.accounts.filter(a =>
        a.accountType === 'asset' &&
        rdKeywords.some(kw => a.accountName.toLowerCase().includes(kw))
      );

      const totalRdCapitalized = rdAssetAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // Flag capitalized R&D in asset accounts — GAAP requires expensing
      if (totalRdCapitalized > 0 && totalRdCapitalized > data.materialityThreshold * 0.1) {
        const severity = totalRdCapitalized > data.materialityThreshold ? 'high' as const : 'medium' as const;

        // Check if there are journal entries capitalizing R&D costs
        const capitalizationJEs = data.journalEntries.filter(je =>
          je.lines.some(l =>
            l.debit > 0 &&
            (l.accountName?.toLowerCase().includes('research') ||
             l.accountName?.toLowerCase().includes('development') ||
             l.accountName?.toLowerCase().includes('r&d'))
          ) &&
          je.lines.some(l =>
            l.debit > 0 &&
            l.accountName &&
            !l.accountName.toLowerCase().includes('expense')
          )
        );

        findings.push(createFinding(
          data.engagementId,
          'GAAP-RD-001',
          'GAAP',
          severity,
          'R&D Costs Potentially Capitalized in Violation of ASC 730',
          `${rdAssetAccounts.length} asset account(s) containing R&D-related descriptions were identified with combined balances of $${(totalRdCapitalized / 1000000).toFixed(2)}M. ${capitalizationJEs.length > 0 ? `${capitalizationJEs.length} journal entry/entries were detected that appear to capitalize R&D costs.` : 'No specific capitalizing journal entries were identified, but the balances remain in asset accounts.'} Under ASC 730-10-25-1, research and development costs must be charged to expense when incurred. The only exceptions are (1) materials, equipment, or facilities with alternative future uses (ASC 730-10-25-2), (2) software development costs after technological feasibility under ASC 985-20, and (3) internal-use software development costs under ASC 350-40. Unless one of these narrow exceptions applies, these capitalized amounts represent a potential overstatement of assets and understatement of R&D expense by $${(totalRdCapitalized / 1000000).toFixed(2)}M.${totalRdExpense > 0 ? ` Current period R&D expense is $${(totalRdExpense / 1000000).toFixed(2)}M.` : ' No R&D expense was recognized in the current period, which further suggests improper capitalization.'}`,
          'ASC 730-10-25-1: Research and development costs shall be charged to expense when incurred. ASC 730-10-25-2: Elements of R&D costs include materials, equipment, personnel, intangibles, contract services, and indirect costs.',
          'Obtain a detailed schedule of all capitalized R&D amounts. For each capitalized item, determine whether an ASC 730 exception applies (alternative future use, ASC 985-20 software, or ASC 350-40 internal-use software). For amounts that do not qualify for an exception, prepare an adjusting entry to reclassify the capitalized balance to R&D expense. Verify that the entity\'s R&D capitalization policy is consistent with GAAP. Review disclosures required by ASC 730-10-50-1 for total R&D costs charged to expense.',
          totalRdCapitalized,
          [...rdAssetAccounts, ...rdExpenseAccounts].map(a => a.accountNumber)
        ));
      }

      // Additional check: if there is significant R&D expense, verify it is classified properly
      if (totalRdExpense > 0 && rdAssetAccounts.length === 0) {
        // Check for period-over-period R&D expense volatility that could indicate inconsistent treatment
        const rdBeginning = rdExpenseAccounts.reduce((sum, a) => sum + Math.abs(a.beginningBalance), 0);

        if (rdBeginning > 0) {
          const rdChange = totalRdExpense - rdBeginning;
          const rdChangePct = rdChange / rdBeginning;

          // A large decrease in R&D expense could indicate costs being rerouted to asset accounts
          if (rdChangePct < -0.40 && Math.abs(rdChange) > data.materialityThreshold * 0.25) {
            // Check if any intangible or other asset accounts increased correspondingly
            const intangibleAccounts = data.accounts.filter(a =>
              a.subType === 'intangible' || a.subType === 'other_asset'
            );
            const intangibleGrowth = intangibleAccounts.reduce(
              (sum, a) => sum + (Math.abs(a.endingBalance) - Math.abs(a.beginningBalance)), 0
            );

            if (intangibleGrowth > Math.abs(rdChange) * 0.5) {
              findings.push(createFinding(
                data.engagementId,
                'GAAP-RD-001',
                'GAAP',
                'medium',
                'R&D Expense Decline with Corresponding Asset Increase',
                `R&D expense decreased by ${(Math.abs(rdChangePct) * 100).toFixed(1)}% ($${(Math.abs(rdChange) / 1000000).toFixed(2)}M) while intangible/other assets increased by $${(intangibleGrowth / 1000000).toFixed(2)}M. This pattern may indicate that R&D costs are being reclassified to intangible assets. Under ASC 730, only costs meeting specific exceptions (software development after technological feasibility, internal-use software, or assets with alternative future use) may be capitalized. Verify that any reclassification is supported by a qualifying exception.`,
                'ASC 730-10-25-1: R&D costs shall be charged to expense when incurred. ASC 985-20-25: Software development costs may be capitalized after technological feasibility.',
                'Investigate the cause of the decline in R&D expense. Analyze intangible asset additions for the period. Determine whether any capitalized amounts represent R&D costs that should have been expensed. If software development costs were capitalized, verify that technological feasibility was established before capitalization commenced.',
                Math.abs(rdChange),
                [...rdExpenseAccounts, ...intangibleAccounts].map(a => a.accountNumber)
              ));
            }
          }
        }
      }

      return findings;
    },
  },
];
