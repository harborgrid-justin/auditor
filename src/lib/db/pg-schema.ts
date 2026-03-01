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
  materiality_threshold DOUBLE PRECISION NOT NULL DEFAULT 0,
  industry VARCHAR(100),
  entity_type VARCHAR(20) CHECK (entity_type IN ('c_corp', 's_corp', 'partnership', 'llc', 'nonprofit')),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  amount_impact DOUBLE PRECISION,
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
  default_materiality DOUBLE PRECISION NOT NULL DEFAULT 0,
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
`;
