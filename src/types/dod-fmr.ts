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

// --- Debt Management (Volume 16) ---

export type DebtCategory = 'travel_card' | 'overpayment' | 'advance' | 'erroneous_payment' | 'property_loss' | 'other';
export type DebtStatus = 'active' | 'delinquent' | 'referred_treasury' | 'compromised' | 'written_off' | 'waived' | 'collected';

export interface DebtRecord {
  id: string;
  engagementId: string;
  debtorName: string;
  debtorId?: string;
  amount: number;
  originalAmount: number;
  category: DebtCategory;
  status: DebtStatus;
  establishedDate: string;
  delinquentDate?: string;
  dueDate: string;
  referredToTreasury: boolean;
  referredDate?: string;
  enrolledInTOP: boolean;
  interestAssessed: number;
  penaltyAssessed: number;
  adminFeeAssessed: number;
  totalAmountDue: number;
  paymentsReceived: number;
  writeOffRequested: boolean;
  writeOffApproved: boolean;
  writeOffApprovedBy?: string;
  writeOffApprovalLevel?: string;
  writeOffDate?: string;
  dueDiligenceComplete: boolean;
  demandLettersSent: number;
  skipTracingComplete: boolean;
  compromiseRequested: boolean;
  compromiseAmount: number;
  compromiseApproved: boolean;
  waiverRequested: boolean;
  waiverApproved: boolean;
  waiverAuthority?: string;
  fiscalYear: number;
  createdAt: string;
}

export interface DebtAging {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days91to120: number;
  over120Days: number;
  totalDelinquent: number;
}

// --- FBWT Reconciliation ---

export type FBWTDifferenceType = 'amount' | 'timing' | 'classification' | 'unmatched';

export interface FBWTReconcilingItem {
  id: string;
  description: string;
  differenceType: FBWTDifferenceType;
  agencyAmount: number;
  treasuryAmount: number;
  difference: number;
  ageInDays: number;
  accountSymbol: string;
  category: 'in_transit_disbursement' | 'unprocessed_collection' | 'timing_difference' | 'suspense' | 'other';
}

export interface FBWTReconciliation {
  reconciliationDate: string;
  fiscalYear: number;
  treasuryAccountSymbol: string;
  agencyBookBalance: number;
  treasuryBalance: number;
  netDifference: number;
  reconcilingItems: FBWTReconcilingItem[];
  isReconciled: boolean;
}

// --- Government Property Accountability ---

export type PropertyCategory = 'general_ppe' | 'national_defense' | 'heritage' | 'stewardship_land' | 'internal_use_software';

export interface PropertyRecord {
  id: string;
  engagementId: string;
  propertyId: string;
  description: string;
  category: PropertyCategory;
  acquisitionDate: string;
  acquisitionCost: number;
  currentBookValue: number;
  accumulatedDepreciation: number;
  usefulLifeYears?: number;
  depreciationMethod?: 'straight_line' | 'declining_balance' | 'none';
  location: string;
  condition: 'serviceable' | 'unserviceable' | 'excess' | 'surplus';
  accountableOrganization: string;
  lastInventoryDate?: string;
  ussglAccountNumber: string;
  fiscalYear: number;
}

export interface DepreciationSchedule {
  propertyId: string;
  acquisitionCost: number;
  salvageValue: number;
  usefulLifeYears: number;
  depreciationMethod: 'straight_line' | 'declining_balance';
  annualDepreciation: number;
  accumulatedDepreciation: number;
  currentBookValue: number;
}

// --- Environmental Liabilities ---

export type EnvironmentalSiteType = 'brac' | 'fuds' | 'active_installation' | 'operational_range' | 'disposal';

export interface EnvironmentalLiability {
  id: string;
  engagementId: string;
  siteName: string;
  siteType: EnvironmentalSiteType;
  estimatedCost: number;
  recordedLiability: number;
  cleanupStartDate?: string;
  estimatedCompletionDate?: string;
  responsibleComponent: string;
  regulatoryBasis: string;
  estimateMethodology: string;
  lastEstimateUpdate: string;
  fiscalYear: number;
}

export interface CleanupEstimate {
  siteId: string;
  estimateDate: string;
  lowEstimate: number;
  midEstimate: number;
  highEstimate: number;
  selectedEstimate: number;
  discountRate?: number;
  inflationRate?: number;
  methodology: string;
}

// --- Federal Employee Benefits ---

export type BenefitType = 'military_retirement' | 'fers' | 'csrs' | 'opeb_health' | 'tsp_matching' | 'feca';

export interface ActuarialLiability {
  id: string;
  engagementId: string;
  benefitType: BenefitType;
  totalLiability: number;
  fundedPortion: number;
  unfundedPortion: number;
  imputedFinancingCost: number;
  servicesCost: number;
  interestCost: number;
  actuarialGainLoss: number;
  discountRate: number;
  inflationAssumption: number;
  valuationDate: string;
  nextValuationDate?: string;
  actuaryFirm?: string;
  fiscalYear: number;
}

export interface ActuarialAssumptions {
  discountRate: number;
  salaryGrowthRate: number;
  inflationRate: number;
  costOfLivingAdjustment: number;
  mortalityTable: string;
  retirementAge: number;
  valuationDate: string;
}

// --- DATA Act Compliance ---

export type DATAActFileType = 'file_a' | 'file_b' | 'file_c' | 'file_d1' | 'file_d2' | 'file_e' | 'file_f';

export interface DATAActSubmission {
  id: string;
  engagementId: string;
  reportingPeriod: string;
  fiscalYear: number;
  fileType: DATAActFileType;
  totalRecords: number;
  validRecords: number;
  errorRecords: number;
  warningRecords: number;
  submissionDate: string;
  certifiedBy?: string;
  certifiedDate?: string;
  status: 'draft' | 'submitted' | 'certified' | 'published';
}

export interface DATAActValidationResult {
  fileType: DATAActFileType;
  totalElements: number;
  completeElements: number;
  missingElements: string[];
  crossFileErrors: string[];
  accuracyScore: number;
  completenessScore: number;
}

// --- Lease Accounting (SFFAS 54, effective FY2027) ---

export type LeaseClassification = 'operating' | 'capital' | 'intragovernmental';

export interface LeaseRecord {
  id: string;
  engagementId: string;
  leaseNumber: string;
  lesseeComponent: string;
  lessorEntity: string;
  leaseClassification: LeaseClassification;
  assetDescription: string;
  commencementDate: string;
  terminationDate: string;
  leaseTermMonths: number;
  totalLeasePayments: number;
  annualPayment: number;
  leaseAssetValue: number;
  leaseLiabilityBalance: number;
  discountRate: number;
  isIntragovernmental: boolean;
  capitalizedAmount: number;
  amortizationScheduleExists: boolean;
  disclosureProvided: boolean;
  fiscalYear: number;
}

// --- Corrective Action Plans (CAP) ---

export type CAPStatus = 'draft' | 'active' | 'in_progress' | 'completed' | 'overdue' | 'cancelled';
export type FindingClassification = 'material_weakness' | 'significant_deficiency' | 'noncompliance' | 'other';
export type NFRStatus = 'issued' | 'management_response' | 'remediation' | 'validated' | 'closed';

export interface CorrectiveActionPlan {
  id: string;
  engagementId: string;
  findingId: string;
  findingClassification: FindingClassification;
  findingDescription: string;
  rootCause: string;
  correctiveAction: string;
  responsibleOfficial: string;
  targetCompletionDate: string;
  actualCompletionDate?: string;
  milestones: RemediationMilestone[];
  status: CAPStatus;
  evidenceRequired: string[];
  evidenceProvided: string[];
  percentComplete: number;
  fiscalYearIdentified: number;
  fiscalYearTarget: number;
  createdAt: string;
}

export interface RemediationMilestone {
  id: string;
  description: string;
  targetDate: string;
  completedDate?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  evidence?: string;
}

// --- Multi-Component Consolidation ---

export type DoDComponentCode =
  | 'army' | 'navy' | 'air_force' | 'marines' | 'space_force'
  | 'dla' | 'dfas' | 'dha' | 'disa' | 'dia' | 'nsa' | 'nga'
  | 'osd' | 'whs' | 'dtra' | 'dod_ig' | 'other';

export interface DoDComponent {
  code: DoDComponentCode;
  name: string;
  reportingEntity: boolean;
  parentComponent?: DoDComponentCode;
}

export interface ConsolidationElimination {
  id: string;
  engagementId: string;
  buyerComponent: DoDComponentCode;
  sellerComponent: DoDComponentCode;
  transactionType: string;
  buyerAmount: number;
  sellerAmount: number;
  difference: number;
  eliminationAmount: number;
  reconciled: boolean;
  ussglDebitAccount: string;
  ussglCreditAccount: string;
  fiscalYear: number;
}

export interface ConsolidatedTrialBalance {
  fiscalYear: number;
  componentBalances: Array<{
    component: DoDComponentCode;
    totalDebits: number;
    totalCredits: number;
  }>;
  eliminations: ConsolidationElimination[];
  consolidatedDebits: number;
  consolidatedCredits: number;
  isBalanced: boolean;
}

// --- FMR Revision Tracking ---

export interface FMRRevision {
  volumeNumber: number;
  chapterNumber: number;
  revisionDate: string;
  previousRevisionDate?: string;
  changeDescription: string;
  affectedRuleIds: string[];
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
  sf133Data?: SF133Data[];
  debtRecords?: DebtRecord[];
  propertyRecords?: PropertyRecord[];
  environmentalLiabilities?: EnvironmentalLiability[];
  actuarialLiabilities?: ActuarialLiability[];
  dataActSubmissions?: DATAActSubmission[];
  leaseRecords?: LeaseRecord[];
  correctiveActionPlans?: CorrectiveActionPlan[];
  consolidationEliminations?: ConsolidationElimination[];
  fbwtReconciliations?: FBWTReconciliation[];
  fiscalYear: number;
  dodComponent: string;
}
