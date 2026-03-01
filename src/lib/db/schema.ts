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
  entityType: text('entity_type', { enum: ['c_corp', 's_corp', 'partnership', 'llc', 'nonprofit'] }),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
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
  framework: text('framework', { enum: ['GAAP', 'IRS', 'SOX', 'PCAOB'] }).notNull(),
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
  entityType: text('entity_type', { enum: ['engagement', 'finding', 'control', 'file', 'journal_entry', 'user', 'template', 'schedule', 'signoff', 'workpaper'] }).notNull(),
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
