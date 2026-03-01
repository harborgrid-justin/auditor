/**
 * PostgreSQL Schema Definition (Drizzle ORM)
 *
 * This schema mirrors the SQLite schema but uses pgTable from drizzle-orm/pg-core.
 * Used when DATABASE_PROVIDER=postgresql.
 */

import { pgTable, text, integer, doublePrecision, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('auditor'),
  createdAt: text('created_at').notNull(),
});

export const engagements = pgTable('engagements', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  entityName: text('entity_name').notNull(),
  fiscalYearEnd: text('fiscal_year_end').notNull(),
  status: text('status').notNull().default('planning'),
  materialityThreshold: doublePrecision('materiality_threshold').notNull().default(0),
  industry: text('industry'),
  entityType: text('entity_type'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
});

export const engagementMembers = pgTable('engagement_members', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role').notNull().default('staff'),
});

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  accountNumber: text('account_number').notNull(),
  accountName: text('account_name').notNull(),
  accountType: text('account_type').notNull(),
  subType: text('sub_type'),
  beginningBalance: doublePrecision('beginning_balance').notNull().default(0),
  endingBalance: doublePrecision('ending_balance').notNull().default(0),
  period: text('period').notNull(),
});

export const trialBalanceEntries = pgTable('trial_balance_entries', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  accountId: text('account_id').notNull().references(() => accounts.id),
  debit: doublePrecision('debit').notNull().default(0),
  credit: doublePrecision('credit').notNull().default(0),
  period: text('period').notNull(),
  sourceFile: text('source_file').notNull(),
});

export const journalEntries = pgTable('journal_entries', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  entryNumber: text('entry_number').notNull(),
  date: text('date').notNull(),
  description: text('description').notNull(),
  postedBy: text('posted_by').notNull(),
  approvedBy: text('approved_by'),
  source: text('source').notNull().default('manual'),
});

export const journalEntryLines = pgTable('journal_entry_lines', {
  id: text('id').primaryKey(),
  journalEntryId: text('journal_entry_id').notNull().references(() => journalEntries.id),
  accountId: text('account_id').notNull(),
  accountName: text('account_name'),
  debit: doublePrecision('debit').notNull().default(0),
  credit: doublePrecision('credit').notNull().default(0),
  description: text('description'),
});

export const financialStatements = pgTable('financial_statements', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  statementType: text('statement_type').notNull(),
  period: text('period').notNull(),
  dataJson: text('data_json').notNull(),
});

export const taxData = pgTable('tax_data', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  formType: text('form_type').notNull(),
  schedule: text('schedule').notNull(),
  lineNumber: text('line_number').notNull(),
  description: text('description').notNull(),
  amount: doublePrecision('amount').notNull().default(0),
  period: text('period').notNull(),
});

export const findings = pgTable('findings', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  ruleId: text('rule_id').notNull(),
  framework: text('framework').notNull(),
  severity: text('severity').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  citation: text('citation').notNull(),
  remediation: text('remediation').notNull(),
  amountImpact: doublePrecision('amount_impact'),
  affectedAccounts: text('affected_accounts'),
  status: text('status').notNull().default('open'),
  createdAt: text('created_at').notNull(),
});

export const soxControls = pgTable('sox_controls', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  controlId: text('control_id').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  controlType: text('control_type').notNull(),
  category: text('category').notNull(),
  frequency: text('frequency').notNull(),
  owner: text('owner').notNull().default(''),
  status: text('status').notNull().default('not_tested'),
  assertion: text('assertion').notNull().default('[]'),
  riskLevel: text('risk_level').notNull().default('medium'),
  automatedManual: text('automated_manual').notNull().default('manual'),
});

export const soxTestResults = pgTable('sox_test_results', {
  id: text('id').primaryKey(),
  controlId: text('control_id').notNull().references(() => soxControls.id),
  testDate: text('test_date').notNull(),
  testedBy: text('tested_by').notNull(),
  result: text('result').notNull(),
  sampleSize: integer('sample_size').notNull().default(0),
  exceptionsFound: integer('exceptions_found').notNull().default(0),
  evidence: text('evidence').notNull().default(''),
  notes: text('notes').notNull().default(''),
});

export const riskScores = pgTable('risk_scores', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  category: text('category').notNull(),
  score: doublePrecision('score').notNull(),
  factorsJson: text('factors_json').notNull(),
  calculatedAt: text('calculated_at').notNull(),
});

export const uploadedFiles = pgTable('uploaded_files', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  dataType: text('data_type').notNull(),
  recordCount: integer('record_count').notNull().default(0),
  status: text('status').notNull().default('processing'),
  uploadedAt: text('uploaded_at').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
});

// --- Phase 2: Audit Trail & SOX Compliance ---

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id'),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  details: text('details'),
  ipAddress: text('ip_address'),
  timestamp: text('timestamp').notNull(),
});

export const findingHistory = pgTable('finding_history', {
  id: text('id').primaryKey(),
  findingId: text('finding_id').notNull().references(() => findings.id),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  changedBy: text('changed_by').notNull(),
  fieldChanged: text('field_changed').notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  changedAt: text('changed_at').notNull(),
});

export const reviewComments = pgTable('review_comments', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  findingId: text('finding_id').notNull().references(() => findings.id),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull(),
  comment: text('comment').notNull(),
  createdAt: text('created_at').notNull(),
});

export const workpapers = pgTable('workpapers', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  findingId: text('finding_id'),
  controlId: text('control_id'),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
  uploadedAt: text('uploaded_at').notNull(),
  description: text('description'),
});

export const signoffs = pgTable('signoffs', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  signedBy: text('signed_by').notNull(),
  signerName: text('signer_name').notNull(),
  role: text('role').notNull(),
  opinion: text('opinion'),
  signedAt: text('signed_at').notNull(),
});

// --- Phase 3: Workflow & Templates ---

export const workflowTransitions = pgTable('workflow_transitions', {
  id: text('id').primaryKey(),
  findingId: text('finding_id').notNull().references(() => findings.id),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  fromStatus: text('from_status').notNull(),
  toStatus: text('to_status').notNull(),
  changedBy: text('changed_by').notNull(),
  changerName: text('changer_name').notNull(),
  comment: text('comment'),
  changedAt: text('changed_at').notNull(),
});

export const engagementTemplates = pgTable('engagement_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  entityType: text('entity_type'),
  industry: text('industry'),
  defaultMateriality: doublePrecision('default_materiality').notNull().default(0),
  frameworksJson: text('frameworks_json'),
  soxControlsJson: text('sox_controls_json'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
});

export const schedules = pgTable('schedules', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  name: text('name').notNull(),
  cronExpression: text('cron_expression').notNull(),
  frameworksJson: text('frameworks_json').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  lastRunAt: text('last_run_at'),
  nextRunAt: text('next_run_at'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
});

// --- Phase 4: Enterprise Audit Opinion Features ---

export const samplingPlans = pgTable('sampling_plans', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  name: text('name').notNull(),
  populationType: text('population_type').notNull(),
  method: text('method').notNull(),
  confidenceLevel: doublePrecision('confidence_level').notNull().default(0.95),
  tolerableRate: doublePrecision('tolerable_rate'),
  expectedDeviationRate: doublePrecision('expected_deviation_rate'),
  tolerableMisstatement: doublePrecision('tolerable_misstatement'),
  expectedMisstatement: doublePrecision('expected_misstatement'),
  populationSize: integer('population_size').notNull().default(0),
  populationValue: doublePrecision('population_value'),
  calculatedSampleSize: integer('calculated_sample_size').notNull().default(0),
  selectedItemsJson: text('selected_items_json'),
  exceptionsFound: integer('exceptions_found').notNull().default(0),
  projectedMisstatement: doublePrecision('projected_misstatement'),
  upperMisstatementLimit: doublePrecision('upper_misstatement_limit'),
  conclusion: text('conclusion').notNull().default('pending'),
  conclusionNotes: text('conclusion_notes'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
});

export const auditAdjustments = pgTable('audit_adjustments', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  adjustmentNumber: text('adjustment_number').notNull(),
  type: text('type').notNull(),
  category: text('category').notNull().default('factual'),
  description: text('description').notNull(),
  debitAccountId: text('debit_account_id'),
  debitAccountName: text('debit_account_name').notNull(),
  creditAccountId: text('credit_account_id'),
  creditAccountName: text('credit_account_name').notNull(),
  amount: doublePrecision('amount').notNull(),
  findingId: text('finding_id'),
  effectOnIncome: doublePrecision('effect_on_income').notNull().default(0),
  effectOnAssets: doublePrecision('effect_on_assets').notNull().default(0),
  effectOnLiabilities: doublePrecision('effect_on_liabilities').notNull().default(0),
  effectOnEquity: doublePrecision('effect_on_equity').notNull().default(0),
  proposedBy: text('proposed_by').notNull(),
  approvedBy: text('approved_by'),
  status: text('status').notNull().default('draft'),
  createdAt: text('created_at').notNull(),
});

export const assertionCoverage = pgTable('assertion_coverage', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  accountId: text('account_id'),
  accountName: text('account_name').notNull(),
  accountType: text('account_type').notNull(),
  assertion: text('assertion').notNull(),
  procedureType: text('procedure_type').notNull(),
  procedureDescription: text('procedure_description').notNull(),
  evidenceReference: text('evidence_reference'),
  coveredBy: text('covered_by').notNull(),
  status: text('status').notNull().default('planned'),
  conclusion: text('conclusion'),
  completedAt: text('completed_at'),
});

export const goingConcernAssessments = pgTable('going_concern_assessments', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  assessmentDate: text('assessment_date').notNull(),
  quantitativeIndicatorsJson: text('quantitative_indicators_json').notNull(),
  qualitativeIndicatorsJson: text('qualitative_indicators_json'),
  cashFlowProjectionJson: text('cash_flow_projection_json'),
  managementPlanJson: text('management_plan_json'),
  mitigatingFactorsJson: text('mitigating_factors_json'),
  conclusion: text('conclusion').notNull(),
  opinionImpact: text('opinion_impact').notNull(),
  disclosureAdequate: boolean('disclosure_adequate').notNull().default(true),
  assessedBy: text('assessed_by').notNull(),
  reviewedBy: text('reviewed_by'),
  notes: text('notes'),
});

export const scopeLimitations = pgTable('scope_limitations', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  description: text('description').notNull(),
  accountsAffected: text('accounts_affected').notNull(),
  estimatedImpact: doublePrecision('estimated_impact'),
  pervasive: boolean('pervasive').notNull().default(false),
  imposedBy: text('imposed_by').notNull(),
  resolved: boolean('resolved').notNull().default(false),
  resolutionNotes: text('resolution_notes'),
  identifiedBy: text('identified_by').notNull(),
  identifiedAt: text('identified_at').notNull(),
});

export const completionChecklist = pgTable('completion_checklist', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  itemKey: text('item_key').notNull(),
  category: text('category').notNull(),
  description: text('description').notNull(),
  autoCheck: boolean('auto_check').notNull().default(false),
  autoCheckResult: boolean('auto_check_result'),
  status: text('status').notNull().default('not_started'),
  completedBy: text('completed_by'),
  completedAt: text('completed_at'),
  notes: text('notes'),
  required: boolean('required').notNull().default(true),
});

export const independenceConfirmations = pgTable('independence_confirmations', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  userId: text('user_id').notNull().references(() => users.id),
  userName: text('user_name').notNull(),
  confirmationType: text('confirmation_type').notNull(),
  confirmed: boolean('confirmed').notNull().default(false),
  threatsIdentified: text('threats_identified'),
  safeguardsApplied: text('safeguards_applied'),
  nonAuditServices: text('non_audit_services'),
  feeArrangement: text('fee_arrangement'),
  confirmedAt: text('confirmed_at'),
});

export const relatedParties = pgTable('related_parties', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  partyName: text('party_name').notNull(),
  relationship: text('relationship').notNull(),
  ownershipPct: doublePrecision('ownership_pct'),
  controlIndicators: text('control_indicators'),
  identifiedBy: text('identified_by').notNull(),
  identifiedAt: text('identified_at').notNull(),
});

export const relatedPartyTransactions = pgTable('related_party_transactions', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  relatedPartyId: text('related_party_id').notNull().references(() => relatedParties.id),
  transactionType: text('transaction_type').notNull(),
  description: text('description').notNull(),
  amount: doublePrecision('amount').notNull(),
  terms: text('terms'),
  businessPurpose: text('business_purpose'),
  armLengthAssessment: text('arm_length_assessment').notNull().default('not_assessed'),
  disclosed: boolean('disclosed').notNull().default(false),
  journalEntryIds: text('journal_entry_ids'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: text('reviewed_at'),
});

export const subsequentEvents = pgTable('subsequent_events', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  eventDescription: text('event_description').notNull(),
  eventDate: text('event_date').notNull(),
  eventType: text('event_type').notNull(),
  procedurePerformed: text('procedure_performed').notNull(),
  conclusion: text('conclusion').notNull(),
  adjustmentRequired: boolean('adjustment_required').notNull().default(false),
  disclosureRequired: boolean('disclosure_required').notNull().default(false),
  adjustmentAmount: doublePrecision('adjustment_amount'),
  identifiedBy: text('identified_by').notNull(),
  identifiedAt: text('identified_at').notNull(),
  reviewedBy: text('reviewed_by'),
});

// --- Phase 5: Enterprise Tax Compliance ---

export const taxParametersTable = pgTable('tax_parameters', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  taxYear: integer('tax_year').notNull(),
  value: doublePrecision('value').notNull(),
  valueType: text('value_type').notNull(),
  entityTypes: text('entity_types').notNull().default('all'),
  citation: text('citation').notNull(),
  legislationId: text('legislation_id'),
  effectiveDate: text('effective_date'),
  sunsetDate: text('sunset_date'),
  notes: text('notes'),
  updatedAt: text('updated_at').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export const legislationTable = pgTable('legislation', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  publicLaw: text('public_law'),
  enactedDate: text('enacted_date').notNull(),
  effectiveDate: text('effective_date').notNull(),
  sunsetDate: text('sunset_date'),
  status: text('status').notNull(),
  affectedSections: text('affected_sections').notNull(),
  summary: text('summary').notNull(),
  createdAt: text('created_at').notNull(),
});

export const legislationRuleLinksTable = pgTable('legislation_rule_links', {
  id: text('id').primaryKey(),
  legislationId: text('legislation_id').notNull().references(() => legislationTable.id),
  ruleId: text('rule_id').notNull(),
  parameterCode: text('parameter_code'),
  impactDescription: text('impact_description').notNull(),
});

export const uncertainTaxPositions = pgTable('uncertain_tax_positions', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  positionDescription: text('position_description').notNull(),
  ircSection: text('irc_section').notNull(),
  taxYear: integer('tax_year').notNull(),
  grossAmount: doublePrecision('gross_amount').notNull(),
  recognitionThresholdMet: boolean('recognition_threshold_met').notNull().default(false),
  technicalMeritsRating: text('technical_merits_rating'),
  measurementAmount: doublePrecision('measurement_amount'),
  interestAccrual: doublePrecision('interest_accrual').notNull().default(0),
  penaltyAccrual: doublePrecision('penalty_accrual').notNull().default(0),
  totalReserve: doublePrecision('total_reserve').notNull().default(0),
  status: text('status').notNull().default('identified'),
  expirationDate: text('expiration_date'),
  supportingDocumentation: text('supporting_documentation'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  reviewedBy: text('reviewed_by'),
  reviewedAt: text('reviewed_at'),
});

// --- DoD FMR: Federal Financial Management (Volumes 1-15) ---

export const appropriations = pgTable('appropriations', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  treasuryAccountSymbol: text('treasury_account_symbol').notNull(),
  appropriationType: text('appropriation_type').notNull(),
  appropriationTitle: text('appropriation_title').notNull(),
  budgetCategory: text('budget_category').notNull(),
  fiscalYearStart: text('fiscal_year_start').notNull(),
  fiscalYearEnd: text('fiscal_year_end').notNull(),
  expirationDate: text('expiration_date'),
  cancellationDate: text('cancellation_date'),
  totalAuthority: doublePrecision('total_authority').notNull().default(0),
  apportioned: doublePrecision('apportioned').notNull().default(0),
  allotted: doublePrecision('allotted').notNull().default(0),
  committed: doublePrecision('committed').notNull().default(0),
  obligated: doublePrecision('obligated').notNull().default(0),
  disbursed: doublePrecision('disbursed').notNull().default(0),
  unobligatedBalance: doublePrecision('unobligated_balance').notNull().default(0),
  status: text('status').notNull().default('current'),
  sfisDataJson: text('sfis_data_json'),
  createdAt: text('created_at').notNull(),
});

export const fundControls = pgTable('fund_controls', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  appropriationId: text('appropriation_id').notNull().references(() => appropriations.id),
  controlLevel: text('control_level').notNull(),
  amount: doublePrecision('amount').notNull().default(0),
  obligatedAgainst: doublePrecision('obligated_against').notNull().default(0),
  expendedAgainst: doublePrecision('expended_against').notNull().default(0),
  availableBalance: doublePrecision('available_balance').notNull().default(0),
  controlledBy: text('controlled_by').notNull(),
  effectiveDate: text('effective_date').notNull(),
  expirationDate: text('expiration_date'),
});

export const dodObligations = pgTable('dod_obligations', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  appropriationId: text('appropriation_id').notNull().references(() => appropriations.id),
  obligationNumber: text('obligation_number').notNull(),
  documentType: text('document_type').notNull(),
  vendorOrPayee: text('vendor_or_payee'),
  amount: doublePrecision('amount').notNull(),
  obligatedDate: text('obligated_date').notNull(),
  liquidatedAmount: doublePrecision('liquidated_amount').notNull().default(0),
  unliquidatedBalance: doublePrecision('unliquidated_balance').notNull().default(0),
  adjustmentAmount: doublePrecision('adjustment_amount').notNull().default(0),
  status: text('status').notNull().default('open'),
  bonafideNeedDate: text('bonafide_need_date'),
  fiscalYear: integer('fiscal_year').notNull(),
  budgetObjectCode: text('budget_object_code').notNull(),
  budgetActivityCode: text('budget_activity_code'),
  programElement: text('program_element'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
});

export const dodDisbursements = pgTable('dod_disbursements', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  obligationId: text('obligation_id').notNull().references(() => dodObligations.id),
  disbursementNumber: text('disbursement_number').notNull(),
  voucherNumber: text('voucher_number'),
  payeeId: text('payee_id'),
  amount: doublePrecision('amount').notNull(),
  disbursementDate: text('disbursement_date').notNull(),
  paymentMethod: text('payment_method').notNull(),
  certifiedBy: text('certified_by'),
  status: text('status').notNull().default('pending'),
  promptPayDueDate: text('prompt_pay_due_date'),
  discountDate: text('discount_date'),
  discountAmount: doublePrecision('discount_amount').notNull().default(0),
  interestPenalty: doublePrecision('interest_penalty').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const dodCollections = pgTable('dod_collections', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  appropriationId: text('appropriation_id').notNull().references(() => appropriations.id),
  collectionType: text('collection_type').notNull(),
  sourceEntity: text('source_entity').notNull(),
  amount: doublePrecision('amount').notNull(),
  collectionDate: text('collection_date').notNull(),
  depositNumber: text('deposit_number'),
  accountingClassification: text('accounting_classification'),
  status: text('status').notNull().default('recorded'),
  createdAt: text('created_at').notNull(),
});

export const ussglAccounts = pgTable('ussgl_accounts', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  accountNumber: text('account_number').notNull(),
  accountTitle: text('account_title').notNull(),
  normalBalance: text('normal_balance').notNull(),
  accountType: text('account_type').notNull(),
  category: text('category').notNull(),
  beginBalance: doublePrecision('begin_balance').notNull().default(0),
  endBalance: doublePrecision('end_balance').notNull().default(0),
  fiscalYear: integer('fiscal_year').notNull(),
});

export const ussglTransactions = pgTable('ussgl_transactions', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  transactionCode: text('transaction_code').notNull(),
  debitAccountId: text('debit_account_id').notNull(),
  creditAccountId: text('credit_account_id').notNull(),
  amount: doublePrecision('amount').notNull(),
  postingDate: text('posting_date').notNull(),
  documentNumber: text('document_number').notNull(),
  description: text('description').notNull(),
  fiscalYear: integer('fiscal_year').notNull(),
  proprietaryOrBudgetary: text('proprietary_or_budgetary').notNull(),
});

export const budgetObjectCodes = pgTable('budget_object_codes', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  title: text('title').notNull(),
  category: text('category').notNull(),
  subCategory: text('sub_category'),
  fiscalYear: integer('fiscal_year').notNull(),
});

export const sfisElements = pgTable('sfis_elements', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  departmentCode: text('department_code').notNull(),
  mainAccountCode: text('main_account_code').notNull(),
  subAccountCode: text('sub_account_code'),
  availabilityType: text('availability_type'),
  beginPeriod: text('begin_period'),
  endPeriod: text('end_period'),
  fundType: text('fund_type'),
  programCode: text('program_code'),
  projectCode: text('project_code'),
  activityCode: text('activity_code'),
});

export const adaViolations = pgTable('ada_violations', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  appropriationId: text('appropriation_id').references(() => appropriations.id),
  violationType: text('violation_type').notNull(),
  statutoryBasis: text('statutory_basis').notNull(),
  amount: doublePrecision('amount').notNull(),
  description: text('description').notNull(),
  discoveredDate: text('discovered_date').notNull(),
  reportedDate: text('reported_date'),
  responsibleOfficer: text('responsible_officer'),
  investigationStatus: text('investigation_status').notNull().default('detected'),
  correctiveAction: text('corrective_action'),
  violationDetails: text('violation_details'),
  fiscalYear: integer('fiscal_year').notNull(),
  createdAt: text('created_at').notNull(),
});

export const militaryPayRecords = pgTable('military_pay_records', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  memberId: text('member_id').notNull(),
  payGrade: text('pay_grade').notNull(),
  yearsOfService: integer('years_of_service').notNull(),
  basicPay: doublePrecision('basic_pay').notNull(),
  bah: doublePrecision('bah').notNull().default(0),
  bas: doublePrecision('bas').notNull().default(0),
  specialPaysJson: text('special_pays_json'),
  incentivePaysJson: text('incentive_pays_json'),
  combatZoneExclusion: boolean('combat_zone_exclusion').notNull().default(false),
  tspContribution: doublePrecision('tsp_contribution').notNull().default(0),
  tspMatchAmount: doublePrecision('tsp_match_amount').notNull().default(0),
  separationPay: doublePrecision('separation_pay').notNull().default(0),
  retirementPay: doublePrecision('retirement_pay').notNull().default(0),
  totalCompensation: doublePrecision('total_compensation').notNull(),
  fiscalYear: integer('fiscal_year').notNull(),
  payPeriod: text('pay_period').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
});

export const civilianPayRecords = pgTable('civilian_pay_records', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  employeeId: text('employee_id').notNull(),
  payPlan: text('pay_plan').notNull(),
  grade: text('grade').notNull(),
  step: integer('step').notNull(),
  locality: text('locality').notNull(),
  basicPay: doublePrecision('basic_pay').notNull(),
  localityAdjustment: doublePrecision('locality_adjustment').notNull().default(0),
  fehbContribution: doublePrecision('fehb_contribution').notNull().default(0),
  fegliContribution: doublePrecision('fegli_contribution').notNull().default(0),
  retirementContribution: doublePrecision('retirement_contribution').notNull().default(0),
  retirementPlan: text('retirement_plan').notNull(),
  tspContribution: doublePrecision('tsp_contribution').notNull().default(0),
  tspMatchAmount: doublePrecision('tsp_match_amount').notNull().default(0),
  premiumPay: doublePrecision('premium_pay').notNull().default(0),
  overtimePay: doublePrecision('overtime_pay').notNull().default(0),
  leaveHoursAccrued: doublePrecision('leave_hours_accrued').notNull().default(0),
  totalCompensation: doublePrecision('total_compensation').notNull(),
  fiscalYear: integer('fiscal_year').notNull(),
  payPeriod: text('pay_period').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
});

export const travelOrders = pgTable('travel_orders', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  travelerId: text('traveler_id').notNull(),
  orderType: text('order_type').notNull(),
  purpose: text('purpose').notNull(),
  originLocation: text('origin_location').notNull(),
  destinationLocation: text('destination_location').notNull(),
  departDate: text('depart_date').notNull(),
  returnDate: text('return_date').notNull(),
  authorizedAmount: doublePrecision('authorized_amount').notNull(),
  actualAmount: doublePrecision('actual_amount').notNull().default(0),
  perDiemRate: doublePrecision('per_diem_rate').notNull(),
  lodgingRate: doublePrecision('lodging_rate').notNull(),
  mieRate: doublePrecision('mie_rate').notNull().default(0),
  status: text('status').notNull().default('authorized'),
  authorizingOfficial: text('authorizing_official').notNull(),
  fiscalYear: integer('fiscal_year').notNull(),
  createdAt: text('created_at').notNull(),
});

export const dodTravelVouchers = pgTable('dod_travel_vouchers', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  travelOrderId: text('travel_order_id').notNull().references(() => travelOrders.id),
  voucherNumber: text('voucher_number').notNull(),
  lodgingCost: doublePrecision('lodging_cost').notNull().default(0),
  mealsCost: doublePrecision('meals_cost').notNull().default(0),
  transportationCost: doublePrecision('transportation_cost').notNull().default(0),
  otherCosts: doublePrecision('other_costs').notNull().default(0),
  advanceAmount: doublePrecision('advance_amount').notNull().default(0),
  totalClaim: doublePrecision('total_claim').notNull(),
  approvedAmount: doublePrecision('approved_amount'),
  settlementAmount: doublePrecision('settlement_amount'),
  travelCardUsed: boolean('travel_card_used').notNull().default(false),
  splitDisbursement: boolean('split_disbursement').notNull().default(false),
  filedDate: text('filed_date').notNull(),
  settledDate: text('settled_date'),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
});

export const travelCardTransactions = pgTable('travel_card_transactions', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  travelerId: text('traveler_id').notNull(),
  transactionDate: text('transaction_date').notNull(),
  merchantName: text('merchant_name').notNull(),
  amount: doublePrecision('amount').notNull(),
  category: text('category').notNull(),
  travelOrderId: text('travel_order_id'),
  reconciledToVoucher: boolean('reconciled_to_voucher').notNull().default(false),
  delinquencyStatus: text('delinquency_status').notNull().default('current'),
});

export const dodContracts = pgTable('dod_contracts', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  contractNumber: text('contract_number').notNull(),
  contractType: text('contract_type').notNull(),
  vendorName: text('vendor_name').notNull(),
  totalValue: doublePrecision('total_value').notNull(),
  obligatedAmount: doublePrecision('obligated_amount').notNull().default(0),
  fundedAmount: doublePrecision('funded_amount').notNull().default(0),
  periodOfPerformance: text('period_of_performance').notNull(),
  contractingOfficer: text('contracting_officer').notNull(),
  status: text('status').notNull().default('active'),
  closeoutDate: text('closeout_date'),
  fiscalYear: integer('fiscal_year').notNull(),
  createdAt: text('created_at').notNull(),
});

export const dodContractPayments = pgTable('dod_contract_payments', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  obligationId: text('obligation_id').notNull(),
  contractNumber: text('contract_number').notNull(),
  contractType: text('contract_type').notNull(),
  vendorId: text('vendor_id').notNull(),
  invoiceNumber: text('invoice_number'),
  invoiceAmount: doublePrecision('invoice_amount').notNull(),
  approvedAmount: doublePrecision('approved_amount').notNull(),
  retainageAmount: doublePrecision('retainage_amount').notNull().default(0),
  progressPaymentPct: doublePrecision('progress_payment_pct'),
  performanceBasedPct: doublePrecision('performance_based_pct'),
  paymentType: text('payment_type').notNull(),
  dcaaAuditRequired: boolean('dcaa_audit_required').notNull().default(false),
  dcaaAuditStatus: text('dcaa_audit_status'),
  certifiedBy: text('certified_by'),
  paymentDate: text('payment_date').notNull(),
  status: text('status').notNull().default('pending'),
  createdAt: text('created_at').notNull(),
});

export const interagencyAgreements = pgTable('interagency_agreements', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  agreementNumber: text('agreement_number').notNull(),
  agreementType: text('agreement_type').notNull(),
  servicingAgency: text('servicing_agency').notNull(),
  requestingAgency: text('requesting_agency').notNull(),
  amount: doublePrecision('amount').notNull(),
  advanceReceived: doublePrecision('advance_received').notNull().default(0),
  billedAmount: doublePrecision('billed_amount').notNull().default(0),
  collectedAmount: doublePrecision('collected_amount').notNull().default(0),
  obligatedAmount: doublePrecision('obligated_amount').notNull().default(0),
  periodOfPerformance: text('period_of_performance').notNull(),
  authority: text('authority').notNull(),
  status: text('status').notNull().default('pending'),
  fiscalYear: integer('fiscal_year').notNull(),
  createdAt: text('created_at').notNull(),
});

export const workingCapitalFunds = pgTable('working_capital_funds', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  fundName: text('fund_name').notNull(),
  fundType: text('fund_type').notNull(),
  capitalizedAssets: doublePrecision('capitalized_assets').notNull().default(0),
  accumulatedDepreciation: doublePrecision('accumulated_depreciation').notNull().default(0),
  revenueFromOperations: doublePrecision('revenue_from_operations').notNull().default(0),
  costOfOperations: doublePrecision('cost_of_operations').notNull().default(0),
  netOperatingResult: doublePrecision('net_operating_result').notNull().default(0),
  cashBalance: doublePrecision('cash_balance').notNull().default(0),
  fiscalYear: integer('fiscal_year').notNull(),
});

export const specialAccountsTable = pgTable('special_accounts', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  accountType: text('account_type').notNull(),
  accountName: text('account_name').notNull(),
  balance: doublePrecision('balance').notNull().default(0),
  receipts: doublePrecision('receipts').notNull().default(0),
  disbursementsAmount: doublePrecision('disbursements_amount').notNull().default(0),
  transfersIn: doublePrecision('transfers_in').notNull().default(0),
  transfersOut: doublePrecision('transfers_out').notNull().default(0),
  fiscalYear: integer('fiscal_year').notNull(),
});

export const nafAccounts = pgTable('naf_accounts', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  accountType: text('account_type').notNull(),
  accountName: text('account_name').notNull(),
  revenues: doublePrecision('revenues').notNull().default(0),
  expenses: doublePrecision('expenses').notNull().default(0),
  netIncome: doublePrecision('net_income').notNull().default(0),
  assets: doublePrecision('assets').notNull().default(0),
  liabilities: doublePrecision('liabilities').notNull().default(0),
  netAssets: doublePrecision('net_assets').notNull().default(0),
  fiscalYear: integer('fiscal_year').notNull(),
});

export const intragovernmentalTransactions = pgTable('intragovernmental_transactions', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  transactionType: text('transaction_type').notNull(),
  tradingPartnerAgency: text('trading_partner_agency').notNull(),
  tradingPartnerTas: text('trading_partner_tas'),
  agreementNumber: text('agreement_number'),
  amount: doublePrecision('amount').notNull(),
  buyerSellerIndicator: text('buyer_seller_indicator').notNull(),
  reconciliationStatus: text('reconciliation_status').notNull().default('pending'),
  eliminationRequired: boolean('elimination_required').notNull().default(true),
  period: text('period').notNull(),
  createdAt: text('created_at').notNull(),
});

export const fiarAssessments = pgTable('fiar_assessments', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  assessmentDate: text('assessment_date').notNull(),
  auditReadinessScore: doublePrecision('audit_readiness_score').notNull(),
  fundBalanceReconciled: boolean('fund_balance_reconciled').notNull().default(false),
  ussglCompliant: boolean('ussgl_compliant').notNull().default(false),
  sfisCompliant: boolean('sfis_compliant').notNull().default(false),
  internalControlsAssessed: boolean('internal_controls_assessed').notNull().default(false),
  materialWeaknessesJson: text('material_weaknesses_json'),
  noticeOfFindingsJson: text('notice_of_findings_json'),
  correctiveActionPlansJson: text('corrective_action_plans_json'),
  conclusion: text('conclusion').notNull(),
  assessedBy: text('assessed_by').notNull(),
  createdAt: text('created_at').notNull(),
});

// --- New PostgreSQL-only tables ---

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  priority: text('priority').notNull().default('normal'),
  title: text('title').notNull(),
  message: text('message').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  engagementId: text('engagement_id'),
  read: boolean('read').notNull().default(false),
  createdAt: text('created_at').notNull(),
});

export const jobExecutions = pgTable('job_executions', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  engagementId: text('engagement_id').notNull(),
  fiscalYear: integer('fiscal_year'),
  parametersJson: text('parameters_json'),
  status: text('status').notNull().default('pending'),
  resultJson: text('result_json'),
  error: text('error'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  completedAt: text('completed_at'),
});

export const correctiveActionPlans = pgTable('corrective_action_plans', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull(),
  findingId: text('finding_id'),
  findingTitle: text('finding_title').notNull(),
  category: text('category').notNull(),
  priority: text('priority').notNull(),
  status: text('status').notNull().default('draft'),
  deficiencyDescription: text('deficiency_description').notNull(),
  rootCause: text('root_cause').notNull(),
  correctiveAction: text('corrective_action').notNull(),
  expectedOutcome: text('expected_outcome').notNull(),
  responsibleParty: text('responsible_party').notNull(),
  responsibleOrg: text('responsible_org').notNull(),
  targetDate: text('target_date').notNull(),
  revisedTargetDate: text('revised_target_date'),
  closedDate: text('closed_date'),
  closedBy: text('closed_by'),
  milestonesJson: text('milestones_json'),
  evidenceJson: text('evidence_json'),
  progressNotesJson: text('progress_notes_json'),
  validationCriteriaJson: text('validation_criteria_json'),
  validatedBy: text('validated_by'),
  validationDate: text('validation_date'),
  validationResult: text('validation_result'),
  createdAt: text('created_at').notNull(),
});

// --- Raw SQL for direct execution (legacy compatibility) ---

export const PG_SCHEMA_SQL = `
-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'auditor',
  created_at TEXT NOT NULL
);

-- Engagements
CREATE TABLE IF NOT EXISTS engagements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  fiscal_year_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  materiality_threshold DOUBLE PRECISION NOT NULL DEFAULT 0,
  industry TEXT,
  entity_type TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Engagement Members
CREATE TABLE IF NOT EXISTS engagement_members (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'staff'
);

-- Accounts
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  account_number TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  sub_type TEXT,
  beginning_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  ending_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  period TEXT NOT NULL
);

-- Trial Balance Entries
CREATE TABLE IF NOT EXISTS trial_balance_entries (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  debit DOUBLE PRECISION NOT NULL DEFAULT 0,
  credit DOUBLE PRECISION NOT NULL DEFAULT 0,
  period TEXT NOT NULL,
  source_file TEXT NOT NULL
);

-- Journal Entries
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  entry_number TEXT NOT NULL,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  posted_by TEXT NOT NULL,
  approved_by TEXT,
  source TEXT NOT NULL DEFAULT 'manual'
);

-- Journal Entry Lines
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id TEXT PRIMARY KEY,
  journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id),
  account_id TEXT NOT NULL,
  account_name TEXT,
  debit DOUBLE PRECISION NOT NULL DEFAULT 0,
  credit DOUBLE PRECISION NOT NULL DEFAULT 0,
  description TEXT
);

-- Financial Statements
CREATE TABLE IF NOT EXISTS financial_statements (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  statement_type TEXT NOT NULL,
  period TEXT NOT NULL,
  data_json TEXT NOT NULL
);

-- Tax Data
CREATE TABLE IF NOT EXISTS tax_data (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  form_type TEXT NOT NULL,
  schedule TEXT NOT NULL,
  line_number TEXT NOT NULL,
  description TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  period TEXT NOT NULL
);

-- Findings
CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  rule_id TEXT NOT NULL,
  framework TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  citation TEXT NOT NULL,
  remediation TEXT NOT NULL,
  amount_impact DOUBLE PRECISION,
  affected_accounts TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL
);

-- SOX Controls
CREATE TABLE IF NOT EXISTS sox_controls (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  control_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  control_type TEXT NOT NULL,
  category TEXT NOT NULL,
  frequency TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'not_tested',
  assertion TEXT NOT NULL DEFAULT '[]',
  risk_level TEXT NOT NULL DEFAULT 'medium',
  automated_manual TEXT NOT NULL DEFAULT 'manual'
);

-- SOX Test Results
CREATE TABLE IF NOT EXISTS sox_test_results (
  id TEXT PRIMARY KEY,
  control_id TEXT NOT NULL REFERENCES sox_controls(id),
  test_date TEXT NOT NULL,
  tested_by TEXT NOT NULL,
  result TEXT NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  exceptions_found INTEGER NOT NULL DEFAULT 0,
  evidence TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);

-- Risk Scores
CREATE TABLE IF NOT EXISTS risk_scores (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  category TEXT NOT NULL,
  score DOUBLE PRECISION NOT NULL,
  factors_json TEXT NOT NULL,
  calculated_at TEXT NOT NULL
);

-- Uploaded Files
CREATE TABLE IF NOT EXISTS uploaded_files (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  data_type TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing',
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT NOT NULL
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  engagement_id TEXT,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details TEXT,
  ip_address TEXT,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_engagement ON audit_logs(engagement_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);

-- Finding History
CREATE TABLE IF NOT EXISTS finding_history (
  id TEXT PRIMARY KEY,
  finding_id TEXT NOT NULL REFERENCES findings(id),
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  changed_by TEXT NOT NULL,
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TEXT NOT NULL
);

-- Review Comments
CREATE TABLE IF NOT EXISTS review_comments (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  finding_id TEXT NOT NULL REFERENCES findings(id),
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Workpapers
CREATE TABLE IF NOT EXISTS workpapers (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  finding_id TEXT,
  control_id TEXT,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  description TEXT
);

-- Signoffs
CREATE TABLE IF NOT EXISTS signoffs (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  signed_by TEXT NOT NULL,
  signer_name TEXT NOT NULL,
  role TEXT NOT NULL,
  opinion TEXT,
  signed_at TEXT NOT NULL
);

-- Workflow Transitions
CREATE TABLE IF NOT EXISTS workflow_transitions (
  id TEXT PRIMARY KEY,
  finding_id TEXT NOT NULL REFERENCES findings(id),
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changer_name TEXT NOT NULL,
  comment TEXT,
  changed_at TEXT NOT NULL
);

-- Engagement Templates
CREATE TABLE IF NOT EXISTS engagement_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  entity_type TEXT,
  industry TEXT,
  default_materiality DOUBLE PRECISION NOT NULL DEFAULT 0,
  frameworks_json TEXT,
  sox_controls_json TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Schedules
CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  name TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  frameworks_json TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TEXT,
  next_run_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Sampling Plans
CREATE TABLE IF NOT EXISTS sampling_plans (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  name TEXT NOT NULL,
  population_type TEXT NOT NULL,
  method TEXT NOT NULL,
  confidence_level DOUBLE PRECISION NOT NULL DEFAULT 0.95,
  tolerable_rate DOUBLE PRECISION,
  expected_deviation_rate DOUBLE PRECISION,
  tolerable_misstatement DOUBLE PRECISION,
  expected_misstatement DOUBLE PRECISION,
  population_size INTEGER NOT NULL DEFAULT 0,
  population_value DOUBLE PRECISION,
  calculated_sample_size INTEGER NOT NULL DEFAULT 0,
  selected_items_json TEXT,
  exceptions_found INTEGER NOT NULL DEFAULT 0,
  projected_misstatement DOUBLE PRECISION,
  upper_misstatement_limit DOUBLE PRECISION,
  conclusion TEXT NOT NULL DEFAULT 'pending',
  conclusion_notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Audit Adjustments
CREATE TABLE IF NOT EXISTS audit_adjustments (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  adjustment_number TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'factual',
  description TEXT NOT NULL,
  debit_account_id TEXT,
  debit_account_name TEXT NOT NULL,
  credit_account_id TEXT,
  credit_account_name TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  finding_id TEXT,
  effect_on_income DOUBLE PRECISION NOT NULL DEFAULT 0,
  effect_on_assets DOUBLE PRECISION NOT NULL DEFAULT 0,
  effect_on_liabilities DOUBLE PRECISION NOT NULL DEFAULT 0,
  effect_on_equity DOUBLE PRECISION NOT NULL DEFAULT 0,
  proposed_by TEXT NOT NULL,
  approved_by TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL
);

-- Assertion Coverage
CREATE TABLE IF NOT EXISTS assertion_coverage (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  account_id TEXT,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  assertion TEXT NOT NULL,
  procedure_type TEXT NOT NULL,
  procedure_description TEXT NOT NULL,
  evidence_reference TEXT,
  covered_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  conclusion TEXT,
  completed_at TEXT
);

-- Going Concern Assessments
CREATE TABLE IF NOT EXISTS going_concern_assessments (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  assessment_date TEXT NOT NULL,
  quantitative_indicators_json TEXT NOT NULL,
  qualitative_indicators_json TEXT,
  cash_flow_projection_json TEXT,
  management_plan_json TEXT,
  mitigating_factors_json TEXT,
  conclusion TEXT NOT NULL,
  opinion_impact TEXT NOT NULL,
  disclosure_adequate BOOLEAN NOT NULL DEFAULT TRUE,
  assessed_by TEXT NOT NULL,
  reviewed_by TEXT,
  notes TEXT
);

-- Scope Limitations
CREATE TABLE IF NOT EXISTS scope_limitations (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  description TEXT NOT NULL,
  accounts_affected TEXT NOT NULL,
  estimated_impact DOUBLE PRECISION,
  pervasive BOOLEAN NOT NULL DEFAULT FALSE,
  imposed_by TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolution_notes TEXT,
  identified_by TEXT NOT NULL,
  identified_at TEXT NOT NULL
);

-- Completion Checklist
CREATE TABLE IF NOT EXISTS completion_checklist (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  item_key TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  auto_check BOOLEAN NOT NULL DEFAULT FALSE,
  auto_check_result BOOLEAN,
  status TEXT NOT NULL DEFAULT 'not_started',
  completed_by TEXT,
  completed_at TEXT,
  notes TEXT,
  required BOOLEAN NOT NULL DEFAULT TRUE
);

-- Independence Confirmations
CREATE TABLE IF NOT EXISTS independence_confirmations (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  user_name TEXT NOT NULL,
  confirmation_type TEXT NOT NULL,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  threats_identified TEXT,
  safeguards_applied TEXT,
  non_audit_services TEXT,
  fee_arrangement TEXT,
  confirmed_at TEXT
);

-- Related Parties
CREATE TABLE IF NOT EXISTS related_parties (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  party_name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  ownership_pct DOUBLE PRECISION,
  control_indicators TEXT,
  identified_by TEXT NOT NULL,
  identified_at TEXT NOT NULL
);

-- Related Party Transactions
CREATE TABLE IF NOT EXISTS related_party_transactions (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  related_party_id TEXT NOT NULL REFERENCES related_parties(id),
  transaction_type TEXT NOT NULL,
  description TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  terms TEXT,
  business_purpose TEXT,
  arm_length_assessment TEXT NOT NULL DEFAULT 'not_assessed',
  disclosed BOOLEAN NOT NULL DEFAULT FALSE,
  journal_entry_ids TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT
);

-- Subsequent Events
CREATE TABLE IF NOT EXISTS subsequent_events (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  event_description TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_type TEXT NOT NULL,
  procedure_performed TEXT NOT NULL,
  conclusion TEXT NOT NULL,
  adjustment_required BOOLEAN NOT NULL DEFAULT FALSE,
  disclosure_required BOOLEAN NOT NULL DEFAULT FALSE,
  adjustment_amount DOUBLE PRECISION,
  identified_by TEXT NOT NULL,
  identified_at TEXT NOT NULL,
  reviewed_by TEXT
);

-- Tax Parameters
CREATE TABLE IF NOT EXISTS tax_parameters (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  tax_year INTEGER NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  value_type TEXT NOT NULL,
  entity_types TEXT NOT NULL DEFAULT 'all',
  citation TEXT NOT NULL,
  legislation_id TEXT,
  effective_date TEXT,
  sunset_date TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

-- Legislation
CREATE TABLE IF NOT EXISTS legislation (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  public_law TEXT,
  enacted_date TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  sunset_date TEXT,
  status TEXT NOT NULL,
  affected_sections TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Legislation Rule Links
CREATE TABLE IF NOT EXISTS legislation_rule_links (
  id TEXT PRIMARY KEY,
  legislation_id TEXT NOT NULL REFERENCES legislation(id),
  rule_id TEXT NOT NULL,
  parameter_code TEXT,
  impact_description TEXT NOT NULL
);

-- Uncertain Tax Positions
CREATE TABLE IF NOT EXISTS uncertain_tax_positions (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  position_description TEXT NOT NULL,
  irc_section TEXT NOT NULL,
  tax_year INTEGER NOT NULL,
  gross_amount DOUBLE PRECISION NOT NULL,
  recognition_threshold_met BOOLEAN NOT NULL DEFAULT FALSE,
  technical_merits_rating TEXT,
  measurement_amount DOUBLE PRECISION,
  interest_accrual DOUBLE PRECISION NOT NULL DEFAULT 0,
  penalty_accrual DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_reserve DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'identified',
  expiration_date TEXT,
  supporting_documentation TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT
);

-- Appropriations
CREATE TABLE IF NOT EXISTS appropriations (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  treasury_account_symbol TEXT NOT NULL,
  appropriation_type TEXT NOT NULL,
  appropriation_title TEXT NOT NULL,
  budget_category TEXT NOT NULL,
  fiscal_year_start TEXT NOT NULL,
  fiscal_year_end TEXT NOT NULL,
  expiration_date TEXT,
  cancellation_date TEXT,
  total_authority DOUBLE PRECISION NOT NULL DEFAULT 0,
  apportioned DOUBLE PRECISION NOT NULL DEFAULT 0,
  allotted DOUBLE PRECISION NOT NULL DEFAULT 0,
  committed DOUBLE PRECISION NOT NULL DEFAULT 0,
  obligated DOUBLE PRECISION NOT NULL DEFAULT 0,
  disbursed DOUBLE PRECISION NOT NULL DEFAULT 0,
  unobligated_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'current',
  sfis_data_json TEXT,
  created_at TEXT NOT NULL
);

-- Fund Controls
CREATE TABLE IF NOT EXISTS fund_controls (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  appropriation_id TEXT NOT NULL REFERENCES appropriations(id),
  control_level TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  obligated_against DOUBLE PRECISION NOT NULL DEFAULT 0,
  expended_against DOUBLE PRECISION NOT NULL DEFAULT 0,
  available_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  controlled_by TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  expiration_date TEXT
);

-- DoD Obligations
CREATE TABLE IF NOT EXISTS dod_obligations (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  appropriation_id TEXT NOT NULL REFERENCES appropriations(id),
  obligation_number TEXT NOT NULL,
  document_type TEXT NOT NULL,
  vendor_or_payee TEXT,
  amount DOUBLE PRECISION NOT NULL,
  obligated_date TEXT NOT NULL,
  liquidated_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  unliquidated_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  adjustment_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  bonafide_need_date TEXT,
  fiscal_year INTEGER NOT NULL,
  budget_object_code TEXT NOT NULL,
  budget_activity_code TEXT,
  program_element TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- DoD Disbursements
CREATE TABLE IF NOT EXISTS dod_disbursements (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  obligation_id TEXT NOT NULL REFERENCES dod_obligations(id),
  disbursement_number TEXT NOT NULL,
  voucher_number TEXT,
  payee_id TEXT,
  amount DOUBLE PRECISION NOT NULL,
  disbursement_date TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  certified_by TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  prompt_pay_due_date TEXT,
  discount_date TEXT,
  discount_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  interest_penalty DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- DoD Collections
CREATE TABLE IF NOT EXISTS dod_collections (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  appropriation_id TEXT NOT NULL REFERENCES appropriations(id),
  collection_type TEXT NOT NULL,
  source_entity TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  collection_date TEXT NOT NULL,
  deposit_number TEXT,
  accounting_classification TEXT,
  status TEXT NOT NULL DEFAULT 'recorded',
  created_at TEXT NOT NULL
);

-- USSGL Accounts
CREATE TABLE IF NOT EXISTS ussgl_accounts (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  account_number TEXT NOT NULL,
  account_title TEXT NOT NULL,
  normal_balance TEXT NOT NULL,
  account_type TEXT NOT NULL,
  category TEXT NOT NULL,
  begin_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  end_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  fiscal_year INTEGER NOT NULL
);

-- USSGL Transactions
CREATE TABLE IF NOT EXISTS ussgl_transactions (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  transaction_code TEXT NOT NULL,
  debit_account_id TEXT NOT NULL,
  credit_account_id TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  posting_date TEXT NOT NULL,
  document_number TEXT NOT NULL,
  description TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  proprietary_or_budgetary TEXT NOT NULL
);

-- Budget Object Codes
CREATE TABLE IF NOT EXISTS budget_object_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  sub_category TEXT,
  fiscal_year INTEGER NOT NULL
);

-- SFIS Elements
CREATE TABLE IF NOT EXISTS sfis_elements (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  department_code TEXT NOT NULL,
  main_account_code TEXT NOT NULL,
  sub_account_code TEXT,
  availability_type TEXT,
  begin_period TEXT,
  end_period TEXT,
  fund_type TEXT,
  program_code TEXT,
  project_code TEXT,
  activity_code TEXT
);

-- ADA Violations
CREATE TABLE IF NOT EXISTS ada_violations (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  appropriation_id TEXT REFERENCES appropriations(id),
  violation_type TEXT NOT NULL,
  statutory_basis TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  description TEXT NOT NULL,
  discovered_date TEXT NOT NULL,
  reported_date TEXT,
  responsible_officer TEXT,
  investigation_status TEXT NOT NULL DEFAULT 'detected',
  corrective_action TEXT,
  violation_details TEXT,
  fiscal_year INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- Military Pay Records
CREATE TABLE IF NOT EXISTS military_pay_records (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  member_id TEXT NOT NULL,
  pay_grade TEXT NOT NULL,
  years_of_service INTEGER NOT NULL,
  basic_pay DOUBLE PRECISION NOT NULL,
  bah DOUBLE PRECISION NOT NULL DEFAULT 0,
  bas DOUBLE PRECISION NOT NULL DEFAULT 0,
  special_pays_json TEXT,
  incentive_pays_json TEXT,
  combat_zone_exclusion BOOLEAN NOT NULL DEFAULT FALSE,
  tsp_contribution DOUBLE PRECISION NOT NULL DEFAULT 0,
  tsp_match_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  separation_pay DOUBLE PRECISION NOT NULL DEFAULT 0,
  retirement_pay DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_compensation DOUBLE PRECISION NOT NULL,
  fiscal_year INTEGER NOT NULL,
  pay_period TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

-- Civilian Pay Records
CREATE TABLE IF NOT EXISTS civilian_pay_records (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  employee_id TEXT NOT NULL,
  pay_plan TEXT NOT NULL,
  grade TEXT NOT NULL,
  step INTEGER NOT NULL,
  locality TEXT NOT NULL,
  basic_pay DOUBLE PRECISION NOT NULL,
  locality_adjustment DOUBLE PRECISION NOT NULL DEFAULT 0,
  fehb_contribution DOUBLE PRECISION NOT NULL DEFAULT 0,
  fegli_contribution DOUBLE PRECISION NOT NULL DEFAULT 0,
  retirement_contribution DOUBLE PRECISION NOT NULL DEFAULT 0,
  retirement_plan TEXT NOT NULL,
  tsp_contribution DOUBLE PRECISION NOT NULL DEFAULT 0,
  tsp_match_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  premium_pay DOUBLE PRECISION NOT NULL DEFAULT 0,
  overtime_pay DOUBLE PRECISION NOT NULL DEFAULT 0,
  leave_hours_accrued DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_compensation DOUBLE PRECISION NOT NULL,
  fiscal_year INTEGER NOT NULL,
  pay_period TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

-- Travel Orders
CREATE TABLE IF NOT EXISTS travel_orders (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  traveler_id TEXT NOT NULL,
  order_type TEXT NOT NULL,
  purpose TEXT NOT NULL,
  origin_location TEXT NOT NULL,
  destination_location TEXT NOT NULL,
  depart_date TEXT NOT NULL,
  return_date TEXT NOT NULL,
  authorized_amount DOUBLE PRECISION NOT NULL,
  actual_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  per_diem_rate DOUBLE PRECISION NOT NULL,
  lodging_rate DOUBLE PRECISION NOT NULL,
  mie_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'authorized',
  authorizing_official TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- DoD Travel Vouchers
CREATE TABLE IF NOT EXISTS dod_travel_vouchers (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  travel_order_id TEXT NOT NULL REFERENCES travel_orders(id),
  voucher_number TEXT NOT NULL,
  lodging_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  meals_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  transportation_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  other_costs DOUBLE PRECISION NOT NULL DEFAULT 0,
  advance_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_claim DOUBLE PRECISION NOT NULL,
  approved_amount DOUBLE PRECISION,
  settlement_amount DOUBLE PRECISION,
  travel_card_used BOOLEAN NOT NULL DEFAULT FALSE,
  split_disbursement BOOLEAN NOT NULL DEFAULT FALSE,
  filed_date TEXT NOT NULL,
  settled_date TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Travel Card Transactions
CREATE TABLE IF NOT EXISTS travel_card_transactions (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  traveler_id TEXT NOT NULL,
  transaction_date TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  category TEXT NOT NULL,
  travel_order_id TEXT,
  reconciled_to_voucher BOOLEAN NOT NULL DEFAULT FALSE,
  delinquency_status TEXT NOT NULL DEFAULT 'current'
);

-- DoD Contracts
CREATE TABLE IF NOT EXISTS dod_contracts (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  contract_number TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  total_value DOUBLE PRECISION NOT NULL,
  obligated_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  funded_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  period_of_performance TEXT NOT NULL,
  contracting_officer TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  closeout_date TEXT,
  fiscal_year INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- DoD Contract Payments
CREATE TABLE IF NOT EXISTS dod_contract_payments (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  obligation_id TEXT NOT NULL,
  contract_number TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  vendor_id TEXT NOT NULL,
  invoice_number TEXT,
  invoice_amount DOUBLE PRECISION NOT NULL,
  approved_amount DOUBLE PRECISION NOT NULL,
  retainage_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  progress_payment_pct DOUBLE PRECISION,
  performance_based_pct DOUBLE PRECISION,
  payment_type TEXT NOT NULL,
  dcaa_audit_required BOOLEAN NOT NULL DEFAULT FALSE,
  dcaa_audit_status TEXT,
  certified_by TEXT,
  payment_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);

-- Interagency Agreements
CREATE TABLE IF NOT EXISTS interagency_agreements (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  agreement_number TEXT NOT NULL,
  agreement_type TEXT NOT NULL,
  servicing_agency TEXT NOT NULL,
  requesting_agency TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  advance_received DOUBLE PRECISION NOT NULL DEFAULT 0,
  billed_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  collected_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  obligated_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  period_of_performance TEXT NOT NULL,
  authority TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  fiscal_year INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- Working Capital Funds
CREATE TABLE IF NOT EXISTS working_capital_funds (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  fund_name TEXT NOT NULL,
  fund_type TEXT NOT NULL,
  capitalized_assets DOUBLE PRECISION NOT NULL DEFAULT 0,
  accumulated_depreciation DOUBLE PRECISION NOT NULL DEFAULT 0,
  revenue_from_operations DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost_of_operations DOUBLE PRECISION NOT NULL DEFAULT 0,
  net_operating_result DOUBLE PRECISION NOT NULL DEFAULT 0,
  cash_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  fiscal_year INTEGER NOT NULL
);

-- Special Accounts
CREATE TABLE IF NOT EXISTS special_accounts (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  account_type TEXT NOT NULL,
  account_name TEXT NOT NULL,
  balance DOUBLE PRECISION NOT NULL DEFAULT 0,
  receipts DOUBLE PRECISION NOT NULL DEFAULT 0,
  disbursements_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  transfers_in DOUBLE PRECISION NOT NULL DEFAULT 0,
  transfers_out DOUBLE PRECISION NOT NULL DEFAULT 0,
  fiscal_year INTEGER NOT NULL
);

-- NAF Accounts
CREATE TABLE IF NOT EXISTS naf_accounts (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  account_type TEXT NOT NULL,
  account_name TEXT NOT NULL,
  revenues DOUBLE PRECISION NOT NULL DEFAULT 0,
  expenses DOUBLE PRECISION NOT NULL DEFAULT 0,
  net_income DOUBLE PRECISION NOT NULL DEFAULT 0,
  assets DOUBLE PRECISION NOT NULL DEFAULT 0,
  liabilities DOUBLE PRECISION NOT NULL DEFAULT 0,
  net_assets DOUBLE PRECISION NOT NULL DEFAULT 0,
  fiscal_year INTEGER NOT NULL
);

-- Intragovernmental Transactions
CREATE TABLE IF NOT EXISTS intragovernmental_transactions (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  transaction_type TEXT NOT NULL,
  trading_partner_agency TEXT NOT NULL,
  trading_partner_tas TEXT,
  agreement_number TEXT,
  amount DOUBLE PRECISION NOT NULL,
  buyer_seller_indicator TEXT NOT NULL,
  reconciliation_status TEXT NOT NULL DEFAULT 'pending',
  elimination_required BOOLEAN NOT NULL DEFAULT TRUE,
  period TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- FIAR Assessments
CREATE TABLE IF NOT EXISTS fiar_assessments (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL REFERENCES engagements(id),
  assessment_date TEXT NOT NULL,
  audit_readiness_score DOUBLE PRECISION NOT NULL,
  fund_balance_reconciled BOOLEAN NOT NULL DEFAULT FALSE,
  ussgl_compliant BOOLEAN NOT NULL DEFAULT FALSE,
  sfis_compliant BOOLEAN NOT NULL DEFAULT FALSE,
  internal_controls_assessed BOOLEAN NOT NULL DEFAULT FALSE,
  material_weaknesses_json TEXT,
  notice_of_findings_json TEXT,
  corrective_action_plans_json TEXT,
  conclusion TEXT NOT NULL,
  assessed_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Notifications (PostgreSQL-only)
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  engagement_id TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL
);

-- Job Executions (PostgreSQL-only)
CREATE TABLE IF NOT EXISTS job_executions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  engagement_id TEXT NOT NULL,
  fiscal_year INTEGER,
  parameters_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  result_json TEXT,
  error TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

-- Corrective Action Plans (PostgreSQL-only)
CREATE TABLE IF NOT EXISTS corrective_action_plans (
  id TEXT PRIMARY KEY,
  engagement_id TEXT NOT NULL,
  finding_id TEXT,
  finding_title TEXT NOT NULL,
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  deficiency_description TEXT NOT NULL,
  root_cause TEXT NOT NULL,
  corrective_action TEXT NOT NULL,
  expected_outcome TEXT NOT NULL,
  responsible_party TEXT NOT NULL,
  responsible_org TEXT NOT NULL,
  target_date TEXT NOT NULL,
  revised_target_date TEXT,
  closed_date TEXT,
  closed_by TEXT,
  milestones_json TEXT,
  evidence_json TEXT,
  progress_notes_json TEXT,
  validation_criteria_json TEXT,
  validated_by TEXT,
  validation_date TEXT,
  validation_result TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_findings_engagement ON findings(engagement_id);
CREATE INDEX IF NOT EXISTS idx_findings_framework ON findings(framework);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
`;
