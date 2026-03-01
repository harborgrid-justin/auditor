/**
 * DD-2657 Daily Statement of Accountability Generator
 *
 * Generates the DD Form 2657, required by DoD FMR Vol. 5 for disbursing
 * officers to account for all cash, negotiable instruments, and deposits
 * under their control on a daily basis.
 *
 * The statement balances:
 *   Opening Balance + Receipts - Disbursements = Closing Balance
 *   Closing Balance = Cash on Hand + Deposits in Transit
 *                   - Checks Outstanding + Advances Outstanding
 *
 * Required for:
 *   - Daily accountability of disbursing officers (Vol. 5, Ch. 2)
 *   - Relief from accountability (Vol. 5, Ch. 6)
 *   - Transfer of accountability (Vol. 5, Ch. 7)
 *   - Audit of disbursing operations (Vol. 5, Ch. 19)
 *
 * References:
 *   - DoD FMR Vol. 5, Ch. 2: Disbursing Officer Accountability
 *   - DoD FMR Vol. 5, Ch. 9: Daily Statement of Accountability
 *   - 31 U.S.C. §3321-3325: Disbursing Officials
 *   - 31 U.S.C. §3528: Accountable Officials
 */

import type {
  Disbursement,
  Collection,
  DD2657Statement,
  DD2657ReceiptLine,
  DD2657DisbursementLine,
} from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a DD-2657 Daily Statement of Accountability.
 *
 * Per DoD FMR Vol. 5, Ch. 9: Disbursing officers must prepare a daily
 * statement showing all receipts and disbursements, reconciled to their
 * cash and deposit positions. The statement must balance — any difference
 * indicates a shortage or overage that requires investigation.
 *
 * @param disbursingOfficerId - ID of the disbursing officer
 * @param disbursingOfficerName - Name of the disbursing officer
 * @param disbursingStationSymbol - DSSN (Disbursing Station Symbol Number)
 * @param statementDate - Date of the statement (ISO string)
 * @param fiscalYear - The fiscal year
 * @param openingBalance - Opening cash/deposit balance for the day
 * @param receipts - Collections/receipts received during the day
 * @param disbursements - Disbursements made during the day
 * @param cashOnHand - Physical cash and negotiable instruments on hand
 * @param depositsInTransit - Deposits made but not yet credited by Treasury
 * @param checksOutstanding - Checks issued but not yet presented for payment
 * @param advancesOutstanding - Outstanding advance payments
 * @returns DD2657Statement
 */
export function generateDD2657(
  disbursingOfficerId: string,
  disbursingOfficerName: string,
  disbursingStationSymbol: string,
  statementDate: string,
  fiscalYear: number,
  openingBalance: number,
  receipts: Collection[],
  disbursements: Disbursement[],
  cashOnHand: number,
  depositsInTransit: number,
  checksOutstanding: number,
  advancesOutstanding: number,
): DD2657Statement {
  // Build receipt lines
  const receiptLines: DD2657ReceiptLine[] = receipts.map((r, i) => ({
    lineNumber: i + 1,
    source: r.sourceEntity,
    treasuryAccountSymbol: r.accountingClassification || 'N/A',
    amount: round2(r.amount),
    documentNumber: r.depositNumber,
  }));

  const totalReceipts = round2(
    receiptLines.reduce((sum, r) => sum + r.amount, 0),
  );

  // Build disbursement lines
  const disbursementLines: DD2657DisbursementLine[] = disbursements.map((d, i) => ({
    lineNumber: i + 1,
    payee: d.payeeId || 'Unknown',
    treasuryAccountSymbol: d.disbursementNumber,
    amount: round2(d.amount),
    voucherNumber: d.voucherNumber || d.disbursementNumber,
    paymentMethod: d.paymentMethod,
  }));

  const totalDisbursements = round2(
    disbursementLines.reduce((sum, d) => sum + d.amount, 0),
  );

  // Compute closing balance
  const closingBalance = round2(openingBalance + totalReceipts - totalDisbursements);

  // Compute total accountability
  const totalAccountability = round2(
    cashOnHand + depositsInTransit - checksOutstanding + advancesOutstanding,
  );

  // Balance check
  const balanceDifference = round2(closingBalance - totalAccountability);
  const isBalanced = Math.abs(balanceDifference) < 0.01;

  return {
    disbursingOfficerId,
    disbursingOfficerName,
    disbursingStationSymbol,
    statementDate,
    fiscalYear,
    openingBalance: round2(openingBalance),
    receipts: receiptLines,
    totalReceipts,
    disbursements: disbursementLines,
    totalDisbursements,
    closingBalance,
    cashOnHand: round2(cashOnHand),
    depositsInTransit: round2(depositsInTransit),
    checksOutstanding: round2(checksOutstanding),
    advancesOutstanding: round2(advancesOutstanding),
    totalAccountability,
    balanceDifference,
    isBalanced,
  };
}

/**
 * Validate a DD-2657 for internal consistency.
 *
 * Per DoD FMR Vol. 5, Ch. 9: The daily statement must balance.
 * Discrepancies indicate shortages or overages requiring investigation
 * and potential pecuniary liability determination.
 *
 * @param data - DD2657Statement to validate
 * @returns Validation result with errors
 */
export function validateDD2657(
  data: DD2657Statement,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. Closing balance = opening + receipts - disbursements
  const expectedClosing = round2(
    data.openingBalance + data.totalReceipts - data.totalDisbursements,
  );
  const closingDiff = Math.abs(expectedClosing - data.closingBalance);
  if (closingDiff > 0.01) {
    errors.push(
      `Closing balance ($${data.closingBalance.toFixed(2)}) does not equal ` +
      `opening ($${data.openingBalance.toFixed(2)}) + receipts ` +
      `($${data.totalReceipts.toFixed(2)}) - disbursements ` +
      `($${data.totalDisbursements.toFixed(2)}) = $${expectedClosing.toFixed(2)}. ` +
      `Ref: DoD FMR Vol. 5, Ch. 9.`,
    );
  }

  // 2. Accountability balance check
  if (!data.isBalanced) {
    const shortageOrOverage = data.balanceDifference > 0 ? 'overage' : 'shortage';
    errors.push(
      `Statement is unbalanced: ${shortageOrOverage} of ` +
      `$${Math.abs(data.balanceDifference).toFixed(2)}. ` +
      `Closing balance ($${data.closingBalance.toFixed(2)}) does not equal ` +
      `total accountability ($${data.totalAccountability.toFixed(2)}). ` +
      `Per DoD FMR Vol. 5, Ch. 9: Investigate and report.`,
    );
  }

  // 3. Negative balance check
  if (data.closingBalance < 0) {
    errors.push(
      `Closing balance is negative ($${data.closingBalance.toFixed(2)}). ` +
      `Disbursing officer may have exceeded authorized disbursement levels. ` +
      `Ref: DoD FMR Vol. 5, Ch. 2.`,
    );
  }

  // 4. Receipt line totals
  const computedReceipts = round2(
    data.receipts.reduce((sum, r) => sum + r.amount, 0),
  );
  if (Math.abs(computedReceipts - data.totalReceipts) > 0.01) {
    errors.push(
      `Receipt lines ($${computedReceipts.toFixed(2)}) do not sum to ` +
      `total receipts ($${data.totalReceipts.toFixed(2)}).`,
    );
  }

  // 5. Disbursement line totals
  const computedDisbursements = round2(
    data.disbursements.reduce((sum, d) => sum + d.amount, 0),
  );
  if (Math.abs(computedDisbursements - data.totalDisbursements) > 0.01) {
    errors.push(
      `Disbursement lines ($${computedDisbursements.toFixed(2)}) do not sum to ` +
      `total disbursements ($${data.totalDisbursements.toFixed(2)}).`,
    );
  }

  return { valid: errors.length === 0, errors };
}
