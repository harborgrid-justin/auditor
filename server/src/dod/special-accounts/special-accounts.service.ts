import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN, AppDatabase } from '../../database/database.module';
import { PaginationQueryDto, buildPaginatedResponse } from '../../common/dto/pagination.dto';
import {
  CreateSpecialAccountDto,
  UpdateSpecialAccountDto,
  RunSpecialAccountAnalysisDto,
} from './special-accounts.dto';

@Injectable()
export class SpecialAccountsService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: AppDatabase) {}

  async create(dto: CreateSpecialAccountDto) {
    const { specialAccounts } = await import('@shared/lib/db/pg-schema');
    const id = uuid();
    const now = new Date().toISOString();

    await this.db.insert(specialAccounts).values({
      id,
      engagementId: dto.engagementId,
      accountName: dto.accountName,
      accountType: dto.accountType,
      balance: dto.balance,
      receipts: dto.receipts,
      disbursements: dto.disbursements,
      transfersIn: dto.transfersIn,
      transfersOut: dto.transfersOut,
      fiscalYear: dto.fiscalYear,
      description: dto.description || null,
      status: 'active',
      createdAt: now,
    });

    return this.findOne(id);
  }

  async findByEngagement(engagementId: string, pagination?: PaginationQueryDto) {
    const { specialAccounts } = await import('@shared/lib/db/pg-schema');
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;

    const [items, countResult] = await Promise.all([
      this.db
        .select()
        .from(specialAccounts)
        .where(eq(specialAccounts.engagementId, engagementId))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(specialAccounts)
        .where(eq(specialAccounts.engagementId, engagementId)),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    return buildPaginatedResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const { specialAccounts } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(specialAccounts)
      .where(eq(specialAccounts.id, id));
    if (results.length === 0) {
      throw new NotFoundException(`Special account ${id} not found`);
    }
    return results[0];
  }

  async update(dto: UpdateSpecialAccountDto) {
    const { specialAccounts } = await import('@shared/lib/db/pg-schema');

    await this.findOne(dto.id);

    await this.db
      .update(specialAccounts)
      .set({
        balance: dto.balance,
        receipts: dto.receipts,
        disbursements: dto.disbursements,
        transfersIn: dto.transfersIn,
        transfersOut: dto.transfersOut,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(specialAccounts.id, dto.id));

    return this.findOne(dto.id);
  }

  async runAnalysis(dto: RunSpecialAccountAnalysisDto) {
    const accountsResult = await this.findByEngagement(dto.engagementId, { page: 1, limit: 100 });
    const accounts = accountsResult.data;
    const fiscalYearAccounts = accounts.filter(
      (a: any) => a.fiscalYear === dto.fiscalYear,
    );

    // Vol 12 Rule: Trust Fund Status - verify trust fund balances are properly reported
    const trustFunds = fiscalYearAccounts.filter(
      (a: any) => a.accountType === 'fms_trust' || a.accountType === 'trust_revolving',
    );
    const trustFundFindings: any[] = [];
    for (const fund of trustFunds) {
      const expectedBalance =
        fund.balance + fund.receipts + fund.transfersIn - fund.disbursements - fund.transfersOut;
      const variance = Math.abs(expectedBalance - fund.balance);
      if (variance > 0.01) {
        trustFundFindings.push({
          accountId: fund.id,
          accountName: fund.accountName,
          reportedBalance: fund.balance,
          expectedBalance: Math.round(expectedBalance * 100) / 100,
          variance: Math.round(variance * 100) / 100,
          status: 'discrepancy',
        });
      }
    }

    // Vol 12 Rule: Balance Reconciliation - ensure receipts/disbursements/transfers reconcile
    const balanceReconciliation: any[] = [];
    for (const account of fiscalYearAccounts) {
      const netActivity =
        account.receipts + account.transfersIn - account.disbursements - account.transfersOut;
      balanceReconciliation.push({
        accountId: account.id,
        accountName: account.accountName,
        accountType: account.accountType,
        balance: account.balance,
        netActivity: Math.round(netActivity * 100) / 100,
        reconciled: Math.abs(netActivity) < 0.01 || account.balance !== 0,
      });
    }
    const reconciledCount = balanceReconciliation.filter((r: any) => r.reconciled).length;

    // Vol 12 Rule: Transfer Authorization - verify transfers between accounts are authorized
    const transferAuthFindings: any[] = [];
    for (const account of fiscalYearAccounts) {
      if (account.transfersIn > 0 || account.transfersOut > 0) {
        const transferRatio =
          account.transfersOut > 0 ? account.transfersIn / account.transfersOut : 0;
        transferAuthFindings.push({
          accountId: account.id,
          accountName: account.accountName,
          transfersIn: account.transfersIn,
          transfersOut: account.transfersOut,
          netTransfers: Math.round((account.transfersIn - account.transfersOut) * 100) / 100,
          transferRatio: Math.round(transferRatio * 100) / 100,
          flagged: Math.abs(account.transfersIn - account.transfersOut) > account.balance * 0.1,
        });
      }
    }

    // Vol 12 Rule: Dormant Accounts - identify accounts with no activity
    const dormantAccounts: any[] = [];
    for (const account of fiscalYearAccounts) {
      const hasActivity =
        account.receipts > 0 ||
        account.disbursements > 0 ||
        account.transfersIn > 0 ||
        account.transfersOut > 0;
      if (!hasActivity && account.balance > 0) {
        dormantAccounts.push({
          accountId: account.id,
          accountName: account.accountName,
          accountType: account.accountType,
          balance: account.balance,
          status: 'dormant',
        });
      }
    }

    return {
      id: uuid(),
      engagementId: dto.engagementId,
      fiscalYear: dto.fiscalYear,
      totalAccounts: fiscalYearAccounts.length,
      trust_fund_status: {
        totalTrustFunds: trustFunds.length,
        findings: trustFundFindings,
        status: trustFundFindings.length === 0 ? 'pass' : 'findings_noted',
      },
      balance_reconciliation: {
        totalAccounts: fiscalYearAccounts.length,
        reconciled: reconciledCount,
        unreconciled: fiscalYearAccounts.length - reconciledCount,
        reconciliationRate:
          fiscalYearAccounts.length > 0
            ? Math.round((reconciledCount / fiscalYearAccounts.length) * 10000) / 100
            : 0,
        details: balanceReconciliation,
      },
      transfer_authorization: {
        accountsWithTransfers: transferAuthFindings.length,
        flagged: transferAuthFindings.filter((t: any) => t.flagged).length,
        details: transferAuthFindings,
      },
      dormant_accounts: {
        totalDormant: dormantAccounts.length,
        details: dormantAccounts,
      },
      generatedAt: new Date().toISOString(),
      authority: 'DoD FMR Volume 12, Special Accounts and Trust Funds',
    };
  }
}
