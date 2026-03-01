/**
 * Treasury Central Accounting Reporting System (CARS) Interface
 *
 * Defines the integration interface for communicating with Treasury's
 * CARS/CIR (Central Information Repository) system. CARS is the
 * government-wide accounting system that tracks Fund Balance with Treasury
 * (FBWT), processes GTAS submissions, and manages Treasury Account Symbols.
 *
 * References:
 *   - Treasury Financial Manual (TFM) Vol I, Part 2, Ch 6000
 *   - DoD FMR Vol 4 Ch 2: FBWT Reconciliation
 *   - GTAS submission requirements
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FBWTBalance {
  treasuryAccountSymbol: string;
  agencyId: string;
  fiscalYear: number;
  period: number;
  openingBalance: number;
  closingBalance: number;
  disbursements: number;
  collections: number;
  adjustments: number;
  lastUpdated: string;
}

export interface GTASSubmission {
  submissionId: string;
  agencyId: string;
  fiscalYear: number;
  period: number;
  status: 'draft' | 'submitted' | 'accepted' | 'rejected' | 'certified';
  submittedAt?: string;
  certifiedAt?: string;
  editCheckResults?: GTASEditCheckResult[];
  trialBalanceRows: GTASTrialBalanceRow[];
}

export interface GTASTrialBalanceRow {
  ussglAccountNumber: string;
  beginBalance: number;
  endBalance: number;
  budgetaryDebit: number;
  budgetaryCredit: number;
  proprietaryDebit: number;
  proprietaryCredit: number;
}

export interface GTASEditCheckResult {
  editId: string;
  severity: 'fatal' | 'warning' | 'informational';
  passed: boolean;
  message: string;
}

export interface ReconciliationResult {
  treasuryAccountSymbol: string;
  agencyBalance: number;
  treasuryBalance: number;
  difference: number;
  reconciled: boolean;
  reconciliationDate: string;
  adjustments: ReconciliationAdjustment[];
}

export interface ReconciliationAdjustment {
  type: 'in_transit' | 'timing' | 'error' | 'other';
  amount: number;
  description: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface TreasuryCARSAdapter {
  /**
   * Fetch FBWT balances for an agency from Treasury.
   */
  fetchFBWTBalances(params: {
    agencyId: string;
    fiscalYear: number;
    period: number;
  }): Promise<FBWTBalance[]>;

  /**
   * Submit a GTAS trial balance to Treasury.
   */
  submitGTAS(params: {
    agencyId: string;
    fiscalYear: number;
    period: number;
    trialBalanceRows: GTASTrialBalanceRow[];
  }): Promise<GTASSubmission>;

  /**
   * Check the status of a GTAS submission.
   */
  getGTASStatus(submissionId: string): Promise<GTASSubmission>;

  /**
   * Reconcile agency balances against Treasury balances.
   */
  reconcileAccounts(params: {
    agencyId: string;
    fiscalYear: number;
    period: number;
    agencyBalances: { treasuryAccountSymbol: string; balance: number }[];
  }): Promise<ReconciliationResult[]>;

  /**
   * Fetch Treasury Account Symbol (TAS) details.
   */
  lookupTAS(treasuryAccountSymbol: string): Promise<{
    agencyId: string;
    mainAccountCode: string;
    subAccountCode: string;
    availabilityTypeCode: string;
    title: string;
    status: 'active' | 'expired' | 'cancelled';
  } | null>;
}
