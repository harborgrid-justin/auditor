import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const reportingPolicyRules: AuditRule[] = [
  {
    id: 'DOD-FMR-V06-001',
    name: 'SF-133 Data Completeness',
    framework: 'DOD_FMR',
    category: 'Reporting Policy (Vol 6)',
    description: 'Checks if appropriations exist but are missing required financial data (totalAuthority = 0), indicating incomplete SF-133 reporting',
    citation: 'DoD FMR Vol 6A, Ch 2; OMB Circular A-11, Section 130 - SF-133 Requirements',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { appropriations } = data.dodData;

      const incompleteApprops = appropriations.filter(a => a.totalAuthority === 0);

      if (incompleteApprops.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V06-001',
          'DOD_FMR',
          'medium',
          'SF-133 Data Completeness Deficiency',
          `${incompleteApprops.length} appropriation(s) have zero total authority, indicating missing or incomplete financial data required for the SF-133 Report on Budget Execution and Budgetary Resources: ${incompleteApprops.map(a => `${a.treasuryAccountSymbol} "${a.appropriationTitle}"`).join('; ')}. Each appropriation must report total budgetary resources for accurate SF-133 compilation per OMB Circular A-11, Section 130.`,
          'DoD FMR Volume 6A, Chapter 2; OMB Circular A-11, Section 130: The SF-133 must report budgetary resources for each Treasury Account Symbol. Zero total authority for an active appropriation indicates incomplete data that will result in an inaccurate SF-133 submission.',
          'Review each identified appropriation to determine the correct total authority amount. Coordinate with budget offices to obtain enacted or apportioned amounts. Update the financial system and resubmit the SF-133 for affected periods.',
          null,
          incompleteApprops.map(a => a.treasuryAccountSymbol)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V06-002',
    name: 'USSGL Trial Balance Verification',
    framework: 'DOD_FMR',
    category: 'Reporting Policy (Vol 6)',
    description: 'Verifies that the sum of debit end balances equals the sum of credit end balances for proprietary USSGL accounts',
    citation: 'DoD FMR Vol 6A, Ch 2; USSGL TFM Supplement, Section III - Proprietary Trial Balance',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts } = data.dodData;

      const proprietaryAccounts = ussglAccounts.filter(a => a.accountType === 'proprietary');
      if (proprietaryAccounts.length === 0) return findings;

      const totalDebits = proprietaryAccounts
        .filter(a => a.normalBalance === 'debit')
        .reduce((sum, a) => sum + a.endBalance, 0);
      const totalCredits = proprietaryAccounts
        .filter(a => a.normalBalance === 'credit')
        .reduce((sum, a) => sum + a.endBalance, 0);
      const difference = Math.abs(totalDebits - totalCredits);

      if (difference > 0.01) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V06-002',
          'DOD_FMR',
          'high',
          'USSGL Trial Balance Out of Balance',
          `The proprietary USSGL trial balance is out of balance by $${difference.toLocaleString('en-US', { minimumFractionDigits: 2 })}. Total debit end balances: $${totalDebits.toLocaleString('en-US', { minimumFractionDigits: 2 })}; total credit end balances: $${totalCredits.toLocaleString('en-US', { minimumFractionDigits: 2 })}. An out-of-balance trial balance means the fundamental accounting equation is not satisfied, rendering financial statements unreliable and the GTAS submission inaccurate.`,
          'DoD FMR Volume 6A, Chapter 2; USSGL TFM Supplement, Section III: The proprietary trial balance must balance (total debits equal total credits) for accurate financial statement preparation and GTAS submission to Treasury.',
          'Perform a systematic review of all proprietary accounts to identify the source of the imbalance. Check recent journal entries, adjusting entries, and system interface postings. Verify that all debits have corresponding credits. Correct the identified errors and rebalance the trial balance before resubmitting to GTAS.',
          difference,
          proprietaryAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V06-003',
    name: 'GTAS Reconciliation',
    framework: 'DOD_FMR',
    category: 'Reporting Policy (Vol 6)',
    description: 'Verifies that USSGL account totals align with appropriation totals for GTAS reconciliation',
    citation: 'DoD FMR Vol 6A, Ch 2; Treasury Financial Manual - GTAS Reporting Requirements',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts, appropriations } = data.dodData;

      const budgetaryAccounts = ussglAccounts.filter(a => a.accountType === 'budgetary');
      if (budgetaryAccounts.length === 0 || appropriations.length === 0) return findings;

      const ussglBudgetaryTotal = budgetaryAccounts.reduce((sum, a) => sum + a.endBalance, 0);
      const appropriationTotal = appropriations.reduce((sum, a) => sum + a.totalAuthority, 0);

      if (appropriationTotal === 0) return findings;

      const difference = Math.abs(ussglBudgetaryTotal - appropriationTotal);
      const tolerancePct = 0.05;

      if (difference > appropriationTotal * tolerancePct) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V06-003',
          'DOD_FMR',
          'high',
          'GTAS Reconciliation Discrepancy',
          `USSGL budgetary account totals ($${(ussglBudgetaryTotal / 1000000).toFixed(2)}M) do not align with appropriation totals ($${(appropriationTotal / 1000000).toFixed(2)}M). Difference of $${(difference / 1000000).toFixed(2)}M exceeds the 5% tolerance threshold. This discrepancy will cause the GTAS submission to fail Treasury reconciliation edits and may delay the component's financial reporting.`,
          'DoD FMR Volume 6A, Chapter 2; Treasury Financial Manual, GTAS Reporting Requirements: USSGL account balances submitted through GTAS must reconcile to the component-level appropriation records. Material differences require investigation and resolution before certification.',
          'Reconcile USSGL budgetary accounts to appropriation records by Treasury Account Symbol. Identify transactions that are recorded in one system but not the other. Resolve differences through adjusting entries and resubmit GTAS data. Establish monthly reconciliation procedures to prevent recurrence.',
          difference,
          [...budgetaryAccounts.map(a => a.accountNumber), ...appropriations.map(a => a.treasuryAccountSymbol)]
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V06-004',
    name: 'Budgetary-Proprietary Consistency',
    framework: 'DOD_FMR',
    category: 'Reporting Policy (Vol 6)',
    description: 'Checks that both budgetary and proprietary type accounts exist for dual-track accounting compliance',
    citation: 'DoD FMR Vol 6A, Ch 2; USSGL TFM Supplement - Dual-Track Accounting',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts } = data.dodData;

      if (ussglAccounts.length === 0) return findings;

      const hasBudgetary = ussglAccounts.some(a => a.accountType === 'budgetary');
      const hasProprietary = ussglAccounts.some(a => a.accountType === 'proprietary');

      if (!hasBudgetary || !hasProprietary) {
        const missingType = !hasBudgetary ? 'budgetary' : 'proprietary';
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V06-004',
          'DOD_FMR',
          'medium',
          'Incomplete Dual-Track Accounting',
          `The USSGL account structure is missing ${missingType} accounts. Federal accounting requires a dual-track system with both budgetary and proprietary accounts maintained simultaneously. The absence of ${missingType} accounts means the ${missingType === 'budgetary' ? 'SF-133 and Statement of Budgetary Resources' : 'Balance Sheet and Statement of Net Cost'} cannot be compiled from the general ledger, which will result in incomplete GTAS reporting.`,
          'DoD FMR Volume 6A, Chapter 2; USSGL TFM Supplement: Federal agencies must maintain both proprietary and budgetary accounts (dual-track system). Proprietary accounts support accrual-basis financial statements while budgetary accounts support budget execution reporting.',
          `Establish the missing ${missingType} accounts in the chart of accounts per the USSGL standard. Ensure all financial transactions generate appropriate entries in both tracks. Review and repost prior transactions that should have generated ${missingType} entries.`,
          null,
          ussglAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V06-005',
    name: 'Intragovernmental Transaction Reconciliation',
    framework: 'DOD_FMR',
    category: 'Reporting Policy (Vol 6)',
    description: 'Checks intragovernmental transactions for unmatched items that will fail Treasury reconciliation',
    citation: 'DoD FMR Vol 6A, Ch 4; Treasury Financial Manual - Intragovernmental Reconciliation',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { intragovernmentalTransactions } = data.dodData;

      if (intragovernmentalTransactions.length === 0) return findings;

      const unmatchedItems = intragovernmentalTransactions.filter(
        t => t.reconciliationStatus !== 'matched'
      );

      if (unmatchedItems.length > 0) {
        const totalUnmatched = unmatchedItems.reduce((sum, t) => sum + t.amount, 0);
        const statusBreakdown = unmatchedItems.reduce((acc, t) => {
          acc[t.reconciliationStatus] = (acc[t.reconciliationStatus] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        const statusSummary = Object.entries(statusBreakdown)
          .map(([status, count]) => `${status}: ${count}`)
          .join(', ');

        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V06-005',
          'DOD_FMR',
          'high',
          'Unmatched Intragovernmental Transactions',
          `${unmatchedItems.length} of ${intragovernmentalTransactions.length} intragovernmental transaction(s) are not matched, totaling $${(totalUnmatched / 1000000).toFixed(2)}M. Status breakdown: ${statusSummary}. Unmatched intragovernmental transactions will cause differences on the government-wide financial statements and will be flagged during Treasury's GTAS reconciliation process. Trading partners include: ${Array.from(new Set(unmatchedItems.map(t => t.tradingPartnerAgency))).slice(0, 5).join(', ')}.`,
          'DoD FMR Volume 6A, Chapter 4; Treasury Financial Manual, Intragovernmental Reconciliation: All intragovernmental transactions must be reconciled with trading partners to ensure proper elimination on the government-wide consolidated financial statements. Unmatched items must be resolved before the end of the reporting period.',
          'Coordinate with each trading partner agency to reconcile unmatched transactions. Use the GTAS intragovernmental module to identify specific differences. Resolve disputes through the established dispute resolution process. Submit corrected data before the GTAS reporting deadline.',
          totalUnmatched,
          unmatchedItems.map(t => t.tradingPartnerAgency)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V06-006',
    name: 'Financial Statement Account Coverage',
    framework: 'DOD_FMR',
    category: 'Reporting Policy (Vol 6)',
    description: 'Verifies that all USSGL category types are represented in accounts for complete financial statement reporting',
    citation: 'DoD FMR Vol 6A, Ch 2; SFFAS 1 - Objectives of Federal Financial Reporting',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts } = data.dodData;

      if (ussglAccounts.length === 0) return findings;

      const requiredCategories = [
        'asset',
        'liability',
        'net_position',
        'revenue',
        'expense',
        'budgetary_resource',
        'status_of_resources',
      ] as const;

      const presentCategories = new Set(ussglAccounts.map(a => a.category));
      const missingCategories = requiredCategories.filter(c => !presentCategories.has(c));

      if (missingCategories.length > 0) {
        const balanceSheetAffected = missingCategories.some(c => c === 'asset' || c === 'liability' || c === 'net_position');
        const netCostAffected = missingCategories.some(c => c === 'revenue' || c === 'expense');
        const sbrAffected = missingCategories.some(c => c === 'budgetary_resource' || c === 'status_of_resources');

        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V06-006',
          'DOD_FMR',
          'medium',
          'Incomplete Financial Statement Account Coverage',
          `The following USSGL account categories are missing from the chart of accounts: ${missingCategories.join(', ')}. A complete set of federal financial statements requires all categories to be represented. ${balanceSheetAffected ? 'Balance Sheet affected. ' : ''}${netCostAffected ? 'Statement of Net Cost affected. ' : ''}${sbrAffected ? 'Statement of Budgetary Resources affected.' : ''}`,
          'DoD FMR Volume 6A, Chapter 2; SFFAS 1: Federal financial reporting must include a Balance Sheet, Statement of Net Cost, Statement of Changes in Net Position, and Statement of Budgetary Resources. Each requires specific USSGL account categories to be maintained.',
          'Establish USSGL accounts for each missing category per the USSGL standard chart of accounts. Ensure the financial management system is configured to post transactions to all required account categories. Review and correct any transactions that were improperly classified.',
          null,
          Array.from(presentCategories).map(String)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V06-007',
    name: 'Period-End Reporting Completeness',
    framework: 'DOD_FMR',
    category: 'Reporting Policy (Vol 6)',
    description: 'Checks that USSGL accounts have non-zero end balances for at least some accounts, indicating reporting activity',
    citation: 'DoD FMR Vol 6A, Ch 2; OMB Circular A-136 - Financial Reporting Requirements',
    defaultSeverity: 'low',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts } = data.dodData;

      if (ussglAccounts.length === 0) return findings;

      const accountsWithBalance = ussglAccounts.filter(a => a.endBalance !== 0);

      if (accountsWithBalance.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V06-007',
          'DOD_FMR',
          'low',
          'Period-End Reporting Appears Incomplete',
          `All ${ussglAccounts.length} USSGL accounts have zero end balances. This suggests that period-end closing entries or financial activity has not been recorded, or data has not been populated for the reporting period. Financial reports submitted with all-zero balances will not provide meaningful information for management or oversight purposes.`,
          'DoD FMR Volume 6A, Chapter 2; OMB Circular A-136: Federal entities must submit complete financial data for each reporting period. Accounts with entirely zero balances suggest incomplete reporting.',
          'Verify that all financial transactions for the period have been posted. Ensure period-end closing and adjusting entries have been recorded. Confirm that USSGL account data has been properly extracted from the financial management system.',
          null,
          ussglAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V06-008',
    name: 'Variance Analysis',
    framework: 'DOD_FMR',
    category: 'Reporting Policy (Vol 6)',
    description: 'Flags appropriations where the absolute difference between obligated and disbursed exceeds 50% of total authority',
    citation: 'DoD FMR Vol 6A, Ch 2; OMB Circular A-11, Section 130 - Budget Execution Variance',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { appropriations } = data.dodData;

      for (const approp of appropriations) {
        if (approp.totalAuthority <= 0) continue;

        const variance = Math.abs(approp.obligated - approp.disbursed);
        const variancePct = variance / approp.totalAuthority;

        if (variancePct > 0.50) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V06-008',
            'DOD_FMR',
            'medium',
            'Significant Obligation-Disbursement Variance',
            `Appropriation "${approp.appropriationTitle}" (${approp.treasuryAccountSymbol}): the absolute difference between obligated ($${approp.obligated.toLocaleString()}) and disbursed ($${approp.disbursed.toLocaleString()}) amounts is $${variance.toLocaleString()}, which is ${(variancePct * 100).toFixed(1)}% of total authority ($${approp.totalAuthority.toLocaleString()}). A variance exceeding 50% of total authority indicates potential issues with budget execution timing, unliquidated obligations, or recording errors that require management attention for SF-133 reporting accuracy.`,
            'DoD FMR Volume 6A, Chapter 2; OMB Circular A-11, Section 130: Significant variances between obligations and outlays must be analyzed and explained. Large unliquidated obligation balances or rapid disbursement rates may indicate budget execution issues requiring corrective action.',
            'Analyze the specific causes of the variance. For high obligations relative to disbursements, review unliquidated obligations for validity and aging. For high disbursements relative to obligations, verify that all disbursements have proper obligation authority. Document the analysis and include explanations in the SF-133 footnotes.',
            variance,
            [approp.treasuryAccountSymbol]
          ));
        }
      }

      return findings;
    },
  },
];
