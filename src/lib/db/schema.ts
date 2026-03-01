import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'auditor', 'reviewer', 'viewer'] }).notNull().default('auditor'),
  createdAt: text('created_at').notNull(),
});

export const engagements = sqliteTable('engagements', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  entityName: text('entity_name').notNull(),
  fiscalYearEnd: text('fiscal_year_end').notNull(),
  status: text('status', { enum: ['planning', 'fieldwork', 'review', 'completed', 'archived'] }).notNull().default('planning'),
  materialityThreshold: real('materiality_threshold').notNull().default(0),
  industry: text('industry'),
  entityType: text('entity_type', { enum: ['c_corp', 's_corp', 'partnership', 'llc', 'nonprofit', 'dod_component', 'defense_agency', 'combatant_command', 'working_capital_fund', 'naf_entity'] }),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  classification: text('classification', { enum: ['unclassified', 'cui', 'cui_specified', 'fouo'] }).default('unclassified'),
  archivedAt: text('archived_at'),
  retentionUntil: text('retention_until'),
});

export const engagementMembers = sqliteTable('engagement_members', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  userId: text('user_id').notNull().references(() => users.id),
  role: text('role', { enum: ['lead', 'staff', 'reviewer'] }).notNull().default('staff'),
});

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  accountNumber: text('account_number').notNull(),
  accountName: text('account_name').notNull(),
  accountType: text('account_type', { enum: ['asset', 'liability', 'equity', 'revenue', 'expense'] }).notNull(),
  subType: text('sub_type'),
  beginningBalance: real('beginning_balance').notNull().default(0),
  endingBalance: real('ending_balance').notNull().default(0),
  period: text('period').notNull(),
});

export const trialBalanceEntries = sqliteTable('trial_balance_entries', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  accountId: text('account_id').notNull().references(() => accounts.id),
  debit: real('debit').notNull().default(0),
  credit: real('credit').notNull().default(0),
  period: text('period').notNull(),
  sourceFile: text('source_file').notNull(),
});

export const journalEntries = sqliteTable('journal_entries', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  entryNumber: text('entry_number').notNull(),
  date: text('date').notNull(),
  description: text('description').notNull(),
  postedBy: text('posted_by').notNull(),
  approvedBy: text('approved_by'),
  source: text('source').notNull().default('manual'),
});

export const journalEntryLines = sqliteTable('journal_entry_lines', {
  id: text('id').primaryKey(),
  journalEntryId: text('journal_entry_id').notNull().references(() => journalEntries.id),
  accountId: text('account_id').notNull(),
  accountName: text('account_name'),
  debit: real('debit').notNull().default(0),
  credit: real('credit').notNull().default(0),
  description: text('description'),
});

export const financialStatements = sqliteTable('financial_statements', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  statementType: text('statement_type', { enum: ['BS', 'IS', 'CF'] }).notNull(),
  period: text('period').notNull(),
  dataJson: text('data_json').notNull(),
});

export const taxData = sqliteTable('tax_data', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  formType: text('form_type').notNull(),
  schedule: text('schedule').notNull(),
  lineNumber: text('line_number').notNull(),
  description: text('description').notNull(),
  amount: real('amount').notNull().default(0),
  period: text('period').notNull(),
});

export const findings = sqliteTable('findings', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  ruleId: text('rule_id').notNull(),
  framework: text('framework', { enum: ['GAAP', 'IRS', 'SOX', 'PCAOB', 'DOD_FMR'] }).notNull(),
  severity: text('severity', { enum: ['critical', 'high', 'medium', 'low', 'info'] }).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  citation: text('citation').notNull(),
  remediation: text('remediation').notNull(),
  amountImpact: real('amount_impact'),
  affectedAccounts: text('affected_accounts'),
  status: text('status', { enum: ['open', 'resolved', 'accepted', 'in_review', 'reviewer_approved', 'reviewer_rejected'] }).notNull().default('open'),
  createdAt: text('created_at').notNull(),
});

export const soxControls = sqliteTable('sox_controls', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  controlId: text('control_id').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  controlType: text('control_type', { enum: ['preventive', 'detective'] }).notNull(),
  category: text('category', { enum: ['entity_level', 'transaction', 'itgc', 'disclosure', 'journal_entry'] }).notNull(),
  frequency: text('frequency', { enum: ['continuous', 'daily', 'weekly', 'monthly', 'quarterly', 'annually'] }).notNull(),
  owner: text('owner').notNull().default(''),
  status: text('status', { enum: ['not_tested', 'effective', 'deficient', 'significant_deficiency', 'material_weakness'] }).notNull().default('not_tested'),
  assertion: text('assertion').notNull().default('[]'),
  riskLevel: text('risk_level', { enum: ['high', 'medium', 'low'] }).notNull().default('medium'),
  automatedManual: text('automated_manual', { enum: ['automated', 'manual', 'it_dependent'] }).notNull().default('manual'),
});

export const soxTestResults = sqliteTable('sox_test_results', {
  id: text('id').primaryKey(),
  controlId: text('control_id').notNull().references(() => soxControls.id),
  testDate: text('test_date').notNull(),
  testedBy: text('tested_by').notNull(),
  result: text('result', { enum: ['effective', 'deficient', 'material_weakness'] }).notNull(),
  sampleSize: integer('sample_size').notNull().default(0),
  exceptionsFound: integer('exceptions_found').notNull().default(0),
  evidence: text('evidence').notNull().default(''),
  notes: text('notes').notNull().default(''),
});

export const riskScores = sqliteTable('risk_scores', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  category: text('category').notNull(),
  score: real('score').notNull(),
  factorsJson: text('factors_json').notNull(),
  calculatedAt: text('calculated_at').notNull(),
});

export const uploadedFiles = sqliteTable('uploaded_files', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  dataType: text('data_type', { enum: ['trial_balance', 'journal_entries', 'financial_statements', 'tax_returns', 'other'] }).notNull(),
  recordCount: integer('record_count').notNull().default(0),
  status: text('status', { enum: ['processing', 'completed', 'error'] }).notNull().default('processing'),
  uploadedAt: text('uploaded_at').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
});

// --- Phase 2: Audit Trail & SOX Compliance ---

export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id'),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull(),
  action: text('action', { enum: ['create', 'read', 'update', 'delete', 'analyze', 'export', 'upload', 'login', 'logout'] }).notNull(),
  entityType: text('entity_type', { enum: ['engagement', 'finding', 'control', 'file', 'journal_entry', 'user', 'template', 'schedule', 'signoff', 'workpaper', 'appropriation', 'obligation', 'disbursement', 'ada_violation', 'travel_order', 'contract_payment', 'interagency_agreement'] }).notNull(),
  entityId: text('entity_id'),
  details: text('details'),
  ipAddress: text('ip_address'),
  timestamp: text('timestamp').notNull(),
});

export const findingHistory = sqliteTable('finding_history', {
  id: text('id').primaryKey(),
  findingId: text('finding_id').notNull().references(() => findings.id),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  changedBy: text('changed_by').notNull(),
  fieldChanged: text('field_changed').notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  changedAt: text('changed_at').notNull(),
});

export const reviewComments = sqliteTable('review_comments', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  findingId: text('finding_id').notNull().references(() => findings.id),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull(),
  comment: text('comment').notNull(),
  createdAt: text('created_at').notNull(),
});

export const workpapers = sqliteTable('workpapers', {
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

export const signoffs = sqliteTable('signoffs', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  entityType: text('entity_type', { enum: ['finding', 'control', 'engagement'] }).notNull(),
  entityId: text('entity_id').notNull(),
  signedBy: text('signed_by').notNull(),
  signerName: text('signer_name').notNull(),
  role: text('role').notNull(),
  opinion: text('opinion'),
  signedAt: text('signed_at').notNull(),
});

// --- Phase 3: Workflow & Templates ---

export const workflowTransitions = sqliteTable('workflow_transitions', {
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

export const engagementTemplates = sqliteTable('engagement_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  entityType: text('entity_type'),
  industry: text('industry'),
  defaultMateriality: real('default_materiality').notNull().default(0),
  frameworksJson: text('frameworks_json'),
  soxControlsJson: text('sox_controls_json'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
});

export const schedules = sqliteTable('schedules', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  name: text('name').notNull(),
  cronExpression: text('cron_expression').notNull(),
  frameworksJson: text('frameworks_json').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastRunAt: text('last_run_at'),
  nextRunAt: text('next_run_at'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
});

// --- Phase 4: Enterprise Audit Opinion Features ---

export const samplingPlans = sqliteTable('sampling_plans', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  name: text('name').notNull(),
  populationType: text('population_type', { enum: ['journal_entries', 'accounts_receivable', 'accounts_payable', 'inventory', 'revenue', 'expenses', 'controls', 'custom'] }).notNull(),
  method: text('method', { enum: ['attribute', 'mus', 'stratified', 'systematic', 'random'] }).notNull(),
  confidenceLevel: real('confidence_level').notNull().default(0.95),
  tolerableRate: real('tolerable_rate'),
  expectedDeviationRate: real('expected_deviation_rate'),
  tolerableMisstatement: real('tolerable_misstatement'),
  expectedMisstatement: real('expected_misstatement'),
  populationSize: integer('population_size').notNull().default(0),
  populationValue: real('population_value'),
  calculatedSampleSize: integer('calculated_sample_size').notNull().default(0),
  selectedItemsJson: text('selected_items_json'),
  exceptionsFound: integer('exceptions_found').notNull().default(0),
  projectedMisstatement: real('projected_misstatement'),
  upperMisstatementLimit: real('upper_misstatement_limit'),
  conclusion: text('conclusion', { enum: ['pending', 'supports_reliance', 'does_not_support', 'inconclusive'] }).notNull().default('pending'),
  conclusionNotes: text('conclusion_notes'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
});

export const auditAdjustments = sqliteTable('audit_adjustments', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  adjustmentNumber: text('adjustment_number').notNull(),
  type: text('type', { enum: ['proposed', 'recorded', 'passed'] }).notNull(),
  category: text('category', { enum: ['factual', 'judgmental', 'projected'] }).notNull().default('factual'),
  description: text('description').notNull(),
  debitAccountId: text('debit_account_id'),
  debitAccountName: text('debit_account_name').notNull(),
  creditAccountId: text('credit_account_id'),
  creditAccountName: text('credit_account_name').notNull(),
  amount: real('amount').notNull(),
  findingId: text('finding_id'),
  effectOnIncome: real('effect_on_income').notNull().default(0),
  effectOnAssets: real('effect_on_assets').notNull().default(0),
  effectOnLiabilities: real('effect_on_liabilities').notNull().default(0),
  effectOnEquity: real('effect_on_equity').notNull().default(0),
  proposedBy: text('proposed_by').notNull(),
  approvedBy: text('approved_by'),
  status: text('status', { enum: ['draft', 'proposed', 'accepted', 'rejected', 'waived'] }).notNull().default('draft'),
  createdAt: text('created_at').notNull(),
});

export const assertionCoverage = sqliteTable('assertion_coverage', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  accountId: text('account_id'),
  accountName: text('account_name').notNull(),
  accountType: text('account_type').notNull(),
  assertion: text('assertion', { enum: ['existence', 'completeness', 'valuation', 'rights_obligations', 'presentation_disclosure', 'accuracy', 'cutoff', 'classification'] }).notNull(),
  procedureType: text('procedure_type', { enum: ['substantive_detail', 'substantive_analytical', 'test_of_controls', 'confirmation', 'observation', 'inspection', 'recalculation', 'inquiry'] }).notNull(),
  procedureDescription: text('procedure_description').notNull(),
  evidenceReference: text('evidence_reference'),
  coveredBy: text('covered_by').notNull(),
  status: text('status', { enum: ['planned', 'in_progress', 'completed', 'not_applicable'] }).notNull().default('planned'),
  conclusion: text('conclusion'),
  completedAt: text('completed_at'),
});

export const goingConcernAssessments = sqliteTable('going_concern_assessments', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  assessmentDate: text('assessment_date').notNull(),
  quantitativeIndicatorsJson: text('quantitative_indicators_json').notNull(),
  qualitativeIndicatorsJson: text('qualitative_indicators_json'),
  cashFlowProjectionJson: text('cash_flow_projection_json'),
  managementPlanJson: text('management_plan_json'),
  mitigatingFactorsJson: text('mitigating_factors_json'),
  conclusion: text('conclusion', { enum: ['no_substantial_doubt', 'substantial_doubt_mitigated', 'substantial_doubt_exists'] }).notNull(),
  opinionImpact: text('opinion_impact', { enum: ['none', 'emphasis_of_matter', 'qualified', 'adverse'] }).notNull(),
  disclosureAdequate: integer('disclosure_adequate', { mode: 'boolean' }).notNull().default(true),
  assessedBy: text('assessed_by').notNull(),
  reviewedBy: text('reviewed_by'),
  notes: text('notes'),
});

export const scopeLimitations = sqliteTable('scope_limitations', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  description: text('description').notNull(),
  accountsAffected: text('accounts_affected').notNull(),
  estimatedImpact: real('estimated_impact'),
  pervasive: integer('pervasive', { mode: 'boolean' }).notNull().default(false),
  imposedBy: text('imposed_by', { enum: ['client', 'circumstance'] }).notNull(),
  resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
  resolutionNotes: text('resolution_notes'),
  identifiedBy: text('identified_by').notNull(),
  identifiedAt: text('identified_at').notNull(),
});

export const completionChecklist = sqliteTable('completion_checklist', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  itemKey: text('item_key').notNull(),
  category: text('category', { enum: ['planning', 'fieldwork', 'review', 'reporting', 'quality', 'documentation'] }).notNull(),
  description: text('description').notNull(),
  autoCheck: integer('auto_check', { mode: 'boolean' }).notNull().default(false),
  autoCheckResult: integer('auto_check_result', { mode: 'boolean' }),
  status: text('status', { enum: ['not_started', 'in_progress', 'completed', 'not_applicable'] }).notNull().default('not_started'),
  completedBy: text('completed_by'),
  completedAt: text('completed_at'),
  notes: text('notes'),
  required: integer('required', { mode: 'boolean' }).notNull().default(true),
});

export const independenceConfirmations = sqliteTable('independence_confirmations', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  userId: text('user_id').notNull().references(() => users.id),
  userName: text('user_name').notNull(),
  confirmationType: text('confirmation_type', { enum: ['engagement_level', 'annual', 'specific_matter'] }).notNull(),
  confirmed: integer('confirmed', { mode: 'boolean' }).notNull().default(false),
  threatsIdentified: text('threats_identified'),
  safeguardsApplied: text('safeguards_applied'),
  nonAuditServices: text('non_audit_services'),
  feeArrangement: text('fee_arrangement'),
  confirmedAt: text('confirmed_at'),
});

export const relatedParties = sqliteTable('related_parties', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  partyName: text('party_name').notNull(),
  relationship: text('relationship', { enum: ['parent', 'subsidiary', 'affiliate', 'key_management', 'close_family', 'joint_venture', 'significant_investor', 'other'] }).notNull(),
  ownershipPct: real('ownership_pct'),
  controlIndicators: text('control_indicators'),
  identifiedBy: text('identified_by').notNull(),
  identifiedAt: text('identified_at').notNull(),
});

export const relatedPartyTransactions = sqliteTable('related_party_transactions', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  relatedPartyId: text('related_party_id').notNull().references(() => relatedParties.id),
  transactionType: text('transaction_type').notNull(),
  description: text('description').notNull(),
  amount: real('amount').notNull(),
  terms: text('terms'),
  businessPurpose: text('business_purpose'),
  armLengthAssessment: text('arm_length_assessment', { enum: ['comparable', 'not_comparable', 'not_assessed'] }).notNull().default('not_assessed'),
  disclosed: integer('disclosed', { mode: 'boolean' }).notNull().default(false),
  journalEntryIds: text('journal_entry_ids'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: text('reviewed_at'),
});

export const subsequentEvents = sqliteTable('subsequent_events', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  eventDescription: text('event_description').notNull(),
  eventDate: text('event_date').notNull(),
  eventType: text('event_type', { enum: ['type_1_adjusting', 'type_2_non_adjusting'] }).notNull(),
  procedurePerformed: text('procedure_performed').notNull(),
  conclusion: text('conclusion').notNull(),
  adjustmentRequired: integer('adjustment_required', { mode: 'boolean' }).notNull().default(false),
  disclosureRequired: integer('disclosure_required', { mode: 'boolean' }).notNull().default(false),
  adjustmentAmount: real('adjustment_amount'),
  identifiedBy: text('identified_by').notNull(),
  identifiedAt: text('identified_at').notNull(),
  reviewedBy: text('reviewed_by'),
});

// --- Phase 5: Enterprise Tax Compliance ---

export const taxParametersTable = sqliteTable('tax_parameters', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  taxYear: integer('tax_year').notNull(),
  value: real('value').notNull(),
  valueType: text('value_type', { enum: ['currency', 'percentage', 'integer', 'boolean'] }).notNull(),
  entityTypes: text('entity_types').notNull().default('all'),
  citation: text('citation').notNull(),
  legislationId: text('legislation_id'),
  effectiveDate: text('effective_date'),
  sunsetDate: text('sunset_date'),
  notes: text('notes'),
  updatedAt: text('updated_at').notNull(),
  updatedBy: text('updated_by').notNull(),
});

export const legislationTable = sqliteTable('legislation', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  shortName: text('short_name').notNull(),
  publicLaw: text('public_law'),
  enactedDate: text('enacted_date').notNull(),
  effectiveDate: text('effective_date').notNull(),
  sunsetDate: text('sunset_date'),
  status: text('status', { enum: ['active', 'partially_sunset', 'fully_sunset', 'superseded'] }).notNull(),
  affectedSections: text('affected_sections').notNull(),
  summary: text('summary').notNull(),
  createdAt: text('created_at').notNull(),
});

export const legislationRuleLinksTable = sqliteTable('legislation_rule_links', {
  id: text('id').primaryKey(),
  legislationId: text('legislation_id').notNull().references(() => legislationTable.id),
  ruleId: text('rule_id').notNull(),
  parameterCode: text('parameter_code'),
  impactDescription: text('impact_description').notNull(),
});

export const uncertainTaxPositions = sqliteTable('uncertain_tax_positions', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  positionDescription: text('position_description').notNull(),
  ircSection: text('irc_section').notNull(),
  taxYear: integer('tax_year').notNull(),
  grossAmount: real('gross_amount').notNull(),
  recognitionThresholdMet: integer('recognition_threshold_met', { mode: 'boolean' }).notNull().default(false),
  technicalMeritsRating: text('technical_merits_rating', { enum: ['strong', 'probable', 'more_likely_than_not', 'less_likely', 'unlikely'] }),
  measurementAmount: real('measurement_amount'),
  interestAccrual: real('interest_accrual').notNull().default(0),
  penaltyAccrual: real('penalty_accrual').notNull().default(0),
  totalReserve: real('total_reserve').notNull().default(0),
  status: text('status', { enum: ['identified', 'analyzed', 'reserved', 'settled', 'lapsed'] }).notNull().default('identified'),
  expirationDate: text('expiration_date'),
  supportingDocumentation: text('supporting_documentation'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  reviewedBy: text('reviewed_by'),
  reviewedAt: text('reviewed_at'),
});

// --- DoD FMR: Federal Financial Management (Volumes 1-15) ---

export const appropriations = sqliteTable('appropriations', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  treasuryAccountSymbol: text('treasury_account_symbol').notNull(),
  appropriationType: text('appropriation_type', {
    enum: ['one_year', 'multi_year', 'no_year', 'revolving', 'trust', 'special', 'naf'],
  }).notNull(),
  appropriationTitle: text('appropriation_title').notNull(),
  budgetCategory: text('budget_category', {
    enum: ['milpers', 'om', 'procurement', 'rdte', 'milcon', 'family_housing', 'brac', 'working_capital', 'naf', 'other'],
  }).notNull(),
  fiscalYearStart: text('fiscal_year_start').notNull(),
  fiscalYearEnd: text('fiscal_year_end').notNull(),
  expirationDate: text('expiration_date'),
  cancellationDate: text('cancellation_date'),
  totalAuthority: real('total_authority').notNull().default(0),
  apportioned: real('apportioned').notNull().default(0),
  allotted: real('allotted').notNull().default(0),
  committed: real('committed').notNull().default(0),
  obligated: real('obligated').notNull().default(0),
  disbursed: real('disbursed').notNull().default(0),
  unobligatedBalance: real('unobligated_balance').notNull().default(0),
  status: text('status', { enum: ['current', 'expired', 'cancelled'] }).notNull().default('current'),
  sfisDataJson: text('sfis_data_json'),
  createdAt: text('created_at').notNull(),
});

export const fundControls = sqliteTable('fund_controls', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  appropriationId: text('appropriation_id').notNull().references(() => appropriations.id),
  controlLevel: text('control_level', {
    enum: ['apportionment', 'allotment', 'sub_allotment', 'operating_budget'],
  }).notNull(),
  amount: real('amount').notNull().default(0),
  obligatedAgainst: real('obligated_against').notNull().default(0),
  expendedAgainst: real('expended_against').notNull().default(0),
  availableBalance: real('available_balance').notNull().default(0),
  controlledBy: text('controlled_by').notNull(),
  effectiveDate: text('effective_date').notNull(),
  expirationDate: text('expiration_date'),
});

export const dodObligations = sqliteTable('dod_obligations', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  appropriationId: text('appropriation_id').notNull().references(() => appropriations.id),
  obligationNumber: text('obligation_number').notNull(),
  documentType: text('document_type', {
    enum: ['contract', 'purchase_order', 'travel_order', 'payroll', 'grant', 'iaa', 'misc'],
  }).notNull(),
  vendorOrPayee: text('vendor_or_payee'),
  amount: real('amount').notNull(),
  obligatedDate: text('obligated_date').notNull(),
  liquidatedAmount: real('liquidated_amount').notNull().default(0),
  unliquidatedBalance: real('unliquidated_balance').notNull().default(0),
  adjustmentAmount: real('adjustment_amount').notNull().default(0),
  status: text('status', {
    enum: ['open', 'partially_liquidated', 'fully_liquidated', 'deobligated', 'adjusted'],
  }).notNull().default('open'),
  bonafideNeedDate: text('bonafide_need_date'),
  fiscalYear: integer('fiscal_year').notNull(),
  budgetObjectCode: text('budget_object_code').notNull(),
  budgetActivityCode: text('budget_activity_code'),
  programElement: text('program_element'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
});

export const dodDisbursements = sqliteTable('dod_disbursements', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  obligationId: text('obligation_id').notNull().references(() => dodObligations.id),
  disbursementNumber: text('disbursement_number').notNull(),
  voucherNumber: text('voucher_number'),
  payeeId: text('payee_id'),
  amount: real('amount').notNull(),
  disbursementDate: text('disbursement_date').notNull(),
  paymentMethod: text('payment_method', {
    enum: ['eft', 'check', 'intra_gov', 'treasury_offset', 'cash'],
  }).notNull(),
  certifiedBy: text('certified_by'),
  status: text('status', {
    enum: ['pending', 'certified', 'released', 'cancelled', 'returned'],
  }).notNull().default('pending'),
  promptPayDueDate: text('prompt_pay_due_date'),
  discountDate: text('discount_date'),
  discountAmount: real('discount_amount').notNull().default(0),
  interestPenalty: real('interest_penalty').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const dodCollections = sqliteTable('dod_collections', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  appropriationId: text('appropriation_id').notNull().references(() => appropriations.id),
  collectionType: text('collection_type', {
    enum: ['reimbursement', 'refund', 'recovery', 'sale_proceeds', 'fee', 'deposit'],
  }).notNull(),
  sourceEntity: text('source_entity').notNull(),
  amount: real('amount').notNull(),
  collectionDate: text('collection_date').notNull(),
  depositNumber: text('deposit_number'),
  accountingClassification: text('accounting_classification'),
  status: text('status').notNull().default('recorded'),
  createdAt: text('created_at').notNull(),
});

export const ussglAccounts = sqliteTable('ussgl_accounts', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  accountNumber: text('account_number').notNull(),
  accountTitle: text('account_title').notNull(),
  normalBalance: text('normal_balance', { enum: ['debit', 'credit'] }).notNull(),
  accountType: text('account_type', { enum: ['proprietary', 'budgetary'] }).notNull(),
  category: text('category', {
    enum: ['asset', 'liability', 'net_position', 'revenue', 'expense', 'budgetary_resource', 'status_of_resources'],
  }).notNull(),
  beginBalance: real('begin_balance').notNull().default(0),
  endBalance: real('end_balance').notNull().default(0),
  fiscalYear: integer('fiscal_year').notNull(),
});

export const ussglTransactions = sqliteTable('ussgl_transactions', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  transactionCode: text('transaction_code').notNull(),
  debitAccountId: text('debit_account_id').notNull(),
  creditAccountId: text('credit_account_id').notNull(),
  amount: real('amount').notNull(),
  postingDate: text('posting_date').notNull(),
  documentNumber: text('document_number').notNull(),
  description: text('description').notNull(),
  fiscalYear: integer('fiscal_year').notNull(),
  proprietaryOrBudgetary: text('proprietary_or_budgetary', {
    enum: ['proprietary', 'budgetary', 'both'],
  }).notNull(),
});

export const budgetObjectCodes = sqliteTable('budget_object_codes', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  title: text('title').notNull(),
  category: text('category', {
    enum: ['personnel', 'contractual_services', 'supplies', 'equipment', 'grants', 'other'],
  }).notNull(),
  subCategory: text('sub_category'),
  fiscalYear: integer('fiscal_year').notNull(),
});

export const sfisElements = sqliteTable('sfis_elements', {
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

export const adaViolations = sqliteTable('ada_violations', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  appropriationId: text('appropriation_id').references(() => appropriations.id),
  violationType: text('violation_type', {
    enum: ['over_obligation', 'over_expenditure', 'unauthorized_purpose', 'advance_without_authority', 'voluntary_service', 'time_violation'],
  }).notNull(),
  statutoryBasis: text('statutory_basis').notNull(),
  amount: real('amount').notNull(),
  description: text('description').notNull(),
  discoveredDate: text('discovered_date').notNull(),
  reportedDate: text('reported_date'),
  responsibleOfficer: text('responsible_officer'),
  investigationStatus: text('investigation_status', {
    enum: ['detected', 'under_investigation', 'confirmed', 'reported_to_president', 'resolved'],
  }).notNull().default('detected'),
  correctiveAction: text('corrective_action'),
  violationDetails: text('violation_details'),
  fiscalYear: integer('fiscal_year').notNull(),
  createdAt: text('created_at').notNull(),
});

export const militaryPayRecords = sqliteTable('military_pay_records', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  memberId: text('member_id').notNull(),
  payGrade: text('pay_grade').notNull(),
  yearsOfService: integer('years_of_service').notNull(),
  basicPay: real('basic_pay').notNull(),
  bah: real('bah').notNull().default(0),
  bas: real('bas').notNull().default(0),
  specialPaysJson: text('special_pays_json'),
  incentivePaysJson: text('incentive_pays_json'),
  combatZoneExclusion: integer('combat_zone_exclusion', { mode: 'boolean' }).notNull().default(false),
  tspContribution: real('tsp_contribution').notNull().default(0),
  tspMatchAmount: real('tsp_match_amount').notNull().default(0),
  separationPay: real('separation_pay').notNull().default(0),
  retirementPay: real('retirement_pay').notNull().default(0),
  totalCompensation: real('total_compensation').notNull(),
  fiscalYear: integer('fiscal_year').notNull(),
  payPeriod: text('pay_period').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
});

export const civilianPayRecords = sqliteTable('civilian_pay_records', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  employeeId: text('employee_id').notNull(),
  payPlan: text('pay_plan').notNull(),
  grade: text('grade').notNull(),
  step: integer('step').notNull(),
  locality: text('locality').notNull(),
  basicPay: real('basic_pay').notNull(),
  localityAdjustment: real('locality_adjustment').notNull().default(0),
  fehbContribution: real('fehb_contribution').notNull().default(0),
  fegliContribution: real('fegli_contribution').notNull().default(0),
  retirementContribution: real('retirement_contribution').notNull().default(0),
  retirementPlan: text('retirement_plan', { enum: ['fers', 'csrs', 'fers_revised'] }).notNull(),
  tspContribution: real('tsp_contribution').notNull().default(0),
  tspMatchAmount: real('tsp_match_amount').notNull().default(0),
  premiumPay: real('premium_pay').notNull().default(0),
  overtimePay: real('overtime_pay').notNull().default(0),
  leaveHoursAccrued: real('leave_hours_accrued').notNull().default(0),
  totalCompensation: real('total_compensation').notNull(),
  fiscalYear: integer('fiscal_year').notNull(),
  payPeriod: text('pay_period').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: text('created_at').notNull(),
});

export const travelOrders = sqliteTable('travel_orders', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  travelerId: text('traveler_id').notNull(),
  orderType: text('order_type', { enum: ['tdy', 'pcs', 'local', 'emergency_leave'] }).notNull(),
  purpose: text('purpose').notNull(),
  originLocation: text('origin_location').notNull(),
  destinationLocation: text('destination_location').notNull(),
  departDate: text('depart_date').notNull(),
  returnDate: text('return_date').notNull(),
  authorizedAmount: real('authorized_amount').notNull(),
  actualAmount: real('actual_amount').notNull().default(0),
  perDiemRate: real('per_diem_rate').notNull(),
  lodgingRate: real('lodging_rate').notNull(),
  mieRate: real('mie_rate').notNull().default(0),
  status: text('status', {
    enum: ['authorized', 'in_progress', 'completed', 'voucher_filed', 'settled'],
  }).notNull().default('authorized'),
  authorizingOfficial: text('authorizing_official').notNull(),
  fiscalYear: integer('fiscal_year').notNull(),
  createdAt: text('created_at').notNull(),
});

export const dodTravelVouchers = sqliteTable('dod_travel_vouchers', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  travelOrderId: text('travel_order_id').notNull().references(() => travelOrders.id),
  voucherNumber: text('voucher_number').notNull(),
  lodgingCost: real('lodging_cost').notNull().default(0),
  mealsCost: real('meals_cost').notNull().default(0),
  transportationCost: real('transportation_cost').notNull().default(0),
  otherCosts: real('other_costs').notNull().default(0),
  advanceAmount: real('advance_amount').notNull().default(0),
  totalClaim: real('total_claim').notNull(),
  approvedAmount: real('approved_amount'),
  settlementAmount: real('settlement_amount'),
  travelCardUsed: integer('travel_card_used', { mode: 'boolean' }).notNull().default(false),
  splitDisbursement: integer('split_disbursement', { mode: 'boolean' }).notNull().default(false),
  filedDate: text('filed_date').notNull(),
  settledDate: text('settled_date'),
  status: text('status', { enum: ['submitted', 'approved', 'paid', 'disputed', 'rejected'] }).notNull(),
  createdAt: text('created_at').notNull(),
});

export const travelCardTransactions = sqliteTable('travel_card_transactions', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  travelerId: text('traveler_id').notNull(),
  transactionDate: text('transaction_date').notNull(),
  merchantName: text('merchant_name').notNull(),
  amount: real('amount').notNull(),
  category: text('category').notNull(),
  travelOrderId: text('travel_order_id'),
  reconciledToVoucher: integer('reconciled_to_voucher', { mode: 'boolean' }).notNull().default(false),
  delinquencyStatus: text('delinquency_status', {
    enum: ['current', '30_day', '60_day', '90_plus', 'charge_off'],
  }).notNull().default('current'),
});

export const dodContracts = sqliteTable('dod_contracts', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  contractNumber: text('contract_number').notNull(),
  contractType: text('contract_type', {
    enum: ['firm_fixed_price', 'cost_plus', 'time_and_materials', 'cost_reimbursement', 'idiq', 'bpa', 'other'],
  }).notNull(),
  vendorName: text('vendor_name').notNull(),
  totalValue: real('total_value').notNull(),
  obligatedAmount: real('obligated_amount').notNull().default(0),
  fundedAmount: real('funded_amount').notNull().default(0),
  periodOfPerformance: text('period_of_performance').notNull(),
  contractingOfficer: text('contracting_officer').notNull(),
  status: text('status', { enum: ['active', 'completed', 'terminated', 'closeout'] }).notNull().default('active'),
  closeoutDate: text('closeout_date'),
  fiscalYear: integer('fiscal_year').notNull(),
  createdAt: text('created_at').notNull(),
});

export const dodContractPayments = sqliteTable('dod_contract_payments', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  obligationId: text('obligation_id').notNull(),
  contractNumber: text('contract_number').notNull(),
  contractType: text('contract_type', {
    enum: ['firm_fixed_price', 'cost_plus', 'time_and_materials', 'cost_reimbursement', 'idiq', 'bpa', 'other'],
  }).notNull(),
  vendorId: text('vendor_id').notNull(),
  invoiceNumber: text('invoice_number'),
  invoiceAmount: real('invoice_amount').notNull(),
  approvedAmount: real('approved_amount').notNull(),
  retainageAmount: real('retainage_amount').notNull().default(0),
  progressPaymentPct: real('progress_payment_pct'),
  performanceBasedPct: real('performance_based_pct'),
  paymentType: text('payment_type', {
    enum: ['progress', 'performance_based', 'final', 'partial', 'advance', 'invoice'],
  }).notNull(),
  dcaaAuditRequired: integer('dcaa_audit_required', { mode: 'boolean' }).notNull().default(false),
  dcaaAuditStatus: text('dcaa_audit_status', {
    enum: ['not_required', 'pending', 'in_progress', 'completed', 'exception'],
  }),
  certifiedBy: text('certified_by'),
  paymentDate: text('payment_date').notNull(),
  status: text('status', { enum: ['pending', 'approved', 'paid', 'disputed', 'held'] }).notNull().default('pending'),
  createdAt: text('created_at').notNull(),
});

export const interagencyAgreements = sqliteTable('interagency_agreements', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  agreementNumber: text('agreement_number').notNull(),
  agreementType: text('agreement_type', {
    enum: ['economy_act', 'non_economy_act', 'franchise_fund'],
  }).notNull(),
  servicingAgency: text('servicing_agency').notNull(),
  requestingAgency: text('requesting_agency').notNull(),
  amount: real('amount').notNull(),
  advanceReceived: real('advance_received').notNull().default(0),
  billedAmount: real('billed_amount').notNull().default(0),
  collectedAmount: real('collected_amount').notNull().default(0),
  obligatedAmount: real('obligated_amount').notNull().default(0),
  periodOfPerformance: text('period_of_performance').notNull(),
  authority: text('authority').notNull(),
  status: text('status', { enum: ['pending', 'active', 'completed', 'closeout'] }).notNull().default('pending'),
  fiscalYear: integer('fiscal_year').notNull(),
  createdAt: text('created_at').notNull(),
});

export const workingCapitalFunds = sqliteTable('working_capital_funds', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  fundName: text('fund_name').notNull(),
  fundType: text('fund_type', { enum: ['supply', 'depot_maintenance', 'industrial', 'other'] }).notNull(),
  capitalizedAssets: real('capitalized_assets').notNull().default(0),
  accumulatedDepreciation: real('accumulated_depreciation').notNull().default(0),
  revenueFromOperations: real('revenue_from_operations').notNull().default(0),
  costOfOperations: real('cost_of_operations').notNull().default(0),
  netOperatingResult: real('net_operating_result').notNull().default(0),
  cashBalance: real('cash_balance').notNull().default(0),
  fiscalYear: integer('fiscal_year').notNull(),
});

export const specialAccountsTable = sqliteTable('special_accounts', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  accountType: text('account_type', {
    enum: ['fms_trust', 'environmental_restoration', 'homeowners_assistance', 'other'],
  }).notNull(),
  accountName: text('account_name').notNull(),
  balance: real('balance').notNull().default(0),
  receipts: real('receipts').notNull().default(0),
  disbursementsAmount: real('disbursements_amount').notNull().default(0),
  transfersIn: real('transfers_in').notNull().default(0),
  transfersOut: real('transfers_out').notNull().default(0),
  fiscalYear: integer('fiscal_year').notNull(),
});

export const nafAccounts = sqliteTable('naf_accounts', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  accountType: text('account_type', {
    enum: ['mwr_category_a', 'mwr_category_b', 'mwr_category_c', 'lodging', 'other'],
  }).notNull(),
  accountName: text('account_name').notNull(),
  revenues: real('revenues').notNull().default(0),
  expenses: real('expenses').notNull().default(0),
  netIncome: real('net_income').notNull().default(0),
  assets: real('assets').notNull().default(0),
  liabilities: real('liabilities').notNull().default(0),
  netAssets: real('net_assets').notNull().default(0),
  fiscalYear: integer('fiscal_year').notNull(),
});

export const intragovernmentalTransactions = sqliteTable('intragovernmental_transactions', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  transactionType: text('transaction_type', {
    enum: ['reimbursable', 'transfer', 'allocation', 'economy_act', 'interagency_agreement'],
  }).notNull(),
  tradingPartnerAgency: text('trading_partner_agency').notNull(),
  tradingPartnerTas: text('trading_partner_tas'),
  agreementNumber: text('agreement_number'),
  amount: real('amount').notNull(),
  buyerSellerIndicator: text('buyer_seller_indicator', { enum: ['buyer', 'seller'] }).notNull(),
  reconciliationStatus: text('reconciliation_status', {
    enum: ['matched', 'unmatched', 'in_dispute', 'pending'],
  }).notNull().default('pending'),
  eliminationRequired: integer('elimination_required', { mode: 'boolean' }).notNull().default(true),
  period: text('period').notNull(),
  createdAt: text('created_at').notNull(),
});

export const fiarAssessments = sqliteTable('fiar_assessments', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  assessmentDate: text('assessment_date').notNull(),
  auditReadinessScore: real('audit_readiness_score').notNull(),
  fundBalanceReconciled: integer('fund_balance_reconciled', { mode: 'boolean' }).notNull().default(false),
  ussglCompliant: integer('ussgl_compliant', { mode: 'boolean' }).notNull().default(false),
  sfisCompliant: integer('sfis_compliant', { mode: 'boolean' }).notNull().default(false),
  internalControlsAssessed: integer('internal_controls_assessed', { mode: 'boolean' }).notNull().default(false),
  materialWeaknessesJson: text('material_weaknesses_json'),
  noticeOfFindingsJson: text('notice_of_findings_json'),
  correctiveActionPlansJson: text('corrective_action_plans_json'),
  conclusion: text('conclusion', {
    enum: ['audit_ready', 'substantially_ready', 'not_ready', 'modified'],
  }).notNull(),
  assessedBy: text('assessed_by').notNull(),
  createdAt: text('created_at').notNull(),
});

// --- Reprogramming Actions (DD-1414) ---

export const reprogrammingActions = sqliteTable('reprogramming_actions', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  reprogrammingType: text('reprogramming_type', {
    enum: ['below_threshold', 'above_threshold', 'reprogramming', 'transfer', 'realignment'],
  }).notNull(),
  fromAppropriationId: text('from_appropriation_id').notNull(),
  toAppropriationId: text('to_appropriation_id').notNull(),
  amount: real('amount').notNull(),
  justification: text('justification').notNull(),
  status: text('status', {
    enum: ['draft', 'pending_approval', 'approved', 'rejected', 'executed', 'congressional_notification'],
  }).notNull().default('draft'),
  congressionalNotificationRequired: integer('congressional_notification_required', { mode: 'boolean' }).notNull().default(false),
  approvedBy: text('approved_by'),
  approvedAt: text('approved_at'),
  executedAt: text('executed_at'),
  fiscalYear: integer('fiscal_year').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
});

// --- Rule Version History ---

export const ruleVersions = sqliteTable('rule_versions', {
  id: text('id').primaryKey(),
  ruleId: text('rule_id').notNull(),
  version: integer('version').notNull(),
  contentJson: text('content_json').notNull(),
  effectiveDate: text('effective_date').notNull(),
  sunsetDate: text('sunset_date'),
  changedBy: text('changed_by').notNull(),
  changeReason: text('change_reason').notNull(),
  legislationId: text('legislation_id'),
  createdAt: text('created_at').notNull(),
});

// --- Approval Workflow ---

export const approvalChains = sqliteTable('approval_chains', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  entityType: text('entity_type', {
    enum: ['disbursement', 'ada_violation', 'reprogramming', 'debt_writeoff', 'report', 'obligation'],
  }).notNull(),
  entityId: text('entity_id').notNull(),
  currentStepIndex: integer('current_step_index').notNull().default(0),
  overallStatus: text('overall_status', {
    enum: ['pending', 'approved', 'rejected', 'escalated', 'expired'],
  }).notNull().default('pending'),
  initiatedBy: text('initiated_by').notNull(),
  initiatedAt: text('initiated_at').notNull(),
  completedAt: text('completed_at'),
});

export const approvalSteps = sqliteTable('approval_steps', {
  id: text('id').primaryKey(),
  chainId: text('chain_id').notNull().references(() => approvalChains.id),
  stepIndex: integer('step_index').notNull(),
  requiredRole: text('required_role').notNull(),
  assignedTo: text('assigned_to'),
  status: text('status', {
    enum: ['pending', 'approved', 'rejected', 'escalated', 'expired'],
  }).notNull().default('pending'),
  decision: text('decision', { enum: ['approve', 'reject'] }),
  comment: text('comment'),
  decidedAt: text('decided_at'),
  dueDate: text('due_date'),
});

// ============================================================
// Phase 7: Enterprise Feature Database Tables
// ============================================================

// --- Rule Version Registry (Phase 1.1) ---

export const ruleVersionsTable = sqliteTable('rule_versions', {
  id: text('id').primaryKey(),
  ruleId: text('rule_id').notNull(),
  version: integer('version').notNull(),
  contentJson: text('content_json').notNull(),
  effectiveDate: text('effective_date').notNull(),
  sunsetDate: text('sunset_date'),
  changedBy: text('changed_by').notNull(),
  changeReason: text('change_reason').notNull(),
  legislationId: text('legislation_id'),
  createdAt: text('created_at').notNull(),
});

// --- Legislative Changes (Phase 1.2) ---

export const legislativeChanges = sqliteTable('legislative_changes', {
  id: text('id').primaryKey(),
  ndaaFiscalYear: integer('ndaa_fiscal_year').notNull(),
  publicLawNumber: text('public_law_number').notNull(),
  sectionNumber: text('section_number').notNull(),
  sectionTitle: text('section_title').notNull(),
  description: text('description').notNull(),
  affectedFMRVolumes: text('affected_fmr_volumes').notNull(), // JSON array
  affectedParameterCodes: text('affected_parameter_codes').notNull(), // JSON array
  affectedRuleIds: text('affected_rule_ids').notNull(), // JSON array
  effectiveDate: text('effective_date').notNull(),
  ingestedAt: text('ingested_at'),
  ingestedBy: text('ingested_by'),
});

// --- Fiscal Year Rollovers (Phase 1.3) ---

export const fiscalYearRollovers = sqliteTable('fiscal_year_rollovers', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  closingFiscalYear: integer('closing_fiscal_year').notNull(),
  openingFiscalYear: integer('opening_fiscal_year').notNull(),
  rolloverDate: text('rollover_date').notNull(),
  performedBy: text('performed_by').notNull(),
  totalClosingEntries: integer('total_closing_entries').notNull(),
  totalAppropriationsExpired: integer('total_appropriations_expired').notNull(),
  totalAppropriationsCancelled: integer('total_appropriations_cancelled').notNull(),
  totalULOCarryForward: real('total_ulo_carry_forward').notNull(),
  totalCancelledBalances: real('total_cancelled_balances').notNull(),
  resultJson: text('result_json').notNull(), // Full rollover result
  createdAt: text('created_at').notNull(),
});

// --- FMS Cases (Phase 2.2 — Security Cooperation) ---

export const fmsCases = sqliteTable('fms_cases', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  caseId: text('case_id').notNull(),
  country: text('country').notNull(),
  caseType: text('case_type', {
    enum: ['direct_commercial_sale', 'fms_case', 'building_partner_capacity'],
  }).notNull(),
  status: text('status', {
    enum: ['draft', 'loa_offered', 'loa_accepted', 'implementing', 'delivery', 'billing', 'collection', 'closeout'],
  }).notNull().default('draft'),
  totalValue: real('total_value').notNull(),
  deliveredValue: real('delivered_value').notNull().default(0),
  billedAmount: real('billed_amount').notNull().default(0),
  collectedAmount: real('collected_amount').notNull().default(0),
  implementingAgency: text('implementing_agency').notNull(),
  loaDate: text('loa_date'),
  closureDate: text('closure_date'),
  fiscalYear: integer('fiscal_year').notNull(),
  createdAt: text('created_at').notNull(),
});

// --- Lease Amortization Schedules (Phase 2.1) ---

export const leaseAmortizationSchedules = sqliteTable('lease_amortization_schedules', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  leaseId: text('lease_id').notNull(),
  periodNumber: integer('period_number').notNull(),
  periodDate: text('period_date').notNull(),
  beginningBalance: real('beginning_balance').notNull(),
  payment: real('payment').notNull(),
  interestExpense: real('interest_expense').notNull(),
  principalReduction: real('principal_reduction').notNull(),
  endingBalance: real('ending_balance').notNull(),
  assetAmortization: real('asset_amortization').notNull(),
  assetBookValue: real('asset_book_value').notNull(),
});

// --- Military Pay Tables (Phase 4.1) ---

export const militaryPayTables = sqliteTable('military_pay_tables', {
  id: text('id').primaryKey(),
  fiscalYear: integer('fiscal_year').notNull(),
  payGrade: text('pay_grade').notNull(),
  yearsOfService: integer('years_of_service').notNull(),
  monthlyBasicPay: real('monthly_basic_pay').notNull(),
  effectiveDate: text('effective_date').notNull(),
  authority: text('authority'),
});

// --- Civilian Pay Tables (Phase 4.2) ---

export const civilianPayTables = sqliteTable('civilian_pay_tables', {
  id: text('id').primaryKey(),
  fiscalYear: integer('fiscal_year').notNull(),
  payPlan: text('pay_plan').notNull().default('GS'),
  grade: integer('grade').notNull(),
  step: integer('step').notNull(),
  locality: text('locality').notNull(),
  annualRate: real('annual_rate').notNull(),
  localityAdjustmentPct: real('locality_adjustment_pct').notNull(),
  effectiveDate: text('effective_date').notNull(),
});

// --- Debt Demand Letters (Phase 2.4) ---

export const debtDemandLetters = sqliteTable('debt_demand_letters', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  debtRecordId: text('debt_record_id').notNull(),
  letterType: text('letter_type', {
    enum: ['initial', '30_day', '60_day', '90_day', 'final'],
  }).notNull(),
  generatedDate: text('generated_date').notNull(),
  dueDate: text('due_date').notNull(),
  debtorName: text('debtor_name').notNull(),
  amount: real('amount').notNull(),
  sentDate: text('sent_date'),
  responseReceived: integer('response_received', { mode: 'boolean' }).notNull().default(false),
});

// --- Budget Formulations (Phase 2.3) ---

export const budgetFormulations = sqliteTable('budget_formulations', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  formType: text('form_type', {
    enum: ['pom', 'bes', 'fydp', 'unfunded_requirement', 'congressional_justification'],
  }).notNull(),
  fiscalYear: integer('fiscal_year').notNull(),
  ppbePhase: text('ppbe_phase', {
    enum: ['planning', 'programming', 'budgeting', 'execution'],
  }).notNull(),
  status: text('status', {
    enum: ['draft', 'submitted', 'reviewed', 'approved', 'enacted'],
  }).notNull().default('draft'),
  dataJson: text('data_json').notNull(),
  submittedBy: text('submitted_by'),
  submittedDate: text('submitted_date'),
  createdAt: text('created_at').notNull(),
});

// --- MFA Secrets (Phase 6.2) ---

export const mfaSecrets = sqliteTable('mfa_secrets', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  secret: text('secret').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  backupCodesJson: text('backup_codes_json').notNull(), // JSON array of hashed codes
  createdAt: text('created_at').notNull(),
  lastUsedAt: text('last_used_at'),
});

// --- Escalation Rules (Phase 1.2) ---

export const escalationRules = sqliteTable('escalation_rules', {
  id: text('id').primaryKey(),
  parameterCode: text('parameter_code').notNull(),
  escalationType: text('escalation_type', {
    enum: ['cpi', 'eci', 'legislative', 'administrative', 'actuarial', 'fixed'],
  }).notNull(),
  indexType: text('index_type'),
  fixedRate: real('fixed_rate'),
  roundingRule: text('rounding_rule', {
    enum: ['none', 'nearest_dollar', 'nearest_hundred', 'nearest_thousand'],
  }).notNull(),
  authority: text('authority').notNull(),
  frequency: text('frequency', {
    enum: ['annual', 'biennial', 'quinquennial'],
  }).notNull(),
  effectiveMonth: integer('effective_month').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  maxEscalationPct: real('max_escalation_pct'),
  minEscalationPct: real('min_escalation_pct'),
});

// --- IGT Reconciliation (Phase 5.2) ---

export const igtReconciliations = sqliteTable('igt_reconciliations', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  tradingPartnerAgency: text('trading_partner_agency').notNull(),
  tradingPartnerTas: text('trading_partner_tas'),
  buyerAmount: real('buyer_amount').notNull(),
  sellerAmount: real('seller_amount').notNull(),
  difference: real('difference').notNull(),
  reconciliationStatus: text('reconciliation_status', {
    enum: ['matched', 'unmatched', 'in_dispute', 'resolved'],
  }).notNull(),
  period: text('period').notNull(),
  fiscalYear: integer('fiscal_year').notNull(),
  createdAt: text('created_at').notNull(),
});

// --- Contract Closeouts (Phase 2.6) ---

export const contractCloseouts = sqliteTable('contract_closeouts', {
  id: text('id').primaryKey(),
  engagementId: text('engagement_id').notNull().references(() => engagements.id),
  contractId: text('contract_id').notNull(),
  contractNumber: text('contract_number').notNull(),
  status: text('status', {
    enum: ['not_started', 'physically_complete', 'closeout_initiated', 'indirect_rates_settled', 'final_payment_processed', 'property_cleared', 'patent_cleared', 'release_obtained', 'closed'],
  }).notNull().default('not_started'),
  physicalCompletionDate: text('physical_completion_date'),
  closeoutDeadline: text('closeout_deadline'),
  quickCloseoutEligible: integer('quick_closeout_eligible', { mode: 'boolean' }).notNull().default(false),
  checklistJson: text('checklist_json'), // Full checklist state
  deobligatedAmount: real('deobligated_amount'),
  createdAt: text('created_at').notNull(),
});
