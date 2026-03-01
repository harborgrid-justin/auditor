import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '@/lib/engine/rule-runner';

export const reimbursableOperationsRules: AuditRule[] = [
  {
    id: 'DOD-FMR-V11-001',
    name: 'Economy Act Compliance',
    framework: 'DOD_FMR',
    category: 'Reimbursable Operations (Volume 11)',
    description: 'Verifies that Economy Act interagency agreements have a proper authority citation establishing the legal basis for the agreement',
    citation: 'DoD FMR Vol 11A, Ch 3; 31 U.S.C. 1535 - Economy Act orders',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const iaa of data.dodData.interagencyAgreements) {
        if (iaa.agreementType !== 'economy_act') continue;

        if (!iaa.authority || iaa.authority.trim() === '') {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V11-001',
            'DOD_FMR',
            'high',
            `Economy Act Agreement Missing Authority Citation`,
            `Interagency agreement ${iaa.agreementNumber} between ${iaa.requestingAgency} (requesting) and ${iaa.servicingAgency} (servicing) is classified as an Economy Act order but lacks a proper authority citation. Amount: $${iaa.amount.toLocaleString()}. Economy Act agreements must cite 31 U.S.C. 1535 and document that the ordering agency determined the order is in the best interest of the government.`,
            'DoD FMR Vol 11A, Ch 3; 31 U.S.C. 1535(a) - Economy Act orders require a written determination that (1) amounts are available, (2) the order is in the best interest of the government, and (3) the servicing agency can provide the goods/services more economically than commercial sources.',
            'Update the agreement to include the proper authority citation (31 U.S.C. 1535). Obtain a written determination and findings (D&F) from the ordering agency that Economy Act requirements are met. Ensure the D&F is documented and retained in the agreement file.',
            iaa.amount,
            ['Reimbursable Operations - Economy Act']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V11-002',
    name: 'IAA Billing Accuracy',
    framework: 'DOD_FMR',
    category: 'Reimbursable Operations (Volume 11)',
    description: 'Checks the billedAmount against the obligatedAmount on interagency agreements to detect billing discrepancies',
    citation: 'DoD FMR Vol 11A, Ch 4 - Reimbursable billing procedures',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const iaa of data.dodData.interagencyAgreements) {
        if (iaa.obligatedAmount <= 0) continue;

        if (iaa.billedAmount > iaa.obligatedAmount) {
          const excess = iaa.billedAmount - iaa.obligatedAmount;
          const excessPct = (excess / iaa.obligatedAmount) * 100;

          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V11-002',
            'DOD_FMR',
            excessPct > 20 ? 'high' : 'medium',
            `IAA Billed Amount Exceeds Obligated Amount`,
            `Agreement ${iaa.agreementNumber} (${iaa.servicingAgency} servicing ${iaa.requestingAgency}): billed amount of $${iaa.billedAmount.toLocaleString()} exceeds the obligated amount of $${iaa.obligatedAmount.toLocaleString()} by $${excess.toLocaleString()} (${excessPct.toFixed(1)}%). Billing in excess of obligations may result in funding shortfalls and potential Anti-Deficiency Act concerns.`,
            'DoD FMR Vol 11A, Ch 4 - Billings on reimbursable orders must not exceed the amount obligated on the agreement. Excess billings require additional obligation authority.',
            'Review the billing against the scope of work and obligated amount. If additional work was performed, obtain a modification to increase the obligated amount. If billing was in error, adjust the billing records accordingly.',
            excess,
            ['Reimbursable Operations - Billing']
          ));
        }

        // Check for completed agreements with significant unbilled balances
        if (iaa.status === 'completed' && iaa.billedAmount < iaa.obligatedAmount * 0.50 && iaa.obligatedAmount > 0) {
          const unbilled = iaa.obligatedAmount - iaa.billedAmount;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V11-002',
            'DOD_FMR',
            'low',
            `Completed IAA With Significant Unbilled Balance`,
            `Agreement ${iaa.agreementNumber}: completed with only $${iaa.billedAmount.toLocaleString()} billed against $${iaa.obligatedAmount.toLocaleString()} obligated (${((iaa.billedAmount / iaa.obligatedAmount) * 100).toFixed(1)}% utilized). Unbilled balance of $${unbilled.toLocaleString()} should be de-obligated to free up funds.`,
            'DoD FMR Vol 11A, Ch 4 - Completed agreements should be reconciled and excess obligations de-obligated promptly to return funds to the requesting agency.',
            'Reconcile the agreement and de-obligate the unused balance. Investigate why the full obligated amount was not utilized to improve future obligation estimates.',
            unbilled,
            ['Reimbursable Operations - Billing']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V11-003',
    name: 'Advance vs Reimbursement Accounting',
    framework: 'DOD_FMR',
    category: 'Reimbursable Operations (Volume 11)',
    description: 'Verifies that advance payments received on interagency agreements do not significantly exceed the billed amount, preventing improper retention of advance funding',
    citation: 'DoD FMR Vol 11A, Ch 5 - Advance payment procedures for reimbursable work',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const iaa of data.dodData.interagencyAgreements) {
        if (iaa.advanceReceived <= 0) continue;

        // Advances should not significantly exceed billed amount
        if (iaa.billedAmount > 0 && iaa.advanceReceived > iaa.billedAmount * 1.25) {
          const excessAdvance = iaa.advanceReceived - iaa.billedAmount;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V11-003',
            'DOD_FMR',
            'medium',
            `Advance Received Significantly Exceeds Billed Amount`,
            `Agreement ${iaa.agreementNumber}: advance received of $${iaa.advanceReceived.toLocaleString()} exceeds the billed amount of $${iaa.billedAmount.toLocaleString()} by $${excessAdvance.toLocaleString()}. Advances should be commensurate with anticipated billings. Excess advances represent idle funds that reduce the requesting agency's cash management efficiency.`,
            'DoD FMR Vol 11A, Ch 5 - Advances on reimbursable orders should be limited to amounts necessary to cover anticipated costs. Excess advances must be returned to the requesting agency.',
            'Review the advance amount relative to the work schedule and anticipated billings. Return excess advance funds to the requesting agency. Establish advance replenishment procedures based on actual cost incurrence rates.',
            excessAdvance,
            ['Reimbursable Operations - Advance']
          ));
        }

        // Advance received with zero billing
        if (iaa.billedAmount === 0 && iaa.advanceReceived > 0 && iaa.status === 'active') {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V11-003',
            'DOD_FMR',
            'medium',
            `Advance Received With No Billings`,
            `Agreement ${iaa.agreementNumber}: advance of $${iaa.advanceReceived.toLocaleString()} received but no billings have been recorded. The servicing agency is holding advance funds without corresponding work performance. This may indicate the work has not started or billing records are incomplete.`,
            'DoD FMR Vol 11A, Ch 5 - Advances must be liquidated through billings as work is performed. Idle advances should be returned to the requesting agency.',
            'Determine the status of work under this agreement. If work has not commenced, consider returning the advance. If work is in progress, ensure billings are being processed in a timely manner.',
            iaa.advanceReceived,
            ['Reimbursable Operations - Advance']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V11-004',
    name: 'IAA Period Compliance',
    framework: 'DOD_FMR',
    category: 'Reimbursable Operations (Volume 11)',
    description: 'Checks if interagency agreements extend beyond the period of performance while remaining in active status',
    citation: 'DoD FMR Vol 11A, Ch 3 - Interagency agreement period requirements',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      const now = new Date();

      for (const iaa of data.dodData.interagencyAgreements) {
        if (!iaa.periodOfPerformance) continue;

        const popEnd = new Date(iaa.periodOfPerformance);

        if (iaa.status === 'active' && popEnd < now) {
          const daysOverdue = Math.ceil((now.getTime() - popEnd.getTime()) / (1000 * 60 * 60 * 24));

          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V11-004',
            'DOD_FMR',
            daysOverdue > 180 ? 'high' : 'medium',
            `IAA Active Beyond Period of Performance`,
            `Agreement ${iaa.agreementNumber} (${iaa.servicingAgency} servicing ${iaa.requestingAgency}): still active but the period of performance ended on ${iaa.periodOfPerformance} (${daysOverdue} days ago). Amount: $${iaa.amount.toLocaleString()}, billed: $${iaa.billedAmount.toLocaleString()}. Work or obligations incurred beyond the period of performance may not be valid.`,
            'DoD FMR Vol 11A, Ch 3 - Interagency agreements must specify a period of performance. Work should not continue beyond the agreed period without a modification extending performance. Economy Act orders must be deobligated at the end of the period if services are not provided.',
            'Determine if a modification extending the period of performance is needed. If work is complete, initiate closeout procedures. If work is ongoing, process a modification to extend the period. De-obligate unused funds if work has concluded.',
            null,
            ['Reimbursable Operations - Period']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V11-005',
    name: 'Collection Timeliness',
    framework: 'DOD_FMR',
    category: 'Reimbursable Operations (Volume 11)',
    description: 'Checks the gap between billed and collected amounts on interagency agreements to identify collection deficiencies',
    citation: 'DoD FMR Vol 11A, Ch 6 - Collection procedures for reimbursable work',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const iaa of data.dodData.interagencyAgreements) {
        if (iaa.billedAmount <= 0) continue;

        const uncollected = iaa.billedAmount - iaa.collectedAmount;
        const uncollectedPct = (uncollected / iaa.billedAmount) * 100;

        if (uncollected > 0 && uncollectedPct > 25) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V11-005',
            'DOD_FMR',
            uncollectedPct > 50 ? 'high' : 'medium',
            `IAA Collection Deficiency`,
            `Agreement ${iaa.agreementNumber} (${iaa.servicingAgency}): billed $${iaa.billedAmount.toLocaleString()} but only collected $${iaa.collectedAmount.toLocaleString()} (${((iaa.collectedAmount / iaa.billedAmount) * 100).toFixed(1)}% collection rate). Uncollected amount: $${uncollected.toLocaleString()}. Delayed collections affect cash management and may indicate disputes or administrative processing issues.`,
            'DoD FMR Vol 11A, Ch 6 - Collections on reimbursable work should be pursued in a timely manner. Servicing agencies should follow up on outstanding billings within 30 days.',
            'Follow up with the requesting agency on outstanding billings. Determine if there are billing disputes that need resolution. Establish a collections tracking process and escalate aged receivables to senior management. Consider IPAC (Intra-governmental Payment and Collection) for inter-agency collections.',
            uncollected,
            ['Reimbursable Operations - Collections']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V11-006',
    name: 'Working Capital Fund Rate Review',
    framework: 'DOD_FMR',
    category: 'Reimbursable Operations (Volume 11)',
    description: 'Checks working capital funds for net operating results significantly different from zero, indicating stabilized rates may need adjustment',
    citation: 'DoD FMR Vol 11B, Ch 1; 10 U.S.C. 2208 - Working Capital Fund management and rate setting',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const wcf of data.dodData.workingCapitalFunds) {
        if (wcf.revenueFromOperations <= 0) continue;

        const norPct = (wcf.netOperatingResult / wcf.revenueFromOperations) * 100;
        const absoluteNOR = Math.abs(wcf.netOperatingResult);

        // WCF should break even - flag significant deviations
        if (Math.abs(norPct) > 5 && absoluteNOR > 100000) {
          const isProfit = wcf.netOperatingResult > 0;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V11-006',
            'DOD_FMR',
            Math.abs(norPct) > 15 ? 'high' : 'medium',
            `Working Capital Fund ${isProfit ? 'Surplus' : 'Deficit'}: ${norPct.toFixed(1)}%`,
            `Working Capital Fund "${wcf.fundName}" (${wcf.fundType}): net operating result of ${isProfit ? '+' : ''}$${wcf.netOperatingResult.toLocaleString()} on revenue of $${wcf.revenueFromOperations.toLocaleString()} (${norPct.toFixed(1)}% ${isProfit ? 'surplus' : 'deficit'}). WCFs are designed to operate on a break-even basis. ${isProfit ? 'A significant surplus indicates rates may be set too high, resulting in overcharging customers.' : 'A significant deficit indicates rates may be too low and the fund is consuming its cash reserves.'}`,
            'DoD FMR Vol 11B, Ch 1; 10 U.S.C. 2208 - Working Capital Funds shall establish stabilized rates to recover the full cost of operations. Rates should be reviewed and adjusted to achieve break-even results over time.',
            isProfit
              ? 'Review stabilized billing rates and reduce them to prevent further surplus accumulation. Consider refunding excess collections to customers or adjusting future-year rates downward to return the surplus over time.'
              : 'Review cost structures and billing rates. Increase rates to cover full costs of operations. Identify inefficiencies driving costs above revenue. Develop a plan to restore break-even operations within 2-3 fiscal years.',
            absoluteNOR,
            ['Reimbursable Operations - Working Capital Fund']
          ));
        }

        // Check for negative cash balance
        if (wcf.cashBalance < 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V11-006',
            'DOD_FMR',
            'critical',
            `Working Capital Fund Negative Cash Balance`,
            `Working Capital Fund "${wcf.fundName}" (${wcf.fundType}): cash balance is negative at $${wcf.cashBalance.toLocaleString()}. A negative cash balance indicates the fund cannot meet current obligations and may require a cash infusion from the General Fund to continue operations.`,
            'DoD FMR Vol 11B, Ch 1; 10 U.S.C. 2208 - Working Capital Funds must maintain sufficient cash balances to meet obligations. Negative cash balances require immediate management attention.',
            'Immediately assess the cash position and develop a recovery plan. Request a cash infusion if necessary. Accelerate collection of outstanding billings. Review and reduce discretionary spending. Adjust billing rates upward to restore positive cash flow.',
            Math.abs(wcf.cashBalance),
            ['Reimbursable Operations - Working Capital Fund']
          ));
        }
      }

      return findings;
    },
  },
];
