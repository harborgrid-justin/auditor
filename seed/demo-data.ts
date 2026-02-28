import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'auditor.db');

async function seed() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'auditor', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS engagements (id TEXT PRIMARY KEY, name TEXT NOT NULL, entity_name TEXT NOT NULL, fiscal_year_end TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planning', materiality_threshold REAL NOT NULL DEFAULT 0, industry TEXT, entity_type TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS engagement_members (id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'staff');
    CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL, account_number TEXT NOT NULL, account_name TEXT NOT NULL, account_type TEXT NOT NULL, sub_type TEXT, beginning_balance REAL NOT NULL DEFAULT 0, ending_balance REAL NOT NULL DEFAULT 0, period TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS trial_balance_entries (id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL, account_id TEXT NOT NULL, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0, period TEXT NOT NULL, source_file TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS journal_entries (id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL, entry_number TEXT NOT NULL, date TEXT NOT NULL, description TEXT NOT NULL, posted_by TEXT NOT NULL, approved_by TEXT, source TEXT NOT NULL DEFAULT 'manual');
    CREATE TABLE IF NOT EXISTS journal_entry_lines (id TEXT PRIMARY KEY, journal_entry_id TEXT NOT NULL, account_id TEXT NOT NULL, account_name TEXT, debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0, description TEXT);
    CREATE TABLE IF NOT EXISTS financial_statements (id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL, statement_type TEXT NOT NULL, period TEXT NOT NULL, data_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tax_data (id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL, form_type TEXT NOT NULL, schedule TEXT NOT NULL, line_number TEXT NOT NULL, description TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, period TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS findings (id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL, rule_id TEXT NOT NULL, framework TEXT NOT NULL, severity TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, citation TEXT NOT NULL, remediation TEXT NOT NULL, amount_impact REAL, affected_accounts TEXT, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sox_controls (id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL, control_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, control_type TEXT NOT NULL, category TEXT NOT NULL, frequency TEXT NOT NULL, owner TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'not_tested', assertion TEXT NOT NULL DEFAULT '[]', risk_level TEXT NOT NULL DEFAULT 'medium', automated_manual TEXT NOT NULL DEFAULT 'manual');
    CREATE TABLE IF NOT EXISTS sox_test_results (id TEXT PRIMARY KEY, control_id TEXT NOT NULL, test_date TEXT NOT NULL, tested_by TEXT NOT NULL, result TEXT NOT NULL, sample_size INTEGER NOT NULL DEFAULT 0, exceptions_found INTEGER NOT NULL DEFAULT 0, evidence TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS risk_scores (id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL, category TEXT NOT NULL, score REAL NOT NULL, factors_json TEXT NOT NULL, calculated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS uploaded_files (id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL, file_name TEXT NOT NULL, file_type TEXT NOT NULL, file_size INTEGER NOT NULL, data_type TEXT NOT NULL, record_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'processing', uploaded_at TEXT NOT NULL, uploaded_by TEXT NOT NULL);
  `);

  const now = new Date().toISOString();

  // Create demo user
  const adminId = uuid();
  const passwordHash = await bcrypt.hash('admin123', 12);
  db.prepare('INSERT OR IGNORE INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    adminId, 'admin@auditpro.com', 'Admin User', passwordHash, 'admin', now
  );

  const auditorId = uuid();
  const auditorHash = await bcrypt.hash('auditor123', 12);
  db.prepare('INSERT OR IGNORE INTO users (id, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    auditorId, 'auditor@auditpro.com', 'Jane Auditor', auditorHash, 'auditor', now
  );

  // Create demo engagement: Acme Corp
  const engId = uuid();
  db.prepare('INSERT INTO engagements (id, name, entity_name, fiscal_year_end, status, materiality_threshold, industry, entity_type, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    engId, 'FY2025 Annual Audit', 'Acme Corporation', '2025-12-31', 'fieldwork', 500000, 'Technology', 'c_corp', adminId, now
  );

  // Acme Corp Chart of Accounts
  const accts: [string, string, string, string, string, number, number][] = [
    [uuid(), '1010', 'Cash and Cash Equivalents', 'asset', 'cash', 2500000, 3200000],
    [uuid(), '1100', 'Accounts Receivable', 'asset', 'accounts_receivable', 4200000, 5800000],
    [uuid(), '1150', 'Allowance for Doubtful Accounts', 'asset', 'accounts_receivable', -120000, -85000],
    [uuid(), '1200', 'Inventory - Raw Materials', 'asset', 'inventory', 1800000, 2400000],
    [uuid(), '1210', 'Inventory - Work in Progress', 'asset', 'inventory', 600000, 950000],
    [uuid(), '1220', 'Inventory - Finished Goods', 'asset', 'inventory', 1200000, 1600000],
    [uuid(), '1300', 'Prepaid Expenses', 'asset', 'prepaid', 350000, 420000],
    [uuid(), '1400', 'Property, Plant & Equipment', 'asset', 'fixed_asset', 8500000, 9200000],
    [uuid(), '1410', 'Accumulated Depreciation', 'asset', 'fixed_asset', -3200000, -3900000],
    [uuid(), '1500', 'Right-of-Use Assets', 'asset', 'rou_asset', 2100000, 1850000],
    [uuid(), '1600', 'Goodwill', 'asset', 'intangible', 5000000, 5000000],
    [uuid(), '1610', 'Other Intangible Assets', 'asset', 'intangible', 1500000, 1200000],
    [uuid(), '2010', 'Accounts Payable', 'liability', 'accounts_payable', 2800000, 3500000],
    [uuid(), '2050', 'Accrued Liabilities', 'liability', 'accrued_liabilities', 1200000, 1450000],
    [uuid(), '2100', 'Deferred Revenue', 'liability', 'deferred_revenue', 3200000, 4800000],
    [uuid(), '2200', 'Current Portion of Long-Term Debt', 'liability', 'short_term_debt', 500000, 500000],
    [uuid(), '2300', 'Long-Term Debt', 'liability', 'long_term_debt', 6000000, 5500000],
    [uuid(), '2400', 'Operating Lease Liabilities', 'liability', 'lease_liability', 2200000, 1950000],
    [uuid(), '2500', 'Deferred Tax Liability', 'liability', 'other_liability', 800000, 950000],
    [uuid(), '3010', 'Common Stock', 'equity', 'common_stock', 1000000, 1000000],
    [uuid(), '3020', 'Additional Paid-in Capital', 'equity', 'other_equity', 4500000, 5200000],
    [uuid(), '3100', 'Retained Earnings', 'equity', 'retained_earnings', 8930000, 10485000],
    [uuid(), '3200', 'AOCI', 'equity', 'aoci', -200000, -175000],
    [uuid(), '3300', 'Treasury Stock', 'equity', 'treasury_stock', -1500000, -2000000],
    [uuid(), '4010', 'Product Revenue', 'revenue', 'operating_revenue', 0, 28500000],
    [uuid(), '4020', 'Service Revenue', 'revenue', 'operating_revenue', 0, 12000000],
    [uuid(), '4030', 'Subscription Revenue', 'revenue', 'operating_revenue', 0, 8500000],
    [uuid(), '4100', 'Interest Income', 'revenue', 'non_operating_revenue', 0, 150000],
    [uuid(), '4200', 'Gain on Sale of Assets', 'revenue', 'non_operating_revenue', 0, 75000],
    [uuid(), '5010', 'Cost of Goods Sold', 'expense', 'cost_of_goods_sold', 0, 22000000],
    [uuid(), '6010', 'Salaries and Wages', 'expense', 'operating_expense', 0, 9500000],
    [uuid(), '6020', 'Employee Benefits', 'expense', 'operating_expense', 0, 2800000],
    [uuid(), '6030', 'Stock-Based Compensation', 'expense', 'operating_expense', 0, 1200000],
    [uuid(), '6100', 'Rent Expense', 'expense', 'operating_expense', 0, 1800000],
    [uuid(), '6200', 'Depreciation Expense', 'expense', 'depreciation', 0, 700000],
    [uuid(), '6210', 'Amortization Expense', 'expense', 'amortization', 0, 300000],
    [uuid(), '6300', 'Professional Fees', 'expense', 'operating_expense', 0, 850000],
    [uuid(), '6400', 'Travel & Entertainment', 'expense', 'operating_expense', 0, 650000],
    [uuid(), '6500', 'Marketing & Advertising', 'expense', 'operating_expense', 0, 2200000],
    [uuid(), '6600', 'Research & Development', 'expense', 'operating_expense', 0, 3500000],
    [uuid(), '6700', 'Insurance', 'expense', 'operating_expense', 0, 450000],
    [uuid(), '6800', 'Utilities', 'expense', 'operating_expense', 0, 180000],
    [uuid(), '7010', 'Interest Expense', 'expense', 'interest_expense', 0, 420000],
    [uuid(), '9010', 'Income Tax Expense', 'expense', 'tax_expense', 0, 1180000],
  ];

  const accountInsert = db.prepare('INSERT INTO accounts (id, engagement_id, account_number, account_name, account_type, sub_type, beginning_balance, ending_balance, period) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const tbInsert = db.prepare('INSERT INTO trial_balance_entries (id, engagement_id, account_id, debit, credit, period, source_file) VALUES (?, ?, ?, ?, ?, ?, ?)');

  const insertAccounts = db.transaction(() => {
    for (const [id, num, name, type, sub, begin, end] of accts) {
      accountInsert.run(id, engId, num, name, type, sub, begin, end, '2025-12');
      const balance = end;
      const debit = balance > 0 ? Math.abs(balance) : 0;
      const credit = balance < 0 ? Math.abs(balance) : 0;
      if (['liability', 'equity', 'revenue'].includes(type)) {
        tbInsert.run(uuid(), engId, id, credit > 0 ? 0 : 0, Math.abs(balance), '2025-12', 'demo_seed');
      } else {
        tbInsert.run(uuid(), engId, id, Math.abs(balance), 0, '2025-12', 'demo_seed');
      }
    }
  });
  insertAccounts();

  // Journal Entries - including some with issues for SOX testing
  const jeInsert = db.prepare('INSERT INTO journal_entries (id, engagement_id, entry_number, date, description, posted_by, approved_by, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const jelInsert = db.prepare('INSERT INTO journal_entry_lines (id, journal_entry_id, account_id, account_name, debit, credit, description) VALUES (?, ?, ?, ?, ?, ?, ?)');

  const journalEntries: [string, string, string, string, string, string | null, string, [string, number, number][]][] = [
    [uuid(), 'JE-001', '2025-01-15', 'Monthly revenue accrual', 'jsmith', 'mjones', 'system',
      [['Accounts Receivable', 1500000, 0], ['Product Revenue', 0, 1500000]]],
    [uuid(), 'JE-002', '2025-02-28', 'Inventory purchase', 'jsmith', 'mjones', 'system',
      [['Inventory - Raw Materials', 800000, 0], ['Accounts Payable', 0, 800000]]],
    [uuid(), 'JE-003', '2025-03-31', 'Quarterly depreciation', 'alee', 'mjones', 'system',
      [['Depreciation Expense', 175000, 0], ['Accumulated Depreciation', 0, 175000]]],
    [uuid(), 'JE-004', '2025-06-30', 'Mid-year bonus accrual', 'jsmith', 'mjones', 'system',
      [['Salaries and Wages', 500000, 0], ['Accrued Liabilities', 0, 500000]]],
    // Suspicious entries for testing
    [uuid(), 'JE-005', '2025-12-31', 'Year-end revenue adjustment', 'cfo_admin', null, 'manual',
      [['Accounts Receivable', 2000000, 0], ['Product Revenue', 0, 2000000]]], // No approval, posted by exec
    [uuid(), 'JE-006', '2025-12-31', 'Reclassification entry', 'jsmith', null, 'manual',
      [['Prepaid Expenses', 100000, 0], ['Operating Expense', 0, 100000]]], // Missing approval
    [uuid(), 'JE-007', '2026-01-05', 'Post-close adjustment', 'cfo_admin', null, 'manual',
      [['Product Revenue', 0, 500000], ['Deferred Revenue', 500000, 0]]], // Post-close entry
    [uuid(), 'JE-008', '2025-12-30', 'Round-number transfer', 'jsmith', 'jsmith', 'manual',
      [['Cash and Cash Equivalents', 1000000, 0], ['Accounts Receivable', 0, 1000000]]], // Same preparer/approver
    [uuid(), 'JE-009', '2025-11-15', 'Standard payroll entry', 'payroll_sys', 'mjones', 'system',
      [['Salaries and Wages', 750000, 0], ['Cash and Cash Equivalents', 0, 750000]]],
    [uuid(), 'JE-010', '2025-12-28', 'Large vendor payment', 'alee', 'mjones', 'system',
      [['Accounts Payable', 2500000, 0], ['Cash and Cash Equivalents', 0, 2500000]]],
  ];

  const insertJEs = db.transaction(() => {
    for (const [jeId, num, date, desc, posted, approved, source, lines] of journalEntries) {
      jeInsert.run(jeId, engId, num, date, desc, posted, approved, source);
      for (const [acctName, debit, credit] of lines) {
        jelInsert.run(uuid(), jeId, 'mapped', acctName, debit, credit, desc);
      }
    }
  });
  insertJEs();

  // Financial Statements
  const bsData = {
    totalAssets: 27635000,
    totalLiabilities: 18650000,
    totalEquity: 14510000,
    cash: 3200000,
    accountsReceivable: 5800000,
    inventory: 4950000,
    ppe: 5300000,
    goodwill: 5000000,
    accountsPayable: 3500000,
    deferredRevenue: 4800000,
    longTermDebt: 5500000,
    retainedEarnings: 10485000,
  };

  const isData = {
    totalRevenue: 49225000,
    costOfGoodsSold: 22000000,
    grossProfit: 27225000,
    operatingExpenses: 24130000,
    operatingIncome: 3095000,
    interestExpense: 420000,
    otherIncome: 225000,
    incomeBeforeTax: 2900000,
    incomeTaxExpense: 1180000,
    netIncome: 1720000,
    revenue_product: 28500000,
    revenue_service: 12000000,
    revenue_subscription: 8500000,
  };

  const cfData = {
    netIncome: 1720000,
    depreciation: 700000,
    amortization: 300000,
    stockBasedComp: 1200000,
    changeInAR: -1600000,
    changeInInventory: -1350000,
    changeInAP: 700000,
    changeInDeferredRev: 1600000,
    operatingCashFlow: 3270000,
    capitalExpenditures: -700000,
    investingCashFlow: -625000,
    debtRepayment: -500000,
    stockRepurchase: -500000,
    financingCashFlow: -1345000,
    netChangeInCash: 700000,
  };

  db.prepare('INSERT INTO financial_statements (id, engagement_id, statement_type, period, data_json) VALUES (?, ?, ?, ?, ?)').run(uuid(), engId, 'BS', '2025-12', JSON.stringify(bsData));
  db.prepare('INSERT INTO financial_statements (id, engagement_id, statement_type, period, data_json) VALUES (?, ?, ?, ?, ?)').run(uuid(), engId, 'IS', '2025-12', JSON.stringify(isData));
  db.prepare('INSERT INTO financial_statements (id, engagement_id, statement_type, period, data_json) VALUES (?, ?, ?, ?, ?)').run(uuid(), engId, 'CF', '2025-12', JSON.stringify(cfData));

  // Tax Data
  const taxEntries: [string, string, string, string, number][] = [
    ['1120', 'main', '1a', 'Gross receipts or sales', 49225000],
    ['1120', 'main', '2', 'Cost of goods sold', 22000000],
    ['1120', 'main', '3', 'Gross profit', 27225000],
    ['1120', 'main', '11', 'Total income', 27450000],
    ['1120', 'main', '27', 'Total deductions', 24550000],
    ['1120', 'main', '28', 'Taxable income before NOL', 2900000],
    ['1120', 'main', '30', 'Taxable income', 2900000],
    ['1120', 'main', '31', 'Total tax', 609000],
    ['1120', 'Schedule M-1', '1', 'Net income per books', 1720000],
    ['1120', 'Schedule M-1', '2', 'Federal income tax per books', 1180000],
    ['1120', 'Schedule M-1', '5a', 'Depreciation - books', 700000],
    ['1120', 'Schedule M-1', '5b', 'Depreciation - tax', 850000],
    ['1120', 'Schedule M-1', '7', 'Stock-based compensation', 1200000],
    ['1120', 'Schedule M-1', '8', 'Meals deduction limit (50%)', 325000],
    ['1120', 'Schedule M-1', '10', 'Taxable income per return', 2900000],
    ['4562', 'main', '14', 'Section 179 expense deduction', 200000],
    ['4562', 'main', '17', 'MACRS 5-year property', 350000],
    ['4562', 'main', '22', 'Total depreciation', 850000],
    ['6765', 'main', '1', 'Qualified research expenses', 3500000],
    ['6765', 'main', '9', 'Total R&D credit', 175000],
  ];

  const taxInsert = db.prepare('INSERT INTO tax_data (id, engagement_id, form_type, schedule, line_number, description, amount, period) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insertTax = db.transaction(() => {
    for (const [form, sched, line, desc, amt] of taxEntries) {
      taxInsert.run(uuid(), engId, form, sched, line, desc, amt, '2025-12');
    }
  });
  insertTax();

  // SOX Controls
  const soxInsert = db.prepare('INSERT INTO sox_controls (id, engagement_id, control_id, title, description, control_type, category, frequency, owner, status, assertion, risk_level, automated_manual) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const soxControls: [string, string, string, string, string, string, string, string, string, string, string][] = [
    ['JE-01', 'Journal Entry Approval', 'All journal entries require supervisory approval before posting', 'preventive', 'journal_entry', 'continuous', 'Controller', 'effective', '["Accuracy","Existence/Occurrence"]', 'high', 'manual'],
    ['JE-02', 'Non-Standard JE Review', 'Non-standard and post-closing entries subject to additional management review', 'detective', 'journal_entry', 'monthly', 'CFO', 'not_tested', '["Accuracy","Existence/Occurrence","Completeness"]', 'high', 'manual'],
    ['FC-01', 'Monthly Reconciliation', 'Significant balance sheet accounts reconciled monthly', 'detective', 'transaction', 'monthly', 'Accounting Manager', 'effective', '["Existence/Occurrence","Completeness","Valuation/Allocation"]', 'high', 'manual'],
    ['FC-02', 'Financial Close Checklist', 'Standardized close checklist completed each period', 'preventive', 'transaction', 'monthly', 'Controller', 'effective', '["Completeness","Cutoff"]', 'medium', 'manual'],
    ['IT-01', 'User Access Review', 'Quarterly review of financial system access', 'detective', 'itgc', 'quarterly', 'IT Director', 'not_tested', '["Existence/Occurrence","Completeness"]', 'high', 'manual'],
    ['IT-02', 'Change Management', 'System changes authorized, tested, and approved', 'preventive', 'itgc', 'continuous', 'IT Director', 'effective', '["Accuracy","Completeness"]', 'high', 'manual'],
    ['MR-01', 'Management Review', 'Monthly review of financial results vs budget', 'detective', 'entity_level', 'monthly', 'CFO', 'effective', '["Valuation/Allocation","Completeness","Accuracy"]', 'medium', 'manual'],
    ['SD-01', 'Segregation of Duties', 'Incompatible duties are segregated', 'preventive', 'entity_level', 'continuous', 'Controller', 'not_tested', '["Existence/Occurrence","Accuracy"]', 'high', 'manual'],
  ];

  const insertSox = db.transaction(() => {
    for (const [cid, title, desc, ctype, cat, freq, owner, stat, assertion, risk, auto] of soxControls) {
      soxInsert.run(uuid(), engId, cid, title, desc, ctype, cat, freq, owner, stat, assertion, risk, auto);
    }
  });
  insertSox();

  // Uploaded files record
  db.prepare('INSERT INTO uploaded_files (id, engagement_id, file_name, file_type, file_size, data_type, record_count, status, uploaded_at, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    uuid(), engId, 'acme_trial_balance_2025.csv', 'csv', 45000, 'trial_balance', accts.length, 'completed', now, 'system'
  );
  db.prepare('INSERT INTO uploaded_files (id, engagement_id, file_name, file_type, file_size, data_type, record_count, status, uploaded_at, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    uuid(), engId, 'acme_journal_entries_2025.csv', 'csv', 32000, 'journal_entries', journalEntries.length, 'completed', now, 'system'
  );

  console.log('Demo data seeded successfully!');
  console.log(`  - Admin user: admin@auditpro.com / admin123`);
  console.log(`  - Auditor user: auditor@auditpro.com / auditor123`);
  console.log(`  - Engagement: Acme Corporation - FY2025 Annual Audit`);
  console.log(`  - ${accts.length} accounts, ${journalEntries.length} journal entries`);
  console.log(`  - Financial statements: BS, IS, CF`);
  console.log(`  - ${taxEntries.length} tax data entries`);
  console.log(`  - ${soxControls.length} SOX controls`);

  db.close();
}

seed().catch(console.error);
