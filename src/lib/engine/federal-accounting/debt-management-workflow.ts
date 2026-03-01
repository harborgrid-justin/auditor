/**
 * Volume 16 Debt Management Workflow Engine
 *
 * Full lifecycle of federal debt management for DoD components: demand
 * letters, Treasury referral, TOP enrollment, salary offset, compromise,
 * waiver, write-off, charge accrual, aging, and due diligence.
 *
 * References: 31 U.S.C. §§3711, 3716, 3717; 31 CFR 901-903;
 * 5 U.S.C. §§5514, 5584; 10 U.S.C. §2774; DoD FMR Vol. 16; OMB A-129.
 */

import type { DebtRecord, DebtAging } from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';
import { getParameter } from '@/lib/engine/tax-parameters/registry';

// ── Types ───────────────────────────────────────────────────────────────────

export type DemandLetterType = 'initial' | '30_day' | '60_day' | '90_day' | 'final';

/** Demand letter per 31 CFR 901.2 progressive demand sequence. */
export interface DemandLetter {
  id: string;
  debtId: string;
  type: DemandLetterType;
  generatedDate: string;
  dueDate: string;
  debtorName: string;
  amount: number;
  content: string;
}

export interface DemandLetterResult {
  letter: DemandLetter;
  nextLetterType: DemandLetterType | null;
  nextLetterDueDate: string | null;
}

export interface TOPEnrollmentResult {
  eligible: boolean;
  enrolled: boolean;
  reason: string;
  debtId: string;
  amount: number;
}

export interface TreasuryReferralResult {
  referred: boolean;
  reason: string;
  debtId: string;
  referralDate: string | null;
  delinquentDays: number;
}

export interface SalaryOffsetResult {
  eligible: boolean;
  initiated: boolean;
  reason: string;
  debtId: string;
  offsetAmount: number;
  maxPerPayPeriodPct: number;
}

export interface CompromiseResult {
  approved: boolean;
  reason: string;
  debtId: string;
  originalAmount: number;
  compromiseAmount: number;
  requiresDOJReferral: boolean;
  approvalLevel: string;
}

export interface WaiverResult {
  approved: boolean;
  reason: string;
  debtId: string;
  amount: number;
  waiverAuthority: string;
  requiresHigherAuth: boolean;
}

export interface WriteOffResult {
  approved: boolean;
  reason: string;
  debtId: string;
  amount: number;
  approvalLevel: string;
  dueDiligenceComplete: boolean;
}

export interface DebtChargesResult {
  debtId: string;
  daysDelinquent: number;
  interestAccrued: number;
  penaltyAccrued: number;
  adminFeeAccrued: number;
  totalCharges: number;
  totalAmountDue: number;
}

export interface DueDiligenceItem {
  requirement: string;
  completed: boolean;
  citation: string;
}

export interface DueDiligenceResult {
  debtId: string;
  complete: boolean;
  items: DueDiligenceItem[];
  missingItems: string[];
}

// ── Internal Helpers ────────────────────────────────────────────────────────

const MS_PER_DAY = 86_400_000;
const RESOLVED: DebtRecord['status'][] = ['collected', 'waived', 'written_off'];

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmt(amount: number): string {
  return '$' + amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function delinqDays(debt: DebtRecord, asOf: Date = new Date()): number {
  if (!debt.delinquentDate) return 0;
  return Math.max(0, daysBetween(new Date(debt.delinquentDate), asOf));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isResolved(debt: DebtRecord): boolean {
  return RESOLVED.includes(debt.status);
}

function getApprovalLevel(amount: number, threshold: number): string {
  if (amount <= 10_000) return 'debt_management_officer';
  if (amount <= threshold) return 'component_head';
  return 'agency_head_or_cfo';
}

// ── 1. Demand Letter Generation (31 CFR 901.2) ─────────────────────────────

const LETTER_SEQ: DemandLetterType[] = [
  'initial', '30_day', '60_day', '90_day', 'final',
];

/**
 * Generates the next demand letter in the progressive sequence per
 * 31 CFR 901.2. Each letter informs the debtor of the debt basis,
 * amount, rights to inspect records and request review, applicable
 * charges, payment deadline, and intent to refer to Treasury.
 *
 * @param debt - The delinquent debt record
 * @param fiscalYear - Current fiscal year for parameter lookups
 * @returns Generated letter with scheduling metadata, or null if all sent
 */
export function generateDemandLetter(
  debt: DebtRecord,
  fiscalYear: number,
): DemandLetterResult | null {
  if (debt.demandLettersSent >= LETTER_SEQ.length) return null;

  const letterType = LETTER_SEQ[debt.demandLettersSent];
  const now = new Date();
  const dueDays = letterType === 'final' ? 15 : 30;
  const dueDate = addDays(now, dueDays);
  const adminFee = getParameter('DOD_DEBT_ADMIN_FEE', fiscalYear, undefined, 55);
  const rate = getParameter('DOD_DEBT_INTEREST_RATE', fiscalYear, undefined, 1.0);
  const fmtDue = dueDate.toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const header = letterType === 'initial'
    ? 'INITIAL NOTICE OF DEBT'
    : letterType === 'final'
      ? 'FINAL NOTICE BEFORE ENFORCED COLLECTION'
      : 'DEMAND FOR PAYMENT - ' + letterType.replace('_', '-').toUpperCase() + ' FOLLOW-UP';

  const urgency = letterType === 'final'
    ? 'This is your FINAL NOTICE. Failure to respond will result in referral to the U.S. Department of the Treasury for enforced collection, administrative offset, and credit bureau reporting.'
    : 'If unpaid by ' + fmtDue + ', interest at ' + rate + '% p.a., penalty up to 6% p.a. on amounts >90 days past due, and ' + fmt(adminFee) + ' admin fee per demand will accrue per 31 U.S.C. §3717.';

  const content = [
    header, '',
    'Dear ' + debt.debtorName + ',', '',
    'You owe a debt to the United States Government: ' + fmt(debt.totalAmountDue) + '.', '',
    'Original Amount:     ' + fmt(debt.originalAmount),
    'Interest Assessed:   ' + fmt(debt.interestAssessed),
    'Penalties Assessed:  ' + fmt(debt.penaltyAssessed),
    'Admin Fees Assessed: ' + fmt(debt.adminFeeAssessed),
    'Payments Received:   ' + fmt(debt.paymentsReceived),
    'Total Amount Due:    ' + fmt(debt.totalAmountDue),
    'Payment Due Date:    ' + fmtDue, '',
    urgency, '',
    'YOUR RIGHTS (per 31 CFR 901.2):',
    '  1. Inspect and copy agency records related to this debt.',
    '  2. Request a review of the determination of the debt.',
    '  3. Propose a voluntary repayment agreement.',
    '  4. Request a waiver, if applicable under statute.', '',
    'Debt Management Office',
  ].join('\n');

  const nextIdx = debt.demandLettersSent + 1;
  const nextType = nextIdx < LETTER_SEQ.length ? LETTER_SEQ[nextIdx] : null;

  return {
    letter: {
      id: uuid(),
      debtId: debt.id,
      type: letterType,
      generatedDate: now.toISOString(),
      dueDate: dueDate.toISOString(),
      debtorName: debt.debtorName,
      amount: debt.totalAmountDue,
      content,
    },
    nextLetterType: nextType,
    nextLetterDueDate: nextType ? addDays(now, dueDays + 30).toISOString() : null,
  };
}

// ── 2. Treasury Offset Program Enrollment (31 U.S.C. §3716) ────────────────

/**
 * Evaluates TOP enrollment eligibility. Requires debt > threshold,
 * delinquent > DOD_DEBT_REFERRAL_DAYS, and due process notice sent.
 */
export function enrollInTOP(debt: DebtRecord, fiscalYear: number): TOPEnrollmentResult {
  const threshold = getParameter('DOD_DEBT_REFERRAL_THRESHOLD', fiscalYear, undefined, 25000);
  const reqDays = getParameter('DOD_DEBT_REFERRAL_DAYS', fiscalYear, undefined, 120);
  const days = delinqDays(debt);
  const base = { debtId: debt.id, amount: debt.totalAmountDue };

  if (debt.enrolledInTOP)
    return { eligible: true, enrolled: true, reason: 'Already enrolled in TOP.', ...base };
  if (isResolved(debt))
    return { eligible: false, enrolled: false, reason: 'Status "' + debt.status + '" not eligible for TOP.', ...base };
  if (debt.totalAmountDue < threshold)
    return { eligible: false, enrolled: false, reason: 'Amount ' + fmt(debt.totalAmountDue) + ' below TOP threshold ' + fmt(threshold) + '.', ...base };
  if (days < reqDays)
    return { eligible: false, enrolled: false, reason: 'Delinquent ' + days + ' days; TOP requires ' + reqDays + '.', ...base };
  if (debt.demandLettersSent < 1)
    return { eligible: false, enrolled: false, reason: 'Due process notice not yet provided per 31 CFR 901.2.', ...base };

  return {
    eligible: true,
    enrolled: true,
    reason: 'Meets all TOP criteria: ' + fmt(debt.totalAmountDue) + ' exceeds threshold, ' + days + ' days delinquent, due process provided.',
    ...base,
  };
}

// ── 3. Cross-Servicing Referral to Treasury (31 U.S.C. §3711(g)) ───────────

/**
 * Evaluates mandatory Treasury referral per DCIA. Debts exceeding
 * DOD_DEBT_REFERRAL_THRESHOLD delinquent > DOD_DEBT_REFERRAL_DAYS must
 * be referred unless exempt (litigation, approved compromise).
 */
export function referToTreasury(debt: DebtRecord, fiscalYear: number): TreasuryReferralResult {
  const now = new Date();
  const threshold = getParameter('DOD_DEBT_REFERRAL_THRESHOLD', fiscalYear, undefined, 25000);
  const reqDays = getParameter('DOD_DEBT_REFERRAL_DAYS', fiscalYear, undefined, 120);
  const days = delinqDays(debt, now);
  const base = { debtId: debt.id, delinquentDays: days };

  if (debt.referredToTreasury)
    return { referred: true, reason: 'Already referred on ' + (debt.referredDate ?? 'unknown date') + '.', referralDate: debt.referredDate ?? null, ...base };
  if (isResolved(debt))
    return { referred: false, reason: 'Resolved (' + debt.status + '); referral not required.', referralDate: null, ...base };
  if (debt.compromiseApproved)
    return { referred: false, reason: 'Approved compromise defers Treasury referral.', referralDate: null, ...base };
  if (debt.totalAmountDue < threshold)
    return { referred: false, reason: 'Amount ' + fmt(debt.totalAmountDue) + ' below referral threshold ' + fmt(threshold) + '.', referralDate: null, ...base };
  if (days < reqDays)
    return { referred: false, reason: 'Delinquent ' + days + ' days; DCIA requires ' + reqDays + '.', referralDate: null, ...base };

  return {
    referred: true,
    reason: 'Must refer per 31 U.S.C. §3711(g): ' + days + ' days delinquent, ' + fmt(debt.totalAmountDue) + ' exceeds threshold.',
    referralDate: now.toISOString(),
    ...base,
  };
}

// ── 4. Salary Offset (5 U.S.C. §5514) ──────────────────────────────────────

/**
 * Initiates salary offset for travel card delinquencies exceeding
 * DOD_TRAVEL_CARD_SALARY_OFFSET_THRESHOLD. Due process notice required.
 * Statutory cap: 15% of disposable pay per pay period.
 */
export function initiateSalaryOffset(debt: DebtRecord, fiscalYear: number): SalaryOffsetResult {
  const threshold = getParameter('DOD_TRAVEL_CARD_SALARY_OFFSET_THRESHOLD', fiscalYear, undefined, 250);
  const maxPct = 15;
  const base = { debtId: debt.id, maxPerPayPeriodPct: maxPct };

  if (isResolved(debt))
    return { eligible: false, initiated: false, reason: 'Status "' + debt.status + '"; not applicable.', offsetAmount: 0, ...base };
  if (debt.category !== 'travel_card')
    return { eligible: false, initiated: false, reason: 'Category "' + debt.category + '" not eligible; salary offset applies to travel_card per DoD FMR Vol. 16, Ch. 5.', offsetAmount: 0, ...base };
  if (debt.totalAmountDue < threshold)
    return { eligible: false, initiated: false, reason: 'Amount ' + fmt(debt.totalAmountDue) + ' below threshold ' + fmt(threshold) + '.', offsetAmount: 0, ...base };
  if (debt.demandLettersSent < 1)
    return { eligible: true, initiated: false, reason: 'Due process notice required before offset per 5 U.S.C. §5514(a)(2).', offsetAmount: debt.totalAmountDue, ...base };

  return {
    eligible: true,
    initiated: true,
    reason: 'Salary offset initiated: ' + fmt(debt.totalAmountDue) + ' exceeds ' + fmt(threshold) + '. Max ' + maxPct + '% disposable pay per period.',
    offsetAmount: debt.totalAmountDue,
    ...base,
  };
}

// ── 5. Compromise / Waiver / Write-Off ──────────────────────────────────────

/**
 * Evaluates compromise per 31 U.S.C. §3711(a) and 31 CFR 902.
 * Agency authority limited to DOD_DEBT_COMPROMISE_AGENCY_LIMIT; amounts
 * above require DOJ referral. Delegation scales with amount.
 */
export function evaluateCompromise(
  debt: DebtRecord,
  proposedAmount: number,
  fiscalYear: number,
): CompromiseResult {
  const agencyLimit = getParameter('DOD_DEBT_COMPROMISE_AGENCY_LIMIT', fiscalYear, undefined, 100000);
  const base = { debtId: debt.id, originalAmount: debt.totalAmountDue, compromiseAmount: proposedAmount };

  if (proposedAmount >= debt.totalAmountDue) {
    return {
      approved: false,
      reason: 'Proposed ' + fmt(proposedAmount) + ' not less than total ' + fmt(debt.totalAmountDue) + '. Compromise must reduce the debt.',
      requiresDOJReferral: false,
      approvalLevel: 'none',
      ...base,
    };
  }
  if (debt.totalAmountDue > agencyLimit) {
    return {
      approved: false,
      reason: 'Amount ' + fmt(debt.totalAmountDue) + ' exceeds agency limit ' + fmt(agencyLimit) + '; DOJ referral required per 31 CFR 902.1(b).',
      requiresDOJReferral: true,
      approvalLevel: 'doj',
      ...base,
    };
  }

  const pct = (proposedAmount / debt.totalAmountDue) * 100;
  const level = debt.totalAmountDue <= 10_000
    ? 'debt_management_officer'
    : debt.totalAmountDue <= 50_000 ? 'component_head' : 'cfo';

  return {
    approved: true,
    reason: 'Compromise ' + fmt(proposedAmount) + ' (' + pct.toFixed(1) + '%) within agency authority. ' + level + ' approval required.',
    requiresDOJReferral: false,
    approvalLevel: level,
    ...base,
  };
}

/**
 * Evaluates waiver per 5 U.S.C. §5584 (civilian) / 10 U.S.C. §2774
 * (military). Requires: no fault of employee and collection against
 * equity/good conscience. Property loss and travel card debts ineligible.
 */
export function evaluateWaiver(debt: DebtRecord, fiscalYear: number): WaiverResult {
  const woThreshold = getParameter('DOD_DEBT_WRITEOFF_THRESHOLD', fiscalYear, undefined, 100000);
  const base = { debtId: debt.id, amount: debt.totalAmountDue };

  if (debt.category === 'property_loss') {
    return {
      approved: false,
      reason: 'Property loss debts ineligible for waiver; adjudicated under 10 U.S.C. §2775.',
      waiverAuthority: 'none',
      requiresHigherAuth: false,
      ...base,
    };
  }
  if (debt.category === 'travel_card') {
    return {
      approved: false,
      reason: 'Travel card debts are contractual; salary offset applies per DoD FMR Vol. 16, Ch. 5.',
      waiverAuthority: 'none',
      requiresHigherAuth: false,
      ...base,
    };
  }

  const isMil = debt.category === 'overpayment' || debt.category === 'erroneous_payment';
  const auth = isMil ? '10 U.S.C. §2774' : '5 U.S.C. §5584';
  const higher = debt.totalAmountDue > woThreshold;
  const level = debt.totalAmountDue <= 5_000
    ? 'debt_management_officer'
    : debt.totalAmountDue <= woThreshold ? 'component_head' : 'agency_head_or_cfo';

  return {
    approved: true,
    reason: 'Eligible under ' + auth + '. ' + level + ' approval required. Must show: (1) no fault, (2) collection against equity/good conscience.',
    waiverAuthority: level,
    requiresHigherAuth: higher,
    ...base,
  };
}

/**
 * Evaluates write-off per 31 CFR 903.1. Requires due diligence complete
 * and minimum 3 demand letters. Does not extinguish the debt.
 */
export function evaluateWriteOff(debt: DebtRecord, fiscalYear: number): WriteOffResult {
  const woThreshold = getParameter('DOD_DEBT_WRITEOFF_THRESHOLD', fiscalYear, undefined, 100000);
  const base = { debtId: debt.id, amount: debt.totalAmountDue };

  if (!debt.dueDiligenceComplete) {
    return {
      approved: false,
      reason: 'Due diligence incomplete per 31 CFR 903.1.',
      approvalLevel: 'none',
      dueDiligenceComplete: false,
      ...base,
    };
  }
  if (debt.demandLettersSent < 3) {
    return {
      approved: false,
      reason: 'Only ' + debt.demandLettersSent + ' demand letter(s); minimum 3 required.',
      approvalLevel: 'none',
      dueDiligenceComplete: true,
      ...base,
    };
  }

  const level = getApprovalLevel(debt.totalAmountDue, woThreshold);
  return {
    approved: true,
    reason: 'Write-off approved (' + level + '). ' + debt.demandLettersSent + ' letters sent, due diligence complete. Does not extinguish the debt per 31 CFR 903.',
    approvalLevel: level,
    dueDiligenceComplete: true,
    ...base,
  };
}

// ── 6. Interest / Penalty / Admin Fee Accrual (31 U.S.C. §3717) ────────────

/**
 * Calculates accrued charges on a delinquent debt:
 *   - Interest from delinquency date at DOD_DEBT_INTEREST_RATE (annualized)
 *   - Penalty up to 6% p.a. on portions >90 days past due
 *   - Admin fee (DOD_DEBT_ADMIN_FEE) per demand letter
 */
export function accrueDebtCharges(debt: DebtRecord, fiscalYear: number): DebtChargesResult {
  const ratePct = getParameter('DOD_DEBT_INTEREST_RATE', fiscalYear, undefined, 1.0);
  const adminFee = getParameter('DOD_DEBT_ADMIN_FEE', fiscalYear, undefined, 55);
  const penaltyPct = 6.0; // Statutory max per 31 U.S.C. §3717(e)
  const days = delinqDays(debt);

  if (days <= 0) {
    return {
      debtId: debt.id,
      daysDelinquent: 0,
      interestAccrued: 0,
      penaltyAccrued: 0,
      adminFeeAccrued: 0,
      totalCharges: 0,
      totalAmountDue: debt.totalAmountDue,
    };
  }

  const principal = debt.amount - debt.paymentsReceived;
  const interest = Math.max(0, (principal * (ratePct / 100) * days) / 365);
  const penalty = days > 90
    ? Math.max(0, (principal * (penaltyPct / 100) * (days - 90)) / 365)
    : 0;
  const admin = adminFee * Math.max(debt.demandLettersSent, 1);
  const totalCharges = interest + penalty + admin;

  return {
    debtId: debt.id,
    daysDelinquent: days,
    interestAccrued: round2(interest),
    penaltyAccrued: round2(penalty),
    adminFeeAccrued: round2(admin),
    totalCharges: round2(totalCharges),
    totalAmountDue: round2(principal + totalCharges),
  };
}

// ── 7. Debt Aging Report ────────────────────────────────────────────────────

/**
 * Categorizes outstanding debts into aging buckets per DoD FMR Vol. 16
 * and OMB A-129: current, 1-30, 31-60, 61-90, 91-120, 120+ days.
 */
export function generateDebtAgingReport(debts: DebtRecord[]): DebtAging {
  const now = new Date();
  const aging: DebtAging = {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    days91to120: 0,
    over120Days: 0,
    totalDelinquent: 0,
  };

  for (const debt of debts) {
    if (isResolved(debt)) continue;
    const outstanding = debt.totalAmountDue - debt.paymentsReceived;
    if (outstanding <= 0) continue;

    if (!debt.delinquentDate) {
      aging.current += outstanding;
      continue;
    }

    const days = delinqDays(debt, now);
    if (days <= 0) aging.current += outstanding;
    else if (days <= 30) aging.days1to30 += outstanding;
    else if (days <= 60) aging.days31to60 += outstanding;
    else if (days <= 90) aging.days61to90 += outstanding;
    else if (days <= 120) aging.days91to120 += outstanding;
    else aging.over120Days += outstanding;
  }

  aging.totalDelinquent =
    aging.days1to30 + aging.days31to60 + aging.days61to90 +
    aging.days91to120 + aging.over120Days;

  const keys = Object.keys(aging) as (keyof DebtAging)[];
  for (const k of keys) {
    aging[k] = round2(aging[k]);
  }
  return aging;
}

// ── 8. Due Diligence Checklist (31 CFR 903.1) ──────────────────────────────

/**
 * Evaluates due diligence requirements before collection termination
 * or write-off. Checks demand letters, skip tracing, Treasury referral,
 * TOP enrollment, charges assessed, compromise, and salary offset.
 */
export function evaluateDueDiligence(debt: DebtRecord): DueDiligenceResult {
  const items: DueDiligenceItem[] = [
    {
      requirement: 'Minimum 3 demand letters sent',
      completed: debt.demandLettersSent >= 3,
      citation: '31 CFR 901.2',
    },
    {
      requirement: 'Skip tracing completed',
      completed: debt.skipTracingComplete,
      citation: 'DoD FMR Vol. 16, Ch. 4',
    },
    {
      requirement: 'Referred to Treasury for cross-servicing',
      completed: debt.referredToTreasury,
      citation: '31 U.S.C. §3711(g)',
    },
    {
      requirement: 'Enrolled in TOP',
      completed: debt.enrolledInTOP,
      citation: '31 U.S.C. §3716',
    },
    {
      requirement: 'Interest/penalties/admin fees assessed',
      completed: debt.interestAssessed > 0 || debt.penaltyAssessed > 0 || debt.adminFeeAssessed > 0,
      citation: '31 U.S.C. §3717',
    },
    {
      requirement: 'Compromise evaluation completed',
      completed: debt.compromiseRequested || debt.totalAmountDue <= 0,
      citation: '31 U.S.C. §3711(a); 31 CFR 902',
    },
    {
      requirement: 'Salary offset considered (if applicable)',
      completed: debt.category !== 'travel_card' || debt.status !== 'delinquent',
      citation: '5 U.S.C. §5514',
    },
  ];

  const missingItems = items
    .filter((i) => !i.completed)
    .map((i) => i.requirement);

  return {
    debtId: debt.id,
    complete: missingItems.length === 0,
    items,
    missingItems,
  };
}
