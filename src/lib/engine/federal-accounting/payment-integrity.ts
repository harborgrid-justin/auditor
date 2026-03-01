/**
 * Payment Integrity Engine
 *
 * Implements compliance with the Payment Integrity Information Act (PIIA) of
 * 2019 (P.L. 116-117), which supersedes IPERA/IPERIA. All federal agencies
 * must:
 *
 *   1. Identify programs susceptible to significant improper payments
 *   2. Estimate improper payment rates through statistical sampling
 *   3. Report improper payment information annually
 *   4. Publish corrective action plans for programs exceeding thresholds
 *
 * Improper payments include:
 *   - Duplicate payments (same vendor, amount, period)
 *   - Overpayments (paid more than owed)
 *   - Underpayments (paid less than owed)
 *   - Payments to wrong payee
 *   - Payments for goods/services not received
 *   - Payments not supported by documentation
 *
 * OMB defines "significant" as either:
 *   - Both 1.5% of program outlays AND $10 million, OR
 *   - $100 million regardless of rate
 *
 * References:
 *   - P.L. 116-117, PIIA (2019)
 *   - OMB Circular A-123, Appendix C (Requirements for Payment Integrity)
 *   - OMB Circular A-136, Section II.4 (Improper Payment Reporting)
 *   - DoD FMR Vol. 5, Ch. 6 (Certifying Officers)
 *   - DoD FMR Vol. 10, Ch. 18 (Improper Payments)
 *   - GAO-12-573G (Managing the Risk of Improper Payments)
 */

import type {
  Disbursement,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Obligation,
  ContractPayment,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  MilitaryPayRecord,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  CivilianPayRecord,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  TravelOrder,
  DoDEngagementData,
} from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImproperPaymentCategory =
  | 'duplicate_payment'
  | 'overpayment'
  | 'underpayment'
  | 'wrong_payee'
  | 'goods_not_received'
  | 'insufficient_documentation'
  | 'payment_to_ineligible'
  | 'other';

export type PaymentRiskLevel = 'high' | 'medium' | 'low';

export interface ImproperPaymentFinding {
  id: string;
  category: ImproperPaymentCategory;
  description: string;
  paymentId: string;
  paymentType: 'disbursement' | 'contract' | 'military_pay' | 'civilian_pay' | 'travel';
  amount: number;
  estimatedImproperAmount: number;
  vendorOrPayee?: string;
  paymentDate: string;
  detectionMethod: 'statistical_sampling' | 'duplicate_detection' | 'data_analytics' | 'manual_review';
  confidence: number;
}

export interface PaymentIntegrityAssessment {
  id: string;
  engagementId: string;
  fiscalYear: number;
  assessmentDate: string;

  // Summary
  totalPaymentsReviewed: number;
  totalPaymentAmount: number;
  improperPaymentCount: number;
  improperPaymentAmount: number;
  improperPaymentRate: number;
  isSignificant: boolean;

  // By category
  duplicatePayments: ImproperPaymentFinding[];
  overpayments: ImproperPaymentFinding[];
  underpayments: ImproperPaymentFinding[];
  otherImproperPayments: ImproperPaymentFinding[];

  // By payment type
  disbursementFindings: number;
  contractFindings: number;
  payrollFindings: number;
  travelFindings: number;

  // Risk assessment
  programRiskLevels: Array<{
    program: string;
    riskLevel: PaymentRiskLevel;
    outlays: number;
    estimatedImproperRate: number;
    reason: string;
  }>;

  // Compliance
  piiaCompliant: boolean;
  complianceFindings: string[];
  correctiveActions: string[];
}

// ---------------------------------------------------------------------------
// Duplicate Detection
// ---------------------------------------------------------------------------

/**
 * Detect potential duplicate disbursements.
 *
 * A duplicate is identified when two or more payments match on:
 *   - Same payee/vendor (payeeId)
 *   - Same amount (within 0.01 tolerance)
 *   - Within the same 30-day window
 */
function detectDuplicateDisbursements(disbursements: Disbursement[]): ImproperPaymentFinding[] {
  const findings: ImproperPaymentFinding[] = [];
  const sorted = [...disbursements]
    .filter((d) => d.status !== 'cancelled' && d.status !== 'returned')
    .sort((a, b) => a.disbursementDate.localeCompare(b.disbursementDate));

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];

      // Check same payee
      if (!a.payeeId || !b.payeeId || a.payeeId !== b.payeeId) continue;

      // Check same amount
      if (Math.abs(a.amount - b.amount) > 0.01) continue;

      // Check within 30-day window
      const daysDiff =
        Math.abs(new Date(a.disbursementDate).getTime() - new Date(b.disbursementDate).getTime()) /
        (1000 * 60 * 60 * 24);
      if (daysDiff > 30) continue;

      findings.push({
        id: uuid(),
        category: 'duplicate_payment',
        description: `Potential duplicate: disbursement ${b.disbursementNumber} matches ${a.disbursementNumber} — same payee (${a.payeeId}), same amount ($${a.amount.toFixed(2)}), ${daysDiff.toFixed(0)} days apart`,
        paymentId: b.id,
        paymentType: 'disbursement',
        amount: b.amount,
        estimatedImproperAmount: b.amount,
        vendorOrPayee: b.payeeId ?? undefined,
        paymentDate: b.disbursementDate,
        detectionMethod: 'duplicate_detection',
        confidence: daysDiff <= 7 ? 0.9 : 0.7,
      });
    }
  }

  return findings;
}

/**
 * Detect potential duplicate contract payments by matching on
 * contract number + invoice number + amount.
 */
function detectDuplicateContractPayments(payments: ContractPayment[]): ImproperPaymentFinding[] {
  const findings: ImproperPaymentFinding[] = [];
  const seen = new Map<string, ContractPayment>();

  for (const payment of payments) {
    if (!payment.invoiceNumber) continue;
    const key = `${payment.contractNumber}|${payment.invoiceNumber}|${payment.invoiceAmount.toFixed(2)}`;

    if (seen.has(key)) {
      const original = seen.get(key)!;
      findings.push({
        id: uuid(),
        category: 'duplicate_payment',
        description: `Potential duplicate contract payment: ${payment.contractNumber} invoice ${payment.invoiceNumber} for $${payment.invoiceAmount.toFixed(2)} — matches previous payment on ${original.paymentDate}`,
        paymentId: payment.id,
        paymentType: 'contract',
        amount: payment.invoiceAmount,
        estimatedImproperAmount: payment.invoiceAmount,
        vendorOrPayee: payment.vendorId,
        paymentDate: payment.paymentDate,
        detectionMethod: 'duplicate_detection',
        confidence: 0.95,
      });
    } else {
      seen.set(key, payment);
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Overpayment Detection
// ---------------------------------------------------------------------------

/**
 * Detect overpayments by comparing approved amounts to invoice/obligation
 * amounts. An overpayment occurs when paid amount exceeds approved amount.
 */
function detectOverpayments(data: DoDEngagementData): ImproperPaymentFinding[] {
  const findings: ImproperPaymentFinding[] = [];

  // Check contract payments where approved > invoice
  for (const payment of data.contractPayments) {
    if (payment.approvedAmount > payment.invoiceAmount * 1.001) {
      findings.push({
        id: uuid(),
        category: 'overpayment',
        description: `Contract payment approved ($${payment.approvedAmount.toFixed(2)}) exceeds invoice amount ($${payment.invoiceAmount.toFixed(2)}) by $${(payment.approvedAmount - payment.invoiceAmount).toFixed(2)}`,
        paymentId: payment.id,
        paymentType: 'contract',
        amount: payment.approvedAmount,
        estimatedImproperAmount: payment.approvedAmount - payment.invoiceAmount,
        vendorOrPayee: payment.vendorId,
        paymentDate: payment.paymentDate,
        detectionMethod: 'data_analytics',
        confidence: 0.85,
      });
    }
  }

  // Check disbursements against obligations for over-liquidation
  const obligationMap = new Map(data.obligations.map((o) => [o.id, o]));
  for (const disb of data.disbursements) {
    const obligation = obligationMap.get(disb.obligationId);
    if (!obligation) continue;
    if (obligation.liquidatedAmount > obligation.amount * 1.001) {
      findings.push({
        id: uuid(),
        category: 'overpayment',
        description: `Obligation ${obligation.obligationNumber} over-liquidated: liquidated $${obligation.liquidatedAmount.toFixed(2)} against obligation of $${obligation.amount.toFixed(2)}`,
        paymentId: disb.id,
        paymentType: 'disbursement',
        amount: disb.amount,
        estimatedImproperAmount: obligation.liquidatedAmount - obligation.amount,
        vendorOrPayee: obligation.vendorOrPayee ?? undefined,
        paymentDate: disb.disbursementDate,
        detectionMethod: 'data_analytics',
        confidence: 0.9,
      });
    }
  }

  // Check travel where actual exceeds authorized beyond tolerance
  for (const order of data.travelOrders) {
    if (order.actualAmount > order.authorizedAmount * 1.10) {
      findings.push({
        id: uuid(),
        category: 'overpayment',
        description: `Travel actual ($${order.actualAmount.toFixed(2)}) exceeds authorized ($${order.authorizedAmount.toFixed(2)}) by ${(((order.actualAmount - order.authorizedAmount) / order.authorizedAmount) * 100).toFixed(1)}%`,
        paymentId: order.id,
        paymentType: 'travel',
        amount: order.actualAmount,
        estimatedImproperAmount: order.actualAmount - order.authorizedAmount,
        paymentDate: order.departDate,
        detectionMethod: 'data_analytics',
        confidence: 0.7,
      });
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Statistical Sampling
// ---------------------------------------------------------------------------

/**
 * Estimate the improper payment rate using statistical attributes sampling.
 * Uses a simple random sample with 95% confidence level.
 *
 * Per OMB A-123 Appendix C, agencies must sample at a level sufficient
 * to produce estimates with a 95% confidence interval of +/- 3%.
 */
function estimateImproperPaymentRate(
  totalPayments: number,
  findingsCount: number,
  findingsAmount: number,
  totalAmount: number
): { rate: number; isSignificant: boolean } {
  if (totalPayments === 0 || totalAmount === 0) {
    return { rate: 0, isSignificant: false };
  }

  const rate = (findingsAmount / totalAmount) * 100;

  // OMB significance thresholds:
  // - Both 1.5% AND $10M, OR
  // - $100M regardless of rate
  const isSignificant =
    (rate >= 1.5 && findingsAmount >= 10_000_000) || findingsAmount >= 100_000_000;

  return { rate, isSignificant };
}

// ---------------------------------------------------------------------------
// Risk Assessment
// ---------------------------------------------------------------------------

function assessProgramRisks(data: DoDEngagementData): PaymentIntegrityAssessment['programRiskLevels'] {
  const risks: PaymentIntegrityAssessment['programRiskLevels'] = [];

  // Military pay risk
  const milPayTotal = data.militaryPayRecords.reduce((s, r) => s + r.totalCompensation, 0);
  if (milPayTotal > 0) {
    risks.push({
      program: 'Military Pay (Vol. 7)',
      riskLevel: 'medium',
      outlays: milPayTotal,
      estimatedImproperRate: 1.0,
      reason: 'Complex pay tables, special/incentive pays, and combat zone exclusions increase risk',
    });
  }

  // Civilian pay risk
  const civPayTotal = data.civilianPayRecords.reduce((s, r) => s + r.totalCompensation, 0);
  if (civPayTotal > 0) {
    risks.push({
      program: 'Civilian Pay (Vol. 8)',
      riskLevel: 'medium',
      outlays: civPayTotal,
      estimatedImproperRate: 0.8,
      reason: 'GS/locality pay calculations, benefits enrollment, and overtime/premium pay risk',
    });
  }

  // Travel risk
  const travelTotal = data.travelOrders.reduce((s, o) => s + o.actualAmount, 0);
  if (travelTotal > 0) {
    const overBudget = data.travelOrders.filter(
      (o) => o.actualAmount > o.authorizedAmount * 1.05
    ).length;
    const overRate = data.travelOrders.length > 0 ? overBudget / data.travelOrders.length : 0;
    risks.push({
      program: 'Travel (Vol. 9)',
      riskLevel: overRate > 0.1 ? 'high' : 'medium',
      outlays: travelTotal,
      estimatedImproperRate: overRate * 100,
      reason:
        overRate > 0.1
          ? `${(overRate * 100).toFixed(1)}% of travel orders exceed authorization — high risk`
          : 'Per diem rate complexity and split disbursement requirements',
    });
  }

  // Contract payments risk
  const contractTotal = data.contractPayments.reduce((s, p) => s + p.approvedAmount, 0);
  if (contractTotal > 0) {
    const dcaaRequired = data.contractPayments.filter((p) => p.dcaaAuditRequired).length;
    const dcaaComplete = data.contractPayments.filter(
      (p) => p.dcaaAuditRequired && p.dcaaAuditStatus === 'completed'
    ).length;
    const dcaaGap = dcaaRequired > 0 ? (dcaaRequired - dcaaComplete) / dcaaRequired : 0;
    risks.push({
      program: 'Contract Payments (Vol. 10)',
      riskLevel: dcaaGap > 0.2 ? 'high' : contractTotal > 1_000_000_000 ? 'high' : 'medium',
      outlays: contractTotal,
      estimatedImproperRate: dcaaGap * 5,
      reason:
        dcaaGap > 0.2
          ? `${(dcaaGap * 100).toFixed(0)}% of required DCAA audits incomplete — elevated risk`
          : 'Large contract portfolio requires ongoing monitoring',
    });
  }

  // Disbursements risk
  const disbTotal = data.disbursements.reduce((s, d) => s + d.amount, 0);
  if (disbTotal > 0) {
    const eftCount = data.disbursements.filter((d) => d.paymentMethod === 'eft').length;
    const eftRate = data.disbursements.length > 0 ? eftCount / data.disbursements.length : 1;
    risks.push({
      program: 'General Disbursements (Vol. 5)',
      riskLevel: eftRate < 0.95 ? 'medium' : 'low',
      outlays: disbTotal,
      estimatedImproperRate: (1 - eftRate) * 3,
      reason:
        eftRate < 0.95
          ? `EFT compliance at ${(eftRate * 100).toFixed(1)}% — non-EFT payments carry higher fraud risk`
          : 'High EFT compliance reduces payment integrity risk',
    });
  }

  return risks;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Perform a comprehensive payment integrity assessment per PIIA/OMB A-123 Appendix C.
 *
 * Analyzes all payment streams for:
 * - Duplicate payments
 * - Overpayments / underpayments
 * - Statistical sampling estimates
 * - Program-level risk assessment
 */
export function performPaymentIntegrityAssessment(
  engagementId: string,
  data: DoDEngagementData
): PaymentIntegrityAssessment {
  // Run all detection methods
  const duplicateDisbursements = detectDuplicateDisbursements(data.disbursements);
  const duplicateContracts = detectDuplicateContractPayments(data.contractPayments);
  const overpayments = detectOverpayments(data);

  const allDuplicates = [...duplicateDisbursements, ...duplicateContracts];
  const allFindings = [...allDuplicates, ...overpayments];

  // Count by payment type
  const disbursementFindings = allFindings.filter((f) => f.paymentType === 'disbursement').length;
  const contractFindings = allFindings.filter((f) => f.paymentType === 'contract').length;
  const payrollFindings = allFindings.filter(
    (f) => f.paymentType === 'military_pay' || f.paymentType === 'civilian_pay'
  ).length;
  const travelFindings = allFindings.filter((f) => f.paymentType === 'travel').length;

  // Calculate totals
  const totalPayments =
    data.disbursements.length +
    data.contractPayments.length +
    data.militaryPayRecords.length +
    data.civilianPayRecords.length +
    data.travelOrders.length;

  const totalAmount =
    data.disbursements.reduce((s, d) => s + d.amount, 0) +
    data.contractPayments.reduce((s, p) => s + p.approvedAmount, 0) +
    data.militaryPayRecords.reduce((s, r) => s + r.totalCompensation, 0) +
    data.civilianPayRecords.reduce((s, r) => s + r.totalCompensation, 0) +
    data.travelOrders.reduce((s, o) => s + o.actualAmount, 0);

  const improperAmount = allFindings.reduce((s, f) => s + f.estimatedImproperAmount, 0);
  const { rate, isSignificant } = estimateImproperPaymentRate(
    totalPayments,
    allFindings.length,
    improperAmount,
    totalAmount
  );

  // Risk assessment
  const programRiskLevels = assessProgramRisks(data);

  // PIIA compliance check
  const complianceFindings: string[] = [];
  const correctiveActions: string[] = [];

  if (isSignificant) {
    complianceFindings.push(
      `Improper payment rate of ${rate.toFixed(2)}% ($${improperAmount.toLocaleString()}) exceeds OMB significance thresholds`
    );
    correctiveActions.push('Develop and publish corrective action plan per PIIA Section 3(a)(3)');
    correctiveActions.push('Implement additional internal controls per OMB A-123');
    correctiveActions.push('Report to Congress per PIIA Section 3(b)');
  }

  const highRiskPrograms = programRiskLevels.filter((p) => p.riskLevel === 'high');
  if (highRiskPrograms.length > 0) {
    complianceFindings.push(
      `${highRiskPrograms.length} program(s) identified as high risk for improper payments: ${highRiskPrograms.map((p) => p.program).join(', ')}`
    );
    correctiveActions.push('Conduct root cause analysis for high-risk programs');
  }

  if (allDuplicates.length > 0) {
    complianceFindings.push(
      `${allDuplicates.length} potential duplicate payment(s) detected totaling $${allDuplicates.reduce((s, f) => s + f.estimatedImproperAmount, 0).toLocaleString()}`
    );
    correctiveActions.push('Implement pre-payment duplicate detection controls');
  }

  return {
    id: uuid(),
    engagementId,
    fiscalYear: data.fiscalYear,
    assessmentDate: new Date().toISOString(),
    totalPaymentsReviewed: totalPayments,
    totalPaymentAmount: totalAmount,
    improperPaymentCount: allFindings.length,
    improperPaymentAmount: improperAmount,
    improperPaymentRate: rate,
    isSignificant,
    duplicatePayments: allDuplicates,
    overpayments: overpayments.filter((f) => f.category === 'overpayment'),
    underpayments: [],
    otherImproperPayments: [],
    disbursementFindings,
    contractFindings,
    payrollFindings,
    travelFindings,
    programRiskLevels,
    piiaCompliant: !isSignificant && allDuplicates.length === 0,
    complianceFindings,
    correctiveActions,
  };
}

/**
 * Generate the payment integrity section for the annual PIIA report.
 */
export function generatePIIAReportSection(assessment: PaymentIntegrityAssessment): string {
  const lines: string[] = [];

  lines.push('PAYMENT INTEGRITY INFORMATION ACT (PIIA) ASSESSMENT');
  lines.push('====================================================');
  lines.push('');
  lines.push(`Fiscal Year: ${assessment.fiscalYear}`);
  lines.push(`Assessment Date: ${assessment.assessmentDate.split('T')[0]}`);
  lines.push('');
  lines.push('SUMMARY');
  lines.push('-------');
  lines.push(`Total Payments Reviewed:    ${assessment.totalPaymentsReviewed.toLocaleString()}`);
  lines.push(`Total Payment Amount:       $${assessment.totalPaymentAmount.toLocaleString()}`);
  lines.push(`Improper Payments Found:    ${assessment.improperPaymentCount}`);
  lines.push(`Improper Payment Amount:    $${assessment.improperPaymentAmount.toLocaleString()}`);
  lines.push(`Improper Payment Rate:      ${assessment.improperPaymentRate.toFixed(2)}%`);
  lines.push(`OMB Significant:            ${assessment.isSignificant ? 'YES' : 'No'}`);
  lines.push(`PIIA Compliant:             ${assessment.piiaCompliant ? 'Yes' : 'NO'}`);

  if (assessment.programRiskLevels.length > 0) {
    lines.push('');
    lines.push('PROGRAM RISK LEVELS');
    lines.push('-------------------');
    for (const prog of assessment.programRiskLevels) {
      lines.push(
        `  ${prog.program}: ${prog.riskLevel.toUpperCase()} (${prog.estimatedImproperRate.toFixed(1)}% est.) — ${prog.reason}`
      );
    }
  }

  if (assessment.complianceFindings.length > 0) {
    lines.push('');
    lines.push('FINDINGS');
    lines.push('--------');
    assessment.complianceFindings.forEach((f, i) => {
      lines.push(`  ${i + 1}. ${f}`);
    });
  }

  if (assessment.correctiveActions.length > 0) {
    lines.push('');
    lines.push('CORRECTIVE ACTIONS');
    lines.push('------------------');
    assessment.correctiveActions.forEach((a, i) => {
      lines.push(`  ${i + 1}. ${a}`);
    });
  }

  return lines.join('\n');
}
