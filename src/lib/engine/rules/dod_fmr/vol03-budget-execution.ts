import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '@/lib/engine/rule-runner';

export const budgetExecutionRules: AuditRule[] = [
  {
    id: 'DOD-FMR-V03-001',
    name: 'Apportionment Compliance',
    framework: 'DOD_FMR',
    category: 'Budget Execution (Vol 3)',
    description: 'Detects appropriations where obligations exceed the apportioned amount, a potential Antideficiency Act violation',
    citation: 'DoD FMR Vol 3, Ch 2; 31 U.S.C. § 1517(a) - Apportionment Limitations',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { appropriations } = data.dodData;

      for (const approp of appropriations) {
        if (approp.apportioned > 0 && approp.obligated > approp.apportioned) {
          const excess = approp.obligated - approp.apportioned;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V03-001',
            'DOD_FMR',
            'critical',
            'Obligations Exceed Apportionment',
            `Appropriation "${approp.appropriationTitle}" (TAS: ${approp.treasuryAccountSymbol}) has obligations of $${(approp.obligated / 1000000).toFixed(2)}M exceeding the apportioned amount of $${(approp.apportioned / 1000000).toFixed(2)}M by $${(excess / 1000000).toFixed(2)}M. This is a potential violation of 31 U.S.C. § 1517(a) and the Antideficiency Act, which prohibits obligating in excess of an apportionment.`,
            'DoD FMR Volume 3, Chapter 2; 31 U.S.C. § 1517(a): An officer or employee of the United States Government may not make or authorize an obligation exceeding an apportionment. 31 U.S.C. § 1351 requires reporting of ADA violations.',
            'Immediately cease new obligations against this appropriation. Investigate the cause of the over-obligation. If confirmed as an ADA violation, initiate investigation and reporting procedures per DoD FMR Volume 14. Consider requesting a supplemental apportionment from OMB if additional authority is available.',
            excess,
            [approp.treasuryAccountSymbol]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V03-002',
    name: 'Allotment Compliance',
    framework: 'DOD_FMR',
    category: 'Budget Execution (Vol 3)',
    description: 'Checks fund controls at the allotment level for obligations exceeding the allotted amount',
    citation: 'DoD FMR Vol 3, Ch 2; 31 U.S.C. § 1517(a) - Allotment Limitations',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { fundControls } = data.dodData;

      const allotmentControls = fundControls.filter(fc => fc.controlLevel === 'allotment' || fc.controlLevel === 'sub_allotment');

      for (const control of allotmentControls) {
        if (control.obligatedAgainst > control.amount) {
          const excess = control.obligatedAgainst - control.amount;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V03-002',
            'DOD_FMR',
            'critical',
            'Obligations Exceed Allotment',
            `Fund control point "${control.controlledBy}" at the ${control.controlLevel} level has obligations of $${(control.obligatedAgainst / 1000000).toFixed(2)}M exceeding the allotted amount of $${(control.amount / 1000000).toFixed(2)}M by $${(excess / 1000000).toFixed(2)}M. Exceeding an allotment is a potential Antideficiency Act violation under 31 U.S.C. § 1517(a).`,
            'DoD FMR Volume 3, Chapter 2; 31 U.S.C. § 1517(a): An officer or employee may not make or authorize an obligation exceeding an amount permitted by agency regulations (allotments). DoD FMR Volume 14, Chapter 3.',
            'Immediately suspend new obligations against this allotment. Initiate an investigation to determine the cause and responsible parties. If confirmed, report as an Antideficiency Act violation per Volume 14 procedures. Review allotment management and fund control procedures.',
            excess,
            [control.appropriationId]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V03-003',
    name: 'Obligation Validity',
    framework: 'DOD_FMR',
    category: 'Budget Execution (Vol 3)',
    description: 'Verifies obligations have proper obligationNumber, obligatedDate, and positive amounts',
    citation: 'DoD FMR Vol 3, Ch 8; GAO Principles of Federal Appropriations Law, Vol II, Ch 7',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { obligations } = data.dodData;

      const missingNumber = obligations.filter(o => !o.obligationNumber || o.obligationNumber.trim().length === 0);
      const missingDate = obligations.filter(o => !o.obligatedDate);
      const zeroOrNegative = obligations.filter(o => o.amount <= 0 && o.status !== 'deobligated');

      if (missingNumber.length > 0) {
        const totalAmount = missingNumber.reduce((sum, o) => sum + o.amount, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V03-003',
          'DOD_FMR',
          'medium',
          'Obligations Missing Obligation Numbers',
          `${missingNumber.length} obligation(s) totaling $${(totalAmount / 1000000).toFixed(2)}M are missing obligation numbers. Every obligation must have a unique document number for identification, tracking, and audit trail purposes.`,
          'DoD FMR Volume 3, Chapter 8: All obligations must be documented with a valid, unique obligation number.',
          'Assign unique obligation numbers to all affected records. Implement system controls to prevent recording obligations without a document number.',
          totalAmount,
          missingNumber.map(o => o.id)
        ));
      }

      if (missingDate.length > 0) {
        const totalAmount = missingDate.reduce((sum, o) => sum + o.amount, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V03-003',
          'DOD_FMR',
          'medium',
          'Obligations Missing Obligation Dates',
          `${missingDate.length} obligation(s) totaling $${(totalAmount / 1000000).toFixed(2)}M are missing obligation dates. The obligation date is critical for determining the fiscal year the obligation is charged to and for bona fide need determinations.`,
          'DoD FMR Volume 3, Chapter 8; 31 U.S.C. § 1502: The obligation date determines the fiscal year to which the obligation is properly chargeable.',
          'Record the correct obligation date for all affected obligations. The date should reflect when the government incurred a binding legal commitment.',
          totalAmount,
          missingDate.map(o => o.obligationNumber || o.id)
        ));
      }

      if (zeroOrNegative.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V03-003',
          'DOD_FMR',
          'medium',
          'Obligations with Zero or Negative Amounts',
          `${zeroOrNegative.length} non-deobligated obligation(s) have amounts of $0 or less. Obligations must represent positive, binding commitments of the government. Zero-dollar or negative obligations (other than deobligations) indicate data entry errors or improper transaction processing.`,
          'DoD FMR Volume 3, Chapter 8: A valid obligation requires a positive amount representing a binding agreement. GAO Principles of Federal Appropriations Law, Vol II, Ch 7.',
          'Review each flagged obligation and correct the amount or status. If the obligation should have been deobligated, process the deobligation. If the amount is in error, correct it to the proper positive amount.',
          null,
          zeroOrNegative.map(o => o.obligationNumber || o.id)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V03-004',
    name: 'Expired Appropriation Usage',
    framework: 'DOD_FMR',
    category: 'Budget Execution (Vol 3)',
    description: 'Detects new obligations recorded against expired appropriations which violate time restrictions',
    citation: 'DoD FMR Vol 3, Ch 6; 31 U.S.C. § 1502(a) - Time Limitations on Obligations',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { appropriations, obligations } = data.dodData;

      const expiredApprops = new Map(
        appropriations.filter(a => a.status === 'expired').map(a => [a.id, a])
      );

      const newObligationsOnExpired = obligations.filter(o => {
        const approp = expiredApprops.get(o.appropriationId);
        if (!approp) return false;
        return o.fiscalYear >= data.dodData!.fiscalYear;
      });

      if (newObligationsOnExpired.length > 0) {
        const totalAmount = newObligationsOnExpired.reduce((sum, o) => sum + o.amount, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V03-004',
          'DOD_FMR',
          'critical',
          'New Obligations Recorded Against Expired Appropriations',
          `${newObligationsOnExpired.length} new obligation(s) totaling $${(totalAmount / 1000000).toFixed(2)}M were recorded against expired appropriations in the current fiscal year. Obligations: ${newObligationsOnExpired.slice(0, 5).map(o => `${o.obligationNumber} ($${(o.amount / 1000000).toFixed(2)}M)`).join(', ')}${newObligationsOnExpired.length > 5 ? ` and ${newObligationsOnExpired.length - 5} more` : ''}. Expired appropriations may only be used for legitimate upward adjustments to existing obligations, not for new obligations.`,
          'DoD FMR Volume 3, Chapter 6; 31 U.S.C. § 1502(a): Obligations may not be incurred against an appropriation after the expiration of its period of availability. Expired appropriations are available only for recording, adjusting, and liquidating obligations properly incurred during the current period.',
          'Immediately reverse any new obligations improperly recorded against expired appropriations. Determine the correct current-year appropriation to charge and re-record the obligations. Report potential ADA violations per Volume 14 procedures.',
          totalAmount,
          newObligationsOnExpired.map(o => o.obligationNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V03-005',
    name: 'Cancelled Appropriation Detection',
    framework: 'DOD_FMR',
    category: 'Budget Execution (Vol 3)',
    description: 'Flags cancelled appropriations with remaining balances or financial activity',
    citation: 'DoD FMR Vol 3, Ch 6; 31 U.S.C. § 1555 - Closing of Accounts',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { appropriations } = data.dodData;

      const cancelledWithBalance = appropriations.filter(
        a => a.status === 'cancelled' && (a.unobligatedBalance > 0 || a.obligated > 0 || a.disbursed > 0)
      );

      if (cancelledWithBalance.length > 0) {
        const totalRemaining = cancelledWithBalance.reduce((sum, a) => sum + a.unobligatedBalance + Math.max(0, a.obligated - a.disbursed), 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V03-005',
          'DOD_FMR',
          'critical',
          'Cancelled Appropriations with Remaining Balances',
          `${cancelledWithBalance.length} cancelled appropriation(s) still have financial balances totaling approximately $${(totalRemaining / 1000000).toFixed(2)}M: ${cancelledWithBalance.map(a => `"${a.appropriationTitle}" (TAS: ${a.treasuryAccountSymbol}, unobligated: $${(a.unobligatedBalance / 1000000).toFixed(2)}M)`).join('; ')}. Once an appropriation is cancelled (5 years after expiration), all remaining balances must be cancelled and no further financial activity may be recorded.`,
          'DoD FMR Volume 3, Chapter 6; 31 U.S.C. § 1555: After the 5-year expired phase, the account is closed and all remaining balances are cancelled. 31 U.S.C. § 1553(b): Payments on cancelled accounts must be made from current appropriations.',
          'Remove all financial balances from cancelled appropriation accounts. If legitimate unpaid liabilities exist, charge them to a current year appropriation of the same type per 31 U.S.C. § 1553(b). Investigate how balances remained in cancelled accounts and implement system controls.',
          totalRemaining,
          cancelledWithBalance.map(a => a.treasuryAccountSymbol)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V03-006',
    name: 'Continuing Resolution Compliance',
    framework: 'DOD_FMR',
    category: 'Budget Execution (Vol 3)',
    description: 'Checks appropriations operating under a continuing resolution for proper pro-rata obligation limits',
    citation: 'DoD FMR Vol 3, Ch 1; Continuing Appropriations Act Provisions',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { appropriations } = data.dodData;

      const oneYearApprops = appropriations.filter(a =>
        a.appropriationType === 'one_year' && a.status === 'current'
      );

      for (const approp of oneYearApprops) {
        if (approp.totalAuthority > 0 && approp.obligated > approp.totalAuthority) {
          const excess = approp.obligated - approp.totalAuthority;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V03-006',
            'DOD_FMR',
            'high',
            'Obligations May Exceed Continuing Resolution Authority',
            `Appropriation "${approp.appropriationTitle}" (TAS: ${approp.treasuryAccountSymbol}) has obligations of $${(approp.obligated / 1000000).toFixed(2)}M exceeding total authority of $${(approp.totalAuthority / 1000000).toFixed(2)}M by $${(excess / 1000000).toFixed(2)}M. If operating under a continuing resolution, obligations are generally limited to the prior year rate or the lowest level passed by either chamber. Exceeding this limit may constitute an ADA violation.`,
            'DoD FMR Volume 3, Chapter 1; Continuing Appropriations Act provisions: Obligations under a CR are generally limited to the rate of the prior year appropriation. 31 U.S.C. § 1341(a)(1)(A).',
            'Verify whether this appropriation is operating under a CR or a full-year appropriation. If under a CR, immediately reduce obligations to within the authorized rate. Review obligation plans and defer non-essential requirements.',
            excess,
            [approp.treasuryAccountSymbol]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V03-007',
    name: 'Obligation Aging',
    framework: 'DOD_FMR',
    category: 'Budget Execution (Vol 3)',
    description: 'Flags unliquidated obligations older than 180 days that may indicate stale or invalid obligations',
    citation: 'DoD FMR Vol 3, Ch 8; OMB Circular A-11, Section 130 - Unliquidated Obligations',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { obligations } = data.dodData;
      const now = new Date();
      const sixMonthsAgo = new Date(now);
      sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);

      const agedULOs = obligations.filter(o => {
        if (o.unliquidatedBalance <= 0) return false;
        if (o.status === 'deobligated' || o.status === 'fully_liquidated') return false;
        const obligatedDate = new Date(o.obligatedDate);
        return obligatedDate < sixMonthsAgo;
      });

      if (agedULOs.length > 0) {
        const totalULO = agedULOs.reduce((sum, o) => sum + o.unliquidatedBalance, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V03-007',
          'DOD_FMR',
          'medium',
          'Aged Unliquidated Obligations Detected',
          `${agedULOs.length} obligation(s) have unliquidated balances outstanding for more than 180 days, totaling $${(totalULO / 1000000).toFixed(2)}M. Examples: ${agedULOs.slice(0, 5).map(o => `${o.obligationNumber} ($${(o.unliquidatedBalance / 1000000).toFixed(2)}M, obligated ${o.obligatedDate})`).join('; ')}${agedULOs.length > 5 ? ` and ${agedULOs.length - 5} more` : ''}. Aged ULOs may indicate invalid obligations, failed deliveries, or administrative oversights that should be reviewed for potential deobligation.`,
          'DoD FMR Volume 3, Chapter 8; OMB Circular A-11, Section 130: Agencies must review unliquidated obligations at least annually and deobligate amounts no longer needed.',
          'Perform a comprehensive review of all ULOs older than 180 days. Contact contracting officers and program managers to validate remaining balances. Deobligate funds that are no longer needed.',
          totalULO,
          agedULOs.slice(0, 20).map(o => o.obligationNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V03-008',
    name: 'Deobligation Timeliness',
    framework: 'DOD_FMR',
    category: 'Budget Execution (Vol 3)',
    description: 'Identifies obligations that should be deobligated based on their status and aging',
    citation: 'DoD FMR Vol 3, Ch 8; OMB Circular A-11, Section 130',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { obligations } = data.dodData;
      const now = new Date();
      const twelveMonthsAgo = new Date(now);
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

      const fullyDeliveredWithBalance = obligations.filter(o =>
        o.status === 'fully_liquidated' && o.unliquidatedBalance > 0
      );

      if (fullyDeliveredWithBalance.length > 0) {
        const totalExcess = fullyDeliveredWithBalance.reduce((sum, o) => sum + o.unliquidatedBalance, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V03-008',
          'DOD_FMR',
          'medium',
          'Fully Liquidated Obligations with Remaining Balances Need Deobligation',
          `${fullyDeliveredWithBalance.length} obligation(s) marked as fully liquidated still have unliquidated balances totaling $${(totalExcess / 1000000).toFixed(2)}M. These residual balances should be deobligated to free funds for other requirements and to accurately report unobligated balances.`,
          'DoD FMR Volume 3, Chapter 8; OMB Circular A-11, Section 130: Agencies must deobligate amounts no longer needed in a timely manner.',
          'Process deobligations for all fully liquidated obligations with remaining balances. Ensure freed funds are properly reflected in the unobligated balance.',
          totalExcess,
          fullyDeliveredWithBalance.map(o => o.obligationNumber)
        ));
      }

      const staleObligations = obligations.filter(o => {
        if (o.status !== 'open') return false;
        if (o.liquidatedAmount > 0) return false;
        const obligatedDate = new Date(o.obligatedDate);
        return obligatedDate < twelveMonthsAgo;
      });

      if (staleObligations.length > 0) {
        const totalStale = staleObligations.reduce((sum, o) => sum + o.amount, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V03-008',
          'DOD_FMR',
          'medium',
          'Stale Obligations with No Liquidation Activity',
          `${staleObligations.length} obligation(s) totaling $${(totalStale / 1000000).toFixed(2)}M have been open for over 12 months with zero liquidation activity. Examples: ${staleObligations.slice(0, 5).map(o => `${o.obligationNumber} ($${(o.amount / 1000000).toFixed(2)}M, since ${o.obligatedDate})`).join('; ')}${staleObligations.length > 5 ? ` and ${staleObligations.length - 5} more` : ''}.`,
          'DoD FMR Volume 3, Chapter 8: Obligations must be reviewed periodically and deobligated when no longer valid.',
          'Contact contracting officers and program managers to validate each stale obligation. Process deobligations for obligations where the underlying requirement no longer exists.',
          totalStale,
          staleObligations.slice(0, 20).map(o => o.obligationNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V03-009',
    name: 'Fund Balance Reconciliation',
    framework: 'DOD_FMR',
    category: 'Budget Execution (Vol 3)',
    description: 'Verifies that unobligatedBalance equals totalAuthority minus obligated for each appropriation',
    citation: 'DoD FMR Vol 3, Ch 2; OMB Circular A-11, Section 120 - Budget Execution',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { appropriations } = data.dodData;

      for (const approp of appropriations) {
        const computedUnobligated = approp.totalAuthority - approp.obligated;
        const difference = Math.abs(approp.unobligatedBalance - computedUnobligated);

        if (difference > 0.01) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V03-009',
            'DOD_FMR',
            'medium',
            'Unobligated Balance Discrepancy',
            `Appropriation "${approp.appropriationTitle}" (TAS: ${approp.treasuryAccountSymbol}) has a recorded unobligated balance of $${(approp.unobligatedBalance / 1000000).toFixed(2)}M, but the computed balance (total authority $${(approp.totalAuthority / 1000000).toFixed(2)}M minus obligations $${(approp.obligated / 1000000).toFixed(2)}M) is $${(computedUnobligated / 1000000).toFixed(2)}M. Difference: $${(difference / 1000000).toFixed(4)}M.`,
            'DoD FMR Volume 3, Chapter 2; OMB Circular A-11, Section 120: The unobligated balance must equal total budgetary resources minus total obligations.',
            'Reconcile the unobligated balance by reviewing all transactions affecting total authority and obligations. Identify and correct the source of the discrepancy.',
            difference,
            [approp.treasuryAccountSymbol]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V03-010',
    name: 'Commitment to Obligation Conversion',
    framework: 'DOD_FMR',
    category: 'Budget Execution (Vol 3)',
    description: 'Checks committed versus obligated alignment to detect aged commitments that have not converted',
    citation: 'DoD FMR Vol 3, Ch 8 - Commitments and Obligations',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { appropriations } = data.dodData;

      const agedCommitments = appropriations.filter(a =>
        a.status === 'current' && a.committed > 0 && a.committed > a.obligated
      );

      if (agedCommitments.length > 0) {
        const totalUnconverted = agedCommitments.reduce(
          (sum, a) => sum + (a.committed - a.obligated), 0
        );

        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V03-010',
          'DOD_FMR',
          'medium',
          'Commitments Outstanding Without Corresponding Obligations',
          `${agedCommitments.length} appropriation(s) have commitments exceeding obligations, totaling $${(totalUnconverted / 1000000).toFixed(2)}M in uncommitted-to-obligated funds: ${agedCommitments.map(a => `"${a.appropriationTitle}" (committed: $${(a.committed / 1000000).toFixed(2)}M, obligated: $${(a.obligated / 1000000).toFixed(2)}M)`).join('; ')}. Aged commitments that have not converted to obligations may indicate stale requirements or contracting delays.`,
          'DoD FMR Volume 3, Chapter 8: Commitments must be converted to obligations in a timely manner. Aged commitments distort fund availability.',
          'Review all aged commitments to determine if the underlying requirement still exists. Decommit funds where requirements have been cancelled or deferred. Establish commitment aging reports and review thresholds.',
          totalUnconverted,
          agedCommitments.map(a => a.treasuryAccountSymbol)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V03-011',
    name: 'Budget Execution Rate Analysis',
    framework: 'DOD_FMR',
    category: 'Budget Execution (Vol 3)',
    description: 'Flags appropriations with unusually low or high execution rates that warrant management attention',
    citation: 'DoD FMR Vol 3, Ch 1; OMB Circular A-11, Section 120 - Budget Execution Monitoring',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { appropriations } = data.dodData;

      const currentApprops = appropriations.filter(a =>
        a.status === 'current' && a.totalAuthority > 0
      );

      for (const approp of currentApprops) {
        const executionRate = approp.obligated / approp.totalAuthority;

        if (executionRate > 0.98) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V03-011',
            'DOD_FMR',
            'medium',
            'Abnormally High Budget Execution Rate',
            `Appropriation "${approp.appropriationTitle}" (TAS: ${approp.treasuryAccountSymbol}) has an execution rate of ${(executionRate * 100).toFixed(1)}% ($${(approp.obligated / 1000000).toFixed(2)}M of $${(approp.totalAuthority / 1000000).toFixed(2)}M). Rates near 100% may indicate year-end spending pressure or increased risk of over-obligation.`,
            'DoD FMR Volume 3, Chapter 1; OMB Circular A-11, Section 120: Agencies should monitor execution rates to ensure compliance with statutory limitations.',
            'Review remaining unobligated balance for adequacy. Ensure no planned obligations would cause over-obligation. Investigate whether year-end obligations represent genuine requirements.',
            null,
            [approp.treasuryAccountSymbol]
          ));
        } else if (executionRate < 0.25 && approp.totalAuthority > 1000000) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V03-011',
            'DOD_FMR',
            'medium',
            'Abnormally Low Budget Execution Rate',
            `Appropriation "${approp.appropriationTitle}" (TAS: ${approp.treasuryAccountSymbol}) has an execution rate of only ${(executionRate * 100).toFixed(1)}% ($${(approp.obligated / 1000000).toFixed(2)}M of $${(approp.totalAuthority / 1000000).toFixed(2)}M). Low execution may indicate program delays or requirements that should be reprogrammed.`,
            'DoD FMR Volume 3, Chapter 1; OMB Circular A-11, Section 120: Low execution rates may require explanation in budget justification documents.',
            'Investigate the cause of low execution. Determine if funds should be reprogrammed to higher-priority requirements.',
            null,
            [approp.treasuryAccountSymbol]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V03-012',
    name: 'Year-End Obligation Spike Detection',
    framework: 'DOD_FMR',
    category: 'Budget Execution (Vol 3)',
    description: 'Detects abnormal increases in obligation activity during Q4 that may indicate improper year-end spending',
    citation: 'DoD FMR Vol 3, Ch 8; GAO Report on Year-End Spending',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { obligations } = data.dodData;

      if (obligations.length === 0) return findings;

      const fiscalYear = data.dodData.fiscalYear;
      const q4Start = new Date(`${fiscalYear}-07-01`);
      const q4End = new Date(`${fiscalYear}-09-30`);
      const q1q3End = new Date(`${fiscalYear}-06-30`);
      const fyStart = new Date(`${fiscalYear - 1}-10-01`);

      const q4Obligations = obligations.filter(o => {
        const d = new Date(o.obligatedDate);
        return d >= q4Start && d <= q4End;
      });

      const q1q3Obligations = obligations.filter(o => {
        const d = new Date(o.obligatedDate);
        return d >= fyStart && d <= q1q3End;
      });

      if (q1q3Obligations.length === 0) return findings;

      const q4Total = q4Obligations.reduce((sum, o) => sum + o.amount, 0);
      const q1q3Total = q1q3Obligations.reduce((sum, o) => sum + o.amount, 0);
      const q1q3AvgPerQuarter = q1q3Total / 3;

      if (q1q3AvgPerQuarter > 0 && q4Total > q1q3AvgPerQuarter * 2) {
        const spikeRatio = q4Total / q1q3AvgPerQuarter;
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V03-012',
          'DOD_FMR',
          'medium',
          'Year-End Obligation Spike Detected',
          `Q4 (Jul-Sep FY${fiscalYear}) obligations of $${(q4Total / 1000000).toFixed(2)}M are ${spikeRatio.toFixed(1)}x the Q1-Q3 average quarterly rate of $${(q1q3AvgPerQuarter / 1000000).toFixed(2)}M. This represents ${q4Obligations.length} obligation(s) in Q4 versus an average of ${Math.round(q1q3Obligations.length / 3)} per quarter in Q1-Q3. Disproportionate year-end obligations are a risk indicator for improper spending driven by "use it or lose it" pressures.`,
          'DoD FMR Volume 3, Chapter 8; GAO-15-424: Year-end spending patterns warrant scrutiny to ensure obligations represent genuine requirements and comply with the bona fide needs rule.',
          'Review Q4 obligations to ensure they represent bona fide needs of the current fiscal year. Verify large Q4 obligations are supported by proper documentation and not driven solely by expiring funds.',
          q4Total - q1q3AvgPerQuarter,
          []
        ));
      }

      return findings;
    },
  },
];
