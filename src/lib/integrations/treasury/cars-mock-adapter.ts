/**
 * Mock Treasury CARS Adapter
 *
 * Provides a mock implementation of the TreasuryCARSAdapter interface
 * for development, testing, and demo environments. Returns realistic
 * sample data without requiring actual Treasury system access.
 */

import type {
  TreasuryCARSAdapter,
  FBWTBalance,
  GTASSubmission,
  GTASTrialBalanceRow,
  ReconciliationResult,
} from './cars-interface';

export class CARSMockAdapter implements TreasuryCARSAdapter {
  private submissions = new Map<string, GTASSubmission>();

  async fetchFBWTBalances(params: {
    agencyId: string;
    fiscalYear: number;
    period: number;
  }): Promise<FBWTBalance[]> {
    // Generate sample FBWT balances for common TAS
    const sampleTAS = [
      '097-0100',
      '097-0200',
      '097-0300',
      '021-1804',
    ];

    return sampleTAS.map(tas => ({
      treasuryAccountSymbol: tas,
      agencyId: params.agencyId,
      fiscalYear: params.fiscalYear,
      period: params.period,
      openingBalance: 1_000_000 + Math.floor(Math.random() * 9_000_000),
      closingBalance: 900_000 + Math.floor(Math.random() * 8_000_000),
      disbursements: 100_000 + Math.floor(Math.random() * 500_000),
      collections: 50_000 + Math.floor(Math.random() * 200_000),
      adjustments: Math.floor(Math.random() * 10_000) - 5_000,
      lastUpdated: new Date().toISOString(),
    }));
  }

  async submitGTAS(params: {
    agencyId: string;
    fiscalYear: number;
    period: number;
    trialBalanceRows: GTASTrialBalanceRow[];
  }): Promise<GTASSubmission> {
    const submissionId = `GTAS-${params.agencyId}-${params.fiscalYear}-P${params.period}-${Date.now()}`;

    // Simulate edit checks
    const totalDebits = params.trialBalanceRows.reduce(
      (s, r) => s + r.budgetaryDebit + r.proprietaryDebit, 0,
    );
    const totalCredits = params.trialBalanceRows.reduce(
      (s, r) => s + r.budgetaryCredit + r.proprietaryCredit, 0,
    );

    const editCheckResults = [
      {
        editId: 'GTAS-001',
        severity: 'fatal' as const,
        passed: Math.abs(totalDebits - totalCredits) < 0.01,
        message: Math.abs(totalDebits - totalCredits) < 0.01
          ? 'Trial balance is in balance'
          : `Trial balance out of balance by $${Math.abs(totalDebits - totalCredits).toFixed(2)}`,
      },
      {
        editId: 'GTAS-002',
        severity: 'warning' as const,
        passed: params.trialBalanceRows.length > 0,
        message: params.trialBalanceRows.length > 0
          ? 'Trial balance has data'
          : 'No trial balance rows submitted',
      },
    ];

    const allPassed = editCheckResults.every(e => e.severity !== 'fatal' || e.passed);

    const submission: GTASSubmission = {
      submissionId,
      agencyId: params.agencyId,
      fiscalYear: params.fiscalYear,
      period: params.period,
      status: allPassed ? 'submitted' : 'rejected',
      submittedAt: new Date().toISOString(),
      editCheckResults,
      trialBalanceRows: params.trialBalanceRows,
    };

    this.submissions.set(submissionId, submission);
    return submission;
  }

  async getGTASStatus(submissionId: string): Promise<GTASSubmission> {
    const submission = this.submissions.get(submissionId);
    if (!submission) {
      throw new Error(`GTAS submission not found: ${submissionId}`);
    }
    return submission;
  }

  async reconcileAccounts(params: {
    agencyId: string;
    fiscalYear: number;
    period: number;
    agencyBalances: { treasuryAccountSymbol: string; balance: number }[];
  }): Promise<ReconciliationResult[]> {
    return params.agencyBalances.map(ab => {
      // Simulate a small difference for realism
      const treasuryBalance = ab.balance + (Math.random() > 0.7 ? Math.floor(Math.random() * 1000) - 500 : 0);
      const diff = Math.round((ab.balance - treasuryBalance) * 100) / 100;

      return {
        treasuryAccountSymbol: ab.treasuryAccountSymbol,
        agencyBalance: ab.balance,
        treasuryBalance,
        difference: diff,
        reconciled: Math.abs(diff) < 0.01,
        reconciliationDate: new Date().toISOString(),
        adjustments: Math.abs(diff) > 0 ? [{
          type: 'in_transit' as const,
          amount: diff,
          description: 'Timing difference — disbursements in transit',
        }] : [],
      };
    });
  }

  async lookupTAS(treasuryAccountSymbol: string): Promise<{
    agencyId: string;
    mainAccountCode: string;
    subAccountCode: string;
    availabilityTypeCode: string;
    title: string;
    status: 'active' | 'expired' | 'cancelled';
  } | null> {
    const parts = treasuryAccountSymbol.split('-');
    if (parts.length < 2) return null;

    return {
      agencyId: parts[0],
      mainAccountCode: parts[1],
      subAccountCode: parts[2] || '000',
      availabilityTypeCode: 'X',
      title: `Account ${treasuryAccountSymbol}`,
      status: 'active',
    };
  }
}
