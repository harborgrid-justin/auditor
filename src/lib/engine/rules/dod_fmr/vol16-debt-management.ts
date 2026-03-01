/* eslint-disable @typescript-eslint/no-explicit-any */
import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '@/lib/engine/rule-runner';
import { getParameter } from '@/lib/engine/tax-parameters/registry';

export const debtManagementRules: AuditRule[] = [
  {
    id: 'DOD-FMR-V16-001',
    name: 'Debt Aging Compliance',
    framework: 'DOD_FMR',
    category: 'debt_management',
    description: 'Checks delinquent debts exceeding 120 days that have not been referred to Treasury as required by the Debt Collection Improvement Act (DCIA)',
    citation: '31 U.S.C. §3711(g); DoD FMR Vol 16, Ch 1',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const debtRecords = (data.dodData as any).debtRecords as any[] | undefined;
      if (!debtRecords || !Array.isArray(debtRecords)) return [];

      const referralDays = getParameter('DOD_DEBT_REFERRAL_DAYS', data.taxYear, undefined, 120);
      const now = new Date();

      for (const debt of debtRecords) {
        if (!debt.delinquentDate) continue;

        const delinquentDate = new Date(debt.delinquentDate);
        const daysSinceDelinquent = Math.ceil(
          (now.getTime() - delinquentDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSinceDelinquent > referralDays && !debt.referredToTreasury) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V16-001',
            'DOD_FMR',
            daysSinceDelinquent > 180 ? 'critical' : 'high',
            `Delinquent Debt Not Referred to Treasury: ${daysSinceDelinquent} Days`,
            `Debt record "${debt.id}" for debtor "${debt.debtorName}" (amount: $${debt.amount.toLocaleString()}) has been delinquent for ${daysSinceDelinquent} days (since ${debt.delinquentDate}) but has not been referred to Treasury. The Debt Collection Improvement Act requires referral of delinquent debts to Treasury within ${referralDays} days of delinquency for cross-servicing and offset.`,
            '31 U.S.C. §3711(g); DoD FMR Vol 16, Ch 1 - Federal agencies are required to refer debts that are more than 120 days delinquent to the Treasury for collection through cross-servicing or offset under the Debt Collection Improvement Act (DCIA).',
            `Immediately refer this debt to the Bureau of the Fiscal Service (Treasury) for cross-servicing. Document the referral date and ensure the debt file is complete with all supporting documentation including demand letters, debtor contact records, and payment history. Implement automated aging alerts to prevent future referral delays.`,
            debt.amount,
            [`Debt Management - ${debt.id}`]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V16-002',
    name: 'Write-Off Authorization Levels',
    framework: 'DOD_FMR',
    category: 'debt_management',
    description: 'Validates that write-off amounts do not exceed the approving official authorization threshold, ensuring proper authority for debt write-off decisions',
    citation: 'DoD FMR Vol 16, Ch 4; OMB A-129',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const debtRecords = (data.dodData as any).debtRecords as any[] | undefined;
      if (!debtRecords || !Array.isArray(debtRecords)) return [];

      const writeOffThreshold = getParameter('DOD_DEBT_WRITEOFF_THRESHOLD', data.taxYear, undefined, 100000);

      for (const debt of debtRecords) {
        if (!debt.writeOffRequested) continue;

        if (debt.writeOffApproved && debt.amount > writeOffThreshold) {
          const approvalLevel = debt.writeOffApprovalLevel || 'unknown';
          if (approvalLevel !== 'agency_head' && approvalLevel !== 'cfo') {
            findings.push(createFinding(
              data.engagementId,
              'DOD-FMR-V16-002',
              'DOD_FMR',
              'critical',
              `Write-Off Exceeds Authorization Level`,
              `Debt record "${debt.id}" for debtor "${debt.debtorName}": write-off of $${debt.amount.toLocaleString()} was approved by "${debt.writeOffApprovedBy}" at level "${approvalLevel}" but exceeds the $${writeOffThreshold.toLocaleString()} threshold requiring agency head or CFO approval. Write-offs above this threshold require higher-level authorization per DoD FMR Vol 16, Ch 4 and OMB Circular A-129.`,
              'DoD FMR Vol 16, Ch 4; OMB A-129 - Debt write-offs exceeding the agency threshold must be approved at the appropriate authority level. Write-offs above established thresholds require agency head or CFO-level approval.',
              'Suspend the write-off action and escalate to the appropriate approval authority. Obtain agency head or CFO-level approval before finalizing the write-off. Document the authorization chain and maintain the approval record in the debt file. Review delegation of write-off authority to ensure compliance with thresholds.',
              debt.amount,
              [`Debt Management - Write-Off - ${debt.id}`]
            ));
          }
        }

        if (debt.writeOffApproved && !debt.writeOffApprovedBy) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V16-002',
            'DOD_FMR',
            'high',
            `Write-Off Missing Approving Official`,
            `Debt record "${debt.id}" for debtor "${debt.debtorName}": write-off of $${debt.amount.toLocaleString()} is marked as approved but has no designated approving official. All write-off decisions must be documented with the name and title of the authorizing official.`,
            'DoD FMR Vol 16, Ch 4; OMB A-129 - All debt write-off actions must be properly documented including the identity and authority level of the approving official.',
            'Identify and document the approving official for this write-off. Verify the official has the delegated authority to approve write-offs of this amount. If the approval cannot be substantiated, reverse the write-off and resubmit through proper channels.',
            debt.amount,
            [`Debt Management - Write-Off - ${debt.id}`]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V16-003',
    name: 'Treasury Offset Program Enrollment',
    framework: 'DOD_FMR',
    category: 'debt_management',
    description: 'Verifies that debts exceeding $25K and delinquent for more than 120 days are enrolled in the Treasury Offset Program (TOP)',
    citation: '31 U.S.C. §3716; DoD FMR Vol 16, Ch 1',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const debtRecords = (data.dodData as any).debtRecords as any[] | undefined;
      if (!debtRecords || !Array.isArray(debtRecords)) return [];

      const referralThreshold = getParameter('DOD_DEBT_REFERRAL_THRESHOLD', data.taxYear, undefined, 25000);
      const referralDays = getParameter('DOD_DEBT_REFERRAL_DAYS', data.taxYear, undefined, 120);
      const now = new Date();

      for (const debt of debtRecords) {
        if (!debt.delinquentDate || debt.amount < referralThreshold) continue;

        const delinquentDate = new Date(debt.delinquentDate);
        const daysSinceDelinquent = Math.ceil(
          (now.getTime() - delinquentDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSinceDelinquent > referralDays && !debt.enrolledInTOP) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V16-003',
            'DOD_FMR',
            'high',
            `Debt Not Enrolled in Treasury Offset Program`,
            `Debt record "${debt.id}" for debtor "${debt.debtorName}" (amount: $${debt.amount.toLocaleString()}) exceeds the $${referralThreshold.toLocaleString()} threshold and has been delinquent for ${daysSinceDelinquent} days (since ${debt.delinquentDate}) but is not enrolled in the Treasury Offset Program (TOP). Under 31 U.S.C. §3716, eligible delinquent debts must be submitted to TOP for offset against federal payments to the debtor.`,
            '31 U.S.C. §3716; DoD FMR Vol 16, Ch 1 - Federal agencies must submit legally enforceable debts that are more than 120 days delinquent to the Treasury Offset Program for administrative offset against federal payments, tax refunds, and other eligible payment streams.',
            'Submit this debt to the Treasury Offset Program immediately. Ensure all required data elements are included in the TOP submission (debtor TIN, amount, agency code, debt type). Verify the debt meets legal enforceability requirements. Monitor TOP for offset collections and update the debt record accordingly.',
            debt.amount,
            [`Debt Management - TOP - ${debt.id}`]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V16-004',
    name: 'Debt Collection Interest/Penalty/Admin Fees',
    framework: 'DOD_FMR',
    category: 'debt_management',
    description: 'Validates that interest, penalties, and administrative fees are assessed on delinquent debts per 31 U.S.C. §3717',
    citation: '31 U.S.C. §3717; DoD FMR Vol 16, Ch 2',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const debtRecords = (data.dodData as any).debtRecords as any[] | undefined;
      if (!debtRecords || !Array.isArray(debtRecords)) return [];

      const adminFee = getParameter('DOD_DEBT_ADMIN_FEE', data.taxYear, undefined, 55);
      const now = new Date();

      for (const debt of debtRecords) {
        if (!debt.delinquentDate) continue;

        const delinquentDate = new Date(debt.delinquentDate);
        const daysSinceDelinquent = Math.ceil(
          (now.getTime() - delinquentDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Only check debts that have been delinquent for more than 30 days
        if (daysSinceDelinquent <= 30) continue;

        const missingAssessments: string[] = [];
        if (!debt.interestAssessed) missingAssessments.push('interest');
        if (!debt.penaltyAssessed) missingAssessments.push('penalty');
        if (!debt.adminFeeAssessed) missingAssessments.push('administrative fee');

        if (missingAssessments.length > 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V16-004',
            'DOD_FMR',
            missingAssessments.length >= 3 ? 'high' : 'medium',
            `Missing Debt Collection Charges: ${missingAssessments.join(', ')}`,
            `Debt record "${debt.id}" for debtor "${debt.debtorName}" (amount: $${debt.amount.toLocaleString()}, delinquent ${daysSinceDelinquent} days): the following required charges have not been assessed: ${missingAssessments.join(', ')}. Under 31 U.S.C. §3717, agencies must charge interest, penalties, and administrative costs on delinquent debts. The administrative fee is $${adminFee} per demand. Failure to assess these charges results in lost revenue to the government.`,
            '31 U.S.C. §3717; DoD FMR Vol 16, Ch 2 - Agencies shall charge: (1) interest at the Treasury Current Value of Funds Rate from the date of delinquency, (2) a penalty charge of not more than 6% per year on any portion of the debt more than 90 days past due, and (3) administrative costs of processing and handling delinquent debts.',
            `Assess the missing charges immediately: ${missingAssessments.includes('interest') ? 'calculate and apply interest from the date of delinquency at the Treasury rate; ' : ''}${missingAssessments.includes('penalty') ? 'apply the penalty charge on portions delinquent over 90 days; ' : ''}${missingAssessments.includes('administrative fee') ? `apply the $${adminFee} administrative fee per demand letter; ` : ''}Update the debt record to reflect all assessed charges and notify the debtor of the updated balance.`,
            debt.amount,
            [`Debt Management - Charges - ${debt.id}`]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V16-005',
    name: 'Compromise Authority Limits',
    framework: 'DOD_FMR',
    category: 'debt_management',
    description: 'Checks that debt compromise amounts exceeding $100K are referred to the Department of Justice as required by the Federal Claims Collection Standards',
    citation: '31 U.S.C. §3711(a); DoD FMR Vol 16, Ch 3; FCCS 31 CFR 902',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const debtRecords = (data.dodData as any).debtRecords as any[] | undefined;
      if (!debtRecords || !Array.isArray(debtRecords)) return [];

      const compromiseLimit = getParameter('DOD_DEBT_COMPROMISE_AGENCY_LIMIT', data.taxYear, undefined, 100000);

      for (const debt of debtRecords) {
        if (!debt.compromiseRequested) continue;

        const compromiseAmount = debt.compromiseAmount ?? debt.amount;

        if (compromiseAmount > compromiseLimit) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V16-005',
            'DOD_FMR',
            'critical',
            `Compromise Amount Exceeds Agency Authority - DOJ Referral Required`,
            `Debt record "${debt.id}" for debtor "${debt.debtorName}": compromise requested on a debt of $${debt.amount.toLocaleString()} with a compromise amount of $${compromiseAmount.toLocaleString()}, which exceeds the agency compromise authority limit of $${compromiseLimit.toLocaleString()}. Under the Federal Claims Collection Standards (31 CFR 902), debts exceeding the agency limit must be referred to the Department of Justice for compromise consideration.`,
            '31 U.S.C. §3711(a); DoD FMR Vol 16, Ch 3; FCCS 31 CFR 902 - Agencies may compromise debts up to the agency limit ($100,000 or as adjusted). Claims in excess of this amount must be referred to the Department of Justice for compromise, unless the agency has been granted higher authority.',
            'Refer this debt to the Department of Justice (Civil Division or appropriate litigating division) for compromise consideration. Prepare a referral package including: the claim history, financial analysis of the debtor, basis for the compromise recommendation, and all supporting documentation. Do not finalize any compromise agreement until DOJ authorization is received.',
            compromiseAmount,
            [`Debt Management - Compromise - ${debt.id}`]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V16-006',
    name: 'Debt Due Diligence Before Write-Off',
    framework: 'DOD_FMR',
    category: 'debt_management',
    description: 'Verifies that all required due diligence steps have been completed before a debt is written off, including demand letters, skip tracing, and collection attempts',
    citation: 'DoD FMR Vol 16, Ch 4; 31 CFR 903.1',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const debtRecords = (data.dodData as any).debtRecords as any[] | undefined;
      if (!debtRecords || !Array.isArray(debtRecords)) return [];

      for (const debt of debtRecords) {
        if (!debt.writeOffRequested) continue;

        if (!debt.dueDiligenceComplete) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V16-006',
            'DOD_FMR',
            'high',
            `Write-Off Requested Without Completing Due Diligence`,
            `Debt record "${debt.id}" for debtor "${debt.debtorName}" (amount: $${debt.amount.toLocaleString()}): a write-off has been requested but required due diligence steps have not been completed. Before writing off a debt, agencies must demonstrate that all reasonable collection efforts have been exhausted, including: issuing the required demand letters (minimum of 3), attempting skip tracing if the debtor cannot be located, referring to Treasury for cross-servicing, enrolling in TOP, and considering litigation referral to DOJ.`,
            'DoD FMR Vol 16, Ch 4; 31 CFR 903.1 - Before terminating collection activity and writing off a debt, the agency must have pursued all appropriate means of collection, including demand letters, administrative offset, salary offset, referral to Treasury, and referral to DOJ where appropriate. The debt file must document all collection efforts.',
            'Complete all required due diligence steps before resubmitting the write-off request: (1) verify all demand letters have been sent and documented, (2) perform skip tracing if debtor cannot be located, (3) confirm Treasury cross-servicing referral, (4) confirm TOP enrollment, (5) evaluate litigation referral to DOJ, (6) document the basis for concluding the debt is uncollectible. Only after all steps are documented should the write-off be resubmitted for approval.',
            debt.amount,
            [`Debt Management - Due Diligence - ${debt.id}`]
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V16-007',
    name: 'Travel Card Delinquency (Salary Offset)',
    framework: 'DOD_FMR',
    category: 'debt_management',
    description: 'Checks travel card delinquencies for salary offset eligibility when the delinquent amount exceeds the salary offset threshold',
    citation: 'DoD FMR Vol 16, Ch 5; 5 U.S.C. §5514',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      const salaryOffsetThreshold = getParameter('DOD_TRAVEL_CARD_SALARY_OFFSET_THRESHOLD', data.taxYear, undefined, 250);

      // Check travel card transactions for delinquencies eligible for salary offset
      const delinquentStatuses = ['60_day', '90_plus', 'charge_off'];

      // Group delinquent travel card transactions by traveler
      const delinquentByTraveler = new Map<string, { count: number; totalAmount: number; worstStatus: string }>();

      for (const txn of data.dodData.travelCardTransactions) {
        if (delinquentStatuses.includes(txn.delinquencyStatus)) {
          const existing = delinquentByTraveler.get(txn.travelerId) || { count: 0, totalAmount: 0, worstStatus: txn.delinquencyStatus };
          existing.count += 1;
          existing.totalAmount += txn.amount;
          if (delinquentStatuses.indexOf(txn.delinquencyStatus) > delinquentStatuses.indexOf(existing.worstStatus)) {
            existing.worstStatus = txn.delinquencyStatus;
          }
          delinquentByTraveler.set(txn.travelerId, existing);
        }
      }

      for (const [travelerId, info] of Array.from(delinquentByTraveler.entries())) {
        if (info.totalAmount >= salaryOffsetThreshold) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V16-007',
            'DOD_FMR',
            info.worstStatus === '90_plus' || info.worstStatus === 'charge_off' ? 'critical' : 'high',
            `Travel Card Delinquency Eligible for Salary Offset`,
            `Traveler ${travelerId} has ${info.count} delinquent travel card transaction(s) totaling $${info.totalAmount.toFixed(2)} with worst status "${info.worstStatus.replace(/_/g, ' ')}". The delinquent amount exceeds the $${salaryOffsetThreshold.toFixed(2)} salary offset threshold. Under DoD FMR Vol 16, Ch 5 and 5 U.S.C. §5514, the agency must initiate salary offset procedures to collect delinquent travel card debt from the employee's pay when the cardholder fails to pay voluntarily.`,
            'DoD FMR Vol 16, Ch 5; 5 U.S.C. §5514 - When a travel card holder is delinquent and the amount exceeds the salary offset threshold, the agency must provide the employee with written notice of intent to offset, the opportunity to review records, the right to a hearing, and the right to enter into a repayment agreement before initiating salary offset.',
            'Initiate salary offset procedures: (1) send the employee a written Notice of Intent to Offset at least 30 days before the offset begins, (2) provide the employee the opportunity to inspect and copy agency records related to the debt, (3) offer the employee the right to a hearing, (4) offer the option of a voluntary repayment agreement. If the employee does not respond or pay, proceed with salary offset not to exceed 15% of disposable pay per pay period.',
            info.totalAmount,
            [`Debt Management - Travel Card - ${travelerId}`]
          ));
        }
      }

      // Also check debt records for travel card category debts
      const debtRecords = (data.dodData as any).debtRecords as any[] | undefined;
      if (debtRecords && Array.isArray(debtRecords)) {
        for (const debt of debtRecords) {
          if (debt.category !== 'travel_card') continue;
          if (debt.amount < salaryOffsetThreshold) continue;

          if (debt.delinquentDate) {
            const delinquentDate = new Date(debt.delinquentDate);
            const now = new Date();
            const daysSinceDelinquent = Math.ceil(
              (now.getTime() - delinquentDate.getTime()) / (1000 * 60 * 60 * 24)
            );

            if (daysSinceDelinquent > 60) {
              findings.push(createFinding(
                data.engagementId,
                'DOD-FMR-V16-007',
                'DOD_FMR',
                daysSinceDelinquent > 90 ? 'critical' : 'high',
                `Travel Card Debt Requires Salary Offset Action`,
                `Debt record "${debt.id}" for debtor "${debt.debtorName}": travel card debt of $${debt.amount.toLocaleString()} has been delinquent for ${daysSinceDelinquent} days (since ${debt.delinquentDate}), exceeding the $${salaryOffsetThreshold.toFixed(2)} salary offset threshold. Salary offset procedures must be initiated to collect this delinquent travel card debt from the employee's pay.`,
                'DoD FMR Vol 16, Ch 5; 5 U.S.C. §5514 - Agencies are required to use salary offset to collect delinquent travel card debts when the cardholder fails to pay voluntarily and the debt exceeds the offset threshold.',
                'Initiate or verify salary offset procedures for this travel card debt. Ensure proper due process notice has been provided. Begin salary deductions not to exceed 15% of disposable pay per pay period. Coordinate with the payroll office to implement the offset and track collections until the debt is fully satisfied.',
                debt.amount,
                [`Debt Management - Travel Card - ${debt.id}`]
              ));
            }
          }
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V16-008',
    name: 'Waiver and Remission Procedures',
    framework: 'DOD_FMR',
    category: 'debt_management',
    description: 'Validates that waiver and remission requests follow proper procedures and authorization levels per applicable statutory authority',
    citation: '5 U.S.C. §5584; 10 U.S.C. §2774; DoD FMR Vol 16, Ch 6',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const debtRecords = (data.dodData as any).debtRecords as any[] | undefined;
      if (!debtRecords || !Array.isArray(debtRecords)) return [];

      const writeOffThreshold = getParameter('DOD_DEBT_WRITEOFF_THRESHOLD', data.taxYear, undefined, 100000);

      for (const debt of debtRecords) {
        if (!debt.waiverRequested) continue;

        // Waiver approved without proper documentation
        if (debt.waiverApproved && !debt.writeOffApprovedBy) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V16-008',
            'DOD_FMR',
            'high',
            `Waiver Approved Without Documented Authorization`,
            `Debt record "${debt.id}" for debtor "${debt.debtorName}" (amount: $${debt.amount.toLocaleString()}): a waiver has been approved but no authorizing official is documented. Waivers of erroneous payments under 5 U.S.C. §5584 (civilian) or 10 U.S.C. §2774 (military) require approval by an official with delegated waiver authority. The approval must document: (1) the statutory basis for the waiver, (2) that the overpayment was not the fault of the employee, and (3) that collection would be against equity and good conscience or not in the best interest of the United States.`,
            '5 U.S.C. §5584; 10 U.S.C. §2774; DoD FMR Vol 16, Ch 6 - Waiver authority is vested in specific officials and may be delegated. The waiver decision must document the statutory basis and findings required by law. All waivers must have a signed approval from the authorized official.',
            'Identify and document the approving official for this waiver. Ensure the official has proper delegated authority. Document the statutory basis (5 U.S.C. §5584 for civilian pay or 10 U.S.C. §2774 for military pay) and the required findings: (1) no fault or fraud by the employee, and (2) collection would be against equity and good conscience. If these cannot be documented, reverse the waiver.',
            debt.amount,
            [`Debt Management - Waiver - ${debt.id}`]
          ));
        }

        // Waiver for large amount needs higher authority
        if (debt.waiverApproved && debt.amount > writeOffThreshold) {
          const approvalLevel = debt.writeOffApprovalLevel || 'unknown';
          if (approvalLevel !== 'agency_head' && approvalLevel !== 'cfo' && approvalLevel !== 'gc') {
            findings.push(createFinding(
              data.engagementId,
              'DOD-FMR-V16-008',
              'DOD_FMR',
              'critical',
              `Waiver Amount Exceeds Standard Authority Level`,
              `Debt record "${debt.id}" for debtor "${debt.debtorName}": waiver approved for $${debt.amount.toLocaleString()} exceeds the $${writeOffThreshold.toLocaleString()} threshold but was approved at level "${approvalLevel}". Waivers of this magnitude require review and approval at the agency head, CFO, or General Counsel level to ensure proper oversight of the government's financial interests.`,
              '5 U.S.C. §5584; 10 U.S.C. §2774; DoD FMR Vol 16, Ch 6 - Large waiver amounts must be approved at higher authority levels. The Defense Finance and Accounting Service (DFAS) has specific delegation thresholds for waiver authority.',
              'Escalate this waiver to the appropriate authority level for review and re-approval. Prepare a comprehensive waiver package including the legal analysis, financial impact assessment, and findings of fact supporting the waiver. Obtain documented approval from the agency head, CFO, or General Counsel as appropriate for the waiver amount.',
              debt.amount,
              [`Debt Management - Waiver - ${debt.id}`]
            ));
          }
        }

        // Waiver requested but not yet acted upon - check for timeliness
        if (!debt.waiverApproved && debt.waiverRequested && debt.delinquentDate) {
          const requestDate = new Date(debt.delinquentDate);
          const now = new Date();
          const daysPending = Math.ceil(
            (now.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysPending > 180) {
            findings.push(createFinding(
              data.engagementId,
              'DOD-FMR-V16-008',
              'DOD_FMR',
              'medium',
              `Waiver Request Pending Over 180 Days`,
              `Debt record "${debt.id}" for debtor "${debt.debtorName}" (amount: $${debt.amount.toLocaleString()}): a waiver request has been pending for approximately ${daysPending} days without a final determination. Delays in processing waiver requests create uncertainty for both the debtor and the agency, and may affect the timeliness of collection actions if the waiver is ultimately denied.`,
              '5 U.S.C. §5584; 10 U.S.C. §2774; DoD FMR Vol 16, Ch 6 - Waiver requests should be processed promptly. While collection may be suspended during waiver consideration, unnecessary delays reduce the likelihood of successful collection if the waiver is denied.',
              'Expedite the waiver review and determination. Assign the case to a reviewer with appropriate authority. Ensure all required documentation and legal analysis have been completed. Notify the debtor of the expected timeline for a decision. If collection has been suspended pending the waiver, consider whether interim collection actions are appropriate.',
              debt.amount,
              [`Debt Management - Waiver - ${debt.id}`]
            ));
          }
        }
      }

      return findings;
    },
  },
];
