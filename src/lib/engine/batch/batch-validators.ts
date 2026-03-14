import type { BatchRecord, BatchError } from './batch-processor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requiredField(
  record: BatchRecord,
  field: string,
  errorCode: string,
): BatchError | null {
  const value = record.data[field];
  if (value === undefined || value === null || value === '') {
    return {
      rowNumber: record.rowNumber,
      field,
      errorCode,
      message: `Missing required field: ${field}`,
    };
  }
  return null;
}

function numericField(
  record: BatchRecord,
  field: string,
  errorCode: string,
  options: { positive?: boolean } = {},
): BatchError | null {
  const value = record.data[field];
  if (value === undefined || value === null || value === '') return null; // handled by requiredField
  const num = typeof value === 'number' ? value : Number(value);
  if (isNaN(num)) {
    return {
      rowNumber: record.rowNumber,
      field,
      errorCode,
      message: `Field "${field}" must be a valid number`,
    };
  }
  if (options.positive && num <= 0) {
    return {
      rowNumber: record.rowNumber,
      field,
      errorCode,
      message: `Field "${field}" must be a positive number`,
    };
  }
  return null;
}

function dateField(
  record: BatchRecord,
  field: string,
  errorCode: string,
): BatchError | null {
  const value = record.data[field];
  if (value === undefined || value === null || value === '') return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return {
      rowNumber: record.rowNumber,
      field,
      errorCode,
      message: `Field "${field}" must be a valid date`,
    };
  }
  return null;
}

function collect(...maybeErrors: (BatchError | null)[]): BatchError[] {
  return maybeErrors.filter((e): e is BatchError => e !== null);
}

// ---------------------------------------------------------------------------
// Obligation Import Validator
// ---------------------------------------------------------------------------

/**
 * Validate obligation import record.
 *
 * Required fields: appropriationId, amount, obligatedDate, documentType,
 * budgetObjectCode, vendorOrPayee, fiscalYear
 */
export function validateObligationImport(record: BatchRecord): BatchError[] {
  return collect(
    requiredField(record, 'appropriationId', 'OBL_MISSING_APPROPRIATION'),
    requiredField(record, 'amount', 'OBL_MISSING_AMOUNT'),
    numericField(record, 'amount', 'OBL_INVALID_AMOUNT', { positive: true }),
    requiredField(record, 'obligatedDate', 'OBL_MISSING_DATE'),
    dateField(record, 'obligatedDate', 'OBL_INVALID_DATE'),
    requiredField(record, 'documentType', 'OBL_MISSING_DOC_TYPE'),
    requiredField(record, 'budgetObjectCode', 'OBL_MISSING_BOC'),
    requiredField(record, 'vendorOrPayee', 'OBL_MISSING_VENDOR'),
    requiredField(record, 'fiscalYear', 'OBL_MISSING_FY'),
    numericField(record, 'fiscalYear', 'OBL_INVALID_FY'),
  );
}

// ---------------------------------------------------------------------------
// Disbursement Import Validator
// ---------------------------------------------------------------------------

/**
 * Validate disbursement import record.
 *
 * Required fields: obligationId, amount, paymentMethod, paymentDate,
 * voucherNumber
 */
export function validateDisbursementImport(record: BatchRecord): BatchError[] {
  const errors = collect(
    requiredField(record, 'obligationId', 'DISB_MISSING_OBLIGATION'),
    requiredField(record, 'amount', 'DISB_MISSING_AMOUNT'),
    numericField(record, 'amount', 'DISB_INVALID_AMOUNT', { positive: true }),
    requiredField(record, 'paymentMethod', 'DISB_MISSING_PAYMENT_METHOD'),
    requiredField(record, 'paymentDate', 'DISB_MISSING_DATE'),
    dateField(record, 'paymentDate', 'DISB_INVALID_DATE'),
    requiredField(record, 'voucherNumber', 'DISB_MISSING_VOUCHER'),
  );

  // Validate paymentMethod enum if present
  const method = record.data['paymentMethod'];
  if (method && !['EFT', 'check', 'wire', 'intra_governmental'].includes(method)) {
    errors.push({
      rowNumber: record.rowNumber,
      field: 'paymentMethod',
      errorCode: 'DISB_INVALID_PAYMENT_METHOD',
      message: `Invalid payment method "${method}". Must be one of: EFT, check, wire, intra_governmental`,
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Journal Entry Import Validator
// ---------------------------------------------------------------------------

/**
 * Validate journal entry import record.
 *
 * Required fields: debitAccount, creditAccount, amount, description,
 * postingDate, preparedBy
 */
export function validateJournalEntryImport(record: BatchRecord): BatchError[] {
  const errors = collect(
    requiredField(record, 'debitAccount', 'JE_MISSING_DEBIT_ACCOUNT'),
    requiredField(record, 'creditAccount', 'JE_MISSING_CREDIT_ACCOUNT'),
    requiredField(record, 'amount', 'JE_MISSING_AMOUNT'),
    numericField(record, 'amount', 'JE_INVALID_AMOUNT', { positive: true }),
    requiredField(record, 'description', 'JE_MISSING_DESCRIPTION'),
    requiredField(record, 'postingDate', 'JE_MISSING_POSTING_DATE'),
    dateField(record, 'postingDate', 'JE_INVALID_POSTING_DATE'),
    requiredField(record, 'preparedBy', 'JE_MISSING_PREPARED_BY'),
  );

  // Debit and credit accounts must differ
  const debit = record.data['debitAccount'];
  const credit = record.data['creditAccount'];
  if (debit && credit && debit === credit) {
    errors.push({
      rowNumber: record.rowNumber,
      field: 'creditAccount',
      errorCode: 'JE_SAME_DEBIT_CREDIT',
      message: 'Debit and credit accounts must be different',
    });
  }

  return errors;
}
