import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN } from '../../database/database.module';
import {
  CreateDebtRecordDto,
  GenerateDemandLetterDto,
  EvaluateCompromiseDto,
  InitiateSalaryOffsetDto,
} from './debt-management.dto';

@Injectable()
export class DebtManagementService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: any) {}

  async findByEngagement(engagementId: string) {
    const { debtDemandLetters } = await import('@shared/lib/db/pg-schema');
    return this.db
      .select()
      .from(debtDemandLetters)
      .where(eq(debtDemandLetters.engagementId, engagementId));
  }

  async findOne(id: string) {
    const { debtDemandLetters } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(debtDemandLetters)
      .where(eq(debtDemandLetters.id, id));
    if (results.length === 0) {
      throw new NotFoundException(`Debt record ${id} not found`);
    }
    return results[0];
  }

  async create(dto: CreateDebtRecordDto) {
    const { debtDemandLetters } = await import('@shared/lib/db/pg-schema');
    const id = uuid();
    const now = new Date().toISOString();

    await this.db.insert(debtDemandLetters).values({
      id,
      engagementId: dto.engagementId,
      debtorName: dto.debtorName,
      originalAmount: dto.originalAmount,
      currentBalance: dto.currentBalance,
      debtType: dto.debtType,
      delinquencyDate: dto.delinquencyDate,
      fiscalYear: dto.fiscalYear || new Date().getFullYear(),
      status: 'active',
      createdAt: now,
    });

    return this.findOne(id);
  }

  async generateDemandLetter(dto: GenerateDemandLetterDto) {
    const debt = await this.findOne(dto.debtId);
    const responseDeadlines: Record<string, number> = {
      initial: 30,
      '30_day': 30,
      '60_day': 30,
      '90_day': 30,
    };

    const deadlineDays = responseDeadlines[dto.letterType] || 30;
    const responseDeadline = new Date();
    responseDeadline.setDate(responseDeadline.getDate() + deadlineDays);

    return {
      id: uuid(),
      debtId: dto.debtId,
      letterType: dto.letterType,
      debtorName: debt.debtorName,
      principalAmount: debt.currentBalance,
      responseDeadline: responseDeadline.toISOString(),
      generatedAt: new Date().toISOString(),
      authority: '31 CFR 901.2',
    };
  }

  async evaluateCompromise(dto: EvaluateCompromiseDto) {
    const debt = await this.findOne(dto.debtId);
    const agencyLimit = 100_000;
    const compromisePct = dto.offeredAmount / debt.currentBalance;

    return {
      debtId: dto.debtId,
      currentBalance: debt.currentBalance,
      offeredAmount: dto.offeredAmount,
      compromisePercentage: Math.round(compromisePct * 10000) / 100,
      withinAgencyAuthority: debt.currentBalance <= agencyLimit,
      agencyLimit,
      requiresTreasuryApproval: debt.currentBalance > agencyLimit,
      recommendation: compromisePct >= 0.65 ? 'approve' : 'review_required',
      authority: '31 U.S.C. §3711',
    };
  }

  async initiateSalaryOffset(dto: InitiateSalaryOffsetDto) {
    const debt = await this.findOne(dto.debtId);
    const maxOffsetPct = 0.15;
    const maxPerPeriod = Math.round(dto.disposablePay * maxOffsetPct * 100) / 100;
    const periodsRequired = Math.ceil(debt.currentBalance / maxPerPeriod);

    return {
      debtId: dto.debtId,
      employeeId: dto.employeeId,
      disposablePay: dto.disposablePay,
      maxOffsetPercentage: maxOffsetPct,
      maxAmountPerPeriod: maxPerPeriod,
      totalOwed: debt.currentBalance,
      estimatedPeriods: periodsRequired,
      hearingRightsNotified: true,
      authority: '5 U.S.C. §5514',
    };
  }

  async getDebtAgingReport(engagementId: string) {
    const debts = await this.findByEngagement(engagementId);
    const now = new Date();
    const buckets = { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '91_120': 0, '120_plus': 0 };

    for (const debt of debts) {
      const delinquent = new Date(debt.delinquencyDate);
      const daysDelinquent = Math.floor((now.getTime() - delinquent.getTime()) / 86_400_000);
      const balance = debt.currentBalance || 0;

      if (daysDelinquent <= 0) buckets.current += balance;
      else if (daysDelinquent <= 30) buckets['1_30'] += balance;
      else if (daysDelinquent <= 60) buckets['31_60'] += balance;
      else if (daysDelinquent <= 90) buckets['61_90'] += balance;
      else if (daysDelinquent <= 120) buckets['91_120'] += balance;
      else buckets['120_plus'] += balance;
    }

    return {
      engagementId,
      totalDebts: debts.length,
      agingBuckets: buckets,
      generatedAt: new Date().toISOString(),
    };
  }

  async checkReferralDeadlines(engagementId: string) {
    const debts = await this.findByEngagement(engagementId);
    const now = new Date();
    const alerts: Array<{ debtId: string; daysDelinquent: number; daysUntilDeadline: number; status: string }> = [];

    for (const debt of debts) {
      const delinquent = new Date(debt.delinquencyDate);
      const daysDelinquent = Math.floor((now.getTime() - delinquent.getTime()) / 86_400_000);
      const daysUntilDeadline = 120 - daysDelinquent;

      if (daysDelinquent >= 90) {
        alerts.push({
          debtId: debt.id,
          daysDelinquent,
          daysUntilDeadline: Math.max(daysUntilDeadline, 0),
          status: daysDelinquent >= 120 ? 'overdue' : 'approaching',
        });
      }
    }

    return {
      engagementId,
      alerts,
      authority: '31 U.S.C. §3711(g)',
      generatedAt: new Date().toISOString(),
    };
  }
}
