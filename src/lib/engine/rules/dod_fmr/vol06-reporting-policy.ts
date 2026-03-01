import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '@/lib/engine/rule-runner';

export const reportingPolicyRules: AuditRule[] = [
  {
    id: 'DOD-FMR-V06-001',
    name: 'SF-133 Data Completeness',
    framework: 'DOD_FMR',
    category: 'Reporting Policy (Vol 6)',
    description: 'Verifies that SF-133 Report on Budget Execution data exists and has required sections populated',
    citation: 'DoD FMR Vol 6, Ch 2; OMB Circular A-11, Section 130 - SF 133 Requirements',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { appropriations } = data.dodData;

      // Check if basic budgetary data exists to support SF-133 preparation
      if (appropriations.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V06-001',
          'DOD_FMR',
          'high',
          'No Appropriation Data Available for SF-133 Reporting',
          'No appropriation data exists for this engagement. The SF-133, Report on Budget Execution and Budgetary Resources, requires appropriation-level data including total authority, obligations, unobligated balances, and outlays. Without this data, the SF-133 cannot be prepared.',
          'DoD FMR Volume 6, Chapter 2; OMB Circular A-11, Section 130: Agencies must prepare the SF-133 for each Treasury Account Symbol.',
          'Establish appropriation records with all required budgetary data. Ensure total authority, apportionments, obligations, and unobligated balances are properly recorded for each TAS.',
          null,
          []
        ));
        return findings;
      }

      // Check for appropriations missing critical SF-133 data elements
      const incomplete = appropriations.filter(a =>
        a.totalAuthority === 0 && a.obligated === 0 && a.unobligatedBalance === 0
      );

      if (incomplete.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V06-001',
          'DOD_FMR',
          'medium',
          'Appropriations with No Budgetary Activity for SF-133',
          `${incomplete.length} appropriation(s) have zero values for total authority, obligations, and unobligated balance: ${incomplete.map(a => `"${a.appropriationTitle}" (TAS: ${a.treasuryAccountSymbol})`).join(', ')}. These accounts may not have been properly established or may be missing data needed for SF-133 reporting.`,
          'DoD FMR Volume 6, Chapter 2; OMB Circular A-11, Section 130: All Treasury Account Symbols must be reported on the SF-133 with accurate budgetary data.',
          'Verify that all appropriation accounts are properly established and that budgetary data has been posted. Investigate accounts with no activity to determine if they are still active.',
          null,
          incomplete.map(a => a.treasuryAccountSymbol)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V06-002',
    name: 'SF-133 Balance Verification',
    framework: 'DOD_FMR',
    category: 'Reporting Policy (Vol 6)',
    description: 'Checks that total budgetary resources equals the sum of component budgetary resource amounts',
    citation: 'DoD FMR Vol 6, Ch 2; OMB Circular A-11, Section 130 - SF 133 Edit Checks',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { appropriations } = data.dodData;

      for (const approp of appropriations) {
        // Total budgetary resources should equal obligations + unobligated balance
        const computedTotal = approp.obligated + approp.unobligatedBalance;
        const difference = Math.abs(approp.totalAuthority - computedTotal);

        if (difference > 0.01 && approp.totalAuthority > 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V06-002',
            'DOD_FMR',
            'high',
            'SF-133 Budgetary Resources Do Not Balance',
            `Appropriation "${approp.appropriationTitle}" (TAS: ${approp.treasuryAccountSymbol}): Total budgetary resources ($${(approp.totalAuthority / 1000000).toFixed(2)}M) does not equal obligations ($${(approp.obligated / 1000000).toFixed(2)}M) plus unobligated balance ($${(approp.unobligatedBalance / 1000000).toFixed(2)}M = $${(computedTotal / 1000000).toFixed(2)}M). Difference: $${(difference / 1000000).toFixed(4)}M. This will cause the SF-133 Section I to not balance with Sections II and III.`,
            'DoD FMR Volume 6, Chapter 2; OMB Circular A-11, Section 130: Total budgetary resources (Section I) must equal the status of budgetary resources (Section II) on the SF-133.',
            'Reconcile total budgetary resources to the sum of obligations and unobligated balance. Identify the source of the difference and correct the affected amounts.',
            difference,
            [approp.treasuryAccountSymbol]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V06-003',
    name: 'GTAS Reconciliation',
    framework: 'DOD_FMR',
    category: 'Reporting Policy (Vol 6)',
    description: 'Verifies that USSGL account balances reconcile with appropriation-level records for GTAS reporting',
    citation: 'DoD FMR Vol 6, Ch 2; Treasury GTAS Requirements',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts, appropriations } = data.dodData;

      if (ussglAccounts.length === 0 || appropriations.length === 0) return findings;

      // Compare budgetary USSGL totals to appropriation totals
      const budgetaryAccounts = ussglAccounts.filter(a => a.accountType === 'budgetary');
      const ussglBudgetaryTotal = budgetaryAccounts.reduce((sum, a) => sum + Math.abs(a.endBalance), 0);
      const appTotalAuthority = appropriations.reduce((sum, a) => sum + a.totalAuthority, 0);

      // These should be related but won't match exactly; check for gross discrepancy
      if (ussglBudgetaryTotal > 0 && appTotalAuthority > 0) {
        const ratio = ussglBudgetaryTotal / appTotalAuthority;
        if (ratio < 0.5 || ratio > 2.0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V06-003',
            'DOD_FMR',
            'high',
            'USSGL Budgetary Accounts and Appropriation Records Materially Inconsistent',
            `USSGL budgetary account balances (total: $${(ussglBudgetaryTotal / 1000000).toFixed(2)}M) are materially inconsistent with appropriation-level total authority ($${(appTotalAuthority / 1000000).toFixed(2)}M), ratio: ${ratio.toFixed(2)}. These data sources must reconcile for accurate GTAS submissions to Treasury. Material inconsistencies indicate systemic reconciliation failures.`,
            'DoD FMR Volume 6, Chapter 2; Treasury GTAS Requirements: USSGL trial balance data submitted to GTAS must reconcile with appropriation-level budgetary data.',
            'Perform a comprehensive reconciliation between USSGL budgetary accounts and appropriation records. Identify and resolve all discrepancies before the GTAS submission deadline.',
            Math.abs(ussglBudgetaryTotal - appTotalAuthority),
            []
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V06-004',
    name: 'Trial Balance with Treasury',
    framework: 'DOD_FMR',
    category: 'Reporting Policy (Vol 6)',
    description: 'Verifies that USSGL accounts are in balance as required for Treasury reporting via GTAS',
    citation: 'DoD FMR Vol 6, Ch 2; Treasury Financial Manual - GTAS Adjusted Trial Balance',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { fiarAssessments } = data.dodData;

      const unreconciled = fiarAssessments.filter(a => !a.fundBalanceReconciled);

      if (unreconciled.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V06-004',
          'DOD_FMR',
          'critical',
          'Fund Balance Not Reconciled with Treasury',
          `${unreconciled.length} FIAR assessment(s) indicate fund balances have not been reconciled with Treasury records (assessments dated: ${unreconciled.map(a => a.assessmentDate).join(', ')}). Fund Balance with Treasury (FBWT) is the single largest line item on the DoD balance sheet. An unreconciled FBWT is a pervasive finding that affects the reliability of all financial statements and GTAS submissions.`,
          'DoD FMR Volume 6, Chapter 2; Treasury Financial Manual: Agencies must reconcile fund balances with Treasury monthly via GTAS. SFFAS 1: FBWT must be reported accurately.',
          'Perform a complete reconciliation of FBWT by comparing agency records to Treasury account statements. Identify and resolve all reconciling differences. Implement monthly reconciliation procedures with documented review and approval.',
          null,
          []
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V06-005',
    name: 'Variance Analysis',
    framework: 'DOD_FMR',
    category: 'Reporting Policy (Vol 6)',
    description: 'Checks for material variances between beginning and ending balances that require explanation',
    citation: 'DoD FMR Vol 6, Ch 4; SFFAS 27 - Identifying and Reporting Differences',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts } = data.dodData;

      const balanceSheetAccounts = ussglAccounts.filter(a =>
        a.accountType === 'proprietary' &&
        (a.category === 'asset' || a.category === 'liability' || a.category === 'net_position')
      );

      const materialVariances: string[] = [];

      for (const account of balanceSheetAccounts) {
        if (account.beginBalance === 0) continue;
        const change = account.endBalance - account.beginBalance;
        const changePct = Math.abs(change / account.beginBalance);

        // Flag variances greater than 50% as potentially requiring disclosure
        if (changePct > 0.50 && Math.abs(change) > 100000) {
          materialVariances.push(
            `${account.accountNumber} "${account.accountTitle}": ${(changePct * 100).toFixed(1)}% change ($${(change / 1000000).toFixed(2)}M)`
          );
        }
      }

      if (materialVariances.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V06-005',
          'DOD_FMR',
          'medium',
          'Material Balance Sheet Variances Require Explanation',
          `${materialVariances.length} balance sheet account(s) have material period-over-period variances exceeding 50%: ${materialVariances.slice(0, 5).join('; ')}${materialVariances.length > 5 ? ` and ${materialVariances.length - 5} more` : ''}. Material variances must be analyzed and explained in the financial statement notes to provide meaningful information to readers and auditors.`,
          'DoD FMR Volume 6, Chapter 4; SFFAS 27: Significant differences between reported amounts and expected amounts must be identified and explained.',
          'Analyze each material variance to determine the cause (new programs, policy changes, corrections, unusual transactions). Document variance explanations for the financial statement notes and management discussion.',
          null,
          materialVariances.map(v => v.split(' ')[0])
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V06-006',
    name: 'Financial Statement Completeness',
    framework: 'DOD_FMR',
    category: 'Reporting Policy (Vol 6)',
    description: 'Verifies that all required SFFAS account categories exist to support a complete set of financial statements',
    citation: 'DoD FMR Vol 6, Ch 1; SFFAS 1 - Required Financial Statements',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts } = data.dodData;

      if (ussglAccounts.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V06-006',
          'DOD_FMR',
          'high',
          'No USSGL Accounts Available for Financial Statement Preparation',
          'No USSGL account data exists. A complete set of federal financial statements requires proprietary accounts (assets, liabilities, net position, revenue, expense) and budgetary accounts. Without USSGL data, financial statements cannot be prepared.',
          'DoD FMR Volume 6, Chapter 1; SFFAS 1: Federal entities must prepare a Balance Sheet, Statement of Net Cost, Statement of Changes in Net Position, and Statement of Budgetary Resources.',
          'Establish a complete USSGL chart of accounts covering all required financial statement categories.',
          null,
          []
        ));
        return findings;
      }

      const proprietaryCategories = new Set(
        ussglAccounts.filter(a => a.accountType === 'proprietary').map(a => a.category)
      );
      const hasBudgetary = ussglAccounts.some(a => a.accountType === 'budgetary');

      const missingStatements: string[] = [];
      if (!proprietaryCategories.has('asset') || !proprietaryCategories.has('liability')) {
        missingStatements.push('Balance Sheet (missing assets or liabilities)');
      }
      if (!proprietaryCategories.has('expense')) {
        missingStatements.push('Statement of Net Cost (missing expense accounts)');
      }
      if (!proprietaryCategories.has('net_position')) {
        missingStatements.push('Statement of Changes in Net Position (missing net position accounts)');
      }
      if (!hasBudgetary) {
        missingStatements.push('Statement of Budgetary Resources (missing budgetary accounts)');
      }

      if (missingStatements.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V06-006',
          'DOD_FMR',
          'medium',
          'Incomplete Account Structure for Required Financial Statements',
          `The USSGL chart of accounts is missing categories needed for ${missingStatements.length} required financial statement(s): ${missingStatements.join('; ')}. Federal entities must prepare all four principal financial statements per SFFAS 1.`,
          'DoD FMR Volume 6, Chapter 1; SFFAS 1: Federal financial statements include the Balance Sheet, Statement of Net Cost, Statement of Changes in Net Position, and Statement of Budgetary Resources.',
          'Establish the missing account categories in the USSGL chart of accounts to support preparation of all required financial statements.',
          null,
          []
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V06-007',
    name: 'Note Disclosure Requirements',
    framework: 'DOD_FMR',
    category: 'Reporting Policy (Vol 6)',
    description: 'Checks for material items that may require note disclosure in the financial statements',
    citation: 'DoD FMR Vol 6, Ch 5; SFFAS 1 - Note Disclosures',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts, adaViolations, intragovernmentalTransactions } = data.dodData;

      const disclosureItems: string[] = [];

      // Check for ADA violations requiring disclosure
      const confirmedViolations = adaViolations.filter(v => v.investigationStatus === 'confirmed');
      if (confirmedViolations.length > 0) {
        const totalAmount = confirmedViolations.reduce((sum, v) => sum + v.amount, 0);
        disclosureItems.push(`${confirmedViolations.length} confirmed Antideficiency Act violation(s) totaling $${(totalAmount / 1000000).toFixed(2)}M`);
      }

      // Check for significant IGT differences
      const unmatchedIGT = intragovernmentalTransactions.filter(t => t.reconciliationStatus === 'unmatched');
      if (unmatchedIGT.length > 0) {
        const totalUnmatched = unmatchedIGT.reduce((sum, t) => sum + t.amount, 0);
        if (totalUnmatched > 1000000) {
          disclosureItems.push(`$${(totalUnmatched / 1000000).toFixed(2)}M in unreconciled intragovernmental transactions`);
        }
      }

      // Check for material suspense balances
      const suspenseAccounts = ussglAccounts.filter(a =>
        (a.accountTitle.toLowerCase().includes('suspense') ||
         a.accountTitle.toLowerCase().includes('clearing')) &&
        Math.abs(a.endBalance) > 100000
      );
      if (suspenseAccounts.length > 0) {
        const totalSuspense = suspenseAccounts.reduce((sum, a) => sum + Math.abs(a.endBalance), 0);
        disclosureItems.push(`$${(totalSuspense / 1000000).toFixed(2)}M in material suspense/clearing account balances`);
      }

      if (disclosureItems.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V06-007',
          'DOD_FMR',
          'medium',
          'Material Items Requiring Financial Statement Note Disclosure',
          `${disclosureItems.length} item(s) have been identified that likely require note disclosure in the financial statements: ${disclosureItems.join('; ')}. SFFAS 1 and other standards require disclosure of significant accounting policies, contingencies, commitments, and other material information.`,
          'DoD FMR Volume 6, Chapter 5; SFFAS 1, Paragraphs 72-76: Financial statements must include notes that provide information necessary for a fair presentation.',
          'Ensure each identified item is properly disclosed in the financial statement notes. Coordinate with the audit team to confirm disclosure adequacy.',
          null,
          []
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V06-008',
    name: 'Budgetary Resources Consistency',
    framework: 'DOD_FMR',
    category: 'Reporting Policy (Vol 6)',
    description: 'Verifies that the SF-133 status section sums to total budgetary resources across all appropriations',
    citation: 'DoD FMR Vol 6, Ch 2; OMB Circular A-11, Section 130 - SF 133 Edit Checks',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { appropriations } = data.dodData;

      const currentApprops = appropriations.filter(a => a.status === 'current');
      if (currentApprops.length === 0) return findings;

      const totalAuthority = currentApprops.reduce((sum, a) => sum + a.totalAuthority, 0);
      const totalObligated = currentApprops.reduce((sum, a) => sum + a.obligated, 0);
      const totalUnobligated = currentApprops.reduce((sum, a) => sum + a.unobligatedBalance, 0);
      const statusTotal = totalObligated + totalUnobligated;

      const difference = Math.abs(totalAuthority - statusTotal);

      if (difference > 0.01) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V06-008',
          'DOD_FMR',
          'high',
          'Aggregate Budgetary Resources Inconsistency',
          `Across all ${currentApprops.length} current appropriations, total budgetary resources ($${(totalAuthority / 1000000).toFixed(2)}M) do not equal the sum of obligations ($${(totalObligated / 1000000).toFixed(2)}M) plus unobligated balance ($${(totalUnobligated / 1000000).toFixed(2)}M = $${(statusTotal / 1000000).toFixed(2)}M). Aggregate difference: $${(difference / 1000000).toFixed(4)}M. This inconsistency will cause the Statement of Budgetary Resources to be out of balance.`,
          'DoD FMR Volume 6, Chapter 2; OMB Circular A-11, Section 130: Total budgetary resources must equal the status of budgetary resources on the SF-133 and Statement of Budgetary Resources.',
          'Identify the appropriations causing the imbalance. Reconcile each appropriation individually and correct discrepancies.',
          difference,
          []
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V06-009',
    name: 'Outlay Calculation Accuracy',
    framework: 'DOD_FMR',
    category: 'Reporting Policy (Vol 6)',
    description: 'Verifies that net outlays can be properly computed from disbursement and collection data',
    citation: 'DoD FMR Vol 6, Ch 2; OMB Circular A-11, Section 130 - Outlays',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { appropriations, disbursements, collections } = data.dodData;

      const totalDisbursed = appropriations.reduce((sum, a) => sum + a.disbursed, 0);
      const totalDisbursementRecords = disbursements
        .filter(d => d.status !== 'cancelled' && d.status !== 'returned')
        .reduce((sum, d) => sum + d.amount, 0);

      if (totalDisbursed > 0 && totalDisbursementRecords > 0) {
        const difference = Math.abs(totalDisbursed - totalDisbursementRecords);
        const tolerance = totalDisbursed * 0.05;

        if (difference > tolerance) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V06-009',
            'DOD_FMR',
            'medium',
            'Outlay Data Inconsistency Between Appropriations and Disbursements',
            `Total disbursed amounts from appropriation records ($${(totalDisbursed / 1000000).toFixed(2)}M) differ from the sum of disbursement transaction records ($${(totalDisbursementRecords / 1000000).toFixed(2)}M) by $${(difference / 1000000).toFixed(2)}M. This exceeds the 5% tolerance threshold and indicates a reconciliation issue that will affect net outlay calculations on the SF-133 and Statement of Budgetary Resources.`,
            'DoD FMR Volume 6, Chapter 2; OMB Circular A-11, Section 130: Net outlays must be accurately computed as gross outlays minus offsetting collections.',
            'Reconcile appropriation-level disbursement totals to the underlying disbursement transaction records. Identify and correct the source of discrepancies.',
            difference,
            []
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V06-010',
    name: 'Intragovernmental Differences',
    framework: 'DOD_FMR',
    category: 'Reporting Policy (Vol 6)',
    description: 'Flags significant unreconciled intragovernmental transaction amounts that affect government-wide reporting',
    citation: 'DoD FMR Vol 6, Ch 8; Treasury Financial Manual - Intragovernmental Reporting',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { intragovernmentalTransactions } = data.dodData;

      if (intragovernmentalTransactions.length === 0) return findings;

      // Group by trading partner and check for net differences
      const byPartner = new Map<string, { buyerTotal: number; sellerTotal: number }>();
      for (const txn of intragovernmentalTransactions) {
        const key = txn.tradingPartnerAgency;
        if (!byPartner.has(key)) {
          byPartner.set(key, { buyerTotal: 0, sellerTotal: 0 });
        }
        const group = byPartner.get(key)!;
        if (txn.buyerSellerIndicator === 'buyer') {
          group.buyerTotal += txn.amount;
        } else {
          group.sellerTotal += txn.amount;
        }
      }

      const significantDiffs: Array<{ partner: string; diff: number }> = [];
      for (const [partner, amounts] of Array.from(byPartner.entries())) {
        if (amounts.buyerTotal > 0 && amounts.sellerTotal > 0) {
          const diff = Math.abs(amounts.buyerTotal - amounts.sellerTotal);
          if (diff > 100000) {
            significantDiffs.push({ partner, diff });
          }
        }
      }

      if (significantDiffs.length > 0) {
        const totalDiff = significantDiffs.reduce((sum, d) => sum + d.diff, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V06-010',
          'DOD_FMR',
          'high',
          'Significant Intragovernmental Differences by Trading Partner',
          `${significantDiffs.length} trading partner relationship(s) have significant buyer/seller amount differences totaling $${(totalDiff / 1000000).toFixed(2)}M: ${significantDiffs.slice(0, 5).map(d => `${d.partner}: $${(d.diff / 1000000).toFixed(2)}M difference`).join('; ')}${significantDiffs.length > 5 ? ` and ${significantDiffs.length - 5} more` : ''}. These differences prevent proper elimination on the government-wide financial statements and are reported to Treasury through the GTAS.`,
          'DoD FMR Volume 6, Chapter 8; Treasury Financial Manual: Intragovernmental differences must be reported and resolved. Material differences are disclosed in the government-wide financial statements.',
          'Engage with each trading partner to reconcile differences. Prioritize the largest differences. Establish monthly reconciliation schedules and escalation procedures for unresolved items.',
          totalDiff,
          significantDiffs.map(d => d.partner)
        ));
      }

      return findings;
    },
  },
];
