/**
 * Security Cooperation / Foreign Military Sales (FMS) Financial Engine
 *
 * Implements FMS case lifecycle management, trust fund accounting,
 * congressional notification threshold checks, Excess Defense Article
 * (EDA) valuations, and FMS reporting per DoD FMR Volume 15.
 *
 * FMS is a government-to-government program through which the U.S.
 * Government sells defense articles, services, and training to foreign
 * governments and international organizations. All FMS transactions are
 * financed through the FMS Trust Fund on a customer-funded basis.
 *
 * References:
 *   - DoD FMR Vol. 15 (Security Cooperation Financial Management)
 *   - DSCA Security Assistance Management Manual (SAMM)
 *   - Arms Export Control Act, 22 U.S.C. §2751 et seq.
 *   - 22 U.S.C. §2761 (Sales from stocks)
 *   - 22 U.S.C. §2762 (Procurement for cash sales)
 *   - 22 U.S.C. §2776 (Congressional notification requirements)
 *   - 22 U.S.C. §2321j (Excess defense article transfers)
 *   - 10 U.S.C. §2345 (FMS Trust Fund authority)
 */

import { v4 as uuid } from 'uuid';

import { getParameter } from '@/lib/engine/tax-parameters/registry';

import type {
  FMSCase,
  FMSCaseStatus,
  FMSCaseType,
  FMSTrustFundAccount,
  FMSTrustFundAccountType,
  LetterOfOfferAcceptance,
  LOAAmendment,
  TrustFundTransaction,
  TrustFundTransactionType,
  ExcessDefenseArticle,
  EDACondition,
  EDAValuationResult,
  CongressionalNotificationResult,
  CongressionalNotificationType,
  FMSLifecycleResult,
  FMSDeliveryRecord,
  DeliveryReconciliationResult,
  SecurityAssistanceReport,
  SecurityAssistanceReportType,
} from '@/types/dod-fmr-security-cooperation';

// ---------------------------------------------------------------------------
// Input / Output Types
// ---------------------------------------------------------------------------

/**
 * Input for creating a new FMS case with associated LOA data.
 *
 * Ref: DoD FMR Vol. 15, Ch. 5, para 050301; DSCA SAMM, Ch. 5
 */
export interface CreateFMSCaseInput {
  country: string;
  caseType: FMSCaseType;
  totalValue: number;
  implementingAgency: string;
  loaNumber: string;
  loaExpirationDate: string;
  fiscalYear: number;
  amendments?: LOAAmendment[];
}

/**
 * Result of creating an FMS case, including the generated case and LOA records.
 */
export interface CreateFMSCaseResult {
  fmsCase: FMSCase;
  loa: LetterOfOfferAcceptance;
  trustFundAccount: FMSTrustFundAccount;
  findings: string[];
}

/**
 * Result of advancing an FMS case to a new lifecycle phase.
 */
export interface AdvanceCaseResult {
  success: boolean;
  fmsCase: FMSCase;
  previousPhase: FMSCaseStatus;
  newPhase: FMSCaseStatus;
  findings: string[];
}

/**
 * Financial summary computed for an FMS case.
 *
 * Ref: DoD FMR Vol. 15, Ch. 7; DSCA SAMM, Ch. 9
 */
export interface CaseFinancialSummary {
  caseId: string;
  totalValue: number;
  totalDeposits: number;
  totalDisbursements: number;
  deliveredValue: number;
  billedAmount: number;
  collectedAmount: number;
  outstandingDeliveries: number;
  outstandingBillings: number;
  outstandingCollections: number;
  fundBalance: number;
  percentDelivered: number;
  percentCollected: number;
  findings: string[];
}

/**
 * Input for recording a trust fund deposit.
 */
export interface TrustFundDepositInput {
  caseId: string;
  amount: number;
  source: string;
  transactionDate: string;
  description?: string;
}

/**
 * Input for recording a trust fund disbursement.
 */
export interface TrustFundDisbursementInput {
  caseId: string;
  amount: number;
  purpose: TrustFundTransactionType;
  transactionDate: string;
  description?: string;
}

/**
 * Result of a trust fund reconciliation.
 *
 * Ref: DoD FMR Vol. 15, Ch. 7, para 0703
 */
export interface TrustFundReconciliationResult {
  caseId: string;
  totalDeposits: number;
  totalDisbursements: number;
  balance: number;
  isReconciled: boolean;
  transactions: TrustFundTransaction[];
  findings: string[];
}

/**
 * Input for EDA valuation.
 *
 * Ref: DoD FMR Vol. 15, Ch. 8; 22 U.S.C. §2321j
 */
export interface EDAValuationInput {
  articleId: string;
  articleDescription: string;
  originalAcquisitionCost: number;
  usefulLifeYears: number;
  ageYears: number;
  condition: EDACondition;
  recipientCountry: string;
}

/**
 * Case Status Report summarizing all FMS cases by phase.
 *
 * Ref: DoD FMR Vol. 15, Ch. 9; DSCA SAMM, Ch. 11
 */
export interface CaseStatusReport {
  reportId: string;
  reportDate: string;
  totalCases: number;
  totalValue: number;
  casesByPhase: Record<FMSCaseStatus, number>;
  valueByPhase: Record<FMSCaseStatus, number>;
  casesByCountry: Record<string, number>;
  findings: string[];
}

/**
 * Trust Fund Report summarizing financial positions across FMS cases.
 *
 * Ref: DoD FMR Vol. 15, Ch. 7; DSCA SAMM, Ch. 9
 */
export interface TrustFundReport {
  reportId: string;
  reportDate: string;
  totalDeposits: number;
  totalDisbursements: number;
  totalBalance: number;
  caseDetails: Array<{
    caseId: string;
    country: string;
    deposits: number;
    disbursements: number;
    balance: number;
  }>;
  findings: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Valid FMS case phase transitions per DoD FMR Vol. 15, Ch. 5.
 *
 * Each key is the current phase, and the value is the set of phases
 * the case may transition to. Cases must progress forward through the
 * lifecycle; backward transitions are not permitted except to draft.
 */
const VALID_PHASE_TRANSITIONS: Record<FMSCaseStatus, FMSCaseStatus[]> = {
  draft: ['loa_offered'],
  loa_offered: ['loa_accepted', 'draft'],
  loa_accepted: ['implementing'],
  implementing: ['delivery'],
  delivery: ['billing'],
  billing: ['collection'],
  collection: ['closeout'],
  closeout: [],
};

/**
 * Ordered lifecycle phases for completion percentage calculation.
 */
const PHASE_ORDER: FMSCaseStatus[] = [
  'draft',
  'loa_offered',
  'loa_accepted',
  'implementing',
  'delivery',
  'billing',
  'collection',
  'closeout',
];

/**
 * Condition factor multipliers for EDA valuation.
 *
 * Per DoD FMR Vol. 15, Ch. 8, EDA condition assessments affect
 * the computed fair market value of articles being transferred.
 */
const CONDITION_FACTORS: Record<EDACondition, number> = {
  excellent: 0.90,
  good: 0.70,
  fair: 0.50,
  poor: 0.25,
  non_operational: 0.05,
};

/**
 * USSGL account numbers used in FMS trust fund accounting.
 *
 * Ref: DoD FMR Vol. 15, Ch. 7; USSGL TFM Supplement
 */
const USSGL = {
  /** Advances from Others — FMS Customer Deposits */
  ADVANCES_FROM_OTHERS: '231000',
  /** Reimbursable Authority Earned — FMS */
  REIMBURSABLE_AUTHORITY: '421000',
  /** Fund Balance with Treasury */
  FUND_BALANCE_TREASURY: '101000',
  /** Accounts Receivable — FMS */
  ACCOUNTS_RECEIVABLE: '131000',
  /** Revenue from Services Provided */
  REVENUE_SERVICES: '510000',
  /** Operating Expenses / Cost of Goods Sold */
  OPERATING_EXPENSES: '610000',
  /** Disbursements — FMS Case Expenditures */
  DISBURSEMENTS: '330100',
  /** Refunds and Recoveries */
  REFUNDS: '231500',
} as const;

// ---------------------------------------------------------------------------
// Rounding Utility
// ---------------------------------------------------------------------------

/**
 * Round a monetary value to two decimal places.
 *
 * All FMS financial computations must be rounded to cents per
 * DoD FMR Vol. 15, Ch. 7 requirements.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Section 1: FMS Case Lifecycle Management
// ---------------------------------------------------------------------------

/**
 * Create a new FMS case with associated LOA and trust fund account.
 *
 * Establishes the foundational records for tracking a Foreign Military
 * Sale from Letter of Offer and Acceptance (LOA) preparation through
 * case closeout. Each case receives a unique identifier, an LOA record,
 * and a dedicated FMS Trust Fund account.
 *
 * Per DoD FMR Vol. 15, Ch. 5, para 050301, each FMS case must be
 * documented with an LOA identifying the country, articles/services,
 * estimated costs, and terms of sale.
 *
 * Ref: DoD FMR Vol. 15, Ch. 5; DSCA SAMM, Ch. 5;
 *      22 U.S.C. §2762 (Procurement for cash sales)
 *
 * @param input - Case creation parameters including country, LOA data, and value
 * @returns The created FMS case, LOA, trust fund account, and any findings
 */
export function createFMSCase(input: CreateFMSCaseInput): CreateFMSCaseResult {
  const findings: string[] = [];
  const caseIdInternal = uuid();
  const loaId = uuid();
  const trustFundId = uuid();
  const today = new Date().toISOString().slice(0, 10);

  // Validate total value
  if (input.totalValue <= 0) {
    findings.push('FMS case total value must be greater than zero.');
  }

  // Validate country
  if (!input.country || input.country.trim().length === 0) {
    findings.push('FMS case requires a valid country identifier.');
  }

  // Generate the DoD case designator (country code + fiscal year + sequence)
  const caseDesignator = `${input.country.substring(0, 2).toUpperCase()}-` +
    `${input.fiscalYear}-${caseIdInternal.substring(0, 4).toUpperCase()}`;

  const fmsCase: FMSCase = {
    id: caseIdInternal,
    caseId: caseDesignator,
    country: input.country,
    caseType: input.caseType,
    status: 'draft',
    totalValue: round2(input.totalValue),
    deliveredValue: 0,
    billedAmount: 0,
    collectedAmount: 0,
    implementingAgency: input.implementingAgency,
    loaDate: today,
    fiscalYear: input.fiscalYear,
  };

  const loa: LetterOfOfferAcceptance = {
    id: loaId,
    fmsCaseId: caseIdInternal,
    loaNumber: input.loaNumber,
    country: input.country,
    totalValue: round2(input.totalValue),
    acceptedDate: '',
    expirationDate: input.loaExpirationDate,
    amendments: input.amendments ?? [],
  };

  const trustFundAccount: FMSTrustFundAccount = {
    id: trustFundId,
    accountType: 'fms_trust',
    balance: 0,
    receipts: 0,
    disbursements: 0,
    country: input.country,
    fiscalYear: input.fiscalYear,
  };

  findings.push(
    `FMS case ${caseDesignator} created for ${input.country} ` +
    `with total value $${round2(input.totalValue).toLocaleString()}.`
  );

  return { fmsCase, loa, trustFundAccount, findings };
}

/**
 * Advance an FMS case to the next lifecycle phase.
 *
 * FMS cases progress through a defined lifecycle per DoD FMR Vol. 15,
 * Ch. 5: draft -> loa_offered -> loa_accepted -> implementing ->
 * delivery -> billing -> collection -> closeout.
 *
 * Phase transitions are validated against the allowed transitions map.
 * Backward transitions (except reversion to draft from loa_offered)
 * are prohibited.
 *
 * Ref: DoD FMR Vol. 15, Ch. 5, para 050302;
 *      DSCA SAMM, Ch. 5 (Case Lifecycle)
 *
 * @param fmsCase - The current FMS case record
 * @param newPhase - The target lifecycle phase
 * @returns Result indicating success/failure and any findings
 */
export function advanceFMSCase(
  fmsCase: FMSCase,
  newPhase: FMSCaseStatus
): AdvanceCaseResult {
  const findings: string[] = [];
  const previousPhase = fmsCase.status;

  // Validate transition
  const allowed = VALID_PHASE_TRANSITIONS[previousPhase];
  if (!allowed || !allowed.includes(newPhase)) {
    findings.push(
      `Invalid phase transition from '${previousPhase}' to '${newPhase}'. ` +
      `Allowed transitions: ${(allowed ?? []).join(', ') || 'none'}.`
    );
    return {
      success: false,
      fmsCase,
      previousPhase,
      newPhase: previousPhase,
      findings,
    };
  }

  // Business rule validations per phase
  if (newPhase === 'loa_accepted' && fmsCase.totalValue <= 0) {
    findings.push(
      'Cannot accept LOA: case total value must be greater than zero. ' +
      'Ref: DoD FMR Vol. 15, Ch. 5, para 050301.'
    );
    return {
      success: false,
      fmsCase,
      previousPhase,
      newPhase: previousPhase,
      findings,
    };
  }

  if (newPhase === 'closeout') {
    if (fmsCase.billedAmount < fmsCase.deliveredValue) {
      findings.push(
        `Warning: unbilled deliveries of $${round2(fmsCase.deliveredValue - fmsCase.billedAmount).toLocaleString()} ` +
        `exist. All deliveries should be billed before closeout per DSCA SAMM, Ch. 8.`
      );
    }
    if (fmsCase.collectedAmount < fmsCase.billedAmount) {
      findings.push(
        `Warning: uncollected billings of $${round2(fmsCase.billedAmount - fmsCase.collectedAmount).toLocaleString()} ` +
        `remain outstanding. Closeout requires full collection per DoD FMR Vol. 15, Ch. 5, para 0504.`
      );
    }
  }

  const updatedCase: FMSCase = {
    ...fmsCase,
    status: newPhase,
    closureDate: newPhase === 'closeout'
      ? new Date().toISOString().slice(0, 10)
      : fmsCase.closureDate,
  };

  findings.push(
    `FMS case ${fmsCase.caseId} advanced from '${previousPhase}' to '${newPhase}'.`
  );

  return {
    success: true,
    fmsCase: updatedCase,
    previousPhase,
    newPhase,
    findings,
  };
}

/**
 * Calculate comprehensive financial summary for an FMS case.
 *
 * Computes outstanding deliveries, billings, and collections, as well
 * as the overall completion percentage and fund balance. This is the
 * core financial status computation used for DSCA 1000-series reporting.
 *
 * Ref: DoD FMR Vol. 15, Ch. 7; DSCA SAMM, Ch. 9 (Financial Reporting)
 *
 * @param fmsCase - The FMS case to analyze
 * @param deposits - Total deposits received into the trust fund for this case
 * @param disbursements - Total disbursements made from the trust fund for this case
 * @returns Detailed financial summary with findings
 */
export function calculateCaseFinancials(
  fmsCase: FMSCase,
  deposits: number,
  disbursements: number
): CaseFinancialSummary {
  const findings: string[] = [];

  const outstandingDeliveries = round2(fmsCase.totalValue - fmsCase.deliveredValue);
  const outstandingBillings = round2(fmsCase.deliveredValue - fmsCase.billedAmount);
  const outstandingCollections = round2(fmsCase.billedAmount - fmsCase.collectedAmount);
  const fundBalance = round2(deposits - disbursements);

  const percentDelivered = fmsCase.totalValue > 0
    ? round2((fmsCase.deliveredValue / fmsCase.totalValue) * 100)
    : 0;
  const percentCollected = fmsCase.totalValue > 0
    ? round2((fmsCase.collectedAmount / fmsCase.totalValue) * 100)
    : 0;

  // Financial health checks
  if (fundBalance < 0) {
    findings.push(
      `Trust fund balance is negative ($${fundBalance.toLocaleString()}). ` +
      `Disbursements exceed deposits, which violates the FMS customer-funded ` +
      `principle per DoD FMR Vol. 15, Ch. 7, para 0702.`
    );
  }

  if (outstandingBillings < 0) {
    findings.push(
      `Billed amount exceeds delivered value by $${round2(Math.abs(outstandingBillings)).toLocaleString()}. ` +
      `Billing should not exceed deliveries per DSCA SAMM, Ch. 8.`
    );
  }

  if (outstandingCollections < 0) {
    findings.push(
      `Collected amount exceeds billed amount by $${round2(Math.abs(outstandingCollections)).toLocaleString()}. ` +
      `Potential over-collection requires investigation per DoD FMR Vol. 15, Ch. 7.`
    );
  }

  if (fmsCase.deliveredValue > fmsCase.totalValue) {
    findings.push(
      `Delivered value ($${fmsCase.deliveredValue.toLocaleString()}) exceeds total case value ` +
      `($${fmsCase.totalValue.toLocaleString()}). An LOA amendment may be required ` +
      `per DSCA SAMM, Ch. 5, para 050601.`
    );
  }

  // Admin surcharge check — the standard FMS administrative surcharge
  // is assessed per DoD FMR Vol. 15, Ch. 7, para 070203
  const adminSurchargeRate = getParameter(
    'FMS_ADMIN_SURCHARGE_RATE',
    fmsCase.fiscalYear,
    undefined,
    0.034
  );
  const expectedSurcharge = round2(fmsCase.totalValue * adminSurchargeRate);
  findings.push(
    `FMS administrative surcharge at ${(adminSurchargeRate * 100).toFixed(1)}%: ` +
    `$${expectedSurcharge.toLocaleString()} per DoD FMR Vol. 15, Ch. 7, para 070203.`
  );

  return {
    caseId: fmsCase.caseId,
    totalValue: round2(fmsCase.totalValue),
    totalDeposits: round2(deposits),
    totalDisbursements: round2(disbursements),
    deliveredValue: round2(fmsCase.deliveredValue),
    billedAmount: round2(fmsCase.billedAmount),
    collectedAmount: round2(fmsCase.collectedAmount),
    outstandingDeliveries: Math.max(0, outstandingDeliveries),
    outstandingBillings: Math.max(0, outstandingBillings),
    outstandingCollections: Math.max(0, outstandingCollections),
    fundBalance,
    percentDelivered,
    percentCollected,
    findings,
  };
}

/**
 * Compute the FMS case lifecycle result including stage assessment.
 *
 * Evaluates the current lifecycle stage, calculates completion percentage,
 * and determines if the case is ready to advance to the next stage based
 * on financial and programmatic criteria.
 *
 * Ref: DoD FMR Vol. 15, Ch. 5; DSCA SAMM, Ch. 5
 *
 * @param fmsCase - The FMS case to evaluate
 * @returns Lifecycle result with completion metrics and next-stage readiness
 */
export function evaluateCaseLifecycle(fmsCase: FMSCase): FMSLifecycleResult {
  const findings: string[] = [];
  const currentIndex = PHASE_ORDER.indexOf(fmsCase.status);
  const completionPercentage = currentIndex >= 0
    ? round2((currentIndex / (PHASE_ORDER.length - 1)) * 100)
    : 0;

  const nextStage: FMSCaseStatus | null =
    currentIndex >= 0 && currentIndex < PHASE_ORDER.length - 1
      ? PHASE_ORDER[currentIndex + 1]
      : null;

  const outstandingDeliveries = round2(fmsCase.totalValue - fmsCase.deliveredValue);
  const outstandingBillings = round2(fmsCase.deliveredValue - fmsCase.billedAmount);
  const outstandingCollections = round2(fmsCase.billedAmount - fmsCase.collectedAmount);

  // Readiness checks
  let readyForNextStage = true;

  if (fmsCase.status === 'delivery' && outstandingDeliveries > 0) {
    readyForNextStage = false;
    findings.push(
      `Outstanding deliveries of $${outstandingDeliveries.toLocaleString()} ` +
      `must be completed before advancing to billing.`
    );
  }

  if (fmsCase.status === 'billing' && outstandingBillings > 0) {
    readyForNextStage = false;
    findings.push(
      `Outstanding billings of $${outstandingBillings.toLocaleString()} ` +
      `must be resolved before advancing to collection.`
    );
  }

  if (fmsCase.status === 'collection' && outstandingCollections > 0) {
    readyForNextStage = false;
    findings.push(
      `Outstanding collections of $${outstandingCollections.toLocaleString()} ` +
      `must be completed before case closeout per DoD FMR Vol. 15, Ch. 5, para 0504.`
    );
  }

  if (fmsCase.status === 'closeout') {
    readyForNextStage = false;
    findings.push('Case is in closeout phase; no further phase transitions available.');
  }

  return {
    caseId: fmsCase.caseId,
    currentStage: fmsCase.status,
    nextStage,
    completionPercentage,
    financialSummary: {
      totalValue: round2(fmsCase.totalValue),
      delivered: round2(fmsCase.deliveredValue),
      billed: round2(fmsCase.billedAmount),
      collected: round2(fmsCase.collectedAmount),
      outstandingDeliveries: Math.max(0, outstandingDeliveries),
      outstandingBillings: Math.max(0, outstandingBillings),
      outstandingCollections: Math.max(0, outstandingCollections),
    },
    findings,
    readyForNextStage,
  };
}

// ---------------------------------------------------------------------------
// Section 2: FMS Trust Fund Accounting
// ---------------------------------------------------------------------------

/**
 * Record a customer deposit into the FMS Trust Fund.
 *
 * Foreign government customers deposit funds into the FMS Trust Fund
 * in advance of delivery. These deposits create an advance liability
 * (USSGL 2310xx -- Advances from Others) and are recorded as reimbursable
 * authority (USSGL 4210xx -- Reimbursable Authority Earned).
 *
 * Per DoD FMR Vol. 15, Ch. 7, para 0702, the FMS Trust Fund operates
 * on a customer-funded basis: no U.S. appropriated funds are used for
 * FMS case execution. Customer payments must be received before or
 * concurrent with delivery obligations.
 *
 * USSGL Entry:
 *   Debit  101000 (Fund Balance with Treasury)
 *   Credit 231000 (Advances from Others)
 *
 * Ref: DoD FMR Vol. 15, Ch. 7; 22 U.S.C. §2762
 *
 * @param input - Deposit details including case, amount, and source
 * @param account - The FMS trust fund account to credit
 * @returns The updated account, the recorded transaction, and findings
 */
export function recordTrustFundDeposit(
  input: TrustFundDepositInput,
  account: FMSTrustFundAccount
): { account: FMSTrustFundAccount; transaction: TrustFundTransaction; findings: string[] } {
  const findings: string[] = [];

  if (input.amount <= 0) {
    findings.push('Deposit amount must be greater than zero.');
  }

  const depositAmount = round2(input.amount);

  const transaction: TrustFundTransaction = {
    id: uuid(),
    accountId: account.id,
    transactionType: 'customer_deposit',
    amount: depositAmount,
    transactionDate: input.transactionDate,
    description: input.description ?? `Customer deposit from ${input.source}`,
    caseId: input.caseId,
    ussglDebitAccount: USSGL.FUND_BALANCE_TREASURY,
    ussglCreditAccount: USSGL.ADVANCES_FROM_OTHERS,
  };

  const updatedAccount: FMSTrustFundAccount = {
    ...account,
    balance: round2(account.balance + depositAmount),
    receipts: round2(account.receipts + depositAmount),
  };

  findings.push(
    `Deposit of $${depositAmount.toLocaleString()} recorded to FMS Trust Fund ` +
    `for case ${input.caseId}. ` +
    `Debit ${USSGL.FUND_BALANCE_TREASURY} / Credit ${USSGL.ADVANCES_FROM_OTHERS}.`
  );

  return { account: updatedAccount, transaction, findings };
}

/**
 * Record a disbursement from the FMS Trust Fund.
 *
 * Disbursements are made from the FMS Trust Fund to pay for defense
 * articles, services, and associated costs under an FMS case. Each
 * disbursement reduces the customer's advance balance and records the
 * expenditure against the appropriate USSGL accounts.
 *
 * USSGL Entry:
 *   Debit  231000 (Advances from Others -- reduce liability)
 *   Credit 101000 (Fund Balance with Treasury -- cash outflow)
 *
 * Ref: DoD FMR Vol. 15, Ch. 7, para 0703;
 *      DSCA SAMM, Ch. 9 (Disbursement Processing)
 *
 * @param input - Disbursement details including case, amount, and purpose
 * @param account - The FMS trust fund account to debit
 * @returns The updated account, the recorded transaction, and findings
 */
export function recordTrustFundDisbursement(
  input: TrustFundDisbursementInput,
  account: FMSTrustFundAccount
): { account: FMSTrustFundAccount; transaction: TrustFundTransaction; findings: string[] } {
  const findings: string[] = [];

  if (input.amount <= 0) {
    findings.push('Disbursement amount must be greater than zero.');
  }

  const disbursementAmount = round2(input.amount);

  // Check for potential overdisbursement
  if (disbursementAmount > account.balance) {
    findings.push(
      `Warning: Disbursement of $${disbursementAmount.toLocaleString()} exceeds ` +
      `current trust fund balance of $${round2(account.balance).toLocaleString()}. ` +
      `FMS Trust Fund operates on a customer-funded basis; disbursements should ` +
      `not exceed deposits per DoD FMR Vol. 15, Ch. 7, para 0702.`
    );
  }

  const transaction: TrustFundTransaction = {
    id: uuid(),
    accountId: account.id,
    transactionType: input.purpose,
    amount: disbursementAmount,
    transactionDate: input.transactionDate,
    description: input.description ?? `Disbursement for ${input.purpose.replace(/_/g, ' ')}`,
    caseId: input.caseId,
    ussglDebitAccount: USSGL.ADVANCES_FROM_OTHERS,
    ussglCreditAccount: USSGL.FUND_BALANCE_TREASURY,
  };

  const updatedAccount: FMSTrustFundAccount = {
    ...account,
    balance: round2(account.balance - disbursementAmount),
    disbursements: round2(account.disbursements + disbursementAmount),
  };

  findings.push(
    `Disbursement of $${disbursementAmount.toLocaleString()} recorded against FMS Trust Fund ` +
    `for case ${input.caseId} (purpose: ${input.purpose.replace(/_/g, ' ')}). ` +
    `Debit ${USSGL.ADVANCES_FROM_OTHERS} / Credit ${USSGL.FUND_BALANCE_TREASURY}.`
  );

  return { account: updatedAccount, transaction, findings };
}

/**
 * Reconcile FMS Trust Fund deposits against disbursements for a case.
 *
 * Performs a full reconciliation of the trust fund account for a given
 * FMS case, verifying that deposits and disbursements are in balance
 * and identifying any discrepancies requiring resolution.
 *
 * Per DoD FMR Vol. 15, Ch. 7, para 0703, implementing agencies must
 * reconcile trust fund accounts at least quarterly to ensure accuracy
 * of customer balances and prevent unauthorized expenditures.
 *
 * Ref: DoD FMR Vol. 15, Ch. 7; DSCA SAMM, Ch. 9
 *
 * @param caseId - The FMS case identifier
 * @param transactions - All trust fund transactions for this case
 * @param account - The FMS trust fund account
 * @returns Reconciliation result with findings
 */
export function reconcileTrustFund(
  caseId: string,
  transactions: TrustFundTransaction[],
  account: FMSTrustFundAccount
): TrustFundReconciliationResult {
  const findings: string[] = [];

  // Filter transactions for this case
  const caseTransactions = transactions.filter((t) => t.caseId === caseId);

  const totalDeposits = round2(
    caseTransactions
      .filter((t) => t.transactionType === 'customer_deposit')
      .reduce((sum, t) => sum + t.amount, 0)
  );

  const totalDisbursements = round2(
    caseTransactions
      .filter((t) =>
        t.transactionType !== 'customer_deposit' &&
        t.transactionType !== 'refund' &&
        t.transactionType !== 'interest_credit'
      )
      .reduce((sum, t) => sum + t.amount, 0)
  );

  const totalRefunds = round2(
    caseTransactions
      .filter((t) => t.transactionType === 'refund')
      .reduce((sum, t) => sum + t.amount, 0)
  );

  const totalInterest = round2(
    caseTransactions
      .filter((t) => t.transactionType === 'interest_credit')
      .reduce((sum, t) => sum + t.amount, 0)
  );

  const computedBalance = round2(
    totalDeposits + totalInterest - totalDisbursements - totalRefunds
  );
  const isReconciled = Math.abs(computedBalance - account.balance) < 0.01;

  if (!isReconciled) {
    findings.push(
      `Trust fund reconciliation discrepancy detected for case ${caseId}. ` +
      `Computed balance: $${computedBalance.toLocaleString()}, ` +
      `account balance: $${round2(account.balance).toLocaleString()}. ` +
      `Difference: $${round2(Math.abs(computedBalance - account.balance)).toLocaleString()}. ` +
      `Ref: DoD FMR Vol. 15, Ch. 7, para 0703.`
    );
  } else {
    findings.push(
      `Trust fund for case ${caseId} reconciles. Balance: $${computedBalance.toLocaleString()}.`
    );
  }

  if (computedBalance < 0) {
    findings.push(
      `Negative trust fund balance of $${computedBalance.toLocaleString()} for case ${caseId}. ` +
      `Disbursements exceed deposits, violating the FMS customer-funded principle ` +
      `per DoD FMR Vol. 15, Ch. 7.`
    );
  }

  if (totalRefunds > 0) {
    findings.push(
      `Refunds of $${totalRefunds.toLocaleString()} have been processed for case ${caseId}.`
    );
  }

  if (totalInterest > 0) {
    findings.push(
      `Interest credits of $${totalInterest.toLocaleString()} have been applied to case ${caseId}.`
    );
  }

  return {
    caseId,
    totalDeposits,
    totalDisbursements,
    balance: computedBalance,
    isReconciled,
    transactions: caseTransactions,
    findings,
  };
}

// ---------------------------------------------------------------------------
// Section 3: Congressional Notification
// ---------------------------------------------------------------------------

/**
 * Check whether an FMS case requires congressional notification.
 *
 * Under the Arms Export Control Act, 22 U.S.C. §2776, the President must
 * notify Congress before certain FMS sales can proceed. The notification
 * thresholds are:
 *
 *   - $25,000,000 for major defense equipment (MDE)
 *   - $100,000,000 for defense articles/services (non-MDE)
 *   - $200,000,000 for design and construction services
 *   - $14,000,000 for major defense equipment to NATO+5 countries
 *   - $25,000,000 for defense articles/services to NATO+5 countries
 *
 * The waiting period is typically 30 calendar days (15 days for
 * NATO+5 countries) before the case may proceed.
 *
 * Thresholds are retrieved via getParameter() to support year-specific
 * adjustments per legislative changes.
 *
 * Ref: 22 U.S.C. §2776 (Reports and certifications to Congress);
 *      DSCA SAMM, Ch. 5, para C5.4 (Congressional Notification);
 *      DoD FMR Vol. 15, Ch. 5, para 050304
 *
 * @param fmsCase - The FMS case to evaluate
 * @param isMajorDefenseEquipment - Whether the case involves MDE
 * @param isNATOPlusFive - Whether the customer is a NATO+5 country
 * @returns Congressional notification determination with threshold details
 */
export function checkCongressionalNotification(
  fmsCase: FMSCase,
  isMajorDefenseEquipment: boolean,
  isNATOPlusFive: boolean = false
): CongressionalNotificationResult {
  const fiscalYear = fmsCase.fiscalYear;

  // Retrieve thresholds from parameter registry with statutory defaults
  const mdeThreshold = getParameter(
    'FMS_CONGRESSIONAL_MDE_THRESHOLD',
    fiscalYear,
    undefined,
    25_000_000
  );

  const nonMdeThreshold = getParameter(
    'FMS_CONGRESSIONAL_NON_MDE_THRESHOLD',
    fiscalYear,
    undefined,
    100_000_000
  );

  const designConstructionThreshold = getParameter(
    'FMS_CONGRESSIONAL_DESIGN_CONSTRUCTION_THRESHOLD',
    fiscalYear,
    undefined,
    200_000_000
  );

  const natoMdeThreshold = getParameter(
    'FMS_CONGRESSIONAL_NATO_MDE_THRESHOLD',
    fiscalYear,
    undefined,
    14_000_000
  );

  const natoNonMdeThreshold = getParameter(
    'FMS_CONGRESSIONAL_NATO_NON_MDE_THRESHOLD',
    fiscalYear,
    undefined,
    25_000_000
  );

  // Determine applicable notification type and threshold
  let notificationType: CongressionalNotificationType;
  let applicableThreshold: number;
  let waitingPeriodDays: number;

  if (isMajorDefenseEquipment) {
    notificationType = 'major_defense_equipment';
    applicableThreshold = isNATOPlusFive ? natoMdeThreshold : mdeThreshold;
    waitingPeriodDays = isNATOPlusFive ? 15 : 30;
  } else if (fmsCase.caseType === 'building_partner_capacity') {
    notificationType = 'design_construction_services';
    applicableThreshold = designConstructionThreshold;
    waitingPeriodDays = 30;
  } else {
    notificationType = 'other';
    applicableThreshold = isNATOPlusFive ? natoNonMdeThreshold : nonMdeThreshold;
    waitingPeriodDays = isNATOPlusFive ? 15 : 30;
  }

  const required = fmsCase.totalValue >= applicableThreshold;

  let reason: string;
  if (required) {
    reason =
      `FMS case ${fmsCase.caseId} valued at $${round2(fmsCase.totalValue).toLocaleString()} ` +
      `meets or exceeds the ${notificationType.replace(/_/g, ' ')} congressional notification ` +
      `threshold of $${round2(applicableThreshold).toLocaleString()}` +
      `${isNATOPlusFive ? ' (NATO+5 reduced threshold)' : ''}. ` +
      `A ${waitingPeriodDays}-day waiting period applies per 22 U.S.C. §2776.`;
  } else {
    reason =
      `FMS case ${fmsCase.caseId} valued at $${round2(fmsCase.totalValue).toLocaleString()} ` +
      `is below the ${notificationType.replace(/_/g, ' ')} congressional notification ` +
      `threshold of $${round2(applicableThreshold).toLocaleString()}` +
      `${isNATOPlusFive ? ' (NATO+5 reduced threshold)' : ''}. ` +
      `No congressional notification required.`;
  }

  return {
    required,
    notificationType,
    threshold: round2(applicableThreshold),
    caseValue: round2(fmsCase.totalValue),
    reason,
    waitingPeriodDays: required ? waitingPeriodDays : 0,
  };
}

// ---------------------------------------------------------------------------
// Section 4: Excess Defense Article (EDA) Valuation
// ---------------------------------------------------------------------------

/**
 * Compute the transfer valuation for an Excess Defense Article.
 *
 * EDAs are defense articles owned by the U.S. Government that have been
 * declared excess to DoD needs. When transferred to a foreign government,
 * EDAs must be valued under one of three methodologies:
 *
 *   1. Original acquisition cost -- the price originally paid by DoD
 *   2. Depreciated value -- original cost reduced by straight-line
 *      depreciation over the article's useful life, adjusted for condition
 *   3. Fair market value -- estimated sale price in an arm's-length
 *      transaction
 *
 * Per DoD FMR Vol. 15, Ch. 8, the depreciated value method applies a
 * condition factor and an age factor (straight-line depreciation) to
 * the original acquisition cost.
 *
 * For grant transfers under 22 U.S.C. §2321j(a), the transfer value
 * may be zero (no cost to recipient). For FMS-funded transfers, the
 * computed fair value is used.
 *
 * Ref: DoD FMR Vol. 15, Ch. 8 (Excess Defense Articles);
 *      22 U.S.C. §2321j (Excess defense article transfers);
 *      DSCA SAMM, Ch. 8 (EDA Program)
 *
 * @param input - Article details for valuation
 * @returns Computed valuation result with methodology explanation
 */
export function valuateExcessArticle(input: EDAValuationInput): EDAValuationResult {
  const findings: string[] = [];

  // Validate inputs
  if (input.originalAcquisitionCost <= 0) {
    findings.push('Original acquisition cost must be greater than zero.');
  }
  if (input.usefulLifeYears <= 0) {
    findings.push('Useful life must be greater than zero years.');
  }

  const conditionFactor = CONDITION_FACTORS[input.condition];

  // Age factor: straight-line depreciation over useful life
  // Cannot exceed 1.0 (no negative depreciation) or fall below 0
  const rawAgeFactor = input.usefulLifeYears > 0
    ? Math.max(0, 1 - (input.ageYears / input.usefulLifeYears))
    : 0;
  const ageFactor = round2(Math.min(1, rawAgeFactor));

  // Computed fair value = original cost * condition factor * age factor
  const computedFairValue = round2(
    input.originalAcquisitionCost * conditionFactor * ageFactor
  );

  // Transfer value is the greater of the computed fair value or
  // a minimum residual (5% of original cost) to prevent zero-value
  // FMS-funded transfers. Grant transfers may be $0 but that is
  // handled at the case level, not the valuation level.
  const minimumResidualRate = 0.05;
  const minimumResidual = round2(input.originalAcquisitionCost * minimumResidualRate);
  const transferValue = round2(Math.max(computedFairValue, minimumResidual));

  // Build methodology description
  let methodology: string;
  if (ageFactor <= 0) {
    methodology =
      'Article has exceeded its useful life. Transfer value set to minimum residual ' +
      `(${(minimumResidualRate * 100).toFixed(0)}% of original acquisition cost) ` +
      'per DoD FMR Vol. 15, Ch. 8.';
    findings.push(
      `Article age (${input.ageYears} years) exceeds useful life ` +
      `(${input.usefulLifeYears} years); fully depreciated.`
    );
  } else {
    methodology =
      `Depreciated value method applied: original cost ($${input.originalAcquisitionCost.toLocaleString()}) ` +
      `x condition factor (${conditionFactor} for ${input.condition}) ` +
      `x age factor (${ageFactor} based on ${input.ageYears}/${input.usefulLifeYears} years) ` +
      `= $${computedFairValue.toLocaleString()}. ` +
      'Ref: DoD FMR Vol. 15, Ch. 8; 22 U.S.C. §2321j.';
  }

  if (input.condition === 'non_operational') {
    findings.push(
      'Article is non-operational. Transfer may require additional justification ' +
      'per DSCA SAMM, Ch. 8.'
    );
  }

  findings.push(
    `EDA valuation for "${input.articleDescription}": ` +
    `original cost $${input.originalAcquisitionCost.toLocaleString()}, ` +
    `transfer value $${transferValue.toLocaleString()} ` +
    `(condition: ${input.condition}, age: ${input.ageYears}/${input.usefulLifeYears} years).`
  );

  return {
    articleId: input.articleId,
    originalAcquisitionValue: round2(input.originalAcquisitionCost),
    conditionFactor,
    ageFactor,
    computedFairValue,
    transferValue,
    methodology,
    findings,
  };
}

// ---------------------------------------------------------------------------
// Section 5: Delivery Reconciliation
// ---------------------------------------------------------------------------

/**
 * Reconcile FMS deliveries against LOA, billing, and collection records.
 *
 * Per DSCA SAMM, Ch. 7, implementing agencies must reconcile delivery
 * records against the LOA value, billed amounts, and collected amounts.
 * This function identifies unbilled deliveries, uncollected billings,
 * over-delivery amounts, and individual line-item discrepancies.
 *
 * Ref: DoD FMR Vol. 15, Ch. 6; DSCA SAMM, Ch. 7
 *
 * @param fmsCase - The FMS case being reconciled
 * @param loa - The Letter of Offer and Acceptance
 * @param deliveries - All delivery records for the case
 * @returns Detailed reconciliation result with line-item analysis
 */
export function reconcileDeliveries(
  fmsCase: FMSCase,
  loa: LetterOfOfferAcceptance,
  deliveries: FMSDeliveryRecord[]
): DeliveryReconciliationResult {
  const findings: string[] = [];

  // Compute amendment-adjusted LOA value
  const amendmentTotal = loa.amendments.reduce((sum, a) => sum + a.amount, 0);
  const adjustedLoaValue = round2(loa.totalValue + amendmentTotal);

  // Compute totals
  const totalDelivered = round2(
    deliveries.reduce((sum, d) => sum + d.totalCost, 0)
  );
  const totalBilled = round2(
    deliveries.filter((d) => d.billedToCustomer).reduce((sum, d) => sum + d.billedAmount, 0)
  );
  const totalCollected = round2(fmsCase.collectedAmount);

  const unbilledDeliveries = round2(totalDelivered - totalBilled);
  const uncollectedBillings = round2(totalBilled - totalCollected);
  const overDeliveryAmount = round2(Math.max(0, totalDelivered - adjustedLoaValue));

  // Build line-item reconciliation
  const reconcilingItems = deliveries.map((d) => ({
    lineItem: d.lineItemNumber,
    description: d.description,
    deliveredAmount: round2(d.totalCost),
    billedAmount: round2(d.billedAmount),
    difference: round2(d.totalCost - d.billedAmount),
  }));

  // Identify discrepancies
  const discrepantItems = reconcilingItems.filter(
    (item) => Math.abs(item.difference) > 0.01
  );
  const isReconciled = discrepantItems.length === 0 && overDeliveryAmount === 0;

  if (overDeliveryAmount > 0) {
    findings.push(
      `Over-delivery of $${overDeliveryAmount.toLocaleString()} detected: total delivered ` +
      `($${totalDelivered.toLocaleString()}) exceeds adjusted LOA value ` +
      `($${adjustedLoaValue.toLocaleString()}). ` +
      `An LOA amendment is required per DSCA SAMM, Ch. 5, para 050601.`
    );
  }

  if (unbilledDeliveries > 0) {
    findings.push(
      `Unbilled deliveries of $${unbilledDeliveries.toLocaleString()} exist. ` +
      `Implementing agencies must bill for deliveries in a timely manner ` +
      `per DoD FMR Vol. 15, Ch. 6, para 0602.`
    );
  }

  if (uncollectedBillings > 0) {
    findings.push(
      `Uncollected billings of $${uncollectedBillings.toLocaleString()} remain outstanding. ` +
      `Collection actions required per DoD FMR Vol. 15, Ch. 7.`
    );
  }

  if (discrepantItems.length > 0) {
    findings.push(
      `${discrepantItems.length} line item(s) have billing discrepancies ` +
      `requiring resolution per DSCA SAMM, Ch. 7.`
    );
  }

  if (isReconciled) {
    findings.push(
      `Delivery reconciliation for case ${fmsCase.caseId} is complete; ` +
      `all line items reconcile within tolerance.`
    );
  }

  return {
    caseId: fmsCase.caseId,
    totalLoaValue: adjustedLoaValue,
    totalDelivered,
    totalBilled,
    totalCollected,
    unbilledDeliveries: Math.max(0, unbilledDeliveries),
    uncollectedBillings: Math.max(0, uncollectedBillings),
    overDeliveryAmount,
    reconcilingItems,
    isReconciled,
    findings,
  };
}

// ---------------------------------------------------------------------------
// Section 6: FMS Reporting
// ---------------------------------------------------------------------------

/**
 * Generate an FMS Case Status Report summarizing all cases by phase.
 *
 * Produces a consolidated view of FMS cases broken down by lifecycle
 * phase and country, with aggregate financial metrics. This report
 * supports DSCA 1000-series reporting requirements and quarterly
 * program status reviews.
 *
 * Ref: DoD FMR Vol. 15, Ch. 9 (Reporting Requirements);
 *      DSCA SAMM, Ch. 11 (Reports)
 *
 * @param cases - All FMS cases to include in the report
 * @returns Case status report with phase and country breakdowns
 */
export function generateCaseStatusReport(cases: FMSCase[]): CaseStatusReport {
  const findings: string[] = [];

  // Initialize phase counters
  const casesByPhase: Record<FMSCaseStatus, number> = {
    draft: 0,
    loa_offered: 0,
    loa_accepted: 0,
    implementing: 0,
    delivery: 0,
    billing: 0,
    collection: 0,
    closeout: 0,
  };

  const valueByPhase: Record<FMSCaseStatus, number> = {
    draft: 0,
    loa_offered: 0,
    loa_accepted: 0,
    implementing: 0,
    delivery: 0,
    billing: 0,
    collection: 0,
    closeout: 0,
  };

  const casesByCountry: Record<string, number> = {};
  let totalValue = 0;

  for (const fmsCase of cases) {
    casesByPhase[fmsCase.status] += 1;
    valueByPhase[fmsCase.status] = round2(
      valueByPhase[fmsCase.status] + fmsCase.totalValue
    );
    casesByCountry[fmsCase.country] = (casesByCountry[fmsCase.country] ?? 0) + 1;
    totalValue = round2(totalValue + fmsCase.totalValue);
  }

  // Report findings
  const activeCases = cases.filter(
    (c) => c.status !== 'closeout' && c.status !== 'draft'
  ).length;
  const closeoutCases = casesByPhase.closeout;
  const draftCases = casesByPhase.draft;

  findings.push(
    `FMS Case Status Report: ${cases.length} total cases, ` +
    `${activeCases} active, ${draftCases} in draft, ${closeoutCases} closed out. ` +
    `Total portfolio value: $${totalValue.toLocaleString()}.`
  );

  // Flag cases in billing or collection with outstanding amounts
  const billingCases = cases.filter((c) => c.status === 'billing');
  if (billingCases.length > 0) {
    findings.push(
      `${billingCases.length} case(s) in billing phase totaling ` +
      `$${round2(valueByPhase.billing).toLocaleString()}. ` +
      `Review for timely collection per DoD FMR Vol. 15, Ch. 7.`
    );
  }

  const collectionCases = cases.filter((c) => c.status === 'collection');
  if (collectionCases.length > 0) {
    const uncollectedTotal = round2(
      collectionCases.reduce(
        (sum, c) => sum + (c.billedAmount - c.collectedAmount),
        0
      )
    );
    findings.push(
      `${collectionCases.length} case(s) in collection phase with ` +
      `$${uncollectedTotal.toLocaleString()} uncollected. ` +
      `Escalate delinquent accounts per DSCA SAMM, Ch. 9.`
    );
  }

  // Country diversity analysis
  const countryCount = Object.keys(casesByCountry).length;
  findings.push(
    `Cases span ${countryCount} partner nation(s).`
  );

  return {
    reportId: uuid(),
    reportDate: new Date().toISOString(),
    totalCases: cases.length,
    totalValue: round2(totalValue),
    casesByPhase,
    valueByPhase,
    casesByCountry,
    findings,
  };
}

/**
 * Generate an FMS Trust Fund Report summarizing financial positions.
 *
 * Produces a consolidated trust fund financial summary across all
 * FMS cases, identifying each case's deposit, disbursement, and
 * balance positions. This report supports the FMS Trust Fund
 * accountability requirements of DoD FMR Vol. 15, Ch. 7.
 *
 * The FMS Trust Fund (established under 22 U.S.C. §2762) is a
 * revolving fund holding customer deposits. Accurate trust fund
 * reporting is critical for customer confidence, congressional
 * oversight, and financial statement audit readiness.
 *
 * Ref: DoD FMR Vol. 15, Ch. 7 (Trust Fund Accounting);
 *      DoD FMR Vol. 15, Ch. 9 (Reporting Requirements);
 *      DSCA SAMM, Ch. 9 (Financial Management)
 *
 * @param cases - All FMS cases to include
 * @param accounts - Trust fund accounts associated with each case
 * @returns Trust fund financial summary report
 */
export function generateTrustFundReport(
  cases: FMSCase[],
  accounts: FMSTrustFundAccount[]
): TrustFundReport {
  const findings: string[] = [];

  let totalDeposits = 0;
  let totalDisbursements = 0;
  let totalBalance = 0;

  const caseDetails = cases.map((fmsCase) => {
    // Find the corresponding trust fund account by country and fiscal year
    const account = accounts.find(
      (a) =>
        a.country === fmsCase.country && a.fiscalYear === fmsCase.fiscalYear
    );

    const deposits = round2(account?.receipts ?? 0);
    const disbursements = round2(account?.disbursements ?? 0);
    const balance = round2(account?.balance ?? 0);

    totalDeposits = round2(totalDeposits + deposits);
    totalDisbursements = round2(totalDisbursements + disbursements);
    totalBalance = round2(totalBalance + balance);

    return {
      caseId: fmsCase.caseId,
      country: fmsCase.country,
      deposits,
      disbursements,
      balance,
    };
  });

  // Trust fund health checks
  if (totalBalance < 0) {
    findings.push(
      `Aggregate trust fund balance is negative ($${totalBalance.toLocaleString()}). ` +
      `This indicates systemic overdisbursement across the FMS portfolio ` +
      `and requires immediate corrective action per DoD FMR Vol. 15, Ch. 7.`
    );
  }

  const negativeCases = caseDetails.filter((c) => c.balance < 0);
  if (negativeCases.length > 0) {
    findings.push(
      `${negativeCases.length} case(s) have negative trust fund balances. ` +
      `Cases: ${negativeCases.map((c) => c.caseId).join(', ')}. ` +
      `Customer deposits must be collected before further disbursements ` +
      `per DoD FMR Vol. 15, Ch. 7, para 0702.`
    );
  }

  const zeroCases = caseDetails.filter(
    (c) => c.deposits === 0 && c.disbursements === 0
  );
  if (zeroCases.length > 0) {
    findings.push(
      `${zeroCases.length} case(s) have no financial activity. ` +
      `Review for dormant case closeout per DSCA SAMM, Ch. 5, para 050502.`
    );
  }

  findings.push(
    `FMS Trust Fund Report: total deposits $${totalDeposits.toLocaleString()}, ` +
    `total disbursements $${totalDisbursements.toLocaleString()}, ` +
    `net balance $${totalBalance.toLocaleString()} across ${cases.length} case(s).`
  );

  return {
    reportId: uuid(),
    reportDate: new Date().toISOString(),
    totalDeposits,
    totalDisbursements,
    totalBalance,
    caseDetails,
    findings,
  };
}

// ---------------------------------------------------------------------------
// Section 7: Security Assistance Report Generation
// ---------------------------------------------------------------------------

/**
 * Generate a Security Assistance Report (DSCA 1000-series format).
 *
 * Produces a standardized report conforming to DSCA 1000-series
 * reporting requirements, which serve as the primary financial and
 * programmatic reporting mechanism for FMS cases.
 *
 * Report types:
 *   - DSCA 1000: Case Financial Status
 *   - DSCA 1010: Delivery and Force Activity Designator (FAD)
 *   - DSCA 1020: FMS Billing Statement
 *   - DSCA 1030: FMS Trust Fund Activity
 *
 * Ref: DoD FMR Vol. 15, Ch. 9; DSCA SAMM, Ch. 11
 *
 * @param cases - FMS cases for the reporting period
 * @param reportType - The DSCA report type to generate
 * @param reportingPeriod - The period covered (e.g., "FY2025Q2")
 * @returns Security Assistance Report
 */
export function generateSecurityAssistanceReport(
  cases: FMSCase[],
  reportType: SecurityAssistanceReportType,
  reportingPeriod: string
): SecurityAssistanceReport {
  const totalCaseValue = round2(
    cases.reduce((sum, c) => sum + c.totalValue, 0)
  );
  const totalDeliveries = round2(
    cases.reduce((sum, c) => sum + c.deliveredValue, 0)
  );
  const totalCollections = round2(
    cases.reduce((sum, c) => sum + c.collectedAmount, 0)
  );
  const outstandingBalance = round2(totalCaseValue - totalCollections);

  // Determine country for single-country reports; use 'Multiple' for portfolio
  const countries = [...new Set(cases.map((c) => c.country))];
  const country = countries.length === 1 ? countries[0] : 'Multiple';

  return {
    id: uuid(),
    reportType,
    reportingPeriod,
    country,
    totalCaseValue,
    totalDeliveries,
    totalCollections,
    outstandingBalance,
  };
}

// ---------------------------------------------------------------------------
// Section 8: FMS Administrative Surcharge Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate the FMS administrative surcharge for a case.
 *
 * The FMS administrative surcharge covers the U.S. Government's cost
 * of administering the FMS program, including contract administration,
 * quality assurance, and program management. The surcharge rate is
 * set annually and applied to the total case value.
 *
 * Per DoD FMR Vol. 15, Ch. 7, para 070203, the administrative
 * surcharge is a percentage of the total LOA value and is assessed
 * at the time of case implementation.
 *
 * Ref: DoD FMR Vol. 15, Ch. 7, para 070203;
 *      22 U.S.C. §2761(e) (Administrative charges)
 *
 * @param fmsCase - The FMS case to compute the surcharge for
 * @returns The surcharge amount, applicable rate, and findings
 */
export function calculateAdminSurcharge(
  fmsCase: FMSCase
): { surchargeAmount: number; surchargeRate: number; findings: string[] } {
  const findings: string[] = [];

  const surchargeRate = getParameter(
    'FMS_ADMIN_SURCHARGE_RATE',
    fmsCase.fiscalYear,
    undefined,
    0.034
  );

  const surchargeAmount = round2(fmsCase.totalValue * surchargeRate);

  findings.push(
    `FMS administrative surcharge for case ${fmsCase.caseId}: ` +
    `$${surchargeAmount.toLocaleString()} at ${(surchargeRate * 100).toFixed(1)}% ` +
    `of total case value $${round2(fmsCase.totalValue).toLocaleString()}. ` +
    `Ref: DoD FMR Vol. 15, Ch. 7, para 070203; 22 U.S.C. §2761(e).`
  );

  return { surchargeAmount, surchargeRate, findings };
}

// ---------------------------------------------------------------------------
// Section 9: FMS Case Closure Eligibility
// ---------------------------------------------------------------------------

/**
 * Determine whether an FMS case is eligible for closeout.
 *
 * Per DoD FMR Vol. 15, Ch. 5, para 0504, an FMS case may be closed
 * when all of the following conditions are satisfied:
 *
 *   1. All defense articles and services have been delivered
 *   2. All deliveries have been billed to the customer
 *   3. All billings have been collected
 *   4. The trust fund balance for the case is zero or has been refunded
 *   5. All supply and financial discrepancies have been resolved
 *
 * DSCA SAMM, Ch. 5, para 050502 provides additional guidance on the
 * case closure process, including the 36-month supply completion date
 * (SCD) review and final financial reconciliation.
 *
 * Ref: DoD FMR Vol. 15, Ch. 5, para 0504;
 *      DSCA SAMM, Ch. 5, para 050502;
 *      22 U.S.C. §2761-2799
 *
 * @param fmsCase - The FMS case to evaluate for closeout eligibility
 * @param trustFundBalance - Current trust fund balance for the case
 * @returns Eligibility determination with detailed findings
 */
export function checkCloseoutEligibility(
  fmsCase: FMSCase,
  trustFundBalance: number
): { eligible: boolean; findings: string[] } {
  const findings: string[] = [];
  let eligible = true;

  // Check 1: All deliveries complete
  const undelivered = round2(fmsCase.totalValue - fmsCase.deliveredValue);
  if (undelivered > 0.01) {
    eligible = false;
    findings.push(
      `Closeout blocked: $${undelivered.toLocaleString()} in undelivered ` +
      `articles/services. All items must be delivered before closeout ` +
      `per DoD FMR Vol. 15, Ch. 5, para 0504.`
    );
  }

  // Check 2: All deliveries billed
  const unbilled = round2(fmsCase.deliveredValue - fmsCase.billedAmount);
  if (unbilled > 0.01) {
    eligible = false;
    findings.push(
      `Closeout blocked: $${unbilled.toLocaleString()} in unbilled deliveries. ` +
      `All deliveries must be billed per DSCA SAMM, Ch. 5, para 050502.`
    );
  }

  // Check 3: All billings collected
  const uncollected = round2(fmsCase.billedAmount - fmsCase.collectedAmount);
  if (uncollected > 0.01) {
    eligible = false;
    findings.push(
      `Closeout blocked: $${uncollected.toLocaleString()} in uncollected billings. ` +
      `Full collection required per DoD FMR Vol. 15, Ch. 5, para 0504.`
    );
  }

  // Check 4: Trust fund balance resolved
  const balanceRounded = round2(trustFundBalance);
  if (Math.abs(balanceRounded) > 0.01) {
    eligible = false;
    if (balanceRounded > 0) {
      findings.push(
        `Closeout blocked: trust fund has remaining balance of ` +
        `$${balanceRounded.toLocaleString()}. Excess funds must be refunded ` +
        `to the customer per DoD FMR Vol. 15, Ch. 7.`
      );
    } else {
      findings.push(
        `Closeout blocked: trust fund has negative balance of ` +
        `$${balanceRounded.toLocaleString()}. Additional customer payment ` +
        `required per DoD FMR Vol. 15, Ch. 7.`
      );
    }
  }

  // Check 5: Case must be in collection phase or later
  const phaseIndex = PHASE_ORDER.indexOf(fmsCase.status);
  const collectionIndex = PHASE_ORDER.indexOf('collection');
  if (phaseIndex < collectionIndex) {
    eligible = false;
    findings.push(
      `Closeout blocked: case is in '${fmsCase.status}' phase. ` +
      `Case must reach 'collection' phase before closeout ` +
      `per DoD FMR Vol. 15, Ch. 5.`
    );
  }

  if (eligible) {
    findings.push(
      `FMS case ${fmsCase.caseId} meets all closeout eligibility criteria ` +
      `per DoD FMR Vol. 15, Ch. 5, para 0504 and DSCA SAMM, Ch. 5, para 050502.`
    );
  }

  return { eligible, findings };
}

// ---------------------------------------------------------------------------
// Section 10: USSGL Journal Entry Generation
// ---------------------------------------------------------------------------

/**
 * Generate USSGL journal entries for FMS trust fund activity.
 *
 * Produces the standard USSGL journal entries required for recording
 * FMS trust fund deposits, disbursements, and adjustments in the
 * general ledger. These entries support the preparation of the
 * FMS Trust Fund financial statements.
 *
 * Standard USSGL entries for FMS:
 *   - Customer deposit:     DR 1010xx / CR 2310xx
 *   - Disbursement:         DR 2310xx / CR 1010xx
 *   - Revenue recognition:  DR 2310xx / CR 5100xx
 *   - Refund:               DR 2315xx / CR 1010xx
 *
 * Ref: DoD FMR Vol. 15, Ch. 7; USSGL TFM Supplement
 *
 * @param transactionType - Type of trust fund transaction
 * @param amount - Transaction amount
 * @param caseId - Associated FMS case identifier
 * @param description - Transaction description
 * @returns Array of USSGL journal entry lines (debit/credit pairs)
 */
export function generateUSSGLEntries(
  transactionType: TrustFundTransactionType,
  amount: number,
  caseId: string,
  description: string
): Array<{
  account: string;
  debit: number;
  credit: number;
  description: string;
}> {
  const roundedAmount = round2(amount);
  const entries: Array<{
    account: string;
    debit: number;
    credit: number;
    description: string;
  }> = [];

  switch (transactionType) {
    case 'customer_deposit':
      entries.push(
        {
          account: USSGL.FUND_BALANCE_TREASURY,
          debit: roundedAmount,
          credit: 0,
          description: `FMS customer deposit -- case ${caseId}: ${description}`,
        },
        {
          account: USSGL.ADVANCES_FROM_OTHERS,
          debit: 0,
          credit: roundedAmount,
          description: `FMS advance liability recorded -- case ${caseId}: ${description}`,
        }
      );
      break;

    case 'disbursement_for_delivery':
      entries.push(
        {
          account: USSGL.ADVANCES_FROM_OTHERS,
          debit: roundedAmount,
          credit: 0,
          description: `FMS advance liquidated for delivery -- case ${caseId}: ${description}`,
        },
        {
          account: USSGL.FUND_BALANCE_TREASURY,
          debit: 0,
          credit: roundedAmount,
          description: `FMS disbursement for delivery -- case ${caseId}: ${description}`,
        }
      );
      break;

    case 'admin_surcharge':
      entries.push(
        {
          account: USSGL.ADVANCES_FROM_OTHERS,
          debit: roundedAmount,
          credit: 0,
          description: `FMS admin surcharge applied -- case ${caseId}: ${description}`,
        },
        {
          account: USSGL.REVENUE_SERVICES,
          debit: 0,
          credit: roundedAmount,
          description: `FMS admin surcharge revenue -- case ${caseId}: ${description}`,
        }
      );
      break;

    case 'refund':
      entries.push(
        {
          account: USSGL.REFUNDS,
          debit: roundedAmount,
          credit: 0,
          description: `FMS refund to customer -- case ${caseId}: ${description}`,
        },
        {
          account: USSGL.FUND_BALANCE_TREASURY,
          debit: 0,
          credit: roundedAmount,
          description: `FMS refund disbursement -- case ${caseId}: ${description}`,
        }
      );
      break;

    case 'adjustment':
      entries.push(
        {
          account: USSGL.ADVANCES_FROM_OTHERS,
          debit: roundedAmount >= 0 ? roundedAmount : 0,
          credit: roundedAmount < 0 ? round2(Math.abs(roundedAmount)) : 0,
          description: `FMS trust fund adjustment -- case ${caseId}: ${description}`,
        },
        {
          account: USSGL.FUND_BALANCE_TREASURY,
          debit: roundedAmount < 0 ? round2(Math.abs(roundedAmount)) : 0,
          credit: roundedAmount >= 0 ? roundedAmount : 0,
          description: `FMS trust fund adjustment offset -- case ${caseId}: ${description}`,
        }
      );
      break;

    case 'interest_credit':
      entries.push(
        {
          account: USSGL.FUND_BALANCE_TREASURY,
          debit: roundedAmount,
          credit: 0,
          description: `FMS interest credited -- case ${caseId}: ${description}`,
        },
        {
          account: USSGL.ADVANCES_FROM_OTHERS,
          debit: 0,
          credit: roundedAmount,
          description: `FMS interest liability -- case ${caseId}: ${description}`,
        }
      );
      break;
  }

  return entries;
}
