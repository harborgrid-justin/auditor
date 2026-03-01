/**
 * Xero OAuth 2.0 + API Client
 *
 * Implements the IntegrationProvider interface for Xero.
 * Requires XERO_CLIENT_ID and XERO_CLIENT_SECRET environment variables.
 */

import type {
  IntegrationProvider,
  IntegrationToken,
  IntegrationTrialBalance,
  IntegrationJournalEntry,
} from '../types';

const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize';
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0';

export class XeroClient implements IntegrationProvider {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.XERO_CLIENT_ID || '';
    this.clientSecret = process.env.XERO_CLIENT_SECRET || '';
    this.redirectUri = process.env.XERO_REDIRECT_URI || '';
  }

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'openid profile email accounting.transactions.read accounting.reports.read',
      state,
    });
    return `${XERO_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<IntegrationToken> {
    const response = await fetch(XERO_TOKEN_URL, {
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
      throw new Error(`Xero token exchange failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<IntegrationToken> {
    const response = await fetch(XERO_TOKEN_URL, {
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
      throw new Error(`Xero token refresh failed: ${response.statusText}`);
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
    const url = `${XERO_API_BASE}/Reports/TrialBalance?date=${endDate}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: 'application/json',
        'Xero-Tenant-Id': token.companyId || '',
      },
    });

    if (!response.ok) {
      throw new Error(`Xero trial balance fetch failed: ${response.statusText}`);
    }

    const data = await response.json();
    const rows = data?.Reports?.[0]?.Rows || [];

    const results: IntegrationTrialBalance[] = [];
    let currentType: IntegrationTrialBalance['accountType'] = 'asset';

    for (const row of rows) {
      if (row.RowType === 'Section') {
        currentType = mapXeroAccountType(row.Title || '');
      }
      if (row.RowType === 'Row' && row.Cells) {
        const cells = row.Cells;
        results.push({
          accountNumber: cells[0]?.Value || '',
          accountName: cells[0]?.Value || '',
          accountType: currentType,
          balance: parseFloat(cells[1]?.Value || '0') - parseFloat(cells[2]?.Value || '0'),
          currency: 'USD',
        });
      }
    }

    return results;
  }

  async fetchJournalEntries(
    token: IntegrationToken,
    startDate: string,
    endDate: string
  ): Promise<IntegrationJournalEntry[]> {
    const url = `${XERO_API_BASE}/Journals?offset=0`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: 'application/json',
        'Xero-Tenant-Id': token.companyId || '',
      },
    });

    if (!response.ok) {
      throw new Error(`Xero journal entries fetch failed: ${response.statusText}`);
    }

    const data = await response.json();
    const journals = data?.Journals || [];

    return journals
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((j: any) => j.JournalDate >= startDate && j.JournalDate <= endDate)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((j: any) => ({
        entryNumber: j.JournalNumber?.toString() || j.JournalID,
        date: j.JournalDate,
        description: j.Reference || '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lines: (j.JournalLines || []).map((line: any) => ({
          accountName: line.AccountName || '',
          debit: line.NetAmount > 0 ? line.NetAmount : 0,
          credit: line.NetAmount < 0 ? Math.abs(line.NetAmount) : 0,
        })),
        postedBy: 'Xero',
      }));
  }
}

function mapXeroAccountType(title: string): IntegrationTrialBalance['accountType'] {
  const lower = title.toLowerCase();
  if (lower.includes('asset')) return 'asset';
  if (lower.includes('liabilit')) return 'liability';
  if (lower.includes('equity')) return 'equity';
  if (lower.includes('revenue') || lower.includes('income')) return 'revenue';
  if (lower.includes('expense') || lower.includes('cost')) return 'expense';
  return 'asset';
}
