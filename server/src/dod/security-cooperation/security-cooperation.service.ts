import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN, AppDatabase } from '../../database/database.module';
import { PaginationQueryDto, buildPaginatedResponse } from '../../common/dto/pagination.dto';
import { CreateFMSCaseDto, RecordTrustFundTransactionDto, AdvanceCasePhaseDto } from './security-cooperation.dto';

@Injectable()
export class SecurityCooperationService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: AppDatabase) {}

  async findByEngagement(engagementId: string, pagination?: PaginationQueryDto) {
    const { fmsCases } = await import('@shared/lib/db/pg-schema');
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;

    const [items, countResult] = await Promise.all([
      this.db
        .select()
        .from(fmsCases)
        .where(eq(fmsCases.engagementId, engagementId))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(fmsCases)
        .where(eq(fmsCases.engagementId, engagementId)),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    return buildPaginatedResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const { fmsCases } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(fmsCases)
      .where(eq(fmsCases.id, id));
    if (results.length === 0) {
      throw new NotFoundException(`FMS case ${id} not found`);
    }
    return results[0];
  }

  async create(dto: CreateFMSCaseDto) {
    const { fmsCases } = await import('@shared/lib/db/pg-schema');
    const id = uuid();
    const now = new Date().toISOString();

    await this.db.insert(fmsCases).values({
      id,
      engagementId: dto.engagementId,
      caseDesignator: dto.caseDesignator,
      country: dto.country,
      description: dto.description,
      totalValue: dto.totalValue,
      caseType: dto.caseType,
      implementingAgency: dto.implementingAgency || null,
      currentPhase: 'loa_preparation',
      loaDataJson: dto.loaData ? JSON.stringify(dto.loaData) : null,
      createdAt: now,
    });

    return this.findOne(id);
  }

  async advancePhase(dto: AdvanceCasePhaseDto) {
    const { fmsCases } = await import('@shared/lib/db/pg-schema');
    await this.findOne(dto.caseId);

    await this.db
      .update(fmsCases)
      .set({ currentPhase: dto.newPhase, updatedAt: new Date().toISOString() })
      .where(eq(fmsCases.id, dto.caseId));

    return this.findOne(dto.caseId);
  }

  async recordTrustFundTransaction(dto: RecordTrustFundTransactionDto) {
    return {
      id: uuid(),
      caseId: dto.caseId,
      transactionType: dto.transactionType,
      amount: dto.amount,
      description: dto.description,
      recordedAt: new Date().toISOString(),
    };
  }

  async checkCongressionalNotification(caseId: string) {
    const fmsCase = await this.findOne(caseId);
    const majorDefenseThreshold = 25_000_000;
    const otherThreshold = 100_000_000;

    const requiresNotification =
      fmsCase.totalValue >= majorDefenseThreshold ||
      fmsCase.totalValue >= otherThreshold;

    return {
      caseId,
      totalValue: fmsCase.totalValue,
      requiresNotification,
      threshold: fmsCase.totalValue >= majorDefenseThreshold
        ? 'major_defense_equipment_25m'
        : 'other_100m',
      authority: '22 U.S.C. §2776',
    };
  }

  async getCaseStatusReport(engagementId: string) {
    const casesResult = await this.findByEngagement(engagementId, { page: 1, limit: 100 });
    const cases = casesResult.data;
    const byPhase: Record<string, number> = {};
    let totalValue = 0;

    for (const c of cases) {
      byPhase[c.currentPhase] = (byPhase[c.currentPhase] || 0) + 1;
      totalValue += c.totalValue || 0;
    }

    return {
      engagementId,
      totalCases: casesResult.meta.total,
      totalValue,
      byPhase,
      generatedAt: new Date().toISOString(),
    };
  }
}
