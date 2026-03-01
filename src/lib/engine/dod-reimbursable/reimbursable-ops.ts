/**
 * Reimbursable Operations Engine
 *
 * Implements DoD FMR Volumes 11A/11B (Reimbursable Operations Policy) for
 * Economy Act order validation, advance vs. reimbursement analysis, working
 * capital fund rate calculations, and interagency agreement compliance.
 *
 * References:
 *   - DoD 7000.14-R, Volume 11A: Reimbursable Operations Policy
 *   - DoD 7000.14-R, Volume 11B: Reimbursable Operations Procedures
 *   - 31 USC §1535: Economy Act Orders
 *   - 31 USC §1536: Crediting Reimbursements
 *   - OMB Circular A-11: Preparation, Submission, and Execution of the Budget
 *   - 10 USC §2208: Working Capital Funds
 *   - DoD Instruction 4000.19: Interservice and Intragovernmental Support
 */

import type { InteragencyAgreement, WorkingCapitalFund } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate an interagency agreement under the Economy Act (31 USC §1535).
 *
 * The Economy Act authorizes agencies to place orders with other federal
 * agencies for goods and services if certain conditions are met. This
 * function checks structural and financial compliance.
 *
 * Per 31 USC §1535, Economy Act orders must:
 *   1. Be for goods/services that cannot be as conveniently/cheaply provided
 *      by the private sector
 *   2. Have funds obligated in advance
 *   3. Have a period of performance within the appropriation's availability
 *   4. Include a description of services
 *   5. Not be used when a more specific statutory authority exists
 *
 * @param agreement - the InteragencyAgreement to validate
 * @returns Validation result with findings
 */
export function validateEconomyActOrder(
  agreement: InteragencyAgreement,
): { valid: boolean; findings: string[] } {
  const findings: string[] = [];

  // --- Must be an Economy Act order ---
  if (agreement.agreementType !== 'economy_act') {
    findings.push(
      `Agreement type "${agreement.agreementType}" is not an Economy Act order. ` +
      `This validation applies to Economy Act orders only (31 USC §1535). ` +
      `Use validateIAACompliance() for non-Economy Act agreements.`,
    );
    return { valid: false, findings };
  }

  // --- Authority must cite 31 USC §1535 ---
  if (agreement.authority) {
    const authorityLower = agreement.authority.toLowerCase();
    const validReferences = ['31 usc 1535', '31 u.s.c. 1535', 'economy act', '31 usc §1535', '§1535'];
    const hasValidAuthority = validReferences.some(ref => authorityLower.includes(ref));
    if (!hasValidAuthority) {
      findings.push(
        `Authority citation ("${agreement.authority}") does not reference 31 USC §1535 ` +
        `(Economy Act). Economy Act orders must explicitly cite this authority. ` +
        `Ref: DoD FMR Vol 11A, Ch 3.`,
      );
    }
  } else {
    findings.push(
      `No authority cited. Economy Act orders must cite 31 USC §1535. ` +
      `Ref: DoD FMR Vol 11A, Ch 3.`,
    );
  }

  // --- Both agencies must be identified ---
  if (!agreement.servicingAgency || agreement.servicingAgency.trim() === '') {
    findings.push(
      `Servicing agency is not identified. Economy Act orders require both ` +
      `requesting and servicing agencies. Ref: 31 USC §1535(a); DoD FMR Vol 11A, Ch 3.`,
    );
  }
  if (!agreement.requestingAgency || agreement.requestingAgency.trim() === '') {
    findings.push(
      `Requesting agency is not identified. Ref: 31 USC §1535(a); DoD FMR Vol 11A, Ch 3.`,
    );
  }

  // --- Same agency prohibition ---
  if (
    agreement.servicingAgency &&
    agreement.requestingAgency &&
    agreement.servicingAgency.toUpperCase().trim() === agreement.requestingAgency.toUpperCase().trim()
  ) {
    findings.push(
      `Servicing and requesting agencies are the same ("${agreement.servicingAgency}"). ` +
      `Economy Act is for interagency transactions only. Intra-agency work should ` +
      `use internal fund transfers. Ref: 31 USC §1535; DoD FMR Vol 11A, Ch 2.`,
    );
  }

  // --- Funds must be obligated in advance ---
  if (agreement.obligatedAmount <= 0) {
    findings.push(
      `No funds obligated ($${agreement.obligatedAmount.toFixed(2)}). Economy Act orders ` +
      `require advance obligation of funds. Ref: 31 USC §1535(b).`,
    );
  }

  // --- Obligated amount must not exceed agreement amount ---
  if (agreement.obligatedAmount > agreement.amount) {
    findings.push(
      `Obligated amount ($${agreement.obligatedAmount.toFixed(2)}) exceeds agreement ` +
      `amount ($${agreement.amount.toFixed(2)}). Ref: 31 USC §1535; DoD FMR Vol 11A, Ch 3.`,
    );
  }

  // --- Billed amount must not exceed obligated amount ---
  if (agreement.billedAmount > agreement.obligatedAmount) {
    findings.push(
      `Billed amount ($${agreement.billedAmount.toFixed(2)}) exceeds obligated amount ` +
      `($${agreement.obligatedAmount.toFixed(2)}). Billings must be supported by ` +
      `valid obligations. Ref: 31 USC §1536; DoD FMR Vol 11A, Ch 4.`,
    );
  }

  // --- Period of performance must be specified ---
  if (!agreement.periodOfPerformance || agreement.periodOfPerformance.trim() === '') {
    findings.push(
      `Period of performance is not specified. Economy Act orders must include ` +
      `a definite period. Ref: 31 USC §1535(d); DoD FMR Vol 11A, Ch 3.`,
    );
  }

  // --- Deobligation of unfilled orders on completion ---
  if (agreement.status === 'completed' && agreement.obligatedAmount > agreement.billedAmount) {
    const unbilled = agreement.obligatedAmount - agreement.billedAmount;
    findings.push(
      `Completed agreement has $${unbilled.toFixed(2)} in obligations not yet ` +
      `billed. Per 31 USC §1535(d), unfilled orders must be deobligated upon ` +
      `completion. Ref: DoD FMR Vol 11A, Ch 3.`,
    );
  }

  // --- Agreement amount must be positive ---
  if (agreement.amount <= 0) {
    findings.push(
      `Agreement amount ($${agreement.amount.toFixed(2)}) must be positive. ` +
      `Ref: DoD FMR Vol 11A, Ch 3.`,
    );
  }

  return {
    valid: findings.length === 0,
    findings,
  };
}

/**
 * Validate whether an interagency agreement correctly uses advance
 * vs. reimbursement funding mechanisms.
 *
 * Per DoD FMR Vol 11A, Ch 4:
 * - Advances: Requesting agency provides funds in advance. Required for
 *   Economy Act orders per 31 USC §1535(b).
 * - Reimbursements: Servicing agency bills after performance. Standard
 *   method for non-Economy Act agreements.
 *
 * Key rules:
 * - Advances generally may not exceed expected costs for 90 days.
 * - Excess advances must be returned promptly.
 * - Collections must be credited to the appropriate account.
 *
 * @param agreement - the InteragencyAgreement to evaluate
 * @returns Validation result with findings
 */
export function validateAdvanceVsReimbursement(
  agreement: InteragencyAgreement,
): { valid: boolean; findings: string[] } {
  const findings: string[] = [];

  const hasAdvance = agreement.advanceReceived > 0;
  const hasBilling = agreement.billedAmount > 0;

  // --- Economy Act orders MUST be advance-funded ---
  if (agreement.agreementType === 'economy_act') {
    if (!hasAdvance) {
      findings.push(
        `Economy Act order has no advance funding. Per 31 USC §1535(b), the ` +
        `requesting agency must provide funds in advance before the servicing ` +
        `agency incurs obligations. Current advance: $${agreement.advanceReceived.toFixed(2)}. ` +
        `Ref: DoD FMR Vol 11A, Ch 3.`,
      );
    }

    if (hasAdvance && agreement.advanceReceived < agreement.obligatedAmount) {
      findings.push(
        `Economy Act advance ($${agreement.advanceReceived.toFixed(2)}) is less than ` +
        `the obligated amount ($${agreement.obligatedAmount.toFixed(2)}). The full ` +
        `obligation must be funded in advance. Ref: 31 USC §1535(b); DoD FMR Vol 11A, Ch 3.`,
      );
    }
  }

  // --- Advance exceeds agreement amount ---
  if (hasAdvance && agreement.advanceReceived > agreement.amount) {
    findings.push(
      `Advance received ($${agreement.advanceReceived.toFixed(2)}) exceeds the ` +
      `total agreement amount ($${agreement.amount.toFixed(2)}). Advances ` +
      `cannot exceed the authorized order amount. ` +
      `Ref: DoD FMR Vol 11A, Ch 4; 31 USC §1535.`,
    );
  }

  // --- Advance exceeds 90-day estimated costs ---
  if (hasAdvance && agreement.amount > 0) {
    const ninetyDayEstimate = agreement.amount * 0.25; // 90 days of annual agreement
    if (agreement.advanceReceived > ninetyDayEstimate * 1.1) {
      findings.push(
        `Advance received ($${agreement.advanceReceived.toFixed(2)}) may exceed ` +
        `90-day estimated costs ($${ninetyDayEstimate.toFixed(2)}). Per OMB Circular ` +
        `A-11 and DoD FMR Vol 11A, Ch 4, advances generally should not exceed ` +
        `90 days of expected costs.`,
      );
    }
  }

  // --- Combined funding exceeds agreement ---
  if (hasAdvance && hasBilling) {
    const totalFunding = agreement.advanceReceived + agreement.collectedAmount;
    if (totalFunding > agreement.amount) {
      findings.push(
        `Combined advances ($${agreement.advanceReceived.toFixed(2)}) and collections ` +
        `($${agreement.collectedAmount.toFixed(2)}) total $${totalFunding.toFixed(2)}, ` +
        `exceeding the agreement amount ($${agreement.amount.toFixed(2)}). ` +
        `Excess must be returned. Ref: DoD FMR Vol 11A, Ch 4.`,
      );
    }
  }

  // --- Collections should not exceed billings ---
  if (agreement.collectedAmount > agreement.billedAmount && agreement.billedAmount > 0) {
    findings.push(
      `Collections ($${agreement.collectedAmount.toFixed(2)}) exceed billings ` +
      `($${agreement.billedAmount.toFixed(2)}). Over-collection must be ` +
      `reconciled and returned. Ref: DoD FMR Vol 11A, Ch 4.`,
    );
  }

  return {
    valid: findings.length === 0,
    findings,
  };
}

/**
 * Calculate working capital fund cost recovery rates and surplus/deficit.
 *
 * Per 10 USC §2208 and DoD FMR Vol 11B: Working capital funds operate on
 * a break-even basis over time. Revenue from customers should recover the
 * full cost of operations, including depreciation of capital assets.
 *
 * @param wcf - the WorkingCapitalFund record
 * @returns Cost recovery analysis with rate, surplus/deficit, and findings
 */
export function calculateWorkingCapitalFundRates(
  wcf: WorkingCapitalFund,
): { costRecoveryRate: number; surplusDeficit: number; findings: string[] } {
  const findings: string[] = [];

  // Cost recovery rate = revenue / cost of operations
  let costRecoveryRate = 0;
  if (wcf.costOfOperations > 0) {
    costRecoveryRate = wcf.revenueFromOperations / wcf.costOfOperations;
  } else if (wcf.revenueFromOperations > 0) {
    costRecoveryRate = Infinity;
    findings.push(
      `Cost of operations is zero but revenue is $${wcf.revenueFromOperations.toFixed(2)}. ` +
      `This indicates a data anomaly. Ref: DoD FMR Vol 11B.`,
    );
  }

  // Surplus or deficit
  const surplusDeficit = wcf.revenueFromOperations - wcf.costOfOperations;

  // --- WCFs should operate near break-even (within 3%) ---
  if (costRecoveryRate > 0 && isFinite(costRecoveryRate)) {
    if (costRecoveryRate > 1.03) {
      const surplusPct = ((costRecoveryRate - 1.0) * 100).toFixed(1);
      findings.push(
        `Cost recovery rate (${(costRecoveryRate * 100).toFixed(1)}%) exceeds 103%. ` +
        `WCF is generating a ${surplusPct}% surplus ($${surplusDeficit.toFixed(2)}). ` +
        `Rates should be adjusted downward. Ref: DoD FMR Vol 11B; 10 USC §2208.`,
      );
    } else if (costRecoveryRate < 0.97) {
      const deficitPct = ((1.0 - costRecoveryRate) * 100).toFixed(1);
      findings.push(
        `Cost recovery rate (${(costRecoveryRate * 100).toFixed(1)}%) is below 97%. ` +
        `WCF is running a ${deficitPct}% deficit ($${Math.abs(surplusDeficit).toFixed(2)}). ` +
        `Rates should be adjusted upward or costs reduced. ` +
        `Ref: DoD FMR Vol 11B; 10 USC §2208.`,
      );
    }
  }

  // --- Depreciation check ---
  if (wcf.capitalizedAssets > 0 && wcf.accumulatedDepreciation <= 0) {
    findings.push(
      `Capitalized assets of $${wcf.capitalizedAssets.toFixed(2)} have no accumulated ` +
      `depreciation recorded. Depreciation must be included in cost of operations ` +
      `for accurate rate-setting. Ref: DoD FMR Vol 11B, Ch 79.`,
    );
  }

  // --- Accumulated depreciation exceeds capitalized assets ---
  if (wcf.accumulatedDepreciation > wcf.capitalizedAssets) {
    findings.push(
      `Accumulated depreciation ($${wcf.accumulatedDepreciation.toFixed(2)}) exceeds ` +
      `capitalized assets ($${wcf.capitalizedAssets.toFixed(2)}). Potential ` +
      `accounting error. Ref: DoD FMR Vol 11B.`,
    );
  }

  // --- Cash balance adequacy ---
  if (wcf.cashBalance < 0) {
    findings.push(
      `Negative cash balance ($${wcf.cashBalance.toFixed(2)}) indicates the WCF ` +
      `may not be able to meet current obligations. ` +
      `Ref: DoD FMR Vol 11B; 10 USC §2208.`,
    );
  }

  // --- Net operating result consistency ---
  const expectedNOR = wcf.revenueFromOperations - wcf.costOfOperations;
  const norVariance = Math.abs(wcf.netOperatingResult - expectedNOR);
  if (norVariance > 1.00) {
    findings.push(
      `Net operating result ($${wcf.netOperatingResult.toFixed(2)}) does not match ` +
      `revenue minus cost ($${expectedNOR.toFixed(2)}). Variance: $${norVariance.toFixed(2)}. ` +
      `Ref: DoD FMR Vol 11B.`,
    );
  }

  return {
    costRecoveryRate: Math.round(costRecoveryRate * 10000) / 10000,
    surplusDeficit: Math.round(surplusDeficit * 100) / 100,
    findings,
  };
}

/**
 * Validate general interagency agreement (IAA) compliance.
 *
 * Performs broad compliance checks applicable to all types of interagency
 * agreements: Economy Act orders, non-Economy Act statutory authority
 * agreements, and franchise fund agreements.
 *
 * @param agreement - the InteragencyAgreement to validate
 * @returns Validation result with findings
 */
export function validateIAACompliance(
  agreement: InteragencyAgreement,
): { valid: boolean; findings: string[] } {
  const findings: string[] = [];

  // --- Agreement number ---
  if (!agreement.agreementNumber || agreement.agreementNumber.trim() === '') {
    findings.push(
      `Agreement number is missing. All IAAs must have a unique agreement ` +
      `number for tracking. Ref: DoD FMR Vol 11A, Ch 2.`,
    );
  }

  // --- Both parties ---
  if (!agreement.servicingAgency || agreement.servicingAgency.trim() === '') {
    findings.push(
      `Servicing agency is not identified. Ref: DoD FMR Vol 11A, Ch 2.`,
    );
  }
  if (!agreement.requestingAgency || agreement.requestingAgency.trim() === '') {
    findings.push(
      `Requesting agency is not identified. Ref: DoD FMR Vol 11A, Ch 2.`,
    );
  }

  // --- Self-dealing ---
  if (
    agreement.servicingAgency &&
    agreement.requestingAgency &&
    agreement.servicingAgency.toUpperCase().trim() === agreement.requestingAgency.toUpperCase().trim()
  ) {
    findings.push(
      `Servicing and requesting agencies are the same ("${agreement.servicingAgency}"). ` +
      `Interagency agreements require two distinct agencies. ` +
      `Ref: DoD FMR Vol 11A, Ch 2.`,
    );
  }

  // --- Authority ---
  if (!agreement.authority || agreement.authority.trim() === '') {
    findings.push(
      `Legal authority is not cited. All IAAs must reference the statutory ` +
      `authority under which they are executed. Ref: DoD FMR Vol 11A, Ch 2.`,
    );
  }

  // --- Pending status obligations ---
  if (agreement.status === 'pending' && agreement.obligatedAmount > 0) {
    findings.push(
      `Agreement is in "pending" status but has $${agreement.obligatedAmount.toFixed(2)} ` +
      `obligated. No obligations should be recorded until the agreement is ` +
      `fully executed. Ref: DoD FMR Vol 11A, Ch 2.`,
    );
  }

  // --- Financial consistency ---
  if (agreement.billedAmount > agreement.amount) {
    findings.push(
      `Billed amount ($${agreement.billedAmount.toFixed(2)}) exceeds agreement amount ` +
      `($${agreement.amount.toFixed(2)}). An agreement modification is required. ` +
      `Ref: DoD FMR Vol 11A, Ch 3.`,
    );
  }

  if (agreement.collectedAmount > agreement.billedAmount && agreement.billedAmount > 0) {
    findings.push(
      `Collections ($${agreement.collectedAmount.toFixed(2)}) exceed billings ` +
      `($${agreement.billedAmount.toFixed(2)}). Over-collection must be reconciled. ` +
      `Ref: DoD FMR Vol 11A, Ch 4.`,
    );
  }

  // --- Amount validation ---
  if (agreement.amount <= 0 && agreement.status === 'active') {
    findings.push(
      `Active agreement has a non-positive amount ($${agreement.amount.toFixed(2)}). ` +
      `Ref: DoD FMR Vol 11A, Ch 2.`,
    );
  }

  // --- Period of performance ---
  if (!agreement.periodOfPerformance || agreement.periodOfPerformance.trim() === '') {
    findings.push(
      `Period of performance is not specified. Ref: DoD FMR Vol 11A, Ch 2.`,
    );
  }

  // --- Completed agreement closeout ---
  if (agreement.status === 'completed') {
    const unreconciled = agreement.billedAmount - agreement.collectedAmount;
    if (Math.abs(unreconciled) > 0.01) {
      findings.push(
        `Completed agreement has unreconciled balance of $${unreconciled.toFixed(2)} ` +
        `(billed: $${agreement.billedAmount.toFixed(2)}, collected: ` +
        `$${agreement.collectedAmount.toFixed(2)}). All billings must be ` +
        `collected before final closeout. Ref: DoD FMR Vol 11A, Ch 5.`,
      );
    }

    if (agreement.obligatedAmount > 0 && agreement.billedAmount === 0) {
      findings.push(
        `Completed agreement has $${agreement.obligatedAmount.toFixed(2)} in obligations ` +
        `but no billings. Unfilled orders should be deobligated. ` +
        `Ref: DoD FMR Vol 11A, Ch 3.`,
      );
    }
  }

  // --- Advance without obligations ---
  if (agreement.advanceReceived > 0 && agreement.obligatedAmount === 0) {
    findings.push(
      `Advance received ($${agreement.advanceReceived.toFixed(2)}) but no obligations ` +
      `recorded. Advances must be promptly obligated. ` +
      `Ref: DoD FMR Vol 11A, Ch 4; 31 USC §1536.`,
    );
  }

  return {
    valid: findings.length === 0,
    findings,
  };
}
