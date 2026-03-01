import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const interestCapitalizationRules: AuditRule[] = [
  {
    id: 'GAAP-INT-001',
    name: 'Interest Capitalization Assessment',
    framework: 'GAAP',
    category: 'Interest Capitalization (ASC 835)',
    description: 'Identifies when construction-in-progress accounts exist alongside interest expense, flagging for avoidable interest capitalization analysis under ASC 835-20',
    citation: 'ASC 835-20-15-5: Interest shall be capitalized for assets constructed for an entity\'s own use',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      // Identify construction-in-progress (CIP) accounts
      const cipAccounts = data.accounts.filter(a =>
        a.subType === 'construction_in_progress' ||
        a.accountName.toLowerCase().includes('construction in progress') ||
        a.accountName.toLowerCase().includes('construction-in-progress') ||
        a.accountName.toLowerCase().includes('cip') ||
        a.accountName.toLowerCase().includes('assets under construction')
      );

      if (cipAccounts.length === 0) {
        return findings;
      }

      const totalCIP = cipAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (totalCIP === 0) {
        return findings;
      }

      // Identify interest expense accounts
      const interestExpenseAccounts = data.accounts.filter(a =>
        a.subType === 'interest_expense' ||
        (a.accountType === 'expense' &&
         (a.accountName.toLowerCase().includes('interest expense') ||
          a.accountName.toLowerCase().includes('interest cost') ||
          a.accountName.toLowerCase().includes('borrowing cost')))
      );

      const totalInterestExpense = interestExpenseAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      if (totalInterestExpense === 0) {
        return findings;
      }

      // Check for evidence that interest has already been capitalized
      const capitalizedInterestIndicators = data.accounts.filter(a =>
        a.accountName.toLowerCase().includes('capitalized interest') ||
        a.accountName.toLowerCase().includes('interest capitalized')
      );

      const capitalizedInterestJEs = data.journalEntries.filter(je =>
        je.description.toLowerCase().includes('capitalize interest') ||
        je.description.toLowerCase().includes('interest capitalization') ||
        je.description.toLowerCase().includes('avoidable interest')
      );

      const hasCapitalizationEvidence =
        capitalizedInterestIndicators.length > 0 || capitalizedInterestJEs.length > 0;

      // Check for debt accounts to determine if there are borrowings outstanding
      const debtAccounts = data.accounts.filter(a =>
        a.subType === 'short_term_debt' ||
        a.subType === 'long_term_debt' ||
        a.accountName.toLowerCase().includes('notes payable') ||
        a.accountName.toLowerCase().includes('bonds payable') ||
        a.accountName.toLowerCase().includes('credit facility') ||
        a.accountName.toLowerCase().includes('line of credit')
      );

      const totalDebt = debtAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);

      // CIP exists with interest expense but no capitalization evidence
      if (!hasCapitalizationEvidence && totalCIP > data.materialityThreshold * 0.1) {
        // Estimate avoidable interest: simplified as weighted-average rate applied to CIP
        const estimatedRate = totalDebt > 0 ? totalInterestExpense / totalDebt : 0;
        const estimatedAvoidableInterest = totalCIP * estimatedRate;

        const severity = estimatedAvoidableInterest > data.materialityThreshold
          ? 'high' as const
          : 'medium' as const;

        // Check for CIP growth (indicates active construction)
        const cipBeginning = cipAccounts.reduce((sum, a) => sum + Math.abs(a.beginningBalance), 0);
        const cipGrowth = totalCIP - cipBeginning;
        const isActiveConstruction = cipGrowth > 0;

        findings.push(createFinding(
          data.engagementId,
          'GAAP-INT-001',
          'GAAP',
          severity,
          'Construction-in-Progress Requires Interest Capitalization Analysis',
          `Construction-in-progress of $${(totalCIP / 1000000).toFixed(2)}M was identified alongside interest expense of $${(totalInterestExpense / 1000000).toFixed(2)}M and total outstanding debt of $${(totalDebt / 1000000).toFixed(2)}M, but no evidence of interest capitalization was found. ${isActiveConstruction ? `CIP increased by $${(cipGrowth / 1000000).toFixed(2)}M during the period, indicating active construction activity.` : 'CIP did not increase during the period, which may indicate the asset has been placed in service or construction has stalled.'} Under ASC 835-20-15-5, interest cost shall be capitalized as part of the cost of qualifying assets that require a period of time to get them ready for their intended use. The estimated avoidable interest, calculated using a weighted-average borrowing rate of ${(estimatedRate * 100).toFixed(2)}%, is approximately $${(estimatedAvoidableInterest / 1000000).toFixed(2)}M. Failure to capitalize avoidable interest results in overstated interest expense and understated asset values.`,
          'ASC 835-20-15-5: Interest shall be capitalized for assets that are constructed or otherwise produced for an entity\'s own use. ASC 835-20-30-2: The amount of interest cost to be capitalized is intended to be that portion of the interest cost incurred during the acquisition period that theoretically could have been avoided.',
          'Obtain a schedule of all qualifying assets and their expenditure history. Compute avoidable interest using the weighted-average accumulated expenditures method. Apply the specific borrowing rate for asset-specific debt and the weighted-average rate for other borrowings. Verify that interest capitalization ceases when the asset is substantially complete and ready for use. Ensure compliance with ASC 835-20-50 disclosure requirements.',
          estimatedAvoidableInterest,
          [...cipAccounts, ...interestExpenseAccounts].map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
];
