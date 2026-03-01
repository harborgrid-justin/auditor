/**
 * QuickBooks Online OAuth 2.0 + API Client
 *
 * Implements the IntegrationProvider interface for QuickBooks Online.
 * Requires QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET environment variables.
 */

import type {
  IntegrationProvider,
  IntegrationToken,
  IntegrationTrialBalance,
  IntegrationJournalEntry,
} from '../types';

const QBO_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QBO_API_BASE = 'https://quickbooks.api.intuit.com/v3/company';

export class QuickBooksClient implements IntegrationProvider {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.QUICKBOOKS_CLIENT_ID || '';
    this.clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET || '';
    this.redirectUri = process.env.QUICKBOOKS_REDIRECT_URI || '';
  }

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: this.redirectUri,
      state,
    });
    return `${QBO_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<IntegrationToken> {
    const response = await fetch(QBO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error(`QuickBooks token exchange failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      companyId: data.realmId,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<IntegrationToken> {
    const response = await fetch(QBO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`QuickBooks token refresh failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }

  async fetchTrialBalance(
    token: IntegrationToken,
    startDate: string,
    endDate: string
  ): Promise<IntegrationTrialBalance[]> {
    const url = `${QBO_API_BASE}/${token.companyId}/reports/TrialBalance?start_date=${startDate}&end_date=${endDate}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`QuickBooks trial balance fetch failed: ${response.statusText}`);
    }

    const data = await response.json();
    const rows = data?.Rows?.Row || [];

    return rows
      .filter((row: any) => row.ColData)
      .map((row: any) => {
        const cols = row.ColData;
        return {
          accountNumber: cols[0]?.value || '',
          accountName: cols[0]?.value || '',
          accountType: mapQBOAccountType(row.group || ''),
          balance: parseFloat(cols[1]?.value || '0') - parseFloat(cols[2]?.value || '0'),
          currency: 'USD',
        };
      });
  }

  async fetchJournalEntries(
    token: IntegrationToken,
    startDate: string,
    endDate: string
  ): Promise<IntegrationJournalEntry[]> {
    const url = `${QBO_API_BASE}/${token.companyId}/query?query=${encodeURIComponent(`SELECT * FROM JournalEntry WHERE TxnDate >= '${startDate}' AND TxnDate <= '${endDate}'`)}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`QuickBooks journal entries fetch failed: ${response.statusText}`);
    }

    const data = await response.json();
    const entries = data?.QueryResponse?.JournalEntry || [];

    return entries.map((je: any) => ({
      entryNumber: je.DocNumber || je.Id,
      date: je.TxnDate,
      description: je.PrivateNote || '',
      lines: (je.Line || []).map((line: any) => ({
        accountName: line.JournalEntryLineDetail?.AccountRef?.name || '',
        debit: line.JournalEntryLineDetail?.PostingType === 'Debit' ? parseFloat(line.Amount || '0') : 0,
        credit: line.JournalEntryLineDetail?.PostingType === 'Credit' ? parseFloat(line.Amount || '0') : 0,
      })),
      postedBy: 'QuickBooks',
    }));
  }
}

function mapQBOAccountType(group: string): IntegrationTrialBalance['accountType'] {
  const lower = group.toLowerCase();
  if (lower.includes('asset')) return 'asset';
  if (lower.includes('liabilit')) return 'liability';
  if (lower.includes('equity')) return 'equity';
  if (lower.includes('income') || lower.includes('revenue')) return 'revenue';
  if (lower.includes('expense') || lower.includes('cost')) return 'expense';
  return 'asset';
}
