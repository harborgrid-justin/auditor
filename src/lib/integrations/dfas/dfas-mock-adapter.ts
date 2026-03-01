/**
 * Mock DFAS Adapter
 *
 * Provides a mock implementation of the DFASAdapter interface for
 * development, testing, and demo environments.
 */

import type {
  DFASAdapter,
  DFASPayrollData,
  DFASDisbursementData,
  DFASVoucherSubmission,
  DFASSubmissionResult,
} from './dfas-interface';

export class DFASMockAdapter implements DFASAdapter {
  private vouchers = new Map<string, DFASSubmissionResult>();

  async fetchPayrollData(params: {
    componentCode: string;
    payPeriod: string;
    payType?: 'military' | 'civilian' | 'all';
  }): Promise<DFASPayrollData> {
    const militaryPay = 5_000_000 + Math.floor(Math.random() * 2_000_000);
    const civilianPay = 3_000_000 + Math.floor(Math.random() * 1_500_000);
    const allowances = 800_000 + Math.floor(Math.random() * 400_000);
    const deductions = 1_200_000 + Math.floor(Math.random() * 500_000);

    return {
      payPeriod: params.payPeriod,
      componentCode: params.componentCode,
      totalMilitaryPay: militaryPay,
      totalCivilianPay: civilianPay,
      totalAllowances: allowances,
      totalDeductions: deductions,
      netPayAmount: militaryPay + civilianPay + allowances - deductions,
      recordCount: 150 + Math.floor(Math.random() * 100),
      records: [
        {
          employeeId: 'SAMPLE-001',
          payType: 'military_basic',
          grossAmount: 4500,
          deductions: 900,
          netAmount: 3600,
          payPeriod: params.payPeriod,
          accountingCode: `${params.componentCode}-0100-MILPERS`,
        },
        {
          employeeId: 'SAMPLE-002',
          payType: 'civilian_base',
          grossAmount: 3800,
          deductions: 800,
          netAmount: 3000,
          payPeriod: params.payPeriod,
          accountingCode: `${params.componentCode}-0200-CIVPAY`,
        },
      ],
    };
  }

  async fetchDisbursementData(params: {
    componentCode: string;
    startDate: string;
    endDate: string;
    disbursementType?: DFASDisbursementData['disbursementType'];
  }): Promise<DFASDisbursementData[]> {
    return [
      {
        voucherId: `V-${Date.now()}-001`,
        disbursementType: params.disbursementType ?? 'vendor',
        payeeId: 'VENDOR-001',
        payeeName: 'Acme Defense Corp',
        amount: 125_000,
        obligationId: 'OBL-2025-001',
        accountingCode: `${params.componentCode}-0300-PROC`,
        disbursementDate: params.startDate,
        eftIndicator: true,
        status: 'processed',
      },
      {
        voucherId: `V-${Date.now()}-002`,
        disbursementType: 'travel',
        payeeId: 'TRV-001',
        payeeName: 'Smith, John SGT',
        amount: 2_450,
        obligationId: 'OBL-2025-002',
        accountingCode: `${params.componentCode}-0100-TRAVEL`,
        disbursementDate: params.startDate,
        eftIndicator: true,
        status: 'processed',
      },
    ];
  }

  async submitVoucher(voucher: DFASVoucherSubmission): Promise<DFASSubmissionResult> {
    const result: DFASSubmissionResult = {
      voucherId: voucher.voucherId,
      status: 'accepted',
      confirmationNumber: `DFAS-${Date.now()}`,
      processedAt: new Date().toISOString(),
    };

    // Simulate rejection for missing certification
    if (!voucher.certifyingOfficerId) {
      result.status = 'rejected';
      result.rejectionReasons = ['Missing certifying officer ID (DoD FMR Vol 5 Ch 2)'];
      result.confirmationNumber = undefined;
      result.processedAt = undefined;
    }

    this.vouchers.set(voucher.voucherId, result);
    return result;
  }

  async getVoucherStatus(voucherId: string): Promise<DFASSubmissionResult> {
    const result = this.vouchers.get(voucherId);
    if (!result) {
      return {
        voucherId,
        status: 'pending_review',
      };
    }
    return result;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetchDailyAccountability(params: {
    disbursementStationSymbol: string;
    date: string;
  }): Promise<{
    openingBalance: number;
    closingBalance: number;
    totalReceipts: number;
    totalDisbursements: number;
    cashOnHand: number;
  }> {
    const opening = 500_000 + Math.floor(Math.random() * 200_000);
    const receipts = 50_000 + Math.floor(Math.random() * 100_000);
    const disbursements = 80_000 + Math.floor(Math.random() * 120_000);
    const closing = opening + receipts - disbursements;

    return {
      openingBalance: opening,
      closingBalance: closing,
      totalReceipts: receipts,
      totalDisbursements: disbursements,
      cashOnHand: Math.floor(closing * 0.05),
    };
  }
}
