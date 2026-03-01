import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '@/lib/engine/rule-runner';
import { getParameter } from '@/lib/engine/tax-parameters/registry';

export const contractPaymentRules: AuditRule[] = [
  {
    id: 'DOD-FMR-V10-001',
    name: 'Progress Payment Rate Validation',
    framework: 'DOD_FMR',
    category: 'Contract Payment (Volume 10)',
    description: 'Verifies that progress payment percentages do not exceed 80% for large business (default) or 90% for small business contracts',
    citation: 'DoD FMR Vol 10, Ch 9; FAR 32.501 - Progress payment rates',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const fy = data.dodData?.fiscalYear ?? new Date(data.fiscalYearEnd).getFullYear();
      const findings: AuditFinding[] = [];

      const lbPct = getParameter('DOD_PROGRESS_PAY_LB_PCT', fy, undefined, 0.80);
      const sbPct = getParameter('DOD_PROGRESS_PAY_SB_PCT', fy, undefined, 0.90);
      const defaultMaxRate = lbPct * 100; // Large business default as percentage
      const smallBizMaxRate = sbPct * 100; // Small business max as percentage

      for (const payment of data.dodData.contractPayments) {
        if (payment.paymentType !== 'progress' || !payment.progressPaymentPct) continue;

        if (payment.progressPaymentPct > defaultMaxRate) {
          const severity = payment.progressPaymentPct > smallBizMaxRate ? 'critical' : 'high';
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V10-001',
            'DOD_FMR',
            severity,
            `Progress Payment Rate Exceeds ${defaultMaxRate}% Threshold`,
            `Contract ${payment.contractNumber}: progress payment of $${payment.approvedAmount.toLocaleString()} applied at ${payment.progressPaymentPct}%, which exceeds the ${defaultMaxRate}% maximum rate for large businesses. If the contractor is a small business, the maximum is ${smallBizMaxRate}%. Rates above ${smallBizMaxRate}% are never permissible. This may constitute an excessive advance of government funds.`,
            `DoD FMR Vol 10, Ch 9; FAR 32.501-1 - Progress payment rates shall not exceed ${defaultMaxRate}% for large businesses or ${smallBizMaxRate}% for small businesses.`,
            `Verify the contractor business size determination in SAM.gov. If the contractor is not a qualifying small business, reduce the progress payment rate to ${defaultMaxRate}%. Recover any excess payment amount and adjust future progress payment requests accordingly.`,
            payment.approvedAmount * (payment.progressPaymentPct - defaultMaxRate) / 100,
            ['Contract Payment - Progress Payment']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V10-002',
    name: 'Performance-Based Payment Compliance',
    framework: 'DOD_FMR',
    category: 'Contract Payment (Volume 10)',
    description: 'Verifies that performance-based payment percentages are within the allowable range and tied to measurable milestones',
    citation: 'DoD FMR Vol 10, Ch 9; FAR 32.1004 - Performance-based payment procedures',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const payment of data.dodData.contractPayments) {
        if (payment.paymentType !== 'performance_based') continue;

        if (payment.performanceBasedPct && payment.performanceBasedPct > 100) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V10-002',
            'DOD_FMR',
            'high',
            `Performance-Based Payment Exceeds 100% of Milestone Value`,
            `Contract ${payment.contractNumber}: performance-based payment at ${payment.performanceBasedPct}% exceeds the maximum 100% milestone value. Approved amount: $${payment.approvedAmount.toLocaleString()}. Payments cannot exceed the contract milestone value.`,
            'DoD FMR Vol 10, Ch 9; FAR 32.1004 - Performance-based payments shall not exceed the value of the milestone event achieved.',
            'Review the milestone payment schedule in the contract. Verify the payment corresponds to an approved milestone and that the percentage does not exceed 100%. Recover any excess payment from the contractor.',
            payment.approvedAmount * (payment.performanceBasedPct - 100) / 100,
            ['Contract Payment - Performance-Based']
          ));
        }

        if (!payment.performanceBasedPct || payment.performanceBasedPct <= 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V10-002',
            'DOD_FMR',
            'medium',
            `Performance-Based Payment Without Milestone Percentage`,
            `Contract ${payment.contractNumber}: a performance-based payment of $${payment.approvedAmount.toLocaleString()} was processed without a documented milestone completion percentage. Performance-based payments must be linked to specific, measurable performance events.`,
            'DoD FMR Vol 10, Ch 9; FAR 32.1004 - Performance-based payments must be based on quantifiable, measurable, and verifiable objective criteria.',
            'Obtain documentation from the contracting officer confirming the milestone event and completion percentage. Update the payment record with verified milestone data before processing further payments.',
            null,
            ['Contract Payment - Performance-Based']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V10-003',
    name: 'DCAA Audit Requirement',
    framework: 'DOD_FMR',
    category: 'Contract Payment (Volume 10)',
    description: 'Flags contract payments where DCAA audit is required but status is pending or not_required, indicating inadequate cost oversight',
    citation: 'DoD FMR Vol 10, Ch 14; 10 U.S.C. 3841 - Audit of contractor costs',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const fy = data.dodData?.fiscalYear ?? new Date(data.fiscalYearEnd).getFullYear();
      const findings: AuditFinding[] = [];
      const dcaaAuditThreshold = getParameter('DOD_DCAA_AUDIT_THRESHOLD', fy, undefined, 2000000);

      for (const payment of data.dodData.contractPayments) {
        if (!payment.dcaaAuditRequired) continue;

        if (payment.dcaaAuditStatus === 'not_required') {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V10-003',
            'DOD_FMR',
            'high',
            `DCAA Audit Required But Marked Not Required`,
            `Contract ${payment.contractNumber} (${payment.contractType.replace(/_/g, ' ')}): DCAA audit is required per the payment record but the audit status is marked as "not_required." This contradictory status indicates a control failure in cost oversight. Payment amount: $${payment.approvedAmount.toLocaleString()}.`,
            'DoD FMR Vol 10, Ch 14; 10 U.S.C. 3841 - The head of an agency shall provide for DCAA audit of costs incurred under cost-type contracts. Audit coverage is mandatory for contractor incurred cost and indirect rate validation.',
            'Request DCAA audit coverage for this contract immediately. Do not process final payment or close the contract until DCAA has completed its audit. Correct the audit status field to reflect the actual requirement.',
            payment.approvedAmount,
            ['Contract Payment - DCAA Audit']
          ));
        }

        if (payment.dcaaAuditStatus === 'pending' && payment.approvedAmount > dcaaAuditThreshold) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V10-003',
            'DOD_FMR',
            'medium',
            `Payment Processed While DCAA Audit Pending`,
            `Contract ${payment.contractNumber}: payment of $${payment.approvedAmount.toLocaleString()} was processed while the required DCAA audit is still pending. Final cost determination has not been made, creating risk of overpayment on unaudited costs.`,
            'DoD FMR Vol 10, Ch 14 - Payments on cost-type contracts should be based on audited or provisionally approved rates. Final payment should not occur before audit completion.',
            'Ensure payments are based on DCAA-approved provisional billing rates. Track the audit status and reconcile any differences when the final audit is complete. Consider withholding a portion of payment pending audit completion.',
            null,
            ['Contract Payment - DCAA Audit']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V10-004',
    name: 'Invoice-Payment Discrepancy',
    framework: 'DOD_FMR',
    category: 'Contract Payment (Volume 10)',
    description: 'Checks for material differences (greater than 10%) between invoice amount and approved payment amount on contract payments',
    citation: 'DoD FMR Vol 10, Ch 7 - Invoice review and payment approval',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const payment of data.dodData.contractPayments) {
        if (payment.invoiceAmount <= 0) continue;

        const difference = Math.abs(payment.invoiceAmount - payment.approvedAmount);
        const discrepancyPct = (difference / payment.invoiceAmount) * 100;

        if (discrepancyPct > 10) {
          const isUnderpayment = payment.approvedAmount < payment.invoiceAmount;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V10-004',
            'DOD_FMR',
            discrepancyPct > 25 ? 'high' : 'medium',
            `Invoice-Payment Discrepancy: ${discrepancyPct.toFixed(1)}% ${isUnderpayment ? 'Underpayment' : 'Overpayment'}`,
            `Contract ${payment.contractNumber}: invoice amount of $${payment.invoiceAmount.toLocaleString()} vs. approved payment of $${payment.approvedAmount.toLocaleString()} shows a ${discrepancyPct.toFixed(1)}% discrepancy ($${difference.toLocaleString()}). ${isUnderpayment ? 'Underpayment may result in Prompt Payment Act interest penalties.' : 'Overpayment requires investigation and potential recovery.'}`,
            'DoD FMR Vol 10, Ch 7 - Payments must be based on properly reviewed and approved invoices. Material discrepancies between invoiced and paid amounts require documentation and justification.',
            isUnderpayment
              ? 'Review the invoice for compliance with contract terms. If the full amount is justified, process a supplemental payment to avoid Prompt Payment Act penalties. Document the reason for any withholding.'
              : 'Investigate why the approved amount exceeds the invoice. Determine if an error occurred in payment processing. If overpayment is confirmed, initiate recovery action from the contractor.',
            difference,
            ['Contract Payment - Invoice']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V10-005',
    name: 'Contract Closeout Timeliness',
    framework: 'DOD_FMR',
    category: 'Contract Payment (Volume 10)',
    description: 'Flags completed contracts that do not have a closeout date, indicating delayed contract closeout procedures',
    citation: 'DoD FMR Vol 10, Ch 15; FAR 4.804-1 - Contract closeout time standards',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const contract of data.dodData.contracts) {
        if (contract.status === 'completed' && !contract.closeoutDate) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V10-005',
            'DOD_FMR',
            'medium',
            `Completed Contract Without Closeout`,
            `Contract ${contract.contractNumber} (${contract.vendorName}, type: ${contract.contractType.replace(/_/g, ' ')}): status is "completed" but no closeout date has been recorded. Total value: $${contract.totalValue.toLocaleString()}, obligated: $${contract.obligatedAmount.toLocaleString()}. Open contracts tie up funds and create stale unliquidated obligation balances.`,
            'DoD FMR Vol 10, Ch 15; FAR 4.804-1 - Contracts should be closed within applicable time standards: 6 months for firm-fixed-price, 36 months for cost-type contracts after physical completion.',
            'Initiate contract closeout procedures immediately. Complete final invoice review, release excess funds, resolve outstanding claims or disputes, and process the closeout modification. De-obligate remaining unliquidated balances.',
            null,
            ['Contract Payment - Closeout']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V10-006',
    name: 'Retainage Compliance',
    framework: 'DOD_FMR',
    category: 'Contract Payment (Volume 10)',
    description: 'Verifies that retainage amounts are greater than zero for progress payments, ensuring government interest is protected',
    citation: 'DoD FMR Vol 10, Ch 9; FAR 32.103 - Progress payments under construction contracts',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const payment of data.dodData.contractPayments) {
        if (payment.paymentType !== 'progress') continue;

        if (payment.retainageAmount <= 0 && payment.invoiceAmount > 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V10-006',
            'DOD_FMR',
            'medium',
            `No Retainage Withheld on Progress Payment`,
            `Contract ${payment.contractNumber}: progress payment of $${payment.invoiceAmount.toLocaleString()} was processed with ${payment.retainageAmount < 0 ? 'negative' : 'zero'} retainage ($${payment.retainageAmount.toFixed(2)}). Retainage is typically withheld on progress payments to protect the government's interest and ensure satisfactory contract completion.`,
            'DoD FMR Vol 10, Ch 9; FAR 32.103 - Retainage on progress payments protects the government interest until satisfactory contract completion. Standard retainage is typically 5-10% of each progress billing.',
            'Verify whether the contract terms include retainage requirements and whether a retainage waiver was authorized by the contracting officer. If retainage should have been withheld, adjust future payments to recover the missed retainage amount.',
            null,
            ['Contract Payment - Retainage']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V10-007',
    name: 'Payment Certification',
    framework: 'DOD_FMR',
    category: 'Contract Payment (Volume 10)',
    description: 'Verifies that the certifiedBy field is populated on contract payments to ensure proper payment certification controls',
    citation: 'DoD FMR Vol 10, Ch 7; 31 U.S.C. 3528 - Certifying officer responsibilities',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      for (const payment of data.dodData.contractPayments) {
        if (!payment.certifiedBy || payment.certifiedBy.trim() === '') {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V10-007',
            'DOD_FMR',
            'high',
            `Contract Payment Missing Certification`,
            `Contract ${payment.contractNumber}: payment of $${payment.approvedAmount.toLocaleString()} (type: ${payment.paymentType.replace(/_/g, ' ')}) does not have a certifying officer recorded. All disbursements require certification by a properly appointed certifying officer who is personally and pecuniarily liable for the correctness of the payment.`,
            'DoD FMR Vol 10, Ch 7; 31 U.S.C. 3528 - A certifying officer must certify the correctness of each payment voucher before disbursement. The certifying officer is personally liable for any illegal, improper, or incorrect payment.',
            'Identify the certifying officer responsible for this payment and update the record. If no certifying officer was involved, investigate whether proper payment controls were bypassed. Ensure all future payments are certified before disbursement.',
            payment.approvedAmount,
            ['Contract Payment - Certification']
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V10-008',
    name: 'Contract Funding Adequacy',
    framework: 'DOD_FMR',
    category: 'Contract Payment (Volume 10)',
    description: 'Checks if contract obligated amount is less than cumulative payments made, indicating potential over-disbursement',
    citation: 'DoD FMR Vol 10, Ch 2; 31 U.S.C. 1501 - Documentary evidence for obligations',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];

      // Aggregate payments by contract number
      const paymentsByContract = new Map<string, number>();
      for (const payment of data.dodData.contractPayments) {
        const current = paymentsByContract.get(payment.contractNumber) || 0;
        paymentsByContract.set(payment.contractNumber, current + payment.approvedAmount);
      }

      for (const contract of data.dodData.contracts) {
        const totalPayments = paymentsByContract.get(contract.contractNumber) || 0;

        if (totalPayments > contract.obligatedAmount && contract.obligatedAmount > 0) {
          const excess = totalPayments - contract.obligatedAmount;
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V10-008',
            'DOD_FMR',
            'critical',
            `Contract Payments Exceed Obligated Amount`,
            `Contract ${contract.contractNumber} (${contract.vendorName}): cumulative payments of $${totalPayments.toLocaleString()} exceed the obligated amount of $${contract.obligatedAmount.toLocaleString()} by $${excess.toLocaleString()}. Disbursements exceeding obligations constitute a potential Anti-Deficiency Act violation under 31 U.S.C. 1341.`,
            'DoD FMR Vol 10, Ch 2; 31 U.S.C. 1501 - Payments shall not exceed the recorded obligation amount. Over-disbursement requires immediate investigation and may constitute an ADA violation.',
            'Immediately investigate the over-disbursement. Determine if additional obligation authority exists or if the obligation record is incomplete. If confirmed as an over-disbursement, report as a potential ADA violation per DoD FMR Vol 14. Initiate recovery of excess payments from the contractor.',
            excess,
            ['Contract Payment - Funding']
          ));
        }
      }

      return findings;
    },
  },
];
