import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const exitDisposalRules: AuditRule[] = [
  {
    id: 'GAAP-EXIT-001',
    name: 'Restructuring Charges',
    framework: 'GAAP',
    category: 'Exit and Disposal Activities (ASC 420)',
    description: 'Detects restructuring-related accounts and verifies that recognition criteria under ASC 420 are met for exit and disposal cost obligations',
    citation: 'ASC 420-10-25-1: A liability for a cost associated with an exit or disposal activity shall be recognized when the liability is incurred',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const restructuringKeywords = [
        'restructuring', 'restructure', 'severance', 'termination benefit',
        'exit cost', 'disposal', 'plant closing', 'facility closure',
        'workforce reduction', 'relocation', 'lease termination'
      ];

      // Identify restructuring-related expense accounts
      const restructuringExpenseAccounts = data.accounts.filter(a =>
        (a.accountType === 'expense' || a.subType === 'restructuring_charge') &&
        restructuringKeywords.some(kw => a.accountName.toLowerCase().includes(kw))
      );

      // Identify restructuring-related liability/accrual accounts
      const restructuringLiabilityAccounts = data.accounts.filter(a =>
        (a.accountType === 'liability' || a.subType === 'accrued_liabilities') &&
        restructuringKeywords.some(kw => a.accountName.toLowerCase().includes(kw))
      );

      // Also check for restructuring journal entries
      const restructuringJEs = data.journalEntries.filter(je =>
        restructuringKeywords.some(kw => je.description.toLowerCase().includes(kw))
      );

      const totalRestructuringExpense = restructuringExpenseAccounts.reduce(
        (sum, a) => sum + Math.abs(a.endingBalance), 0
      );

      const totalRestructuringLiability = restructuringLiabilityAccounts.reduce(
        (sum, a) => sum + Math.abs(a.endingBalance), 0
      );

      const hasRestructuringActivity =
        restructuringExpenseAccounts.length > 0 ||
        restructuringLiabilityAccounts.length > 0 ||
        restructuringJEs.length > 0;

      if (!hasRestructuringActivity) {
        return findings;
      }

      // Flag for verification of recognition criteria
      if (totalRestructuringExpense > data.materialityThreshold * 0.1 ||
          totalRestructuringLiability > data.materialityThreshold * 0.1) {

        const severity = (totalRestructuringExpense > data.materialityThreshold ||
          totalRestructuringLiability > data.materialityThreshold)
          ? 'high' as const
          : 'medium' as const;

        // Analyze restructuring liability rollforward
        const liabBeginning = restructuringLiabilityAccounts.reduce(
          (sum, a) => sum + Math.abs(a.beginningBalance), 0
        );
        const liabEnding = restructuringLiabilityAccounts.reduce(
          (sum, a) => sum + Math.abs(a.endingBalance), 0
        );

        // Check for potential premature recognition (large accrual at year-end)
        const yearEndRestructuringJEs = data.journalEntries.filter(je => {
          const jeDate = new Date(je.date);
          const fyeDate = new Date(data.fiscalYearEnd);
          const daysBeforeEnd = (fyeDate.getTime() - jeDate.getTime()) / (1000 * 60 * 60 * 24);
          return daysBeforeEnd >= 0 && daysBeforeEnd <= 15 &&
            restructuringKeywords.some(kw => je.description.toLowerCase().includes(kw));
        });

        const timingConcern = yearEndRestructuringJEs.length > 0
          ? ` Notably, ${yearEndRestructuringJEs.length} restructuring-related journal entry/entries were recorded within the final 15 days of the fiscal year, which may indicate accelerated or premature recognition of exit costs.`
          : '';

        // Check for one-time termination benefits without proper communication
        const severanceAccounts = data.accounts.filter(a =>
          a.accountName.toLowerCase().includes('severance') ||
          a.accountName.toLowerCase().includes('termination benefit')
        );
        const totalSeverance = severanceAccounts.reduce(
          (sum, a) => sum + Math.abs(a.endingBalance), 0
        );

        const severanceNote = totalSeverance > 0
          ? ` One-time termination benefits of $${(totalSeverance / 1000000).toFixed(2)}M were identified. Under ASC 420-10-25-4, a liability for one-time termination benefits is recognized when the termination plan has been communicated to employees in sufficient detail to enable them to determine the type and amount of benefits they will receive.`
          : '';

        findings.push(createFinding(
          data.engagementId,
          'GAAP-EXIT-001',
          'GAAP',
          severity,
          'Restructuring Activity Requires ASC 420 Compliance Review',
          `Restructuring activity was detected: expense accounts total $${(totalRestructuringExpense / 1000000).toFixed(2)}M, liability accounts total $${(totalRestructuringLiability / 1000000).toFixed(2)}M (beginning: $${(liabBeginning / 1000000).toFixed(2)}M, ending: $${(liabEnding / 1000000).toFixed(2)}M), and ${restructuringJEs.length} restructuring-related journal entries were recorded.${timingConcern}${severanceNote} Under ASC 420-10-25-1, a liability for exit or disposal costs is recognized when incurred, not when management commits to a restructuring plan. This differs from the prior commitment-date model and requires careful assessment of when each cost element meets the incurrence criteria. Common recognition issues include: (1) premature recognition of costs before they are incurred, (2) failure to measure at fair value, and (3) including costs of ongoing operations in restructuring charges.`,
          'ASC 420-10-25-1: A liability for a cost associated with an exit or disposal activity shall be recognized and measured initially at its fair value in the period in which the liability is incurred. ASC 420-10-50-1: Required disclosures for exit and disposal activities.',
          'Obtain management\'s restructuring plan including cost estimates by category (one-time termination benefits, contract termination costs, other associated costs). For each cost category, verify: (1) the liability is recognized only when incurred per ASC 420-10-25, (2) one-time termination benefits are recognized when communicated to employees, (3) contract termination costs are recognized at the cease-use date, (4) other costs are recognized when incurred. Review the restructuring reserve rollforward for reasonableness. Verify that expected cost revisions are properly accounted for. Assess adequacy of ASC 420-10-50 disclosures.',
          totalRestructuringExpense + totalRestructuringLiability,
          [...restructuringExpenseAccounts, ...restructuringLiabilityAccounts].map(a => a.accountNumber)
        ));
      }

      // Check for stale restructuring liabilities (carried over from prior periods without activity)
      const staleLiabilities = restructuringLiabilityAccounts.filter(a =>
        Math.abs(a.endingBalance) > 0 &&
        Math.abs(a.beginningBalance) > 0 &&
        Math.abs(a.endingBalance - a.beginningBalance) < Math.abs(a.beginningBalance) * 0.05
      );

      if (staleLiabilities.length > 0) {
        const staleTotal = staleLiabilities.reduce(
          (sum, a) => sum + Math.abs(a.endingBalance), 0
        );

        if (staleTotal > data.materialityThreshold * 0.1) {
          findings.push(createFinding(
            data.engagementId,
            'GAAP-EXIT-001',
            'GAAP',
            'medium',
            'Stale Restructuring Liabilities Identified',
            `${staleLiabilities.length} restructuring liability account(s) totaling $${(staleTotal / 1000000).toFixed(2)}M show minimal change from the prior period (less than 5% movement). Restructuring reserves that remain on the balance sheet without corresponding cash disbursements or adjustment activity may indicate: (1) overestimation of the original exit cost, (2) delayed execution of the restructuring plan, (3) reserves maintained for earnings management purposes, or (4) amounts that should have been reversed. Under ASC 420-10-35-1, changes in the liability shall be measured using the credit-adjusted risk-free rate used to measure the initial amount.`,
            'ASC 420-10-35-1: Subsequent measurement of exit cost obligations. ASC 420-10-50-1: Disclosure of changes in the liability during the period.',
            'Obtain a detailed rollforward of each restructuring reserve. For stale balances, inquire about the status of the underlying restructuring plan. Determine if the costs will still be incurred or if the reserves should be reversed. Verify that any reversals are properly recognized in the income statement in the period the estimate changes. Review management\'s assessment of remaining obligations.',
            staleTotal,
            staleLiabilities.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
];
