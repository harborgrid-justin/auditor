import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'auditor.db');

let sqlite: Database.Database | null = null;

function getSqlite() {
  if (!sqlite) {
    sqlite = new Database(DB_PATH);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    initializeDatabase(sqlite);
  }
  return sqlite;
}

function initializeDatabase(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'auditor',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS engagements (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      entity_name TEXT NOT NULL,
      fiscal_year_end TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'planning',
      materiality_threshold REAL NOT NULL DEFAULT 0,
      industry TEXT,
      entity_type TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS engagement_members (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL DEFAULT 'staff'
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id),
      account_number TEXT NOT NULL,
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      sub_type TEXT,
      beginning_balance REAL NOT NULL DEFAULT 0,
      ending_balance REAL NOT NULL DEFAULT 0,
      period TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trial_balance_entries (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id),
      account_id TEXT NOT NULL REFERENCES accounts(id),
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      period TEXT NOT NULL,
      source_file TEXT NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS journal_entry_lines (
      id TEXT PRIMARY KEY,
      journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id),
      account_id TEXT NOT NULL,
      account_name TEXT,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS financial_statements (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id),
      statement_type TEXT NOT NULL,
      period TEXT NOT NULL,
      data_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tax_data (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id),
      form_type TEXT NOT NULL,
      schedule TEXT NOT NULL,
      line_number TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      period TEXT NOT NULL
    );

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
      amount_impact REAL,
      affected_accounts TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS risk_scores (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id),
      category TEXT NOT NULL,
      score REAL NOT NULL,
      factors_json TEXT NOT NULL,
      calculated_at TEXT NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS review_comments (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id),
      finding_id TEXT NOT NULL REFERENCES findings(id),
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      comment TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

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

    CREATE TABLE IF NOT EXISTS engagement_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      entity_type TEXT,
      industry TEXT,
      default_materiality REAL NOT NULL DEFAULT 0,
      frameworks_json TEXT,
      sox_controls_json TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      engagement_id TEXT NOT NULL REFERENCES engagements(id),
      name TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      frameworks_json TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at TEXT,
      next_run_at TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

const sqliteDb = getSqlite();
export const db = drizzle(sqliteDb, { schema });
export const rawDb = sqliteDb;
export { schema };
