/**
 * Debt Management Workflow Engine -- Volume 16
 *
 * Implements the federal debt collection lifecycle for DoD agencies per
 * DoD FMR Volume 16 (Debt Management), the Debt Collection Improvement
 * Act of 1996 (DCIA), and the Federal Claims Collection Standards
 * (31 CFR Parts 900-904).
 *
 * References:
 *   - DoD FMR Vol. 16 (Debt Management)
 *   - 31 U.S.C. Section 3711 (Collection and Compromise of Claims)
 *   - 31 U.S.C. Section 3716 (Administrative Offset)
 *   - 31 U.S.C. Section 3717 (Interest and Penalty on Claims)
 *   - 31 CFR Part 901 (Administrative Collection of Claims)
 *   - 31 CFR Part 902 (Compromise of Claims)
 *   - 5 U.S.C. Section 5514 (Installment Deduction for Indebtedness)
 *   - DCIA (Debt Collection Improvement Act of 1996)
 */

import type { DebtRecord, DebtAging, DebtCategory } from '@/types/dod-fmr';
import { getParameter } from '@/lib/engine/tax-parameters/registry';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DemandLetterType = 'initial' | '30_day' | '60_day' | '90_day';

export interface DemandLetter {
  id: string;
  debtId: string;
  letterType: DemandLetterType;
  sequenceNumber: number;
  generatedDate: string;
  responseDeadline: string;
  debtorInfo: {
    name: string;
    debtorId?: string;
  };
  amount: number;
  interestAccrued: number;
  penaltyAmount: number;
  adminFees: number;
  totalAmountDue: number;
  rightsNotification: string[];
  authority: string;
}

export interface DebtAccrual {
  debtId: string;
  asOfDate: string;
  principalBalance: number;
  interestAccrued: number;
  interestRate: number;
  penaltyAmount: number;
  penaltyRate: number;
  adminFees: number;
  totalAmountDue: number;
  daysDelinquent: number;
  fiscalYear: number;
}

export interface TOPEnrollment {
  id: string;
  debtId: string;
  eligible: boolean;
  enrollmentDate?: string;
  reasons: string[];
  debtAmount: number;
  minimumThreshold: number;
  daysDelinquent: number;
  legallyEnforceable: boolean;
  authority: string;
}

export interface TreasuryReferral {
  id: string;
  debtId: string;
  referralDate: string;
  dciaDeadline: string;
  daysUntilDeadline: number;
  isPastDeadline: boolean;
  debtAmount: number;
  debtorName: string;
  debtCategory: DebtCategory;
  dueDiligenceComplete: boolean;
  demandLettersSent: number;
  referralPackage: {
    debtorInformation: boolean;
    debtBasis: boolean;
    paymentHistory: boolean;
    collectionActions: boolean;
    supportingDocuments: boolean;
  };
  authority: string;
}

export interface SalaryOffsetPlan {
  id: string;
  debtId: string;
  employeeId: string;
  employeeName: string;
  debtAmount: number;
  disposablePay: number;
  maxOffsetPercentage: number;
  offsetAmountPerPeriod: number;
  payPeriods: number;
  estimatedCompletionDate: string;
  hearingRightsNotified: boolean;
  hearingRequested: boolean;
  hearingDate?: string;
  voluntaryRepayment: boolean;
  initiatedDate: string;
  authority: string;
}

export interface CompromiseEvaluation {
  id: string;
  debtId: string;
  originalAmount: number;
  totalAmountDue: number;
  offeredAmount: number;
  compromisePercentage: number;
  withinAgencyLimit: boolean;
  agencyDelegationLimit: number;
  requiresTreasuryApproval: boolean;
  recommendation: 'approve' | 'reject' | 'refer_to_treasury';
  reasons: string[];
  authority: string;
}

export interface WriteOffResult {
  id: string;
  debtId: string;
  amount: number;
  reason: string;
  approvalRequired: string;
  approvalLevel: string;
  writeOffDate: string;
  fiscalYear: number;
  authority: string;
}

export interface DebtAgingReport {
  asOfDate: string;
  totalDebts: number;
  totalAmount: number;
  aging: DebtAging;
  byCategory: Record<string, DebtAging & { count: number }>;
  summary: {
    averageAge: number;
    oldestDebtDays: number;
    percentDelinquent: number;
    percentReferred: number;
    percentEnrolledTOP: number;
  };
}

export interface DueDiligenceChecklist {
  id: string;
  debtId: string;
  generatedDate: string;
  debtEstablished: boolean;
  initialDemandLetterSent: boolean;
  secondDemandLetterSent: boolean;
  thirdDemandLetterSent: boolean;
  rightsNotificationProvided: boolean;
  interestPenaltyAssessed: boolean;
  skipTracingComplete: boolean;
  offsetApplied: boolean;
  topEnrollmentConsidered: boolean;
  crossServicingReferred: boolean;
  compromiseConsidered: boolean;
  writeOffConsidered: boolean;
  salaryOffsetConsidered: boolean;
  allStepsComplete: boolean;
  missingSteps: string[];
  authority: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Days added for each demand letter response deadline */
const DEMAND_LETTER_RESPONSE_DAYS = 30;

/** Sequence mapping for demand letter types */
const LETTER_SEQUENCE: Record<DemandLetterType, number> = {
  initial: 1,
  '30_day': 2,
  '60_day': 3,
  '90_day': 4,
};

/** Standard debtor rights notifications per 31 CFR 901.2. */
const DEBTOR_RIGHTS: string[] = [
  'The basis for the debt and amount owed, including interest, penalties, and administrative costs.',
  'The right to inspect and copy agency records pertaining to the debt.',
  'The right to request review of the agency determination of the debt.',
  'The right to enter into a written repayment agreement.',
  'The right to request a waiver (if applicable by statute).',
  'The right to a hearing before salary offset (5 U.S.C. Section 5514).',
  'That the debt may be referred to TOP for offset against federal payments.',
  'That the debt may be referred to Treasury for cross-servicing.',
  'That the debt may be reported to credit bureaus if not resolved.',
  'The deadline for responding to this notice.',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Round a number to 2 decimal places. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Add calendar days to a date string (YYYY-MM-DD), return YYYY-MM-DD. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/** Calculate the number of whole days between two date strings. */
function daysBetween(fromStr: string, toStr: string): number {
  const from = new Date(fromStr);
  const to = new Date(toStr);
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/** Derive fiscal year from a date string. Federal FY starts October 1. */
function fiscalYearFromDate(dateStr: string): number {
  const d = new Date(dateStr);
  return d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear();
}

/** Today as YYYY-MM-DD. */
function today(): string {
  return new Date().toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// 1. Demand Letter Generation (31 CFR 901.2)
// ---------------------------------------------------------------------------

/**
 * Generate a demand letter for a debt per 31 CFR 901.2.
 *
 * Agencies must make written demand for payment informing the debtor
 * of the basis/amount of the debt, their rights, and consequences of
 * non-payment. Letters are sent in sequence: initial, 30-day, 60-day,
 * and 90-day follow-ups per DoD FMR Vol. 16, Ch. 4.
 *
 * @param debt - The debt record
 * @param letterType - Type/stage of the demand letter
 */
export function generateDemandLetter(
  debt: DebtRecord,
  letterType: DemandLetterType
): DemandLetter {
  const generatedDate = today();
  const responseDeadline = addDays(generatedDate, DEMAND_LETTER_RESPONSE_DAYS);

  const interestAccrued = debt.interestAssessed;
  const penaltyAmount = debt.penaltyAssessed;
  const adminFees = debt.adminFeeAssessed;
  const totalAmountDue = round2(
    debt.amount + interestAccrued + penaltyAmount + adminFees - debt.paymentsReceived
  );

  return {
    id: uuid(),
    debtId: debt.id,
    letterType,
    sequenceNumber: LETTER_SEQUENCE[letterType],
    generatedDate,
    responseDeadline,
    debtorInfo: {
      name: debt.debtorName,
      debtorId: debt.debtorId,
    },
    amount: debt.amount,
    interestAccrued: round2(interestAccrued),
    penaltyAmount: round2(penaltyAmount),
    adminFees: round2(adminFees),
    totalAmountDue: round2(Math.max(totalAmountDue, 0)),
    rightsNotification: [...DEBTOR_RIGHTS],
    authority: '31 CFR 901.2; DoD FMR Vol. 16, Ch. 4',
  };
}

// ---------------------------------------------------------------------------
// 2. Interest / Penalty / Admin Fee Accrual (31 U.S.C. Section 3717)
// ---------------------------------------------------------------------------

/**
 * Calculate accrued interest on a delinquent debt per 31 U.S.C. Section 3717(a).
 *
 * Interest accrues at the Treasury Current Value of Funds Rate
 * (DOD_DEBT_INTEREST_RATE parameter) from the delinquent date.
 * Simple interest: Principal * Rate * (Days / 365).
 *
 * @param debt - The debt record
 * @param asOfDate - Date to calculate interest through (YYYY-MM-DD)
 */
export function accrueInterest(debt: DebtRecord, asOfDate: string): number {
  if (!debt.delinquentDate) return 0;

  const fy = fiscalYearFromDate(asOfDate);
  const annualRate = getParameter('DOD_DEBT_INTEREST_RATE', fy, undefined, 0.01);

  const daysDelinquent = daysBetween(debt.delinquentDate, asOfDate);
  if (daysDelinquent <= 0) return 0;

  const principal = debt.amount - debt.paymentsReceived;
  if (principal <= 0) return 0;

  // Simple interest: P * r * (days / 365)
  const interest = principal * annualRate * (daysDelinquent / 365);
  return round2(interest);
}

/**
 * Calculate penalty on a delinquent debt per 31 U.S.C. Section 3717(e)(2).
 *
 * 6% per annum penalty (DOD_DEBT_PENALTY_RATE) assessed on debts more
 * than 90 days past due. Penalty accrues from day 91 onward.
 *
 * @param debt - The debt record
 * @param asOfDate - Date to calculate penalty through (YYYY-MM-DD)
 */
export function calculatePenalty(debt: DebtRecord, asOfDate: string): number {
  if (!debt.delinquentDate) return 0;

  const totalDaysDelinquent = daysBetween(debt.delinquentDate, asOfDate);
  if (totalDaysDelinquent <= 90) return 0;

  const fy = fiscalYearFromDate(asOfDate);
  const penaltyRate = getParameter('DOD_DEBT_PENALTY_RATE', fy, undefined, 0.06);

  // Penalty accrues only on days beyond the 90-day grace period
  const penaltyDays = totalDaysDelinquent - 90;
  const principal = debt.amount - debt.paymentsReceived;
  if (principal <= 0) return 0;

  const penalty = principal * penaltyRate * (penaltyDays / 365);
  return round2(penalty);
}

/**
 * Calculate administrative fees per 31 U.S.C. Section 3717(e)(1).
 *
 * Flat-rate fee (DOD_DEBT_ADMIN_FEE) plus escalated fee
 * (DOD_DEBT_ADMIN_FEE_ESCALATED) after 3+ demand letters.
 *
 * @param debt - The debt record
 */
export function calculateAdminFees(debt: DebtRecord): number {
  const fy = debt.fiscalYear;
  const baseFee = getParameter('DOD_DEBT_ADMIN_FEE', fy, undefined, 35);

  // Escalated processing fee after multiple demand letters
  const additionalFee = debt.demandLettersSent > 2
    ? getParameter('DOD_DEBT_ADMIN_FEE_ESCALATED', fy, undefined, 65)
    : 0;

  return round2(baseFee + additionalFee);
}

/**
 * Produce a consolidated accrual record combining interest, penalty,
 * and admin fees per 31 U.S.C. Section 3717.
 *
 * @param debt - The debt record
 * @param asOfDate - Date to calculate accruals through (YYYY-MM-DD)
 */
export function computeFullAccrual(debt: DebtRecord, asOfDate: string): DebtAccrual {
  const interestAccrued = accrueInterest(debt, asOfDate);
  const penaltyAmount = calculatePenalty(debt, asOfDate);
  const adminFees = calculateAdminFees(debt);

  const principalBalance = round2(Math.max(debt.amount - debt.paymentsReceived, 0));
  const totalAmountDue = round2(principalBalance + interestAccrued + penaltyAmount + adminFees);

  const daysDelinquent = debt.delinquentDate
    ? Math.max(daysBetween(debt.delinquentDate, asOfDate), 0)
    : 0;

  const fy = fiscalYearFromDate(asOfDate);

  return {
    debtId: debt.id,
    asOfDate,
    principalBalance,
    interestAccrued,
    interestRate: getParameter('DOD_DEBT_INTEREST_RATE', fy, undefined, 0.01),
    penaltyAmount,
    penaltyRate: getParameter('DOD_DEBT_PENALTY_RATE', fy, undefined, 0.06),
    adminFees,
    totalAmountDue,
    daysDelinquent,
    fiscalYear: fy,
  };
}

// ---------------------------------------------------------------------------
// 3. Treasury Offset Program (TOP)
// ---------------------------------------------------------------------------

/**
 * Determine TOP eligibility and generate enrollment record.
 *
 * Per 31 U.S.C. Section 3716 and the DCIA, eligibility requires:
 * debt > 120 days delinquent, balance > DOD_DEBT_TOP_MINIMUM ($25
 * default), legally enforceable, and due process provided.
 *
 * @param debt - The debt record
 */
export function enrollInTOP(debt: DebtRecord): TOPEnrollment {
  const fy = debt.fiscalYear;
  const minimumThreshold = getParameter('DOD_DEBT_TOP_MINIMUM', fy, undefined, 25);
  const reasons: string[] = [];
  let eligible = true;

  // Check delinquency period: must exceed 120 days
  const daysDelinquent = debt.delinquentDate
    ? daysBetween(debt.delinquentDate, today())
    : 0;

  if (daysDelinquent < 120) {
    eligible = false;
    reasons.push(`Debt is only ${daysDelinquent} days delinquent; TOP requires > 120 days.`);
  }

  const outstandingBalance = round2(debt.totalAmountDue - debt.paymentsReceived);
  if (outstandingBalance < minimumThreshold) {
    eligible = false;
    reasons.push(`Outstanding balance ($${outstandingBalance.toFixed(2)}) is below the TOP minimum threshold ($${minimumThreshold.toFixed(2)}).`);
  }

  const legallyEnforceable = debt.status !== 'waived' && debt.status !== 'written_off' && debt.status !== 'compromised';
  if (!legallyEnforceable) {
    eligible = false;
    reasons.push(`Debt status "${debt.status}" indicates the debt is not legally enforceable.`);
  }

  if (debt.demandLettersSent < 1) {
    eligible = false;
    reasons.push('At least one demand letter must be sent before TOP enrollment.');
  }

  if (eligible) {
    reasons.push('Debt meets all TOP eligibility requirements per 31 U.S.C. Section 3716.');
  }

  return {
    id: uuid(),
    debtId: debt.id,
    eligible,
    enrollmentDate: eligible ? today() : undefined,
    reasons,
    debtAmount: outstandingBalance,
    minimumThreshold,
    daysDelinquent,
    legallyEnforceable,
    authority: '31 U.S.C. Section 3716; DCIA; DoD FMR Vol. 16, Ch. 5',
  };
}

// ---------------------------------------------------------------------------
// 4. Cross-Servicing Referral (31 U.S.C. Section 3711(g))
// ---------------------------------------------------------------------------

/**
 * Generate a referral package for Treasury cross-servicing per
 * 31 U.S.C. Section 3711(g). The DCIA mandates referral of non-tax
 * debts delinquent > 120 days. Package includes debtor information,
 * debt basis, payment history, and supporting documents.
 *
 * @param debt - The debt record
 */
export function referToTreasury(debt: DebtRecord): TreasuryReferral {
  const referralDate = today();
  const dciaDeadlineDays = 120;

  const delinquentDate = debt.delinquentDate || debt.dueDate;
  const dciaDeadline = addDays(delinquentDate, dciaDeadlineDays);
  const daysUntilDeadline = daysBetween(referralDate, dciaDeadline);
  const isPastDeadline = daysUntilDeadline < 0;

  return {
    id: uuid(),
    debtId: debt.id,
    referralDate,
    dciaDeadline,
    daysUntilDeadline,
    isPastDeadline,
    debtAmount: round2(debt.totalAmountDue - debt.paymentsReceived),
    debtorName: debt.debtorName,
    debtCategory: debt.category,
    dueDiligenceComplete: debt.dueDiligenceComplete,
    demandLettersSent: debt.demandLettersSent,
    referralPackage: {
      debtorInformation: true,
      debtBasis: true,
      paymentHistory: debt.paymentsReceived > 0,
      collectionActions: debt.demandLettersSent > 0,
      supportingDocuments: debt.dueDiligenceComplete,
    },
    authority: '31 U.S.C. Section 3711(g); DCIA; DoD FMR Vol. 16, Ch. 5',
  };
}

/**
 * Check DCIA 120-day referral deadline status per 31 U.S.C. Section 3711(g).
 *
 * Warning levels: 'none' (>30 days), 'approaching' (15-30 days),
 * 'imminent' (0-15 days), 'past_due' (deadline passed).
 *
 * @param debt - The debt record
 */
export function checkReferralDeadline(debt: DebtRecord): {
  debtId: string;
  delinquentDate: string;
  dciaDeadline: string;
  daysUntilDeadline: number;
  isPastDeadline: boolean;
  warningLevel: 'none' | 'approaching' | 'imminent' | 'past_due';
  alreadyReferred: boolean;
} {
  const delinquentDate = debt.delinquentDate || debt.dueDate;
  const dciaDeadline = addDays(delinquentDate, 120);
  const daysUntilDeadline = daysBetween(today(), dciaDeadline);

  let warningLevel: 'none' | 'approaching' | 'imminent' | 'past_due';
  if (daysUntilDeadline < 0) {
    warningLevel = 'past_due';
  } else if (daysUntilDeadline <= 15) {
    warningLevel = 'imminent';
  } else if (daysUntilDeadline <= 30) {
    warningLevel = 'approaching';
  } else {
    warningLevel = 'none';
  }

  return {
    debtId: debt.id,
    delinquentDate,
    dciaDeadline,
    daysUntilDeadline,
    isPastDeadline: daysUntilDeadline < 0,
    warningLevel,
    alreadyReferred: debt.referredToTreasury,
  };
}

// ---------------------------------------------------------------------------
// 5. Salary Offset Processing (5 U.S.C. Section 5514)
// ---------------------------------------------------------------------------

/**
 * Create a salary offset plan per 5 U.S.C. Section 5514.
 *
 * Deduction capped at 15% of disposable pay (DOD_SALARY_OFFSET_MAX_PCT).
 * Employee must receive 30-day written notice and has hearing rights.
 *
 * @param debt - The debt record
 * @param employeeInfo - Employee salary details for offset calculation
 */
export function initiateSalaryOffset(
  debt: DebtRecord,
  employeeInfo: {
    employeeId: string;
    employeeName: string;
    disposablePayPerPeriod: number;
    payPeriodsPerYear: number;
  }
): SalaryOffsetPlan {
  const fy = debt.fiscalYear;
  const maxOffsetPct = getParameter('DOD_SALARY_OFFSET_MAX_PCT', fy, undefined, 0.15);

  const maxOffsetPerPeriod = round2(employeeInfo.disposablePayPerPeriod * maxOffsetPct);
  const outstandingBalance = round2(debt.totalAmountDue - debt.paymentsReceived);

  // Calculate minimum pay periods needed at max offset rate
  const payPeriods = maxOffsetPerPeriod > 0
    ? Math.ceil(outstandingBalance / maxOffsetPerPeriod)
    : 0;

  // Estimate completion using biweekly (14 calendar day) pay periods
  const biweeklyDays = 14;
  const totalDays = payPeriods * biweeklyDays;
  const estimatedCompletionDate = addDays(today(), totalDays);

  return {
    id: uuid(),
    debtId: debt.id,
    employeeId: employeeInfo.employeeId,
    employeeName: employeeInfo.employeeName,
    debtAmount: outstandingBalance,
    disposablePay: employeeInfo.disposablePayPerPeriod,
    maxOffsetPercentage: maxOffsetPct,
    offsetAmountPerPeriod: maxOffsetPerPeriod,
    payPeriods,
    estimatedCompletionDate,
    hearingRightsNotified: true,
    hearingRequested: false,
    voluntaryRepayment: false,
    initiatedDate: today(),
    authority: '5 U.S.C. Section 5514; DoD FMR Vol. 16, Ch. 6',
  };
}

// ---------------------------------------------------------------------------
// 6. Compromise / Waiver / Write-off
// ---------------------------------------------------------------------------

/**
 * Evaluate compromise eligibility per 31 U.S.C. Section 3711 / 31 CFR Part 902.
 *
 * Agency delegation limit from DOD_DEBT_COMPROMISE_AGENCY_LIMIT; amounts
 * above require Treasury approval. Recommendation thresholds: >= 65%
 * approve, 40-64% approve with justification, < 40% reject.
 *
 * @param debt - The debt record
 * @param offeredAmount - The dollar amount the debtor is offering
 */
export function evaluateCompromise(
  debt: DebtRecord,
  offeredAmount: number
): CompromiseEvaluation {
  const fy = debt.fiscalYear;
  const agencyLimit = getParameter(
    'DOD_DEBT_COMPROMISE_AGENCY_LIMIT', fy, undefined, 100000
  );

  const totalAmountDue = round2(debt.totalAmountDue - debt.paymentsReceived);
  const compromisePercentage = totalAmountDue > 0
    ? round2(offeredAmount / totalAmountDue)
    : 0;

  const withinAgencyLimit = totalAmountDue <= agencyLimit;
  const requiresTreasuryApproval = !withinAgencyLimit;

  const reasons: string[] = [];
  let recommendation: 'approve' | 'reject' | 'refer_to_treasury';

  const pctLabel = `${(compromisePercentage * 100).toFixed(1)}%`;
  const offerLabel = `$${offeredAmount.toFixed(2)}`;

  if (requiresTreasuryApproval) {
    recommendation = 'refer_to_treasury';
    reasons.push(`Debt amount ($${totalAmountDue.toFixed(2)}) exceeds agency delegation limit ($${agencyLimit.toFixed(2)}); referral to Treasury required per 31 CFR 902.1.`);
  } else if (compromisePercentage >= 0.65) {
    recommendation = 'approve';
    reasons.push(`Offered amount (${offerLabel}) represents ${pctLabel} of total due; within acceptable range.`);
  } else if (compromisePercentage >= 0.40) {
    recommendation = 'approve';
    reasons.push(`Offered amount (${offerLabel}) represents ${pctLabel} of total due; compromise may be justified based on debtor inability to pay or litigative risks per 31 CFR 902.2.`);
  } else {
    recommendation = 'reject';
    reasons.push(`Offered amount (${offerLabel}) represents only ${pctLabel} of total due; insufficient basis for compromise absent extraordinary circumstances.`);
  }

  return {
    id: uuid(),
    debtId: debt.id,
    originalAmount: debt.originalAmount,
    totalAmountDue,
    offeredAmount: round2(offeredAmount),
    compromisePercentage,
    withinAgencyLimit,
    agencyDelegationLimit: agencyLimit,
    requiresTreasuryApproval,
    recommendation,
    reasons,
    authority: '31 U.S.C. Section 3711; 31 CFR Part 902; DoD FMR Vol. 16, Ch. 8',
  };
}

/**
 * Process write-off per DoD FMR Vol. 16 / 31 U.S.C. Section 3711(a).
 *
 * Write-off removes the receivable but does not extinguish the legal
 * debt. Approval tiers: <= TIER1 supervisor, <= TIER2 agency head,
 * above TIER2 requires Treasury referral.
 *
 * @param debt - The debt record
 * @param reason - Justification for the write-off
 */
export function processWriteOff(
  debt: DebtRecord,
  reason: string
): WriteOffResult {
  const fy = debt.fiscalYear;
  const amount = round2(debt.totalAmountDue - debt.paymentsReceived);

  const tier1Limit = getParameter('DOD_DEBT_WRITEOFF_TIER1', fy, undefined, 20000);
  const tier2Limit = getParameter('DOD_DEBT_WRITEOFF_TIER2', fy, undefined, 100000);

  let approvalLevel: string;
  let approvalRequired: string;

  if (amount <= tier1Limit) {
    approvalLevel = 'supervisor';
    approvalRequired =
      'Immediate supervisor per DoD FMR Vol. 16 delegation.';
  } else if (amount <= tier2Limit) {
    approvalLevel = 'agency_head';
    approvalRequired =
      'Agency head or designee per DoD FMR Vol. 16 delegation.';
  } else {
    approvalLevel = 'treasury';
    approvalRequired =
      'Referral to Treasury required per 31 U.S.C. Section 3711(a) ' +
      'for write-off above agency delegation.';
  }

  return {
    id: uuid(),
    debtId: debt.id,
    amount,
    reason,
    approvalRequired,
    approvalLevel,
    writeOffDate: today(),
    fiscalYear: fy,
    authority: 'DoD FMR Vol. 16, Ch. 8; 31 U.S.C. Section 3711(a)',
  };
}

// ---------------------------------------------------------------------------
// 7. Debt Aging Report
// ---------------------------------------------------------------------------

/**
 * Generate debt aging report per DoD FMR Vol. 16 / OMB Circular A-129.
 *
 * Buckets: current, 1-30, 31-60, 61-90, 91-120, 120+ days delinquent.
 * Results broken out by debt category with per-category counts.
 *
 * @param debts - Array of debt records to analyze
 * @param asOfDate - Reporting date (YYYY-MM-DD)
 */
export function generateDebtAgingReport(
  debts: DebtRecord[],
  asOfDate: string
): DebtAgingReport {
  const aging: DebtAging = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days91to120: 0, over120Days: 0, totalDelinquent: 0 };

  const byCategory: Record<string, DebtAging & { count: number }> = {};

  let totalAmount = 0;
  let totalAgeDays = 0;
  let oldestDebtDays = 0;
  let referredCount = 0;
  let topCount = 0;

  for (const debt of debts) {
    const balance = round2(debt.totalAmountDue - debt.paymentsReceived);
    if (balance <= 0) continue;

    totalAmount = round2(totalAmount + balance);

    const daysDelinquent = debt.delinquentDate
      ? Math.max(daysBetween(debt.delinquentDate, asOfDate), 0)
      : 0;

    totalAgeDays += daysDelinquent;
    if (daysDelinquent > oldestDebtDays) oldestDebtDays = daysDelinquent;
    if (debt.referredToTreasury) referredCount++;
    if (debt.enrolledInTOP) topCount++;

    if (!byCategory[debt.category]) {
      byCategory[debt.category] = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days91to120: 0, over120Days: 0, totalDelinquent: 0, count: 0 };
    }

    const catBucket = byCategory[debt.category];
    catBucket.count++;

    // Place balance into the appropriate aging bucket
    const bucketKey: keyof DebtAging =
      daysDelinquent === 0 ? 'current'
      : daysDelinquent <= 30 ? 'days1to30'
      : daysDelinquent <= 60 ? 'days31to60'
      : daysDelinquent <= 90 ? 'days61to90'
      : daysDelinquent <= 120 ? 'days91to120'
      : 'over120Days';

    aging[bucketKey] = round2(aging[bucketKey] + balance);
    catBucket[bucketKey] = round2(catBucket[bucketKey] + balance);

    if (daysDelinquent > 0) {
      aging.totalDelinquent = round2(aging.totalDelinquent + balance);
      catBucket.totalDelinquent = round2(catBucket.totalDelinquent + balance);
    }
  }

  const activeDebts = debts.filter(
    d => round2(d.totalAmountDue - d.paymentsReceived) > 0
  );
  const activeCount = activeDebts.length;

  return {
    asOfDate,
    totalDebts: activeCount,
    totalAmount,
    aging,
    byCategory,
    summary: {
      averageAge: activeCount > 0 ? Math.round(totalAgeDays / activeCount) : 0,
      oldestDebtDays,
      percentDelinquent: activeCount > 0
        ? round2(
            (activeDebts.filter(d => d.delinquentDate != null).length / activeCount) * 100
          )
        : 0,
      percentReferred: activeCount > 0
        ? round2((referredCount / activeCount) * 100)
        : 0,
      percentEnrolledTOP: activeCount > 0
        ? round2((topCount / activeCount) * 100)
        : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// 8. Due Diligence Checklist
// ---------------------------------------------------------------------------

/**
 * Generate due diligence checklist per 31 CFR Part 901 / DoD FMR Vol. 16.
 *
 * Auto-checks completion of all required collection steps (demand letters,
 * interest assessment, skip tracing, TOP, cross-servicing, compromise,
 * write-off, salary offset) and lists missing steps for remediation.
 *
 * @param debt - The debt record to evaluate
 */
export function generateDueDiligenceChecklist(
  debt: DebtRecord
): DueDiligenceChecklist {
  const missingSteps: string[] = [];

  const debtEstablished = debt.establishedDate != null && debt.amount > 0;
  if (!debtEstablished) missingSteps.push('Debt has not been properly established with amount and date.');

  const initialDemandLetterSent = debt.demandLettersSent >= 1;
  if (!initialDemandLetterSent) missingSteps.push('Initial demand letter has not been sent (31 CFR 901.2).');

  const secondDemandLetterSent = debt.demandLettersSent >= 2;
  if (!secondDemandLetterSent) missingSteps.push('Second demand letter (30-day follow-up) has not been sent.');

  const thirdDemandLetterSent = debt.demandLettersSent >= 3;
  if (!thirdDemandLetterSent) missingSteps.push('Third demand letter (60-day follow-up) has not been sent.');

  const rightsNotificationProvided = initialDemandLetterSent;
  if (!rightsNotificationProvided) missingSteps.push('Debtor rights notification has not been provided (31 CFR 901.2).');

  const interestPenaltyAssessed = debt.interestAssessed > 0 || debt.penaltyAssessed > 0 || debt.adminFeeAssessed > 0;
  if (!interestPenaltyAssessed) missingSteps.push('Interest, penalty, and/or admin fees have not been assessed (31 U.S.C. Section 3717).');

  const skipTracingComplete = debt.skipTracingComplete;
  if (!skipTracingComplete) missingSteps.push('Skip tracing has not been completed for debtor location.');

  const offsetApplied = debt.enrolledInTOP;
  if (!offsetApplied) missingSteps.push('Administrative offset (TOP) has not been applied or considered (31 U.S.C. Section 3716).');

  const topEnrollmentConsidered = debt.enrolledInTOP || debt.demandLettersSent >= 1;
  if (!topEnrollmentConsidered) missingSteps.push('TOP enrollment eligibility has not been evaluated.');

  const crossServicingReferred = debt.referredToTreasury;
  if (!crossServicingReferred) missingSteps.push('Debt has not been referred to Treasury for cross-servicing (31 U.S.C. Section 3711(g)).');

  const compromiseConsidered = debt.compromiseRequested || debt.compromiseApproved;
  if (!compromiseConsidered) missingSteps.push('Compromise has not been considered (31 CFR Part 902).');

  const writeOffConsidered = debt.writeOffRequested || debt.writeOffApproved;
  if (!writeOffConsidered) missingSteps.push('Write-off has not been considered.');

  // Salary offset applicable only to employee debt categories
  const salaryOffsetConsidered =
    debt.category === 'overpayment' || debt.category === 'advance'
      ? debt.demandLettersSent >= 1
      : true;
  if (!salaryOffsetConsidered) missingSteps.push('Salary offset has not been considered for employee debt (5 U.S.C. Section 5514).');

  const allStepsComplete = missingSteps.length === 0;

  return {
    id: uuid(),
    debtId: debt.id,
    generatedDate: today(),
    debtEstablished,
    initialDemandLetterSent,
    secondDemandLetterSent,
    thirdDemandLetterSent,
    rightsNotificationProvided,
    interestPenaltyAssessed,
    skipTracingComplete,
    offsetApplied,
    topEnrollmentConsidered,
    crossServicingReferred,
    compromiseConsidered,
    writeOffConsidered,
    salaryOffsetConsidered,
    allStepsComplete,
    missingSteps,
    authority: '31 CFR Part 901; DoD FMR Vol. 16; DCIA',
  };
}
