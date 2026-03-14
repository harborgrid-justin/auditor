/**
 * PostgreSQL Schema Definition
 *
 * This schema mirrors the SQLite schema but uses PostgreSQL-specific types.
 * Used when DATABASE_PROVIDER=postgresql.
 */

// NOTE: This module requires `drizzle-orm/pg-core` and `pg` packages.
// Install with: npm install pg @types/pg
// Import drizzle-orm/pg-core when these packages are available.

// For now, this file serves as a schema definition reference for PostgreSQL migration.
// The actual implementation would use pgTable instead of sqliteTable.

export const PG_SCHEMA_SQL = `
-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'auditor' CHECK (role IN ('admin', 'auditor', 'reviewer', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Engagements
CREATE TABLE IF NOT EXISTS engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  entity_name VARCHAR(255) NOT NULL,
  fiscal_year_end VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'fieldwork', 'review', 'completed', 'archived')),
  materiality_threshold NUMERIC(18,2) NOT NULL DEFAULT 0,
  industry VARCHAR(100),
  entity_type VARCHAR(20) CHECK (entity_type IN ('c_corp', 's_corp', 'partnership', 'llc', 'nonprofit')),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  classification VARCHAR(20) DEFAULT 'unclassified' CHECK (classification IN ('unclassified', 'cui', 'cui_specified', 'fouo')),
  archived_at TIMESTAMPTZ,
  retention_until DATE
);

-- Engagement Members
CREATE TABLE IF NOT EXISTS engagement_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  role VARCHAR(20) NOT NULL DEFAULT 'staff' CHECK (role IN ('lead', 'staff', 'reviewer'))
);

-- Audit Logs (immutable)
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID,
  user_id UUID NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  action VARCHAR(20) NOT NULL,
  entity_type VARCHAR(30) NOT NULL,
  entity_id UUID,
  details JSONB,
  ip_address INET,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_engagement ON audit_logs(engagement_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);

-- Findings
CREATE TABLE IF NOT EXISTS findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  rule_id VARCHAR(50) NOT NULL,
  framework VARCHAR(10) NOT NULL CHECK (framework IN ('GAAP', 'IRS', 'SOX', 'PCAOB')),
  severity VARCHAR(10) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  citation TEXT NOT NULL,
  remediation TEXT NOT NULL,
  amount_impact NUMERIC(18,2),
  affected_accounts JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_findings_engagement ON findings(engagement_id);
CREATE INDEX IF NOT EXISTS idx_findings_framework ON findings(framework);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);

-- Finding History
CREATE TABLE IF NOT EXISTS finding_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  engagement_id UUID NOT NULL REFERENCES engagements(id),
  changed_by UUID NOT NULL,
  field_changed VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Review Comments
CREATE TABLE IF NOT EXISTS review_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id),
  finding_id UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sign-offs (immutable)
CREATE TABLE IF NOT EXISTS signoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id),
  entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('finding', 'control', 'engagement')),
  entity_id UUID NOT NULL,
  signed_by UUID NOT NULL,
  signer_name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL,
  opinion TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workflow Transitions
CREATE TABLE IF NOT EXISTS workflow_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
  engagement_id UUID NOT NULL REFERENCES engagements(id),
  from_status VARCHAR(20) NOT NULL,
  to_status VARCHAR(20) NOT NULL,
  changed_by UUID NOT NULL,
  changer_name VARCHAR(255) NOT NULL,
  comment TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Engagement Templates
CREATE TABLE IF NOT EXISTS engagement_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  entity_type VARCHAR(20),
  industry VARCHAR(100),
  default_materiality NUMERIC(18,2) NOT NULL DEFAULT 0,
  frameworks_json JSONB,
  sox_controls_json JSONB,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Schedules
CREATE TABLE IF NOT EXISTS schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  cron_expression VARCHAR(100) NOT NULL,
  frameworks_json JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reprogramming Actions (DD-1414)
CREATE TABLE IF NOT EXISTS reprogramming_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  reprogramming_type VARCHAR(30) NOT NULL CHECK (reprogramming_type IN ('below_threshold', 'above_threshold', 'reprogramming', 'transfer', 'realignment')),
  from_appropriation_id UUID NOT NULL,
  to_appropriation_id UUID NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  justification TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'executed', 'congressional_notification')),
  congressional_notification_required BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  fiscal_year INTEGER NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Rule Version History
CREATE TABLE IF NOT EXISTS rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id VARCHAR(255) NOT NULL,
  version INTEGER NOT NULL,
  content_json JSONB NOT NULL,
  effective_date DATE NOT NULL,
  sunset_date DATE,
  changed_by UUID NOT NULL,
  change_reason TEXT NOT NULL,
  legislation_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rule_versions_rule_id ON rule_versions(rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_versions_effective ON rule_versions(rule_id, effective_date DESC);

-- Approval Chains
CREATE TABLE IF NOT EXISTS approval_chains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('disbursement', 'ada_violation', 'reprogramming', 'debt_writeoff', 'report', 'obligation')),
  entity_id UUID NOT NULL,
  current_step_index INTEGER NOT NULL DEFAULT 0,
  overall_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (overall_status IN ('pending', 'approved', 'rejected', 'escalated', 'expired')),
  initiated_by UUID NOT NULL,
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_approval_chains_entity ON approval_chains(entity_type, entity_id);

-- Approval Steps
CREATE TABLE IF NOT EXISTS approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id UUID NOT NULL REFERENCES approval_chains(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  required_role VARCHAR(50) NOT NULL,
  assigned_to UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'escalated', 'expired')),
  decision VARCHAR(10) CHECK (decision IN ('approve', 'reject')),
  comment TEXT,
  decided_at TIMESTAMPTZ,
  due_date TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_approval_steps_chain ON approval_steps(chain_id, step_index);

-- ============================================================
-- Enterprise Features Tables (DoD FMR Enterprise Extension)
-- ============================================================

-- Organizations (DoD Component Hierarchy)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES organizations(id),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  abbreviation VARCHAR(50) NOT NULL,
  component_type VARCHAR(30) NOT NULL CHECK (component_type IN ('osd', 'military_department', 'defense_agency', 'field_activity', 'combatant_command', 'sub_component', 'installation', 'activity', 'program_office')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'reorganizing')),
  dod_component_code VARCHAR(20),
  treasury_agency_code VARCHAR(20),
  level INTEGER NOT NULL DEFAULT 0,
  path TEXT NOT NULL DEFAULT '/',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_organizations_parent ON organizations(parent_id);
CREATE INDEX IF NOT EXISTS idx_organizations_code ON organizations(code);
CREATE INDEX IF NOT EXISTS idx_organizations_path ON organizations(path);

-- Interagency Agreements (DoD FMR Vol 11 - Reimbursable Operations)
CREATE TABLE IF NOT EXISTS interagency_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  agreement_number VARCHAR(100) NOT NULL,
  agreement_type VARCHAR(30) NOT NULL CHECK (agreement_type IN ('economy_act', 'mipra', 'non_economy_act', 'assisted_acquisition')),
  requesting_agency VARCHAR(255) NOT NULL,
  servicing_agency VARCHAR(255) NOT NULL,
  authority TEXT,
  amount NUMERIC(18,2) NOT NULL,
  obligated_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  billed_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  collected_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  advance_received NUMERIC(18,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'closed')),
  period_of_performance DATE,
  fiscal_year INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iaa_engagement ON interagency_agreements(engagement_id);
CREATE INDEX IF NOT EXISTS idx_iaa_fiscal_year ON interagency_agreements(fiscal_year);

-- Working Capital Funds (DoD FMR Vol 11B)
CREATE TABLE IF NOT EXISTS working_capital_funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  fund_name VARCHAR(255) NOT NULL,
  fund_type VARCHAR(30) NOT NULL CHECK (fund_type IN ('supply', 'maintenance', 'research', 'commissary', 'other')),
  revenue_from_operations NUMERIC(18,2) NOT NULL DEFAULT 0,
  cost_of_operations NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_operating_result NUMERIC(18,2) NOT NULL DEFAULT 0,
  cash_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  fiscal_year INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wcf_engagement ON working_capital_funds(engagement_id);

-- Special Accounts (DoD FMR Vol 12)
CREATE TABLE IF NOT EXISTS special_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  account_name VARCHAR(255) NOT NULL,
  account_type VARCHAR(30) NOT NULL CHECK (account_type IN ('fms_trust', 'environmental_restoration', 'deposit_fund', 'clearing_account', 'suspense', 'working_capital', 'trust_revolving')),
  balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  receipts NUMERIC(18,2) NOT NULL DEFAULT 0,
  disbursements NUMERIC(18,2) NOT NULL DEFAULT 0,
  transfers_in NUMERIC(18,2) NOT NULL DEFAULT 0,
  transfers_out NUMERIC(18,2) NOT NULL DEFAULT 0,
  fiscal_year INTEGER NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_special_accounts_engagement ON special_accounts(engagement_id);
CREATE INDEX IF NOT EXISTS idx_special_accounts_type ON special_accounts(account_type);

-- Monitoring Alert Configurations
CREATE TABLE IF NOT EXISTS monitoring_alert_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  metric_type VARCHAR(30) NOT NULL CHECK (metric_type IN ('fund_execution', 'ada_exposure', 'obligation_aging', 'reconciliation_health', 'payment_integrity')),
  threshold_value DOUBLE PRECISION NOT NULL,
  alert_level VARCHAR(20) NOT NULL DEFAULT 'warning' CHECK (alert_level IN ('warning', 'critical')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alert_configs_engagement ON monitoring_alert_configs(engagement_id);

-- Monitoring Alerts
CREATE TABLE IF NOT EXISTS monitoring_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  metric_type VARCHAR(30) NOT NULL,
  alert_level VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  current_value DOUBLE PRECISION,
  threshold_value DOUBLE PRECISION,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alerts_engagement ON monitoring_alerts(engagement_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON monitoring_alerts(status);

-- Corrective Action Plans (FIAR / OMB A-123)
CREATE TABLE IF NOT EXISTS corrective_action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  finding_id UUID REFERENCES findings(id),
  title VARCHAR(255) NOT NULL,
  classification VARCHAR(30) NOT NULL CHECK (classification IN ('material_weakness', 'significant_deficiency', 'noncompliance', 'control_deficiency')),
  responsible_official VARCHAR(255) NOT NULL,
  target_completion_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'on_track', 'at_risk', 'overdue', 'completed', 'validated')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cap_engagement ON corrective_action_plans(engagement_id);
CREATE INDEX IF NOT EXISTS idx_cap_status ON corrective_action_plans(status);

-- CAP Milestones
CREATE TABLE IF NOT EXISTS cap_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cap_id UUID NOT NULL REFERENCES corrective_action_plans(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  target_date DATE NOT NULL,
  completed_date DATE,
  evidence_description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_milestones_cap ON cap_milestones(cap_id);

-- Workflow Definitions (Enterprise Approval Engine)
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  entity_type VARCHAR(50) NOT NULL,
  steps_json JSONB NOT NULL,
  escalation_rules_json JSONB,
  sla_hours INTEGER NOT NULL DEFAULT 48,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workflow Instances
CREATE TABLE IF NOT EXISTS workflow_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id UUID NOT NULL REFERENCES workflow_definitions(id),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  current_step_index INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'approved', 'rejected', 'escalated', 'cancelled')),
  initiated_by UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_engagement ON workflow_instances(engagement_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_entity ON workflow_instances(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status ON workflow_instances(status);

-- Workflow Step Instances
CREATE TABLE IF NOT EXISTS workflow_step_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES workflow_instances(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  required_role VARCHAR(50) NOT NULL,
  description TEXT,
  assigned_to UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'escalated', 'skipped')),
  decision VARCHAR(10) CHECK (decision IN ('approve', 'reject')),
  comment TEXT,
  decided_at TIMESTAMPTZ,
  due_date TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_instance ON workflow_step_instances(instance_id, step_index);

-- Batch Jobs
CREATE TABLE IF NOT EXISTS batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  batch_type VARCHAR(30) NOT NULL CHECK (batch_type IN ('obligation_import', 'disbursement_import', 'journal_entry_import', 'payroll_processing', 'year_end_close')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validating', 'processing', 'completed', 'failed', 'cancelled')),
  total_records INTEGER NOT NULL DEFAULT 0,
  processed_records INTEGER NOT NULL DEFAULT 0,
  successful_records INTEGER NOT NULL DEFAULT 0,
  failed_records INTEGER NOT NULL DEFAULT 0,
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  fiscal_year INTEGER NOT NULL,
  summary_json JSONB,
  started_by UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_engagement ON batch_jobs(engagement_id);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_jobs(status);

-- Batch Errors
CREATE TABLE IF NOT EXISTS batch_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES batch_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  field VARCHAR(100),
  error_code VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_batch_errors_batch ON batch_errors(batch_id);

-- Three-Way Match Results (Contract Payments)
CREATE TABLE IF NOT EXISTS three_way_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  po_id UUID NOT NULL,
  receipt_id UUID,
  invoice_id UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'partial_match', 'mismatch', 'exception')),
  match_type VARCHAR(20) CHECK (match_type IN ('full', 'partial', 'no_match')),
  discrepancies_json JSONB,
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_three_way_engagement ON three_way_matches(engagement_id);
CREATE INDEX IF NOT EXISTS idx_three_way_status ON three_way_matches(status);

-- Suspense Items (USSGL 5790xx)
CREATE TABLE IF NOT EXISTS suspense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  account_number VARCHAR(20) NOT NULL,
  account_title VARCHAR(255) NOT NULL,
  amount NUMERIC(18,2) NOT NULL,
  original_posting_date DATE NOT NULL,
  aging_days INTEGER NOT NULL DEFAULT 0,
  source VARCHAR(255),
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cleared', 'escalated', 'written_off')),
  assigned_to UUID,
  last_review_date DATE,
  clearing_action VARCHAR(20) CHECK (clearing_action IN ('cleared', 'written_off', 'transferred')),
  clearing_comment TEXT,
  cleared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_suspense_engagement ON suspense_items(engagement_id);
CREATE INDEX IF NOT EXISTS idx_suspense_status ON suspense_items(status);
CREATE INDEX IF NOT EXISTS idx_suspense_aging ON suspense_items(aging_days DESC);

-- Evidence Packages
CREATE TABLE IF NOT EXISTS evidence_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id UUID NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  fiscal_year INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'completed', 'failed', 'expired')),
  classification VARCHAR(20) NOT NULL DEFAULT 'unclassified',
  total_sections INTEGER NOT NULL DEFAULT 0,
  total_items INTEGER NOT NULL DEFAULT 0,
  package_json JSONB,
  generated_by UUID NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_engagement ON evidence_packages(engagement_id);

-- Legislation Ingestion History
CREATE TABLE IF NOT EXISTS legislation_ingestion_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name VARCHAR(100) NOT NULL,
  source_type VARCHAR(30) NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changes_detected BOOLEAN NOT NULL DEFAULT FALSE,
  new_parameters_json JSONB,
  validation_errors_json JSONB,
  applied_by UUID,
  applied_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ingestion_source ON legislation_ingestion_history(source_name);
CREATE INDEX IF NOT EXISTS idx_ingestion_checked ON legislation_ingestion_history(checked_at DESC);
`;
