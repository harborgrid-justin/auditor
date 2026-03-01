import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN } from '../../database/database.module';
import { CreateUssglAccountDto, UpdateUssglAccountDto } from './ussgl.dto';

@Injectable()
export class UssglService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: any) {}

  async findByEngagement(engagementId: string, fiscalYear?: number, trackType?: string) {
    const { ussglAccounts } = await import('@shared/lib/db/pg-schema');

    const conditions: any[] = [eq(ussglAccounts.engagementId, engagementId)];

    if (fiscalYear) {
      conditions.push(eq(ussglAccounts.fiscalYear, fiscalYear));
    }

    if (trackType && trackType !== 'all') {
      conditions.push(eq(ussglAccounts.accountType, trackType));
    }

    const accounts = await this.db
      .select()
      .from(ussglAccounts)
      .where(and(...conditions));

    // Compute trial balance totals
    let totalDebits = 0;
    let totalCredits = 0;
    const proprietaryAccounts: typeof accounts = [];
    const budgetaryAccounts: typeof accounts = [];

    for (const account of accounts) {
      if (account.normalBalance === 'debit') {
        totalDebits += account.endBalance;
      } else {
        totalCredits += account.endBalance;
      }

      if (account.accountType === 'proprietary') {
        proprietaryAccounts.push(account);
      } else {
        budgetaryAccounts.push(account);
      }
    }

    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

    return {
      accounts,
      trialBalance: {
        totalDebits,
        totalCredits,
        difference: totalDebits - totalCredits,
        isBalanced,
      },
      proprietary: {
        accounts: proprietaryAccounts,
        count: proprietaryAccounts.length,
      },
      budgetary: {
        accounts: budgetaryAccounts,
        count: budgetaryAccounts.length,
      },
      fiscalYear: fiscalYear || null,
    };
  }

  async findOne(id: string) {
    const { ussglAccounts } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(ussglAccounts)
      .where(eq(ussglAccounts.id, id));

    if (results.length === 0) {
      throw new NotFoundException(`USSGL account ${id} not found`);
    }
    return results[0];
  }

  async create(dto: CreateUssglAccountDto) {
    const { ussglAccounts } = await import('@shared/lib/db/pg-schema');
    const id = uuid();
    const now = new Date().toISOString();

    await this.db.insert(ussglAccounts).values({
      id,
      engagementId: dto.engagementId,
      accountNumber: dto.accountNumber,
      accountTitle: dto.accountTitle,
      accountType: dto.accountType,
      normalBalance: dto.normalBalance,
      beginBalance: dto.beginBalance ?? 0,
      totalDebits: dto.totalDebits ?? 0,
      totalCredits: dto.totalCredits ?? 0,
      endBalance: dto.endBalance ?? 0,
      fiscalYear: dto.fiscalYear || new Date().getFullYear(),
      createdAt: now,
    });

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateUssglAccountDto) {
    const { ussglAccounts } = await import('@shared/lib/db/pg-schema');

    // Verify exists
    await this.findOne(id);

    const updateData: Record<string, unknown> = {};
    if (dto.beginBalance !== undefined) updateData.beginBalance = dto.beginBalance;
    if (dto.totalDebits !== undefined) updateData.totalDebits = dto.totalDebits;
    if (dto.totalCredits !== undefined) updateData.totalCredits = dto.totalCredits;
    if (dto.endBalance !== undefined) updateData.endBalance = dto.endBalance;

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(ussglAccounts)
        .set(updateData)
        .where(eq(ussglAccounts.id, id));
    }

    return this.findOne(id);
  }
}
