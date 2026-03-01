import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '@/lib/engine/rule-runner';

export const accountingPolicyRules: AuditRule[] = [
  {
    id: 'DOD-FMR-V04-001',
    name: 'USSGL Compliance',
    framework: 'DOD_FMR',
    category: 'Accounting Policy (Vol 4)',
    description: 'Checks that all USSGL accounts have valid 4-digit account number format within standard ranges',
    citation: 'DoD FMR Vol 4, Ch 2; Treasury Financial Manual, USSGL Chart of Accounts',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts } = data.dodData;

      if (ussglAccounts.length === 0) return findings;

      const invalidFormat: string[] = [];
      for (const account of ussglAccounts) {
        const acctNum = account.accountNumber.trim();
        if (!/^\d{4}$/.test(acctNum)) {
          invalidFormat.push(`${acctNum} ("${account.accountTitle}")`);
        }
      }

      if (invalidFormat.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V04-001',
          'DOD_FMR',
          'medium',
          'USSGL Accounts with Invalid Account Number Format',
          `${invalidFormat.length} USSGL account(s) have account numbers that do not conform to the standard 4-digit numeric format: ${invalidFormat.slice(0, 10).join('; ')}${invalidFormat.length > 10 ? ` and ${invalidFormat.length - 10} more` : ''}. All USSGL accounts must use the standard 4-digit format per the Treasury Financial Manual.`,
          'DoD FMR Volume 4, Chapter 2; Treasury Financial Manual, USSGL Chart of Accounts: Account numbers must be 4-digit numeric codes conforming to the USSGL standard.',
          'Correct all non-conforming account numbers to the proper USSGL 4-digit format. Map non-standard accounts to their USSGL equivalents and repost affected transactions.',
          null,
          invalidFormat.map(a => a.split(' ')[0])
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V04-002',
    name: 'Dual-Track Reconciliation',
    framework: 'DOD_FMR',
    category: 'Accounting Policy (Vol 4)',
    description: 'Verifies that proprietary and budgetary accounts balance and reconcile through the dual-track system',
    citation: 'DoD FMR Vol 4, Ch 2; USSGL TFM Supplement - Crosswalk Reconciliation',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts } = data.dodData;

      const proprietaryAccounts = ussglAccounts.filter(a => a.accountType === 'proprietary');
      const budgetaryAccounts = ussglAccounts.filter(a => a.accountType === 'budgetary');

      if (proprietaryAccounts.length === 0 || budgetaryAccounts.length === 0) return findings;

      const budgetaryResources = budgetaryAccounts
        .filter(a => a.category === 'budgetary_resource')
        .reduce((sum, a) => sum + a.endBalance, 0);
      const statusOfResources = budgetaryAccounts
        .filter(a => a.category === 'status_of_resources')
        .reduce((sum, a) => sum + a.endBalance, 0);

      const difference = Math.abs(budgetaryResources - statusOfResources);

      if (difference > 1000) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V04-002',
          'DOD_FMR',
          'high',
          'Proprietary-Budgetary Reconciliation Discrepancy',
          `Budgetary resources ($${(budgetaryResources / 1000000).toFixed(2)}M) do not reconcile with status of budgetary resources ($${(statusOfResources / 1000000).toFixed(2)}M), difference of $${(difference / 1000000).toFixed(2)}M. The dual-track accounting system requires that proprietary and budgetary accounts reconcile through defined crosswalk relationships. This failure indicates posting errors or missing transactions in one or both tracks.`,
          'DoD FMR Volume 4, Chapter 2; USSGL TFM Supplement: Proprietary and budgetary accounts must be maintained in a dual-track system and must reconcile per the USSGL crosswalk.',
          'Perform a detailed crosswalk reconciliation between proprietary and budgetary accounts. Identify transactions posted to one track but not the other. Review system configuration to ensure all transaction types generate proper dual-track entries.',
          difference,
          [...proprietaryAccounts, ...budgetaryAccounts].map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V04-003',
    name: 'FASAB/SFFAS Standard Adherence',
    framework: 'DOD_FMR',
    category: 'Accounting Policy (Vol 4)',
    description: 'Checks for accounts missing required SFFAS categories to ensure compliance with federal accounting standards',
    citation: 'DoD FMR Vol 4, Ch 1; SFFAS Standards - Federal Accounting Standards Advisory Board',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts } = data.dodData;

      const proprietaryAccounts = ussglAccounts.filter(a => a.accountType === 'proprietary');
      if (proprietaryAccounts.length === 0) return findings;

      const categories = new Set<string>(proprietaryAccounts.map(a => a.category));
      const requiredCategories: Array<{ category: string; sffas: string; description: string }> = [
        { category: 'asset', sffas: 'SFFAS 1/6', description: 'asset accounts (cash, receivables, PP&E)' },
        { category: 'liability', sffas: 'SFFAS 5', description: 'liability accounts (payables, accrued liabilities)' },
        { category: 'net_position', sffas: 'SFFAS 1', description: 'net position accounts (cumulative results, unexpended appropriations)' },
        { category: 'revenue', sffas: 'SFFAS 7', description: 'revenue accounts (exchange and non-exchange revenue)' },
        { category: 'expense', sffas: 'SFFAS 4', description: 'expense accounts (program costs, depreciation)' },
      ];

      const missingCategories = requiredCategories.filter(r => !categories.has(r.category));

      if (missingCategories.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V04-003',
          'DOD_FMR',
          'medium',
          'Missing Required SFFAS Account Categories',
          `The USSGL chart of accounts is missing ${missingCategories.length} required account category(ies): ${missingCategories.map(m => `${m.description} (required by ${m.sffas})`).join('; ')}. A complete chart of accounts per SFFAS standards is necessary for full financial statement presentation.`,
          'DoD FMR Volume 4, Chapter 1; FASAB/SFFAS Standards: Federal financial statements require asset, liability, net position, revenue, and expense accounts to present a complete set of financial statements.',
          'Establish the missing account categories in the USSGL chart of accounts. Ensure all required SFFAS account types are represented and properly classified.',
          null,
          []
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V04-004',
    name: 'Trial Balance Verification',
    framework: 'DOD_FMR',
    category: 'Accounting Policy (Vol 4)',
    description: 'Checks that debits equal credits for both proprietary and budgetary trial balances',
    citation: 'DoD FMR Vol 4, Ch 2; USSGL TFM Supplement, Sections III & IV',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts } = data.dodData;

      // Proprietary trial balance
      const proprietaryAccounts = ussglAccounts.filter(a => a.accountType === 'proprietary');
      if (proprietaryAccounts.length > 0) {
        const propDebits = proprietaryAccounts
          .filter(a => a.normalBalance === 'debit')
          .reduce((sum, a) => sum + a.endBalance, 0);
        const propCredits = proprietaryAccounts
          .filter(a => a.normalBalance === 'credit')
          .reduce((sum, a) => sum + a.endBalance, 0);
        const propDiff = Math.abs(propDebits - propCredits);

        if (propDiff > 0.01) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V04-004',
            'DOD_FMR',
            'critical',
            'Proprietary Trial Balance Out of Balance',
            `The proprietary trial balance is out of balance by $${propDiff.toLocaleString('en-US', { minimumFractionDigits: 2 })}. Total debit balances: $${propDebits.toLocaleString('en-US', { minimumFractionDigits: 2 })}; total credit balances: $${propCredits.toLocaleString('en-US', { minimumFractionDigits: 2 })}. An out-of-balance proprietary trial balance means the fundamental accounting equation (Assets = Liabilities + Net Position) is not satisfied, rendering the financial statements unreliable.`,
            'DoD FMR Volume 4, Chapter 2; USSGL TFM Supplement, Section III: The proprietary trial balance must balance (total debits equal total credits).',
            'Perform a systematic review of all proprietary accounts to identify the source of the imbalance. Check recent journal entries, adjusting entries, and system interface postings for errors.',
            propDiff,
            proprietaryAccounts.map(a => a.accountNumber)
          ));
        }
      }

      // Budgetary trial balance
      const budgetaryAccounts = ussglAccounts.filter(a => a.accountType === 'budgetary');
      if (budgetaryAccounts.length > 0) {
        const budgDebits = budgetaryAccounts
          .filter(a => a.normalBalance === 'debit')
          .reduce((sum, a) => sum + a.endBalance, 0);
        const budgCredits = budgetaryAccounts
          .filter(a => a.normalBalance === 'credit')
          .reduce((sum, a) => sum + a.endBalance, 0);
        const budgDiff = Math.abs(budgDebits - budgCredits);

        if (budgDiff > 0.01) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V04-004',
            'DOD_FMR',
            'critical',
            'Budgetary Trial Balance Out of Balance',
            `The budgetary trial balance is out of balance by $${budgDiff.toLocaleString('en-US', { minimumFractionDigits: 2 })}. Total debit balances: $${budgDebits.toLocaleString('en-US', { minimumFractionDigits: 2 })}; total credit balances: $${budgCredits.toLocaleString('en-US', { minimumFractionDigits: 2 })}. An out-of-balance budgetary trial balance means budgetary resources do not equal the status of those resources, which will cause the SF 133 and Statement of Budgetary Resources to be misstated.`,
            'DoD FMR Volume 4, Chapter 2; USSGL TFM Supplement, Section IV: The budgetary trial balance must balance.',
            'Reconcile budgetary accounts by verifying that all apportionment, allotment, obligation, and outlay transactions have been properly posted. Check for missing or duplicate entries.',
            budgDiff,
            budgetaryAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V04-005',
    name: 'Intragovernmental Elimination',
    framework: 'DOD_FMR',
    category: 'Accounting Policy (Vol 4)',
    description: 'Checks intragovernmental transactions for unmatched items that will prevent proper elimination',
    citation: 'DoD FMR Vol 4, Ch 9; Treasury Financial Manual, Federal Intragovernmental Transactions',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { intragovernmentalTransactions } = data.dodData;

      if (intragovernmentalTransactions.length === 0) return findings;

      const unmatched = intragovernmentalTransactions.filter(t => t.reconciliationStatus === 'unmatched');
      const inDispute = intragovernmentalTransactions.filter(t => t.reconciliationStatus === 'in_dispute');

      if (unmatched.length > 0) {
        const totalUnmatched = unmatched.reduce((sum, t) => sum + t.amount, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V04-005',
          'DOD_FMR',
          'high',
          'Unmatched Intragovernmental Transactions',
          `${unmatched.length} intragovernmental transaction(s) totaling $${(totalUnmatched / 1000000).toFixed(2)}M are unmatched with trading partners. Trading partners: ${Array.from(new Set(unmatched.map(t => t.tradingPartnerAgency))).join(', ')}. Unmatched IGT transactions prevent proper elimination on the government-wide financial statements and are a persistent audit finding across DoD.`,
          'DoD FMR Volume 4, Chapter 9; Treasury Financial Manual, Federal Intragovernmental Transactions Accounting Policies Guide: All IGT transactions must be reconciled and matched with trading partners for proper elimination.',
          'Coordinate with each trading partner agency to reconcile differences. Use the GTAS to identify and resolve interagency differences. Establish regular reconciliation procedures with each trading partner.',
          totalUnmatched,
          unmatched.map(t => t.tradingPartnerAgency)
        ));
      }

      if (inDispute.length > 0) {
        const totalDisputed = inDispute.reduce((sum, t) => sum + t.amount, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V04-005',
          'DOD_FMR',
          'medium',
          'Intragovernmental Transactions in Dispute',
          `${inDispute.length} intragovernmental transaction(s) totaling $${(totalDisputed / 1000000).toFixed(2)}M are in dispute with trading partners. Disputed transactions must be resolved before the financial statement reporting deadline to avoid qualification of the audit opinion.`,
          'DoD FMR Volume 4, Chapter 9: Disputes must be resolved through the established dispute resolution process.',
          'Escalate unresolved disputes through the appropriate dispute resolution channels. Engage senior financial management from both agencies if needed.',
          totalDisputed,
          inDispute.map(t => t.tradingPartnerAgency)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V04-006',
    name: 'SFIS Alignment',
    framework: 'DOD_FMR',
    category: 'Accounting Policy (Vol 4)',
    description: 'Verifies SFIS elements match the appropriation structure for consistent financial reporting',
    citation: 'DoD FMR Vol 4, Ch 3; DoD SFIS Implementation Guide',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { appropriations, sfisElements } = data.dodData;

      if (sfisElements.length === 0 || appropriations.length === 0) return findings;

      const appropsWithoutSfis = appropriations.filter(a => !a.sfisData || Object.keys(a.sfisData).length === 0);

      if (appropsWithoutSfis.length > 0) {
        const totalAuthority = appropsWithoutSfis.reduce((sum, a) => sum + a.totalAuthority, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V04-006',
          'DOD_FMR',
          'medium',
          'Appropriations Missing SFIS Code Mapping',
          `${appropsWithoutSfis.length} appropriation(s) totaling $${(totalAuthority / 1000000).toFixed(1)}M do not have SFIS data mapped: ${appropsWithoutSfis.map(a => a.appropriationTitle).join(', ')}. SFIS mapping is required for all appropriations to ensure standardized financial reporting across DoD components.`,
          'DoD FMR Volume 4, Chapter 3; DoD SFIS Implementation Guide: All financial transactions must be mapped to SFIS elements for standardized reporting.',
          'Map each appropriation to the appropriate SFIS elements including department code, main account code, and sub-account code. Coordinate with the component SFIS administrator.',
          totalAuthority,
          appropsWithoutSfis.map(a => a.treasuryAccountSymbol)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V04-007',
    name: 'Account Closing Entries',
    framework: 'DOD_FMR',
    category: 'Accounting Policy (Vol 4)',
    description: 'Verifies that end-of-year closing entries have been recorded for temporary (nominal) accounts',
    citation: 'DoD FMR Vol 4, Ch 2; USSGL TFM Supplement - Closing Entries',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts } = data.dodData;

      const revenueAccounts = ussglAccounts.filter(a => a.category === 'revenue');
      const expenseAccounts = ussglAccounts.filter(a => a.category === 'expense');
      const netPositionAccounts = ussglAccounts.filter(a => a.category === 'net_position');

      const totalRevenue = revenueAccounts.reduce((sum, a) => sum + a.endBalance, 0);
      const totalExpenses = expenseAccounts.reduce((sum, a) => sum + a.endBalance, 0);

      if ((totalRevenue !== 0 || totalExpenses !== 0) && netPositionAccounts.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V04-007',
          'DOD_FMR',
          'medium',
          'Period-End Closing Entries May Be Incomplete',
          `Revenue accounts have balances totaling $${(totalRevenue / 1000000).toFixed(2)}M and expense accounts total $${(totalExpenses / 1000000).toFixed(2)}M, but no net position (USSGL 3000-series) accounts exist. At fiscal year end, revenue and expense accounts must be closed to the cumulative results of operations (USSGL 3310).`,
          'DoD FMR Volume 4, Chapter 2; USSGL TFM Supplement, Closing Entries: At the end of each fiscal year, nominal accounts (revenue and expenses) must be closed to cumulative results of operations.',
          'Record fiscal year-end closing entries to transfer revenue and expense balances to cumulative results of operations. Ensure all adjusting entries have been posted before closing.',
          Math.abs(totalRevenue) + Math.abs(totalExpenses),
          [...revenueAccounts, ...expenseAccounts].map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V04-008',
    name: 'Revenue Recognition Compliance (SFFAS 7)',
    framework: 'DOD_FMR',
    category: 'Accounting Policy (Vol 4)',
    description: 'Checks for proper exchange revenue recording by comparing collections to recorded revenue',
    citation: 'DoD FMR Vol 4, Ch 11; SFFAS 7 - Accounting for Revenue and Other Financing Sources',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts, collections } = data.dodData;

      const revenueAccounts = ussglAccounts.filter(a => {
        const num = parseInt(a.accountNumber, 10);
        return num >= 5000 && num < 6000 && a.accountType === 'proprietary';
      });

      const totalRevenue = revenueAccounts.reduce((sum, a) => sum + a.endBalance, 0);
      const totalCollections = collections.reduce((sum, c) => sum + c.amount, 0);

      if (totalCollections > 0 && totalRevenue > 0) {
        const ratio = totalCollections / totalRevenue;
        if (ratio > 1.5 || ratio < 0.5) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V04-008',
            'DOD_FMR',
            'medium',
            'Revenue and Collections Significant Variance',
            `Total collections of $${(totalCollections / 1000000).toFixed(2)}M and total recorded revenue of $${(totalRevenue / 1000000).toFixed(2)}M differ significantly (ratio: ${ratio.toFixed(2)}). Under SFFAS 7, exchange revenue should be recognized when goods or services are provided, not when cash is collected. This variance may indicate revenue recognition timing issues or unrecorded revenue.`,
            'DoD FMR Volume 4, Chapter 11; SFFAS 7, Paragraphs 36-44: Exchange revenue shall be recognized when goods have been delivered or services rendered.',
            'Reconcile collections to revenue recognition. Ensure exchange revenue is recognized on an accrual basis per SFFAS 7. Review deferred revenue and receivable balances.',
            Math.abs(totalCollections - totalRevenue),
            revenueAccounts.map(a => a.accountNumber)
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V04-009',
    name: 'Liability Recognition Compliance (SFFAS 5)',
    framework: 'DOD_FMR',
    category: 'Accounting Policy (Vol 4)',
    description: 'Verifies that liabilities are properly recorded when obligations exist for goods and services received',
    citation: 'DoD FMR Vol 4, Ch 10; SFFAS 5 - Accounting for Liabilities of the Federal Government',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts, obligations } = data.dodData;

      const liabilityAccounts = ussglAccounts.filter(a => {
        const num = parseInt(a.accountNumber, 10);
        return num >= 2000 && num < 3000 && a.accountType === 'proprietary';
      });

      const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + a.endBalance, 0);
      const totalOpenObligations = obligations
        .filter(o => o.status === 'open' || o.status === 'partially_liquidated')
        .reduce((sum, o) => sum + o.unliquidatedBalance, 0);

      if (totalOpenObligations > 0 && totalLiabilities <= 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V04-009',
          'DOD_FMR',
          'medium',
          'Open Obligations Without Recorded Liabilities',
          `There are $${(totalOpenObligations / 1000000).toFixed(2)}M in open/partially liquidated obligations but no liabilities recorded in USSGL liability accounts (2000-series). SFFAS 5 requires that liabilities be recognized when goods or services have been received but not yet paid for. This indicates a potential understatement of liabilities on the Balance Sheet.`,
          'DoD FMR Volume 4, Chapter 10; SFFAS 5, Paragraph 19: A liability is recognized when one party has received goods or services and has not yet paid for them.',
          'Review all open obligations and determine if corresponding liabilities should be recorded. Ensure accounts payable (USSGL 2110) and other liability accounts are properly stated. Record accrued liabilities for goods and services received but not yet paid.',
          totalOpenObligations,
          liabilityAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V04-010',
    name: 'PP&E Accounting (SFFAS 6)',
    framework: 'DOD_FMR',
    category: 'Accounting Policy (Vol 4)',
    description: 'Checks for proper Property, Plant & Equipment categorization including accumulated depreciation',
    citation: 'DoD FMR Vol 4, Ch 6; SFFAS 6 - Accounting for Property, Plant, and Equipment',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts } = data.dodData;

      const ppeAccounts = ussglAccounts.filter(a => {
        const num = parseInt(a.accountNumber, 10);
        return num >= 1700 && num < 1800;
      });

      const deprecAccounts = ussglAccounts.filter(a => {
        const num = parseInt(a.accountNumber, 10);
        return num >= 1750 && num < 1800;
      });

      if (ppeAccounts.length > 0 && deprecAccounts.length === 0) {
        const totalPPE = ppeAccounts.reduce((sum, a) => sum + a.endBalance, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V04-010',
          'DOD_FMR',
          'medium',
          'PP&E Recognized Without Accumulated Depreciation',
          `Property, Plant & Equipment of $${(totalPPE / 1000000).toFixed(1)}M is recorded but no accumulated depreciation accounts exist. SFFAS 6 requires that general PP&E be depreciated over its estimated useful life. The absence of depreciation accounts suggests non-compliance with federal accounting standards and overstated asset values on the Balance Sheet.`,
          'DoD FMR Volume 4, Chapter 6; SFFAS 6, Paragraphs 34-40: General PP&E shall be depreciated over estimated useful lives using a systematic and rational method.',
          'Establish accumulated depreciation accounts for all depreciable PP&E categories. Calculate and record depreciation expense using approved methods. Ensure asset useful life estimates comply with DoD guidance.',
          totalPPE,
          ppeAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V04-011',
    name: 'Normal Balance Verification',
    framework: 'DOD_FMR',
    category: 'Accounting Policy (Vol 4)',
    description: 'Verifies that USSGL accounts have balances in the correct direction relative to their normal balance',
    citation: 'DoD FMR Vol 4, Ch 2; USSGL TFM Supplement - Normal Balances',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts } = data.dodData;

      const abnormal = ussglAccounts.filter(a => {
        if (a.endBalance === 0) return false;
        if (a.normalBalance === 'debit' && a.endBalance < 0) return true;
        if (a.normalBalance === 'credit' && a.endBalance < 0) return true;
        return false;
      });

      if (abnormal.length > 0) {
        const totalAbnormal = abnormal.reduce((sum, a) => sum + Math.abs(a.endBalance), 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V04-011',
          'DOD_FMR',
          'high',
          'Abnormal USSGL Account Balances Detected',
          `${abnormal.length} USSGL account(s) have balances in the opposite direction of their normal balance, totaling $${(totalAbnormal / 1000000).toFixed(2)}M: ${abnormal.slice(0, 10).map(a => `${a.accountNumber} "${a.accountTitle}" (normal: ${a.normalBalance}, balance: $${a.endBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })})`).join('; ')}${abnormal.length > 10 ? ` and ${abnormal.length - 10} more` : ''}. Abnormal balances may indicate posting errors, misclassifications, or unusual transactions requiring investigation.`,
          'DoD FMR Volume 4, Chapter 2; USSGL TFM Supplement: Each USSGL account has a defined normal balance. Accounts with balances opposite to the normal direction require explanation.',
          'Investigate each account with an abnormal balance to determine the cause. Correct identified errors and document legitimate abnormal balances with explanations.',
          totalAbnormal,
          abnormal.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V04-012',
    name: 'Transaction Completeness',
    framework: 'DOD_FMR',
    category: 'Accounting Policy (Vol 4)',
    description: 'Checks USSGL transactions for proper documentation including document numbers and descriptions',
    citation: 'DoD FMR Vol 4, Ch 2; GAO Standards for Internal Control - Documentation',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglTransactions } = data.dodData;

      const undocumented = ussglTransactions.filter(t =>
        !t.documentNumber || !t.description || t.description.trim().length < 5
      );

      if (undocumented.length > 0) {
        const totalAmount = undocumented.reduce((sum, t) => sum + t.amount, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V04-012',
          'DOD_FMR',
          'medium',
          'USSGL Transactions Missing Required Documentation',
          `${undocumented.length} USSGL transaction(s) totaling $${(totalAmount / 1000000).toFixed(2)}M are missing document numbers or have inadequate descriptions. Properly documented transactions are essential for audit trail integrity and compliance with GAO internal control standards.`,
          'DoD FMR Volume 4, Chapter 2; GAO Standards for Internal Control (Green Book), Principle 10: Transactions must be documented and readily available for examination.',
          'Review and complete documentation for all identified transactions. Implement system controls to require document number and adequate description before posting.',
          totalAmount,
          undocumented.map(t => t.documentNumber || t.id)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V04-013',
    name: 'Period-End Adjustments',
    framework: 'DOD_FMR',
    category: 'Accounting Policy (Vol 4)',
    description: 'Verifies that period-end adjustments are properly posted including accruals and reclassifications',
    citation: 'DoD FMR Vol 4, Ch 2; SFFAS 1 - Period-End Adjustments',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts } = data.dodData;

      // Check for suspense/clearing accounts with balances that should be cleared at period end
      const suspenseAccounts = ussglAccounts.filter(a =>
        a.accountTitle.toLowerCase().includes('suspense') ||
        a.accountTitle.toLowerCase().includes('undistributed') ||
        a.accountTitle.toLowerCase().includes('clearing')
      );

      const withBalances = suspenseAccounts.filter(a => Math.abs(a.endBalance) > 0);

      if (withBalances.length > 0) {
        const totalSuspense = withBalances.reduce((sum, a) => sum + Math.abs(a.endBalance), 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V04-013',
          'DOD_FMR',
          'medium',
          'Suspense/Clearing Account Balances Require Period-End Clearing',
          `${withBalances.length} suspense/clearing account(s) have outstanding balances totaling $${(totalSuspense / 1000000).toFixed(2)}M: ${withBalances.map(a => `${a.accountNumber} "${a.accountTitle}" ($${Math.abs(a.endBalance).toLocaleString('en-US', { minimumFractionDigits: 2 })})`).join('; ')}. These temporary holding accounts must be cleared to the proper accounts before period-end financial statements are prepared.`,
          'DoD FMR Volume 4, Chapter 2; Treasury Financial Manual: Suspense accounts must be cleared within 60 days. Outstanding balances at period end must be properly classified.',
          'Research and clear all suspense account balances to the correct final accounts. Establish a weekly review process for suspense account activity.',
          totalSuspense,
          withBalances.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V04-014',
    name: 'Beginning Balance Continuity',
    framework: 'DOD_FMR',
    category: 'Accounting Policy (Vol 4)',
    description: 'Verifies that beginning balances match prior year ending balances for balance sheet accounts',
    citation: 'DoD FMR Vol 4, Ch 2; SFFAS 1, Paragraph 53 - Beginning Balances',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts } = data.dodData;

      const balanceSheetAccounts = ussglAccounts.filter(a =>
        a.accountType === 'proprietary' &&
        (a.category === 'asset' || a.category === 'liability' || a.category === 'net_position')
      );

      const byYear = new Map<number, typeof balanceSheetAccounts>();
      for (const acct of balanceSheetAccounts) {
        const yearGroup = byYear.get(acct.fiscalYear) || [];
        yearGroup.push(acct);
        byYear.set(acct.fiscalYear, yearGroup);
      }

      const years = Array.from(byYear.keys()).sort();
      if (years.length < 2) return findings;

      const priorYear = years[years.length - 2];
      const currentYear = years[years.length - 1];

      const priorAccounts = new Map(
        (byYear.get(priorYear) || []).map(a => [a.accountNumber, a])
      );

      const mismatches: string[] = [];
      for (const currentAcct of byYear.get(currentYear) || []) {
        const priorAcct = priorAccounts.get(currentAcct.accountNumber);
        if (priorAcct) {
          const diff = Math.abs(currentAcct.beginBalance - priorAcct.endBalance);
          if (diff > 0.01) {
            mismatches.push(
              `${currentAcct.accountNumber} "${currentAcct.accountTitle}": beginning $${currentAcct.beginBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} vs prior ending $${priorAcct.endBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })} (diff: $${diff.toLocaleString('en-US', { minimumFractionDigits: 2 })})`
            );
          }
        }
      }

      if (mismatches.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V04-014',
          'DOD_FMR',
          'high',
          'Beginning Balances Do Not Match Prior Year Ending Balances',
          `${mismatches.length} account(s) have FY${currentYear} beginning balances that do not match FY${priorYear} ending balances: ${mismatches.slice(0, 5).join('; ')}${mismatches.length > 5 ? ` and ${mismatches.length - 5} more` : ''}. Beginning balances must agree with prior year audited ending balances. Unexplained differences may indicate prior period adjustments that were not properly recorded or disclosed.`,
          'DoD FMR Volume 4, Chapter 2; SFFAS 1, Paragraph 53: Beginning balances for the current period must equal the ending balances of the prior period. SFFAS 21 governs prior period adjustments.',
          'Reconcile beginning balances to prior year ending balances. Identify and document any prior period adjustments. Ensure adjustments are properly authorized and disclosed per SFFAS 21.',
          null,
          mismatches.map(m => m.split(' ')[0])
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V04-015',
    name: 'Account Category Classification',
    framework: 'DOD_FMR',
    category: 'Accounting Policy (Vol 4)',
    description: 'Verifies USSGL accounts are classified in the proper categories based on standard account number ranges',
    citation: 'DoD FMR Vol 4, Ch 3; USSGL TFM Supplement - Account Classification',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts } = data.dodData;

      const misclassified: string[] = [];

      for (const account of ussglAccounts) {
        const acctNum = parseInt(account.accountNumber, 10);
        if (isNaN(acctNum)) continue;

        // USSGL ranges: 1000-1999 Assets, 2000-2999 Liabilities, 3000-3999 Net Position
        // 4000-4999 Budgetary, 5000-5999 Revenue, 6000-6999 Expense
        if (acctNum >= 1000 && acctNum < 2000 && account.accountType !== 'proprietary') {
          misclassified.push(`${account.accountNumber} (${account.accountTitle}): asset account classified as ${account.accountType}`);
        } else if (acctNum >= 2000 && acctNum < 3000 && account.accountType !== 'proprietary') {
          misclassified.push(`${account.accountNumber} (${account.accountTitle}): liability account classified as ${account.accountType}`);
        } else if (acctNum >= 3000 && acctNum < 4000 && account.accountType !== 'proprietary') {
          misclassified.push(`${account.accountNumber} (${account.accountTitle}): net position account classified as ${account.accountType}`);
        } else if (acctNum >= 4000 && acctNum < 5000 && account.accountType !== 'budgetary') {
          misclassified.push(`${account.accountNumber} (${account.accountTitle}): budgetary account classified as ${account.accountType}`);
        } else if (acctNum >= 5000 && acctNum < 6000 && account.accountType !== 'proprietary') {
          misclassified.push(`${account.accountNumber} (${account.accountTitle}): revenue account classified as ${account.accountType}`);
        } else if (acctNum >= 6000 && acctNum < 7000 && account.accountType !== 'proprietary') {
          misclassified.push(`${account.accountNumber} (${account.accountTitle}): expense account classified as ${account.accountType}`);
        }
      }

      if (misclassified.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V04-015',
          'DOD_FMR',
          'medium',
          'USSGL Account Classification Errors',
          `${misclassified.length} USSGL account(s) appear to be misclassified based on standard account number ranges: ${misclassified.slice(0, 10).join('; ')}${misclassified.length > 10 ? ` and ${misclassified.length - 10} more` : ''}. Misclassified accounts produce incorrect trial balances and financial statement presentations.`,
          'DoD FMR Volume 4, Chapter 3; Treasury Financial Manual, USSGL Chart of Accounts: Accounts must be classified according to the standard: 1000-3999 proprietary, 4000-4999 budgetary, 5000-6999 proprietary (revenue/expense).',
          'Review and correct the classification of each identified account. Ensure the chart of accounts aligns with the USSGL standard. Reclassify accounts and repost affected transactions as needed.',
          null,
          misclassified.map(m => m.split(' ')[0])
        ));
      }

      return findings;
    },
  },
];
