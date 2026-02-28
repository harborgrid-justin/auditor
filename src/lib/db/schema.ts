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
  status: text('status', { enum: ['open', 'resolved', 'accepted', 'in_review'] }).notNull().default('open'),
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
