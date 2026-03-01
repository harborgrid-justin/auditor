/**
 * Common integration interface for ERP/Accounting connectors.
 */

export interface IntegrationConfig {
  provider: 'quickbooks' | 'xero';
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface IntegrationToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  companyId?: string;
}

export interface IntegrationTrialBalance {
  accountNumber: string;
  accountName: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  balance: number;
  currency: string;
}

export interface IntegrationJournalEntry {
  entryNumber: string;
  date: string;
  description: string;
  lines: {
    accountName: string;
    debit: number;
    credit: number;
  }[];
  postedBy: string;
}

export interface IntegrationProvider {
  /**
   * Get the OAuth authorization URL to redirect the user to.
   */
  getAuthUrl(state: string): string;

  /**
   * Exchange an authorization code for access/refresh tokens.
   */
  exchangeCode(code: string): Promise<IntegrationToken>;

  /**
   * Refresh an expired access token.
   */
  refreshAccessToken(refreshToken: string): Promise<IntegrationToken>;

  /**
   * Fetch trial balance data from the connected system.
   */
  fetchTrialBalance(token: IntegrationToken, startDate: string, endDate: string): Promise<IntegrationTrialBalance[]>;

  /**
   * Fetch journal entries from the connected system.
   */
  fetchJournalEntries(token: IntegrationToken, startDate: string, endDate: string): Promise<IntegrationJournalEntry[]>;
}
