/**
 * Contract Payment Computation & Validation Engine
 *
 * Implements DoD FMR Volume 10 (Contract Payment Policy) for progress payments,
 * performance-based payments, retainage, DCAA audit requirements, invoice
 * validation, and contract closeout processing.
 *
 * References:
 *   - DoD 7000.14-R, Volume 10: Contract Payment Policy
 *   - FAR Part 32: Contract Financing
 *   - FAR 32.5: Progress Payments Based on Costs
 *   - FAR 32.10: Performance-Based Payments
 *   - FAR 42.7: Indirect Cost Rates
 *   - DFARS 232.1: Non-Commercial Item Purchase Financing
 *   - DCAA Contract Audit Manual (DCAM) Chapter 6
 *   - 10 USC §2324: Allowable Costs under Defense Contracts
 */

import type { ContractRecord, ContractPayment, Obligation } from '@/types/dod-fmr';
import { getParameter } from '@/lib/engine/tax-parameters/registry';

// ---------------------------------------------------------------------------
// Progress Payment Rate Constants (fallbacks)
// Per FAR 32.501-1 and DFARS 232.501-1
// ---------------------------------------------------------------------------

/** Fallback progress payment rate for large businesses (FAR 32.501-1(a)). */
const LARGE_BUSINESS_PROGRESS_RATE_FALLBACK = 0.80;

/** Fallback progress payment rate for small businesses (FAR 32.501-1(b)). */
const SMALL_BUSINESS_PROGRESS_RATE_FALLBACK = 0.85;

/** Default retainage percentages by contract type. */
const RETAINAGE_RATES: Record<string, number> = {
  firm_fixed_price:     0.10,
  cost_plus:            0.15,
  cost_reimbursement:   0.15,
  time_and_materials:   0.10,
  idiq:                 0.10,
  bpa:                  0.05,
  other:                0.10,
};

/** Fallback DCAA audit threshold for non-cost-type contracts. */
const DCAA_THRESHOLD_FALLBACK = 25_000_000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a progress payment against contract terms and FAR requirements.
 *
 * Per FAR 32.5 and DoD FMR Vol 10, Ch 7: Progress payments based on costs
 * are limited to the customary progress payment rate (80% for large business,
 * 85% for small business) of total allowable costs incurred.
 *
 * @param contract - the ContractRecord
 * @param payment - the ContractPayment to validate
 * @returns Validation result with maximum rate and findings
 */
export function validateProgressPayment(
  contract: ContractRecord,
  payment: ContractPayment,
): { valid: boolean; maxRate: number; findings: string[] } {
  const findings: string[] = [];

  // Verify payment type
  if (payment.paymentType !== 'progress') {
    findings.push(
      `Payment type "${payment.paymentType}" is not a progress payment. ` +
      `Use validatePerformanceBasedPayment() for PBP. Ref: FAR 32.5.`,
    );
    return { valid: false, maxRate: 0, findings };
  }

  // Determine the applicable max progress payment rate using fiscal-year parameters.
  // Default to large business rate; small business gets a higher cap.
  const fy = contract.fiscalYear ?? new Date().getFullYear();
  const maxRate = getParameter('DOD_PROGRESS_PAY_LB_PCT', fy, undefined, LARGE_BUSINESS_PROGRESS_RATE_FALLBACK);

  // Validate the progress payment percentage
  if (payment.progressPaymentPct !== undefined && payment.progressPaymentPct !== null) {
    if (payment.progressPaymentPct > maxRate) {
      findings.push(
        `Progress payment rate (${(payment.progressPaymentPct * 100).toFixed(1)}%) exceeds ` +
        `maximum allowable rate (${(maxRate * 100).toFixed(1)}%). ` +
        `Ref: FAR 32.501-1; DoD FMR Vol 10, Ch 7.`,
      );
    }
  }

  // Payment must not exceed contract funded amount
  if (payment.approvedAmount > contract.fundedAmount) {
    findings.push(
      `Approved payment amount ($${payment.approvedAmount.toFixed(2)}) exceeds ` +
      `contract funded amount ($${contract.fundedAmount.toFixed(2)}). ` +
      `Ref: FAR 32.503-6; DoD FMR Vol 10, Ch 7.`,
    );
  }

  // DCAA audit requirements for cost-type contracts
  if (contract.contractType === 'cost_plus' || contract.contractType === 'cost_reimbursement') {
    if (payment.dcaaAuditRequired && payment.dcaaAuditStatus === 'not_required') {
      findings.push(
        `Cost-type contract requires DCAA audit but audit status is "not_required". ` +
        `Ref: FAR 42.7; DCAM Ch 6.`,
      );
    }
    if (payment.dcaaAuditRequired && payment.dcaaAuditStatus === 'pending') {
      findings.push(
        `DCAA audit is pending — payment should not be certified until audit is ` +
        `complete or an interim approval is granted. Ref: FAR 42.703; DoD FMR Vol 10, Ch 7.`,
      );
    }
  }

  // Invoice vs. approved amount
  if (payment.approvedAmount > payment.invoiceAmount) {
    findings.push(
      `Approved amount ($${payment.approvedAmount.toFixed(2)}) exceeds invoice amount ` +
      `($${payment.invoiceAmount.toFixed(2)}). Ref: DoD FMR Vol 10, Ch 7.`,
    );
  }

  // Contract status check
  if (contract.status === 'terminated') {
    findings.push(
      `Contract status is "terminated" — progress payments should be suspended. ` +
      `Ref: FAR 32.503-6(f); DoD FMR Vol 10, Ch 7.`,
    );
  }

  // Retainage amount cannot be negative
  if (payment.retainageAmount < 0) {
    findings.push(
      `Retainage amount ($${payment.retainageAmount.toFixed(2)}) is negative. ` +
      `Ref: FAR 32.503-6; DoD FMR Vol 10, Ch 7.`,
    );
  }

  return {
    valid: findings.length === 0,
    maxRate,
    findings,
  };
}

/**
 * Validate a performance-based payment against contract milestones.
 *
 * Per FAR 32.10 and DoD FMR Vol 10, Ch 7: Performance-based payments (PBP)
 * are tied to measurable milestones or events. PBP is the preferred financing
 * method per DFARS 232.1001.
 *
 * @param contract - the ContractRecord
 * @param payment - the ContractPayment to validate
 * @returns Validation result with findings
 */
export function validatePerformanceBasedPayment(
  contract: ContractRecord,
  payment: ContractPayment,
): { valid: boolean; findings: string[] } {
  const findings: string[] = [];

  // Verify payment type
  if (payment.paymentType !== 'performance_based') {
    findings.push(
      `Payment type "${payment.paymentType}" is not performance-based. Ref: FAR 32.10.`,
    );
    return { valid: false, findings };
  }

  // PBP percentage must be specified
  if (payment.performanceBasedPct === undefined || payment.performanceBasedPct === null) {
    findings.push(
      `Performance-based payment percentage is not specified. PBP must be tied ` +
      `to objective milestones with defined percentages. Ref: FAR 32.1004.`,
    );
  } else {
    if (payment.performanceBasedPct < 0 || payment.performanceBasedPct > 1.0) {
      findings.push(
        `PBP percentage (${(payment.performanceBasedPct * 100).toFixed(1)}%) is outside ` +
        `valid range (0-100%). Ref: FAR 32.1004.`,
      );
    }

    // Pre-delivery PBP typically limited to 90%
    if (payment.performanceBasedPct > 0.90) {
      findings.push(
        `PBP percentage (${(payment.performanceBasedPct * 100).toFixed(1)}%) exceeds 90% ` +
        `threshold. Pre-delivery PBP typically limited to 90% of contract price. ` +
        `Ref: FAR 32.1004(b)(2); DoD FMR Vol 10, Ch 7.`,
      );
    }
  }

  // Approved amount must not exceed invoice
  if (payment.approvedAmount > payment.invoiceAmount) {
    findings.push(
      `Approved amount ($${payment.approvedAmount.toFixed(2)}) exceeds invoice ` +
      `($${payment.invoiceAmount.toFixed(2)}). Ref: DoD FMR Vol 10, Ch 7.`,
    );
  }

  // Contract must not be terminated
  if (contract.status === 'terminated') {
    findings.push(
      `Contract is terminated — PBP should not be made on terminated contracts. ` +
      `Ref: FAR 32.10; DoD FMR Vol 10.`,
    );
  }

  // PBP is for fixed-price contracts per FAR 32.1001
  if (contract.contractType === 'cost_plus' || contract.contractType === 'cost_reimbursement') {
    findings.push(
      `Contract type "${contract.contractType}" is cost-based — performance-based ` +
      `payments are intended for fixed-price contracts. Use progress payments for ` +
      `cost-type. Ref: FAR 32.1001; DFARS 232.1001.`,
    );
  }

  return {
    valid: findings.length === 0,
    findings,
  };
}

/**
 * Calculate the retainage amount for a contract payment.
 *
 * Per FAR 32.503-6 and DoD FMR Vol 10, Ch 7: The government may retain a
 * percentage of progress payments to protect its financial interest.
 * Retainage rates vary by contract type.
 *
 * @param contractType - the type of contract
 * @param paymentAmount - the payment amount before retainage
 * @returns Retainage amount in dollars
 */
export function calculateRetainage(
  contractType: string,
  paymentAmount: number,
): number {
  const retainagePct = RETAINAGE_RATES[contractType] ?? RETAINAGE_RATES['other'];
  return Math.round(paymentAmount * retainagePct * 100) / 100;
}

/**
 * Determine if a contract/payment requires DCAA audit.
 *
 * Per FAR 42.7 and DoD FMR Vol 10, Ch 8: Cost-type contracts require DCAA
 * audit. Additionally, any payment over the threshold on non-cost-type
 * contracts triggers a DCAA review requirement.
 *
 * @param contract - the ContractRecord
 * @param paymentAmount - the payment amount in question
 * @returns true if DCAA audit is required
 */
export function checkDCAARequirement(
  contract: ContractRecord,
  paymentAmount: number,
): boolean {
  // Cost-type contracts always require DCAA audit
  const costTypeContracts = new Set([
    'cost_plus',
    'cost_reimbursement',
    'time_and_materials',
  ]);

  if (costTypeContracts.has(contract.contractType)) {
    return true;
  }

  // Non-cost-type contracts: DCAA required if payment exceeds threshold
  const dcaaThreshold = getParameter('DOD_DCAA_AUDIT_THRESHOLD', contract.fiscalYear ?? new Date().getFullYear(), undefined, DCAA_THRESHOLD_FALLBACK);
  if (paymentAmount > dcaaThreshold) {
    return true;
  }

  // IDIQ contracts with high total value
  if (contract.contractType === 'idiq' && contract.totalValue > 100_000_000) {
    return true;
  }

  return false;
}

/**
 * Validate a contractor invoice for completeness and compliance.
 *
 * Per DoD FMR Vol 10, Ch 7 and FAR 32.905: Proper invoices must contain
 * required data elements. This function checks the payment record for
 * invoice completeness criteria.
 *
 * @param payment - the ContractPayment to validate
 * @returns Validation result with findings
 */
export function validateInvoice(
  payment: ContractPayment,
): { valid: boolean; findings: string[] } {
  const findings: string[] = [];

  // Invoice number is required
  if (!payment.invoiceNumber || payment.invoiceNumber.trim() === '') {
    findings.push(
      `Invoice number is missing. A proper invoice must include an invoice ` +
      `number per FAR 32.905(b)(1). Ref: DoD FMR Vol 10, Ch 7.`,
    );
  }

  // Invoice amount must be positive
  if (payment.invoiceAmount <= 0) {
    findings.push(
      `Invoice amount ($${payment.invoiceAmount.toFixed(2)}) must be positive. ` +
      `Ref: FAR 32.905.`,
    );
  }

  // Contract number must be present
  if (!payment.contractNumber || payment.contractNumber.trim() === '') {
    findings.push(
      `Contract number is missing from the invoice. Required per ` +
      `FAR 32.905(b)(2). Ref: DoD FMR Vol 10, Ch 7.`,
    );
  }

  // Vendor ID must be present
  if (!payment.vendorId || payment.vendorId.trim() === '') {
    findings.push(
      `Vendor ID is missing. Proper invoices must identify the contractor ` +
      `per FAR 32.905(b)(3). Ref: DoD FMR Vol 10, Ch 7.`,
    );
  }

  // Payment date must be present
  if (!payment.paymentDate || payment.paymentDate.trim() === '') {
    findings.push(
      `Payment date is not specified. Ref: DoD FMR Vol 10, Ch 7.`,
    );
  }

  // Approved amount cannot exceed invoice amount
  if (payment.approvedAmount > payment.invoiceAmount) {
    findings.push(
      `Approved amount ($${payment.approvedAmount.toFixed(2)}) exceeds invoice ` +
      `amount ($${payment.invoiceAmount.toFixed(2)}). Payment cannot exceed ` +
      `the invoiced amount. Ref: DoD FMR Vol 10, Ch 7.`,
    );
  }

  // Retainage must not exceed approved amount
  if (payment.retainageAmount > payment.approvedAmount) {
    findings.push(
      `Retainage ($${payment.retainageAmount.toFixed(2)}) exceeds approved amount ` +
      `($${payment.approvedAmount.toFixed(2)}). Ref: FAR 32.503-6.`,
    );
  }

  // DCAA certification check
  if (payment.dcaaAuditRequired && !payment.certifiedBy) {
    findings.push(
      `Payment requires DCAA audit but has not been certified by an authorized ` +
      `official. Ref: FAR 42.703; DoD FMR Vol 10, Ch 7.`,
    );
  }

  return {
    valid: findings.length === 0,
    findings,
  };
}

/**
 * Process contract closeout and identify excess funds for deobligation.
 *
 * Per FAR 4.804 and DoD FMR Vol 10, Ch 9: Contract closeout involves
 * verifying all deliverables, settling payments, deobligating excess
 * funds, and completing final audits where required.
 *
 * DoD closeout timeframes per DFARS 204.804-1:
 * - Firm-fixed-price: 6 months after physical completion
 * - Cost-type: 36 months after physical completion
 * - All others: 20 months after physical completion
 *
 * @param contract - the ContractRecord
 * @param payments - all ContractPayments against this contract
 * @param obligation - the associated Obligation record
 * @returns Closeout analysis with excess funds and findings
 */
export function processContractCloseout(
  contract: ContractRecord,
  payments: ContractPayment[],
  obligation: Obligation,
): { excessFunds: number; findings: string[] } {
  const findings: string[] = [];

  // Calculate total disbursed
  const totalDisbursed = payments
    .filter(p => p.status === 'paid' || p.status === 'certified')
    .reduce((sum, p) => sum + p.approvedAmount, 0);

  // Calculate excess funds available for deobligation
  const excessFunds = Math.max(0, obligation.amount - totalDisbursed);

  // --- Pending payments ---
  const pendingPayments = payments.filter(
    p => p.status === 'pending' || p.status === 'submitted',
  );
  if (pendingPayments.length > 0) {
    const pendingAmount = pendingPayments.reduce((sum, p) => sum + p.approvedAmount, 0);
    findings.push(
      `${pendingPayments.length} payment(s) still pending ($${pendingAmount.toFixed(2)}). ` +
      `All payments must be settled before closeout. Ref: FAR 4.804-5.`,
    );
  }

  // --- DCAA audit requirement for cost-type ---
  const costTypes = new Set(['cost_plus', 'cost_reimbursement', 'time_and_materials']);
  if (costTypes.has(contract.contractType)) {
    const auditPending = payments.some(
      p => p.dcaaAuditRequired &&
           (p.dcaaAuditStatus === 'pending' || p.dcaaAuditStatus === 'in_progress'),
    );
    if (auditPending) {
      findings.push(
        `DCAA audit is still pending for one or more payments on this cost-type ` +
        `contract. Final closeout requires DCAA audit completion. ` +
        `Ref: FAR 42.703; DCAM Ch 6.`,
      );
    }
  }

  // --- Retainage release check ---
  const unreleasedRetainage = payments
    .filter(p => p.retainageAmount > 0)
    .reduce((sum, p) => sum + p.retainageAmount, 0);
  if (unreleasedRetainage > 0) {
    findings.push(
      `$${unreleasedRetainage.toFixed(2)} in retainage has not been released. ` +
      `Retainage must be settled prior to final closeout. Ref: FAR 32.503-6.`,
    );
  }

  // --- Contract status check ---
  if (contract.status !== 'completed' && contract.status !== 'closeout') {
    findings.push(
      `Contract status is "${contract.status}" — closeout requires contract to be ` +
      `in "completed" or "closeout" status. Ref: FAR 4.804-1.`,
    );
  }

  // --- Excess funds alert ---
  if (excessFunds > 0 && contract.fundedAmount > 0) {
    const excessPct = (excessFunds / contract.fundedAmount) * 100;
    if (excessPct > 5) {
      findings.push(
        `Excess funds of $${excessFunds.toFixed(2)} (${excessPct.toFixed(1)}% of funded amount) ` +
        `should be deobligated promptly. Ref: DoD FMR Vol 10, Ch 9; FAR 4.804-5(a)(16).`,
      );
    }
  }

  // --- Over-payment check ---
  if (totalDisbursed > obligation.amount) {
    findings.push(
      `Total disbursements ($${totalDisbursed.toFixed(2)}) exceed obligation amount ` +
      `($${obligation.amount.toFixed(2)}). Potential ADA concern. ` +
      `Ref: DoD FMR Vol 10, Ch 7; 31 USC §1341.`,
    );
  }

  // --- Unliquidated obligation consistency ---
  const expectedULO = obligation.amount - totalDisbursed;
  const uloVariance = Math.abs(obligation.unliquidatedBalance - expectedULO);
  if (uloVariance > 1.00) {
    findings.push(
      `Unliquidated obligation balance ($${obligation.unliquidatedBalance.toFixed(2)}) does not ` +
      `match computed value ($${expectedULO.toFixed(2)}). Variance: $${uloVariance.toFixed(2)}. ` +
      `Ref: DoD FMR Vol 10, Ch 9.`,
    );
  }

  return {
    excessFunds: Math.round(excessFunds * 100) / 100,
    findings,
  };
}
