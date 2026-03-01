// ============================================================
// DoD FMR Volume 15 — Security Cooperation Type Definitions
//
// Covers Foreign Military Sales (FMS), direct commercial sales,
// building partner capacity, Excess Defense Articles (EDA),
// and related trust fund accounting.
//
// References:
//   - DoD FMR Vol. 15 (Security Cooperation)
//   - Arms Export Control Act (22 U.S.C. §2751 et seq.)
//   - DSCA Security Assistance Management Manual (SAMM)
//   - 22 U.S.C. §2776 (Congressional notification)
// ============================================================

// --- FMS Case Types ---

export type FMSCaseType =
  | 'direct_commercial_sale'
  | 'fms_case'
  | 'building_partner_capacity';

export type FMSCaseStatus =
  | 'draft'
  | 'loa_offered'
  | 'loa_accepted'
  | 'implementing'
  | 'delivery'
  | 'billing'
  | 'collection'
  | 'closeout';

/**
 * Represents a Foreign Military Sales case tracking the full lifecycle
 * from Letter of Offer and Acceptance through case closeout.
 *
 * Ref: DoD FMR Vol. 15, Ch. 5; DSCA SAMM, Ch. 5
 */
export interface FMSCase {
  id: string;
  caseId: string;
  country: string;
  caseType: FMSCaseType;
  status: FMSCaseStatus;
  totalValue: number;
  deliveredValue: number;
  billedAmount: number;
  collectedAmount: number;
  implementingAgency: string;
  loaDate: string;
  closureDate?: string;
  fiscalYear: number;
}

// --- Letter of Offer and Acceptance ---

/**
 * Represents a single amendment to a Letter of Offer and Acceptance.
 */
export interface LOAAmendment {
  date: string;
  description: string;
  amount: number;
}

/**
 * Represents a Letter of Offer and Acceptance (LOA), the formal
 * document through which the U.S. Government offers defense
 * articles and services to a foreign government.
 *
 * Ref: DoD FMR Vol. 15, Ch. 5, para 050301;
 *      Arms Export Control Act, 22 U.S.C. §2762
 */
export interface LetterOfOfferAcceptance {
  id: string;
  fmsCaseId: string;
  loaNumber: string;
  country: string;
  totalValue: number;
  acceptedDate: string;
  expirationDate: string;
  amendments: LOAAmendment[];
}

// --- FMS Trust Fund Accounts ---

export type FMSTrustFundAccountType =
  | 'fms_trust'
  | 'fms_admin'
  | 'fms_special';

/**
 * Represents an FMS Trust Fund account used to manage customer
 * (foreign government) deposits and disbursements. FMS operates
 * on a customer-funded basis through the Foreign Military Sales
 * Trust Fund (10 U.S.C. §2345, 22 U.S.C. §2762).
 *
 * Ref: DoD FMR Vol. 15, Ch. 7; 22 U.S.C. §2762
 */
export interface FMSTrustFundAccount {
  id: string;
  accountType: FMSTrustFundAccountType;
  balance: number;
  receipts: number;
  disbursements: number;
  country: string;
  fiscalYear: number;
}

// --- Security Assistance Reporting ---

export type SecurityAssistanceReportType =
  | 'dsca_1000'
  | 'dsca_1010'
  | 'dsca_1020'
  | 'dsca_1030'
  | 'quarterly_status'
  | 'annual_review';

/**
 * Represents a Security Assistance report used for congressional
 * and DSCA oversight. The 1000-series reports are the primary
 * financial and programmatic reports for security cooperation.
 *
 * Ref: DoD FMR Vol. 15, Ch. 9; DSCA SAMM, Ch. 11
 */
export interface SecurityAssistanceReport {
  id: string;
  reportType: SecurityAssistanceReportType;
  reportingPeriod: string;
  country: string;
  totalCaseValue: number;
  totalDeliveries: number;
  totalCollections: number;
  outstandingBalance: number;
}

// --- Excess Defense Articles ---

export type EDACondition =
  | 'excellent'
  | 'good'
  | 'fair'
  | 'poor'
  | 'non_operational';

export type EDAAuthority =
  | 'section_516'
  | 'section_519'
  | 'presidential_drawdown';

/**
 * Represents an Excess Defense Article (EDA) transferred to a
 * foreign government. EDAs are defense articles owned by the
 * U.S. Government that are no longer needed.
 *
 * Ref: DoD FMR Vol. 15, Ch. 8;
 *      22 U.S.C. §2321j (Excess defense article transfers)
 */
export interface ExcessDefenseArticle {
  id: string;
  articleDescription: string;
  originalValue: number;
  currentValue: number;
  condition: EDACondition;
  recipientCountry: string;
  transferDate: string;
  authority: EDAAuthority;
}

// --- Congressional Notification ---

export type CongressionalNotificationType =
  | 'major_defense_equipment'
  | 'significant_military_equipment'
  | 'design_construction_services'
  | 'other';

/**
 * Result of a congressional notification threshold check.
 *
 * Ref: 22 U.S.C. §2776
 */
export interface CongressionalNotificationResult {
  required: boolean;
  notificationType: CongressionalNotificationType;
  threshold: number;
  caseValue: number;
  reason: string;
  waitingPeriodDays: number;
}

// --- Trust Fund Transaction ---

export type TrustFundTransactionType =
  | 'customer_deposit'
  | 'disbursement_for_delivery'
  | 'admin_surcharge'
  | 'refund'
  | 'adjustment'
  | 'interest_credit';

/**
 * Represents a single transaction against an FMS Trust Fund account.
 *
 * Ref: DoD FMR Vol. 15, Ch. 7
 */
export interface TrustFundTransaction {
  id: string;
  accountId: string;
  transactionType: TrustFundTransactionType;
  amount: number;
  transactionDate: string;
  description: string;
  caseId?: string;
  ussglDebitAccount: string;
  ussglCreditAccount: string;
}

// --- Delivery Record ---

/**
 * Represents a delivery of defense articles or services under
 * an FMS case, tracked for reconciliation against the LOA and
 * billing records.
 *
 * Ref: DoD FMR Vol. 15, Ch. 6; DSCA SAMM, Ch. 7
 */
export interface FMSDeliveryRecord {
  id: string;
  caseId: string;
  lineItemNumber: string;
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  deliveryDate: string;
  shippingDocumentNumber: string;
  billedToCustomer: boolean;
  billedAmount: number;
}

// --- FMS Case Lifecycle Result ---

/**
 * Result of tracking an FMS case through its lifecycle stages.
 */
export interface FMSLifecycleResult {
  caseId: string;
  currentStage: FMSCaseStatus;
  nextStage: FMSCaseStatus | null;
  completionPercentage: number;
  financialSummary: {
    totalValue: number;
    delivered: number;
    billed: number;
    collected: number;
    outstandingDeliveries: number;
    outstandingBillings: number;
    outstandingCollections: number;
  };
  findings: string[];
  readyForNextStage: boolean;
}

// --- Delivery Reconciliation Result ---

/**
 * Result of reconciling FMS deliveries against LOA, billing,
 * and collection records per DSCA SAMM requirements.
 */
export interface DeliveryReconciliationResult {
  caseId: string;
  totalLoaValue: number;
  totalDelivered: number;
  totalBilled: number;
  totalCollected: number;
  unbilledDeliveries: number;
  uncollectedBillings: number;
  overDeliveryAmount: number;
  reconcilingItems: Array<{
    lineItem: string;
    description: string;
    deliveredAmount: number;
    billedAmount: number;
    difference: number;
  }>;
  isReconciled: boolean;
  findings: string[];
}

// --- EDA Valuation Result ---

/**
 * Result of valuing an Excess Defense Article for transfer.
 */
export interface EDAValuationResult {
  articleId: string;
  originalAcquisitionValue: number;
  conditionFactor: number;
  ageFactor: number;
  computedFairValue: number;
  transferValue: number;
  methodology: string;
  findings: string[];
}
