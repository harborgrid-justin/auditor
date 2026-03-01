/**
 * DFAS (Defense Finance and Accounting Service) Interface
 *
 * Defines the integration interface for exchanging data with DFAS,
 * the primary provider of finance and accounting services for DoD.
 * DFAS handles military/civilian payroll, vendor payments, and
 * travel reimbursements.
 *
 * References:
 *   - DoD FMR Vol 5: Disbursing Policy
 *   - DoD FMR Vol 7A: Military Pay Policy
 *   - DoD FMR Vol 8: Civilian Pay Policy
 *   - DoD FMR Vol 9: Travel Policy
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DFASPayrollData {
  payPeriod: string;
  componentCode: string;
  totalMilitaryPay: number;
  totalCivilianPay: number;
  totalAllowances: number;
  totalDeductions: number;
  netPayAmount: number;
  recordCount: number;
  records: DFASPayRecord[];
}

export interface DFASPayRecord {
  employeeId: string;
  payType: 'military_basic' | 'military_special' | 'military_incentive' | 'civilian_base' | 'civilian_overtime' | 'civilian_premium';
  grossAmount: number;
  deductions: number;
  netAmount: number;
  payPeriod: string;
  accountingCode: string;
}

export interface DFASDisbursementData {
  voucherId: string;
  disbursementType: 'vendor' | 'travel' | 'payroll' | 'advance' | 'other';
  payeeId: string;
  payeeName: string;
  amount: number;
  obligationId: string;
  accountingCode: string;
  disbursementDate: string;
  checkNumber?: string;
  eftIndicator: boolean;
  status: 'pending' | 'processed' | 'cancelled' | 'returned';
}

export interface DFASVoucherSubmission {
  voucherId: string;
  voucherType: 'SF-1034' | 'SF-1049' | 'DD-1131' | 'other';
  amount: number;
  payeeId: string;
  accountingClassification: string;
  obligationDocumentNumber: string;
  certifyingOfficerId: string;
  disbursementScheduleDate: string;
}

export interface DFASSubmissionResult {
  voucherId: string;
  status: 'accepted' | 'rejected' | 'pending_review';
  confirmationNumber?: string;
  rejectionReasons?: string[];
  processedAt?: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface DFASAdapter {
  /**
   * Fetch payroll data for a component and pay period.
   */
  fetchPayrollData(params: {
    componentCode: string;
    payPeriod: string;
    payType?: 'military' | 'civilian' | 'all';
  }): Promise<DFASPayrollData>;

  /**
   * Fetch disbursement records.
   */
  fetchDisbursementData(params: {
    componentCode: string;
    startDate: string;
    endDate: string;
    disbursementType?: DFASDisbursementData['disbursementType'];
  }): Promise<DFASDisbursementData[]>;

  /**
   * Submit a payment voucher to DFAS for processing.
   */
  submitVoucher(voucher: DFASVoucherSubmission): Promise<DFASSubmissionResult>;

  /**
   * Check the status of a submitted voucher.
   */
  getVoucherStatus(voucherId: string): Promise<DFASSubmissionResult>;

  /**
   * Fetch daily Statement of Accountability data (DD-2657).
   */
  fetchDailyAccountability(params: {
    disbursementStationSymbol: string;
    date: string;
  }): Promise<{
    openingBalance: number;
    closingBalance: number;
    totalReceipts: number;
    totalDisbursements: number;
    cashOnHand: number;
  }>;
}
