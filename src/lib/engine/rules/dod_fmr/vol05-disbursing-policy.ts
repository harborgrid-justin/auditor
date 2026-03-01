import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '@/lib/engine/rule-runner';
import { getParameter } from '@/lib/engine/tax-parameters/registry';

export const disbursingPolicyRules: AuditRule[] = [
  {
    id: 'DOD-FMR-V05-001',
    name: 'Payment Certification Control',
    framework: 'DOD_FMR',
    category: 'Disbursing Policy (Vol 5)',
    description: 'Checks that all disbursements have a certifiedBy field populated to ensure proper payment certification',
    citation: 'DoD FMR Vol 5, Ch 2; 31 U.S.C. § 3528 - Responsibilities and Relief of Certifying Officers',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { disbursements } = data.dodData;

      const uncertified = disbursements.filter(d =>
        !d.certifiedBy && d.status !== 'cancelled' && d.status !== 'returned'
      );

      if (uncertified.length > 0) {
        const totalAmount = uncertified.reduce((sum, d) => sum + d.amount, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V05-001',
          'DOD_FMR',
          'high',
          'Disbursements Without Payment Certification',
          `${uncertified.length} disbursement(s) totaling $${(totalAmount / 1000000).toFixed(2)}M were processed without a certifying officer recorded. Disbursements: ${uncertified.slice(0, 5).map(d => `${d.disbursementNumber} ($${(d.amount / 1000000).toFixed(2)}M)`).join(', ')}${uncertified.length > 5 ? ` and ${uncertified.length - 5} more` : ''}. All federal payments must be certified by a designated certifying officer who accepts pecuniary liability for the correctness and legality of the payment.`,
          'DoD FMR Volume 5, Chapter 2; 31 U.S.C. § 3528: Certifying officers are personally liable for payments they certify. All disbursements must be certified before release.',
          'Ensure all disbursements are reviewed and certified by a designated certifying officer before payment is released. Record the certifying officer identity in the disbursement record. Provide certifying officer training and maintain designation letters.',
          totalAmount,
          uncertified.map(d => d.disbursementNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V05-002',
    name: 'EFT Compliance',
    framework: 'DOD_FMR',
    category: 'Disbursing Policy (Vol 5)',
    description: 'Verifies disbursements use Electronic Funds Transfer as the default payment method per federal requirements',
    citation: 'DoD FMR Vol 5, Ch 3; 31 U.S.C. § 3332 - Required Direct Deposit (EFT)',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const fy = data.dodData?.fiscalYear ?? new Date(data.fiscalYearEnd).getFullYear();
      const findings: AuditFinding[] = [];
      const { disbursements } = data.dodData;
      const eftComplianceThreshold = getParameter('DOD_EFT_COMPLIANCE_THRESHOLD', fy, undefined, 0.95);

      const activeDisbursements = disbursements.filter(d =>
        d.status !== 'cancelled' && d.status !== 'returned'
      );

      if (activeDisbursements.length === 0) return findings;

      const nonEft = activeDisbursements.filter(d => d.paymentMethod !== 'eft' && d.paymentMethod !== 'intra_gov');
      const eftComplianceRate = (activeDisbursements.length - nonEft.length) / activeDisbursements.length;

      if (nonEft.length > 0 && eftComplianceRate < eftComplianceThreshold) {
        const nonEftPct = ((nonEft.length / activeDisbursements.length) * 100).toFixed(1);
        const totalNonEft = nonEft.reduce((sum, d) => sum + d.amount, 0);
        const methodCounts: Record<string, number> = {};
        for (const d of nonEft) {
          methodCounts[d.paymentMethod] = (methodCounts[d.paymentMethod] || 0) + 1;
        }
        const methodBreakdown = Object.entries(methodCounts).map(([m, c]) => `${m}: ${c}`).join(', ');

        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V05-002',
          'DOD_FMR',
          'medium',
          'Disbursements Not Using Electronic Funds Transfer',
          `${nonEft.length} of ${activeDisbursements.length} disbursement(s) (${nonEftPct}%) totaling $${(totalNonEft / 1000000).toFixed(2)}M are not using EFT. Payment method breakdown: ${methodBreakdown}. The Debt Collection Improvement Act of 1996 and 31 U.S.C. § 3332 require federal payments to be made by EFT unless a specific waiver applies.`,
          'DoD FMR Volume 5, Chapter 3; 31 U.S.C. § 3332: All federal payments must be made by EFT. Waivers are available only in limited circumstances.',
          'Convert non-EFT payments to electronic methods. Verify that any check payments have documented waivers. Implement system defaults to use EFT as the primary payment method.',
          totalNonEft,
          nonEft.map(d => d.disbursementNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V05-003',
    name: 'Prompt Payment Act Compliance',
    framework: 'DOD_FMR',
    category: 'Disbursing Policy (Vol 5)',
    description: 'Checks disbursement dates against prompt pay due dates for late payment detection',
    citation: 'DoD FMR Vol 5, Ch 10; 5 CFR Part 1315 - Prompt Payment',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const fy = data.dodData?.fiscalYear ?? new Date(data.fiscalYearEnd).getFullYear();
      const findings: AuditFinding[] = [];
      const { disbursements } = data.dodData;
      const promptPayNetDays = getParameter('DOD_PROMPT_PAY_NET_DAYS', fy, undefined, 30);

      const latePayments = disbursements.filter(d => {
        if (!d.promptPayDueDate || !d.disbursementDate) return false;
        if (d.status === 'cancelled' || d.status === 'returned') return false;
        return new Date(d.disbursementDate) > new Date(d.promptPayDueDate);
      });

      if (latePayments.length > 0) {
        const totalLate = latePayments.reduce((sum, d) => sum + d.amount, 0);
        const totalPenalties = latePayments.reduce((sum, d) => sum + d.interestPenalty, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V05-003',
          'DOD_FMR',
          'high',
          'Prompt Payment Act Violations Detected',
          `${latePayments.length} disbursement(s) totaling $${(totalLate / 1000000).toFixed(2)}M were paid after the Prompt Payment Act due date. Total interest penalties incurred: $${totalPenalties.toFixed(2)}. Examples: ${latePayments.slice(0, 5).map(d => `${d.disbursementNumber} (due: ${d.promptPayDueDate}, paid: ${d.disbursementDate})`).join('; ')}${latePayments.length > 5 ? ` and ${latePayments.length - 5} more` : ''}. Late payments generate interest penalty costs and violate the Prompt Payment Act.`,
          `DoD FMR Volume 5, Chapter 10; 5 CFR Part 1315 (Prompt Payment Act): Agencies must pay interest penalties on late payments. The standard payment period is ${promptPayNetDays} days from receipt of a proper invoice.`,
          'Investigate the causes of late payments. Implement payment tracking dashboards with aging alerts. Ensure interest penalties are paid automatically when due.',
          totalPenalties,
          latePayments.map(d => d.disbursementNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V05-004',
    name: 'Discount Opportunity Capture',
    framework: 'DOD_FMR',
    category: 'Disbursing Policy (Vol 5)',
    description: 'Checks for missed early payment discounts by comparing discount dates to disbursement dates',
    citation: 'DoD FMR Vol 5, Ch 10; 5 CFR Part 1315 - Prompt Payment Discounts',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { disbursements } = data.dodData;

      const missedDiscounts = disbursements.filter(d => {
        if (!d.discountDate || !d.disbursementDate) return false;
        if (d.status === 'cancelled' || d.status === 'returned') return false;
        if (d.discountAmount <= 0) return false;
        return new Date(d.disbursementDate) > new Date(d.discountDate);
      });

      if (missedDiscounts.length > 0) {
        const totalMissedDiscounts = missedDiscounts.reduce((sum, d) => sum + d.discountAmount, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V05-004',
          'DOD_FMR',
          'medium',
          'Missed Early Payment Discounts',
          `${missedDiscounts.length} disbursement(s) missed early payment discount opportunities totaling $${totalMissedDiscounts.toFixed(2)} in lost savings. Examples: ${missedDiscounts.slice(0, 5).map(d => `${d.disbursementNumber} (discount deadline: ${d.discountDate}, paid: ${d.disbursementDate}, discount: $${d.discountAmount.toFixed(2)})`).join('; ')}${missedDiscounts.length > 5 ? ` and ${missedDiscounts.length - 5} more` : ''}. The Prompt Payment Act encourages agencies to take advantage of offered discounts when the annualized return exceeds the Treasury borrowing rate.`,
          'DoD FMR Volume 5, Chapter 10; 5 CFR Part 1315.7: Agencies should take discounts when the effective annual percentage rate exceeds the Treasury borrowing rate.',
          'Implement early payment tracking to identify discount opportunities. Prioritize payment processing for invoices with significant discount terms.',
          totalMissedDiscounts,
          missedDiscounts.map(d => d.disbursementNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V05-005',
    name: 'Interest Penalty Detection',
    framework: 'DOD_FMR',
    category: 'Disbursing Policy (Vol 5)',
    description: 'Flags disbursements where interest penalties greater than zero have been incurred',
    citation: 'DoD FMR Vol 5, Ch 10; 31 U.S.C. § 3902 - Interest Penalties',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { disbursements } = data.dodData;

      const withPenalties = disbursements.filter(d =>
        d.interestPenalty > 0 && d.status !== 'cancelled' && d.status !== 'returned'
      );

      if (withPenalties.length > 0) {
        const totalPenalties = withPenalties.reduce((sum, d) => sum + d.interestPenalty, 0);
        const totalPrincipal = withPenalties.reduce((sum, d) => sum + d.amount, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V05-005',
          'DOD_FMR',
          'medium',
          'Interest Penalties Incurred on Late Payments',
          `${withPenalties.length} disbursement(s) with principal amounts totaling $${(totalPrincipal / 1000000).toFixed(2)}M have incurred interest penalties totaling $${totalPenalties.toFixed(2)}. Interest penalties represent an avoidable cost to the government resulting from failure to make timely payments. These costs are charged to the appropriation funding the underlying obligation.`,
          'DoD FMR Volume 5, Chapter 10; 31 U.S.C. § 3902: Interest penalties are mandatory when payment is late. Penalty interest is computed using the Treasury Tax and Loan Rate.',
          'Analyze root causes of late payments generating penalties. Implement process improvements to ensure payments are made within Prompt Payment Act timeframes. Track penalty trends and report to management.',
          totalPenalties,
          withPenalties.map(d => d.disbursementNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V05-006',
    name: 'Duplicate Payment Detection',
    framework: 'DOD_FMR',
    category: 'Disbursing Policy (Vol 5)',
    description: 'Checks for potential duplicate payments by identifying same payeeId, amount, and similar dates',
    citation: 'DoD FMR Vol 5, Ch 5; OMB Circular A-123, Appendix C - Improper Payments',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { disbursements } = data.dodData;

      const activeDisbursements = disbursements.filter(d =>
        d.status !== 'cancelled' && d.status !== 'returned' && d.payeeId
      );

      const groups = new Map<string, typeof activeDisbursements>();
      for (const d of activeDisbursements) {
        const key = `${d.payeeId}|${d.amount.toFixed(2)}`;
        const group = groups.get(key) || [];
        group.push(d);
        groups.set(key, group);
      }

      const potentialDuplicates: Array<{ payeeId: string; amount: number; pairs: string[] }> = [];

      for (const [, group] of Array.from(groups.entries())) {
        if (group.length < 2) continue;
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const date1 = new Date(group[i].disbursementDate);
            const date2 = new Date(group[j].disbursementDate);
            const daysDiff = Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24);
            if (daysDiff <= 30) {
              potentialDuplicates.push({
                payeeId: group[i].payeeId!,
                amount: group[i].amount,
                pairs: [group[i].disbursementNumber, group[j].disbursementNumber],
              });
            }
          }
        }
      }

      if (potentialDuplicates.length > 0) {
        const totalAtRisk = potentialDuplicates.reduce((sum, pd) => sum + pd.amount, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V05-006',
          'DOD_FMR',
          'high',
          'Potential Duplicate Payments Detected',
          `${potentialDuplicates.length} potential duplicate payment pair(s) detected, representing $${(totalAtRisk / 1000000).toFixed(2)}M at risk. Pairs identified by same payee and amount within 30 days: ${potentialDuplicates.slice(0, 5).map(pd => `Payee ${pd.payeeId}, $${(pd.amount / 1000000).toFixed(4)}M (${pd.pairs.join(' & ')})`).join('; ')}${potentialDuplicates.length > 5 ? ` and ${potentialDuplicates.length - 5} more` : ''}. Duplicate payments are a leading category of improper payments in the federal government.`,
          'DoD FMR Volume 5, Chapter 5; OMB Circular A-123, Appendix C: Agencies must implement controls to prevent, detect, and recover duplicate payments.',
          'Investigate each potential duplicate. If confirmed, initiate recovery action per Volume 5 debt collection procedures. Implement pre-payment duplicate detection controls.',
          totalAtRisk,
          potentialDuplicates.flatMap(pd => pd.pairs)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V05-007',
    name: 'Disbursement-Obligation Linkage',
    framework: 'DOD_FMR',
    category: 'Disbursing Policy (Vol 5)',
    description: 'Verifies that all disbursements reference valid obligations to maintain proper fund accountability',
    citation: 'DoD FMR Vol 5, Ch 2; 31 U.S.C. § 1501 - Documentary Evidence of Obligations',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { disbursements, obligations } = data.dodData;

      const obligationIds = new Set(obligations.map(o => o.id));
      const unlinked = disbursements.filter(d =>
        d.status !== 'cancelled' && d.status !== 'returned' && !obligationIds.has(d.obligationId)
      );

      if (unlinked.length > 0) {
        const totalUnlinked = unlinked.reduce((sum, d) => sum + d.amount, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V05-007',
          'DOD_FMR',
          'high',
          'Disbursements Not Linked to Valid Obligations',
          `${unlinked.length} disbursement(s) totaling $${(totalUnlinked / 1000000).toFixed(2)}M do not reference valid obligation records. Disbursements: ${unlinked.slice(0, 5).map(d => `${d.disbursementNumber} ($${(d.amount / 1000000).toFixed(4)}M)`).join('; ')}${unlinked.length > 5 ? ` and ${unlinked.length - 5} more` : ''}. All disbursements must be traceable to a valid obligation to comply with appropriations law.`,
          'DoD FMR Volume 5, Chapter 2; 31 U.S.C. § 1501: Expenditures must be supported by documentary evidence of a valid obligation. 31 U.S.C. § 1341 prohibits expenditures without a valid obligation.',
          'Link each unlinked disbursement to its corresponding obligation. If no valid obligation exists, determine if the payment was improper and initiate recovery. Implement system controls to prevent disbursements without a valid obligation reference.',
          totalUnlinked,
          unlinked.map(d => d.disbursementNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V05-008',
    name: 'Improper Payment Risk Assessment',
    framework: 'DOD_FMR',
    category: 'Disbursing Policy (Vol 5)',
    description: 'Checks for payment anomalies where disbursement amounts exceed the remaining obligation balance',
    citation: 'DoD FMR Vol 5, Ch 5; OMB Circular A-123, Appendix C - Improper Payments',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { disbursements, obligations } = data.dodData;

      const obligationMap = new Map(obligations.map(o => [o.id, o]));

      const overpayments: Array<{ disbNum: string; disbAmt: number; oblNum: string; ulo: number; excess: number }> = [];

      for (const disb of disbursements) {
        if (disb.status === 'cancelled' || disb.status === 'returned') continue;
        const obligation = obligationMap.get(disb.obligationId);
        if (!obligation) continue;

        if (disb.amount > obligation.unliquidatedBalance + obligation.amount * 0.01) {
          overpayments.push({
            disbNum: disb.disbursementNumber,
            disbAmt: disb.amount,
            oblNum: obligation.obligationNumber,
            ulo: obligation.unliquidatedBalance,
            excess: disb.amount - obligation.unliquidatedBalance,
          });
        }
      }

      if (overpayments.length > 0) {
        const totalExcess = overpayments.reduce((sum, op) => sum + op.excess, 0);
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V05-008',
          'DOD_FMR',
          'high',
          'Disbursements Exceed Obligation Balances',
          `${overpayments.length} disbursement(s) exceed the remaining unliquidated obligation balance, with total excess of $${(totalExcess / 1000000).toFixed(2)}M. Examples: ${overpayments.slice(0, 5).map(op => `${op.disbNum}: disbursed $${(op.disbAmt / 1000000).toFixed(4)}M against obligation ${op.oblNum} with ULO of $${(op.ulo / 1000000).toFixed(4)}M`).join('; ')}${overpayments.length > 5 ? ` and ${overpayments.length - 5} more` : ''}. Payments exceeding obligation balances are a high-risk indicator for improper payments and potential ADA violations.`,
          'DoD FMR Volume 5, Chapter 5; OMB Circular A-123, Appendix C: Agencies must implement controls to prevent payments in excess of valid obligations. 31 U.S.C. § 1341.',
          'Investigate each flagged disbursement. If the obligation needs to be increased, process an upward adjustment. If the payment was improper, initiate recovery procedures. Review disbursing controls to prevent future occurrences.',
          totalExcess,
          overpayments.map(op => op.disbNum)
        ));
      }

      return findings;
    },
  },
];
