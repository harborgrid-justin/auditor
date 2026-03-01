import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN } from '../../database/database.module';
import {
  SubmitIGTTransactionDto,
  RunReconciliationDto,
  CreateDisputeDto,
  ResolveDisputeDto,
} from './igt-reconciliation.dto';

@Injectable()
export class IGTReconciliationService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: any) {}

  async submitTransaction(dto: SubmitIGTTransactionDto) {
    const { igtReconciliations } = await import('@shared/lib/db/pg-schema');
    const id = uuid();
    const now = new Date().toISOString();

    await this.db.insert(igtReconciliations).values({
      id,
      engagementId: dto.engagementId,
      transactionType: dto.transactionType,
      tradingPartnerTAS: dto.tradingPartnerTAS,
      ownTAS: dto.ownTAS,
      amount: dto.amount,
      period: dto.period,
      fiscalYear: dto.fiscalYear,
      description: dto.description || null,
      status: 'pending',
      createdAt: now,
    });

    return this.findOne(id);
  }

  async findOne(id: string) {
    const { igtReconciliations } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(igtReconciliations)
      .where(eq(igtReconciliations.id, id));
    if (results.length === 0) {
      throw new NotFoundException(`IGT transaction ${id} not found`);
    }
    return results[0];
  }

  async findByEngagement(engagementId: string) {
    const { igtReconciliations } = await import('@shared/lib/db/pg-schema');
    return this.db
      .select()
      .from(igtReconciliations)
      .where(eq(igtReconciliations.engagementId, engagementId));
  }

  async runReconciliation(dto: RunReconciliationDto) {
    const transactions = await this.findByEngagement(dto.engagementId);

    const buyTransactions = transactions.filter(
      (t: any) => t.transactionType === 'buy' && t.period === dto.period,
    );
    const sellTransactions = transactions.filter(
      (t: any) => t.transactionType === 'sell' && t.period === dto.period,
    );

    const matched: Array<{ buyId: string; sellId: string; amount: number }> = [];
    const unmatchedBuys: string[] = [];
    const unmatchedSells: string[] = [];
    const sellUsed = new Set<string>();

    for (const buy of buyTransactions) {
      let found = false;
      for (const sell of sellTransactions) {
        if (
          !sellUsed.has(sell.id) &&
          sell.tradingPartnerTAS === buy.ownTAS &&
          sell.ownTAS === buy.tradingPartnerTAS &&
          Math.abs(sell.amount - buy.amount) < 0.01
        ) {
          matched.push({ buyId: buy.id, sellId: sell.id, amount: buy.amount });
          sellUsed.add(sell.id);
          found = true;
          break;
        }
      }
      if (!found) unmatchedBuys.push(buy.id);
    }

    for (const sell of sellTransactions) {
      if (!sellUsed.has(sell.id)) unmatchedSells.push(sell.id);
    }

    return {
      id: uuid(),
      engagementId: dto.engagementId,
      period: dto.period,
      fiscalYear: dto.fiscalYear,
      totalBuyTransactions: buyTransactions.length,
      totalSellTransactions: sellTransactions.length,
      matched: matched.length,
      unmatchedBuys: unmatchedBuys.length,
      unmatchedSells: unmatchedSells.length,
      matchRate: buyTransactions.length > 0
        ? Math.round((matched.length / buyTransactions.length) * 10000) / 100
        : 0,
      details: { matched, unmatchedBuys, unmatchedSells },
      generatedAt: new Date().toISOString(),
      authority: 'Treasury Financial Manual, OMB A-136',
    };
  }

  async createDispute(dto: CreateDisputeDto) {
    return {
      id: uuid(),
      discrepancyId: dto.discrepancyId,
      initiatingAgency: dto.initiatingAgency,
      description: dto.description || null,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
  }

  async resolveDispute(dto: ResolveDisputeDto) {
    return {
      disputeId: dto.disputeId,
      resolution: dto.resolution,
      resolvedAmount: dto.resolvedAmount || null,
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
    };
  }

  async getReconciliationReport(engagementId: string, period: string) {
    const transactions = await this.findByEngagement(engagementId);
    const periodTxns = transactions.filter((t: any) => t.period === period);

    const totalBuys = periodTxns
      .filter((t: any) => t.transactionType === 'buy')
      .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);
    const totalSells = periodTxns
      .filter((t: any) => t.transactionType === 'sell')
      .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

    return {
      engagementId,
      period,
      totalTransactions: periodTxns.length,
      totalBuyAmount: Math.round(totalBuys * 100) / 100,
      totalSellAmount: Math.round(totalSells * 100) / 100,
      netDifference: Math.round((totalBuys - totalSells) * 100) / 100,
      generatedAt: new Date().toISOString(),
    };
  }
}
