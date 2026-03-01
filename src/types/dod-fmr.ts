// ============================================================
// DoD FMR (7000.14-R) Type Definitions
// ============================================================

// --- Appropriation Types ---

export type AppropriationType = 'one_year' | 'multi_year' | 'no_year' | 'revolving' | 'trust' | 'special' | 'naf';

export type BudgetCategory =
  | 'milpers'
  | 'om'
  | 'procurement'
  | 'rdte'
  | 'milcon'
  | 'family_housing'
  | 'brac'
  | 'working_capital'
  | 'naf'
  | 'other';

export type AppropriationStatus = 'current' | 'expired' | 'cancelled';

export interface Appropriation {
  id: string;
  engagementId: string;
  treasuryAccountSymbol: string;
  appropriationType: AppropriationType;
  appropriationTitle: string;
  budgetCategory: BudgetCategory;
  fiscalYearStart: string;
  fiscalYearEnd: string;
  expirationDate?: string;
  cancellationDate?: string;
  totalAuthority: number;
  apportioned: number;
  allotted: number;
  committed: number;
  obligated: number;
  disbursed: number;
  unobligatedBalance: number;
  status: AppropriationStatus;
  sfisData?: Record<string, string>;
  createdAt: string;
}

// --- Fund Control ---

export type FundControlLevel = 'apportionment' | 'allotment' | 'sub_allotment' | 'operating_budget';

export interface FundControl {
  id: string;
  appropriationId: string;
  controlLevel: FundControlLevel;
  amount: number;
  obligatedAgainst: number;
  expendedAgainst: number;
  availableBalance: number;
  controlledBy: string;
  effectiveDate: string;
  expirationDate?: string;
}

export interface FundAvailabilityResult {
  available: boolean;
  availableBalance: number;
  wouldExceed: boolean;
  controlLevel: FundControlLevel;
  appropriationStatus: AppropriationStatus;
}

// --- Obligation Lifecycle ---

export type ObligationType = 'contract' | 'purchase_order' | 'travel_order' | 'payroll' | 'grant' | 'iaa' | 'misc';

export type ObligationStatus = 'open' | 'partially_liquidated' | 'fully_liquidated' | 'deobligated' | 'adjusted';

export interface Obligation {
  id: string;
  engagementId: string;
  appropriationId: string;
  obligationNumber: string;
  documentType: ObligationType;
  vendorOrPayee?: string;
  amount: number;
  obligatedDate: string;
  liquidatedAmount: number;
  unliquidatedBalance: number;
  adjustmentAmount: number;
  status: ObligationStatus;
  bonafideNeedDate?: string;
  fiscalYear: number;
  budgetObjectCode: string;
  budgetActivityCode?: string;
  programElement?: string;
  createdBy: string;
  createdAt: string;
}

// --- Disbursements ---

export type PaymentMethod = 'eft' | 'check' | 'intra_gov' | 'treasury_offset' | 'cash';

export type DisbursementStatus = 'pending' | 'certified' | 'released' | 'cancelled' | 'returned';

export interface Disbursement {
  id: string;
  engagementId: string;
  obligationId: string;
  disbursementNumber: string;
  voucherNumber?: string;
  payeeId?: string;
  amount: number;
  disbursementDate: string;
  paymentMethod: PaymentMethod;
  certifiedBy?: string;
  status: DisbursementStatus;
  promptPayDueDate?: string;
  discountDate?: string;
  discountAmount: number;
  interestPenalty: number;
  createdAt: string;
}

// --- Collections ---

export type CollectionType = 'reimbursement' | 'refund' | 'recovery' | 'sale_proceeds' | 'fee' | 'deposit';

export interface Collection {
  id: string;
  engagementId: string;
  appropriationId: string;
  collectionType: CollectionType;
  sourceEntity: string;
  amount: number;
  collectionDate: string;
  depositNumber?: string;
  accountingClassification?: string;
  status: string;
  createdAt: string;
}

// --- USSGL (United States Standard General Ledger) ---

export type AccountingBasis = 'proprietary' | 'budgetary';

export type USSGLCategory =
  | 'asset'
  | 'liability'
  | 'net_position'
  | 'revenue'
  | 'expense'
  | 'budgetary_resource'
  | 'status_of_resources';

export interface USSGLAccount {
  id: string;
  engagementId: string;
  accountNumber: string;
  accountTitle: string;
  normalBalance: 'debit' | 'credit';
  accountType: AccountingBasis;
  category: USSGLCategory;
  beginBalance: number;
  endBalance: number;
  fiscalYear: number;
}

export interface USSGLTransaction {
  id: string;
  engagementId: string;
  transactionCode: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  postingDate: string;
  documentNumber: string;
  description: string;
  fiscalYear: number;
  proprietaryOrBudgetary: 'proprietary' | 'budgetary' | 'both';
}

// --- Anti-Deficiency Act ---

export type ADAViolationType =
  | 'over_obligation'
  | 'over_expenditure'
  | 'unauthorized_purpose'
  | 'advance_without_authority'
  | 'voluntary_service'
  | 'time_violation';

export type ADAInvestigationStatus =
  | 'detected'
  | 'under_investigation'
  | 'confirmed'
  | 'reported_to_president'
  | 'resolved';

export interface ADAViolation {
  id: string;
  engagementId: string;
  appropriationId?: string;
  violationType: ADAViolationType;
  statutoryBasis: string;
  amount: number;
  description: string;
  discoveredDate: string;
  reportedDate?: string;
  responsibleOfficer?: string;
  investigationStatus: ADAInvestigationStatus;
  correctiveAction?: string;
  violationDetails?: string;
  fiscalYear: number;
  createdAt: string;
}

export interface ADAValidationResult {
  allowed: boolean;
  violations: ADAViolation[];
  availableBalance: number;
  requestedAmount: number;
}

// --- Budget Object Codes ---

export type BOCCategory = 'personnel' | 'contractual_services' | 'supplies' | 'equipment' | 'grants' | 'other';

export interface BudgetObjectCode {
  id: string;
  code: string;
  title: string;
  category: BOCCategory;
  subCategory?: string;
  fiscalYear: number;
}

// --- SFIS (Standard Financial Information Structure) ---

export interface SFISElement {
  id: string;
  engagementId: string;
  departmentCode: string;
  mainAccountCode: string;
  subAccountCode?: string;
  availabilityType?: string;
  beginPeriod?: string;
  endPeriod?: string;
  fundType?: string;
  programCode?: string;
  projectCode?: string;
  activityCode?: string;
}

// --- Military Pay (Volume 7) ---

export interface MilitaryPayRecord {
  id: string;
  engagementId: string;
  memberId: string;
  payGrade: string;
  yearsOfService: number;
  basicPay: number;
  bah: number;
  bas: number;
  specialPaysJson?: string;
  incentivePaysJson?: string;
  combatZoneExclusion: boolean;
  tspContribution: number;
  tspMatchAmount: number;
  separationPay: number;
  retirementPay: number;
  totalCompensation: number;
  fiscalYear: number;
  payPeriod: string;
  status: string;
  createdAt: string;
}

// --- Civilian Pay (Volume 8) ---

export type RetirementPlan = 'fers' | 'csrs' | 'fers_revised';

export interface CivilianPayRecord {
  id: string;
  engagementId: string;
  employeeId: string;
  payPlan: string;
  grade: string;
  step: number;
  locality: string;
  basicPay: number;
  localityAdjustment: number;
  fehbContribution: number;
  fegliContribution: number;
  retirementContribution: number;
  retirementPlan: RetirementPlan;
  tspContribution: number;
  tspMatchAmount: number;
  premiumPay: number;
  overtimePay: number;
  leaveHoursAccrued: number;
  totalCompensation: number;
  fiscalYear: number;
  payPeriod: string;
  status: string;
  createdAt: string;
}

// --- Travel (Volume 9) ---

export type TravelType = 'tdy' | 'pcs' | 'local' | 'emergency_leave';
export type TravelVoucherStatus = 'submitted' | 'approved' | 'paid' | 'disputed' | 'rejected';
export type DelinquencyStatus = 'current' | '30_day' | '60_day' | '90_plus' | 'charge_off';

export interface TravelOrder {
  id: string;
  engagementId: string;
  travelerId: string;
  orderType: TravelType;
  purpose: string;
  originLocation: string;
  destinationLocation: string;
  departDate: string;
  returnDate: string;
  authorizedAmount: number;
  actualAmount: number;
  perDiemRate: number;
  lodgingRate: number;
  mieRate: number;
  status: string;
  authorizingOfficial: string;
  fiscalYear: number;
}

export interface TravelVoucher {
  id: string;
  engagementId: string;
  travelOrderId: string;
  voucherNumber: string;
  lodgingCost: number;
  mealsCost: number;
  transportationCost: number;
  otherCosts: number;
  advanceAmount: number;
  totalClaim: number;
  approvedAmount?: number;
  settlementAmount?: number;
  travelCardUsed: boolean;
  splitDisbursement: boolean;
  filedDate: string;
  settledDate?: string;
  status: TravelVoucherStatus;
}

export interface TravelCardTransaction {
  id: string;
  engagementId: string;
  travelerId: string;
  transactionDate: string;
  merchantName: string;
  amount: number;
  category: string;
  travelOrderId?: string;
  reconciledToVoucher: boolean;
  delinquencyStatus: DelinquencyStatus;
}

// --- Contract Payments (Volume 10) ---

export type ContractType = 'firm_fixed_price' | 'cost_plus' | 'time_and_materials' | 'cost_reimbursement' | 'idiq' | 'bpa' | 'other';
export type ContractPaymentType = 'progress' | 'performance_based' | 'final' | 'partial' | 'advance' | 'invoice';
export type ContractStatus = 'active' | 'completed' | 'terminated' | 'closeout';
export type DcaaAuditStatus = 'not_required' | 'pending' | 'in_progress' | 'completed' | 'exception';

export interface ContractRecord {
  id: string;
  engagementId: string;
  contractNumber: string;
  contractType: ContractType;
  vendorName: string;
  totalValue: number;
  obligatedAmount: number;
  fundedAmount: number;
  periodOfPerformance: string;
  contractingOfficer: string;
  status: ContractStatus;
  closeoutDate?: string;
  fiscalYear: number;
}

export interface ContractPayment {
  id: string;
  engagementId: string;
  obligationId: string;
  contractNumber: string;
  contractType: ContractType;
  vendorId: string;
  invoiceNumber?: string;
  invoiceAmount: number;
  approvedAmount: number;
  retainageAmount: number;
  progressPaymentPct?: number;
  performanceBasedPct?: number;
  paymentType: ContractPaymentType;
  dcaaAuditRequired: boolean;
  dcaaAuditStatus: DcaaAuditStatus;
  certifiedBy?: string;
  paymentDate: string;
  status: string;
}

// --- Interagency Agreements (Volumes 11-12) ---

export type IAAType = 'economy_act' | 'non_economy_act' | 'franchise_fund';
export type IAAStatus = 'pending' | 'active' | 'completed' | 'closeout';

export interface InteragencyAgreement {
  id: string;
  engagementId: string;
  agreementNumber: string;
  agreementType: IAAType;
  servicingAgency: string;
  requestingAgency: string;
  amount: number;
  advanceReceived: number;
  billedAmount: number;
  collectedAmount: number;
  obligatedAmount: number;
  periodOfPerformance: string;
  authority: string;
  status: IAAStatus;
  fiscalYear: number;
}

// --- Working Capital Funds ---

export interface WorkingCapitalFund {
  id: string;
  engagementId: string;
  fundName: string;
  fundType: 'supply' | 'depot_maintenance' | 'industrial' | 'other';
  capitalizedAssets: number;
  accumulatedDepreciation: number;
  revenueFromOperations: number;
  costOfOperations: number;
  netOperatingResult: number;
  cashBalance: number;
  fiscalYear: number;
}

// --- Special Accounts (Volume 12) ---

export interface SpecialAccount {
  id: string;
  engagementId: string;
  accountType: 'fms_trust' | 'environmental_restoration' | 'homeowners_assistance' | 'other';
  accountName: string;
  balance: number;
  receipts: number;
  disbursements: number;
  transfersIn: number;
  transfersOut: number;
  fiscalYear: number;
}

// --- NAF Accounts (Volume 13) ---

export interface NAFAccount {
  id: string;
  engagementId: string;
  accountType: 'mwr_category_a' | 'mwr_category_b' | 'mwr_category_c' | 'lodging' | 'other';
  accountName: string;
  revenues: number;
  expenses: number;
  netIncome: number;
  assets: number;
  liabilities: number;
  netAssets: number;
  fiscalYear: number;
}

// --- Intragovernmental Transactions ---

export type IGTTransactionType = 'reimbursable' | 'transfer' | 'allocation' | 'economy_act' | 'interagency_agreement';
export type ReconciliationStatus = 'matched' | 'unmatched' | 'in_dispute' | 'pending';

export interface IntragovernmentalTransaction {
  id: string;
  engagementId: string;
  transactionType: IGTTransactionType;
  tradingPartnerAgency: string;
  tradingPartnerTas?: string;
  agreementNumber?: string;
  amount: number;
  buyerSellerIndicator: 'buyer' | 'seller';
  reconciliationStatus: ReconciliationStatus;
  eliminationRequired: boolean;
  period: string;
  createdAt: string;
}

// --- FIAR (Financial Improvement and Audit Remediation) ---

export type FIARConclusion = 'audit_ready' | 'substantially_ready' | 'not_ready' | 'modified';

export interface FIARAssessment {
  id: string;
  engagementId: string;
  assessmentDate: string;
  auditReadinessScore: number;
  fundBalanceReconciled: boolean;
  ussglCompliant: boolean;
  sfisCompliant: boolean;
  internalControlsAssessed: boolean;
  materialWeaknesses?: string[];
  noticeOfFindings?: string[];
  correctiveActionPlans?: Array<{ finding: string; plan: string; targetDate: string; status: string }>;
  conclusion: FIARConclusion;
  assessedBy: string;
  createdAt: string;
}

// --- SF-133 Report Data ---

export interface SF133Data {
  treasuryAccountSymbol: string;
  fiscalYear: number;
  period: string;
  budgetaryResources: {
    unobligatedBalanceBroughtForward: number;
    adjustments: number;
    newBudgetAuthority: number;
    spendingAuthority: number;
    totalBudgetaryResources: number;
  };
  statusOfBudgetaryResources: {
    newObligationsAndUpwardAdjustments: number;
    unobligatedBalanceEndOfYear: number;
    apportionedUnexpired: number;
    unapportionedUnexpired: number;
    expired: number;
  };
  outlays: {
    newObligations: number;
    obligatedBalanceNetBeginning: number;
    obligatedBalanceNetEnd: number;
    outlaysNet: number;
  };
}

// --- Dual-Track Reconciliation ---

export interface DualTrackReconciliation {
  proprietaryTotal: number;
  budgetaryTotal: number;
  difference: number;
  reconciliationItems: Array<{
    description: string;
    amount: number;
    proprietaryAccount: string;
    budgetaryAccount: string;
  }>;
  isReconciled: boolean;
}

// --- DoD Engagement Data Extension ---

export interface DoDEngagementData {
  appropriations: Appropriation[];
  obligations: Obligation[];
  ussglAccounts: USSGLAccount[];
  ussglTransactions: USSGLTransaction[];
  disbursements: Disbursement[];
  collections: Collection[];
  militaryPayRecords: MilitaryPayRecord[];
  civilianPayRecords: CivilianPayRecord[];
  travelOrders: TravelOrder[];
  travelVouchers: TravelVoucher[];
  travelCardTransactions: TravelCardTransaction[];
  contractPayments: ContractPayment[];
  contracts: ContractRecord[];
  interagencyAgreements: InteragencyAgreement[];
  intragovernmentalTransactions: IntragovernmentalTransaction[];
  workingCapitalFunds: WorkingCapitalFund[];
  specialAccounts: SpecialAccount[];
  nafAccounts: NAFAccount[];
  adaViolations: ADAViolation[];
  fiarAssessments: FIARAssessment[];
  fundControls: FundControl[];
  budgetObjectCodes: BudgetObjectCode[];
  sfisElements: SFISElement[];
  fiscalYear: number;
  dodComponent: string;
}
