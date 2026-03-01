/**
 * Bulk DoD Data Import / Validation
 *
 * Validates and transforms DoD-specific file formats into the application's
 * data model. Supports DAIMS (DATA Act Information Model Schema) files,
 * SFIS (Standard Financial Information Structure) matrices, and GTAS
 * trial balance uploads.
 *
 * References:
 *   - DATA Act: DAIMS v2.0+ file specifications (Files A–F)
 *   - DoD FMR Vol 1 Ch 4: Standard Financial Information Structure (SFIS)
 *   - Treasury GTAS: Trial balance submission format
 */

import { parseExcel, type ParseResult } from './excel-parser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImportResult<T = Record<string, unknown>> {
  success: boolean;
  recordCount: number;
  records: T[];
  errors: ImportError[];
  warnings: string[];
}

export interface ImportError {
  row: number;
  field: string;
  value: string;
  message: string;
}

export interface DAIMSFileARecord {
  allocationTransferAgencyId: string;
  agencyId: string;
  beginningPeriodOfAvailability: string;
  endingPeriodOfAvailability: string;
  availabilityTypeCode: string;
  mainAccountCode: string;
  subAccountCode: string;
  budgetAuthorityAppropriatedAmount: number;
  otherBudgetaryResourcesAmount: number;
  totalBudgetaryResources: number;
  obligationsIncurred: number;
  deobligations: number;
  unobligatedBalance: number;
  grossOutlayAmount: number;
  statusOfBudgetaryResourcesTotal: number;
}

export interface SFISElement {
  elementCode: string;
  elementName: string;
  parentCode: string;
  level: number;
  category: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normalBalance: 'debit' | 'credit';
}

export interface GTASTrialBalanceEntry {
  fiscalYear: number;
  period: number;
  agencyId: string;
  treasuryAccountSymbol: string;
  ussglAccountNumber: string;
  beginBalance: number;
  endBalance: number;
  debitAmount: number;
  creditAmount: number;
}

// ---------------------------------------------------------------------------
// DAIMS File A Import (Appropriations Account)
// ---------------------------------------------------------------------------

const DAIMS_FILE_A_REQUIRED = [
  'AllocationTransferAgencyIdentifier',
  'AgencyIdentifier',
  'MainAccountCode',
  'BudgetAuthorityAppropriatedAmount',
  'ObligationsIncurredTotalByTAS_CPE',
];

const DAIMS_FILE_A_ALIASES: Record<string, string[]> = {
  allocationTransferAgencyId: ['AllocationTransferAgencyIdentifier', 'ATA_ID'],
  agencyId: ['AgencyIdentifier', 'AID'],
  beginningPeriodOfAvailability: ['BeginningPeriodOfAvailability', 'BPOA'],
  endingPeriodOfAvailability: ['EndingPeriodOfAvailability', 'EPOA'],
  availabilityTypeCode: ['AvailabilityTypeCode', 'ATC'],
  mainAccountCode: ['MainAccountCode', 'MAC'],
  subAccountCode: ['SubAccountCode', 'SAC'],
  budgetAuthorityAppropriatedAmount: ['BudgetAuthorityAppropriatedAmount', 'BudgetAuth'],
  otherBudgetaryResourcesAmount: ['OtherBudgetaryResourcesAmount_CPE', 'OtherBR'],
  totalBudgetaryResources: ['TotalBudgetaryResources_CPE', 'TotalBR'],
  obligationsIncurred: ['ObligationsIncurredTotalByTAS_CPE', 'Obligations'],
  deobligations: ['DeobligationsRecoveriesRefundsByTAS_CPE', 'Deobligations'],
  unobligatedBalance: ['UnobligatedBalance_CPE', 'UOB'],
  grossOutlayAmount: ['GrossOutlayAmountByTAS_CPE', 'Outlays'],
  statusOfBudgetaryResourcesTotal: ['StatusOfBudgetaryResourcesTotal_CPE', 'SOBR'],
};

/**
 * Import a DAIMS File A (Appropriations Account) spreadsheet.
 */
export function importDAIMSFile(buffer: Parameters<typeof parseExcel>[0], sheetName?: string): ImportResult<DAIMSFileARecord> {
  const parsed = parseExcel(buffer, sheetName);
  if (parsed.errors.length > 0) {
    return { success: false, recordCount: 0, records: [], errors: parsed.errors.map(e => ({
      row: 0, field: '', value: '', message: e,
    })), warnings: [] };
  }

  const errors: ImportError[] = [];
  const warnings: string[] = [];
  const records: DAIMSFileARecord[] = [];

  // Validate required columns
  const headerSet = new Set(parsed.headers.map(h => h.toLowerCase()));
  for (const req of DAIMS_FILE_A_REQUIRED) {
    if (!parsed.headers.includes(req) && !headerSet.has(req.toLowerCase())) {
      warnings.push(`Expected column "${req}" not found. Import may use aliases.`);
    }
  }

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const rowNum = i + 2; // header + 1-indexed

    const record = mapRowToDAIMS(row, rowNum, errors);
    if (record) {
      records.push(record);
    }
  }

  return {
    success: errors.length === 0,
    recordCount: records.length,
    records,
    errors,
    warnings,
  };
}

function mapRowToDAIMS(
  row: Record<string, string>,
  rowNum: number,
  errors: ImportError[],
): DAIMSFileARecord | null {
  function resolve(field: string): string {
    const aliases = DAIMS_FILE_A_ALIASES[field] ?? [field];
    for (const alias of aliases) {
      if (row[alias] !== undefined && row[alias] !== '') return row[alias];
      // Case-insensitive fallback
      const key = Object.keys(row).find(k => k.toLowerCase() === alias.toLowerCase());
      if (key && row[key] !== undefined && row[key] !== '') return row[key];
    }
    return '';
  }

  function resolveNum(field: string): number {
    const val = resolve(field);
    if (val === '') return 0;
    const num = parseFloat(val.replace(/[,$]/g, ''));
    if (isNaN(num)) {
      errors.push({ row: rowNum, field, value: val, message: `Invalid number: "${val}"` });
      return 0;
    }
    return num;
  }

  const mainAccountCode = resolve('mainAccountCode');
  if (!mainAccountCode) {
    errors.push({ row: rowNum, field: 'mainAccountCode', value: '', message: 'MainAccountCode is required' });
    return null;
  }

  return {
    allocationTransferAgencyId: resolve('allocationTransferAgencyId'),
    agencyId: resolve('agencyId'),
    beginningPeriodOfAvailability: resolve('beginningPeriodOfAvailability'),
    endingPeriodOfAvailability: resolve('endingPeriodOfAvailability'),
    availabilityTypeCode: resolve('availabilityTypeCode'),
    mainAccountCode,
    subAccountCode: resolve('subAccountCode'),
    budgetAuthorityAppropriatedAmount: resolveNum('budgetAuthorityAppropriatedAmount'),
    otherBudgetaryResourcesAmount: resolveNum('otherBudgetaryResourcesAmount'),
    totalBudgetaryResources: resolveNum('totalBudgetaryResources'),
    obligationsIncurred: resolveNum('obligationsIncurred'),
    deobligations: resolveNum('deobligations'),
    unobligatedBalance: resolveNum('unobligatedBalance'),
    grossOutlayAmount: resolveNum('grossOutlayAmount'),
    statusOfBudgetaryResourcesTotal: resolveNum('statusOfBudgetaryResourcesTotal'),
  };
}

// ---------------------------------------------------------------------------
// SFIS Matrix Import
// ---------------------------------------------------------------------------

/**
 * Import an SFIS element matrix spreadsheet.
 */
export function importSFISMatrix(buffer: Parameters<typeof parseExcel>[0], sheetName?: string): ImportResult<SFISElement> {
  const parsed = parseExcel(buffer, sheetName);
  if (parsed.errors.length > 0) {
    return { success: false, recordCount: 0, records: [], errors: parsed.errors.map(e => ({
      row: 0, field: '', value: '', message: e,
    })), warnings: [] };
  }

  const errors: ImportError[] = [];
  const warnings: string[] = [];
  const records: SFISElement[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const rowNum = i + 2;

    const code = row['ElementCode'] || row['Code'] || row['SFIS_Code'] || '';
    const name = row['ElementName'] || row['Name'] || row['Description'] || '';

    if (!code) {
      errors.push({ row: rowNum, field: 'ElementCode', value: '', message: 'Element code is required' });
      continue;
    }

    const accountType = (row['AccountType'] || row['Type'] || 'expense').toLowerCase();
    const validTypes = ['asset', 'liability', 'equity', 'revenue', 'expense'];

    records.push({
      elementCode: code,
      elementName: name,
      parentCode: row['ParentCode'] || row['Parent'] || '',
      level: parseInt(row['Level'] || '1', 10) || 1,
      category: row['Category'] || '',
      accountType: validTypes.includes(accountType) ? accountType as SFISElement['accountType'] : 'expense',
      normalBalance: (row['NormalBalance'] || 'debit').toLowerCase() === 'credit' ? 'credit' : 'debit',
    });
  }

  return {
    success: errors.length === 0,
    recordCount: records.length,
    records,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// GTAS Trial Balance Import
// ---------------------------------------------------------------------------

/**
 * Import a GTAS trial balance file.
 */
export function importGTASTrialBalance(buffer: Parameters<typeof parseExcel>[0], sheetName?: string): ImportResult<GTASTrialBalanceEntry> {
  const parsed = parseExcel(buffer, sheetName);
  if (parsed.errors.length > 0) {
    return { success: false, recordCount: 0, records: [], errors: parsed.errors.map(e => ({
      row: 0, field: '', value: '', message: e,
    })), warnings: [] };
  }

  const errors: ImportError[] = [];
  const warnings: string[] = [];
  const records: GTASTrialBalanceEntry[] = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const rowNum = i + 2;

    const ussgl = row['USSGLAccountNumber'] || row['USSGL'] || row['AccountNumber'] || '';
    if (!ussgl) {
      errors.push({ row: rowNum, field: 'USSGLAccountNumber', value: '', message: 'USSGL account number is required' });
      continue;
    }

    const parseNum = (field: string, ...aliases: string[]): number => {
      for (const f of [field, ...aliases]) {
        if (row[f] !== undefined && row[f] !== '') {
          const val = parseFloat(row[f].replace(/[,$]/g, ''));
          if (!isNaN(val)) return val;
        }
      }
      return 0;
    };

    records.push({
      fiscalYear: parseInt(row['FiscalYear'] || row['FY'] || '0', 10),
      period: parseInt(row['Period'] || row['FiscalPeriod'] || '0', 10),
      agencyId: row['AgencyIdentifier'] || row['AgencyID'] || '',
      treasuryAccountSymbol: row['TreasuryAccountSymbol'] || row['TAS'] || '',
      ussglAccountNumber: ussgl,
      beginBalance: parseNum('BeginningBalance', 'BeginBalance', 'OpeningBalance'),
      endBalance: parseNum('EndingBalance', 'EndBalance', 'ClosingBalance'),
      debitAmount: parseNum('DebitAmount', 'Debits'),
      creditAmount: parseNum('CreditAmount', 'Credits'),
    });
  }

  // Cross-validate: debits should equal credits
  const totalDebits = records.reduce((s, r) => s + r.debitAmount, 0);
  const totalCredits = records.reduce((s, r) => s + r.creditAmount, 0);
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    warnings.push(
      `Trial balance is out of balance: Debits=$${totalDebits.toLocaleString()}, ` +
      `Credits=$${totalCredits.toLocaleString()}, Difference=$${Math.abs(totalDebits - totalCredits).toLocaleString()}`
    );
  }

  return {
    success: errors.length === 0,
    recordCount: records.length,
    records,
    errors,
    warnings,
  };
}

/**
 * Generic validation for any DoD import — checks for common issues.
 */
export function validateDoDImport(parsed: ParseResult): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (parsed.data.length === 0) {
    issues.push('File contains no data rows');
  }

  if (parsed.headers.length === 0) {
    issues.push('No headers detected in file');
  }

  // Check for suspiciously large files
  if (parsed.data.length > 100_000) {
    issues.push(`File contains ${parsed.data.length.toLocaleString()} rows — consider splitting for performance`);
  }

  // Check for duplicate headers
  const headerCounts = new Map<string, number>();
  for (const h of parsed.headers) {
    headerCounts.set(h, (headerCounts.get(h) ?? 0) + 1);
  }
  for (const [header, count] of Array.from(headerCounts.entries())) {
    if (count > 1) {
      issues.push(`Duplicate header "${header}" appears ${count} times`);
    }
  }

  return { valid: issues.length === 0, issues };
}
