import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN, AppDatabase } from '../../database/database.module';
import { PaginationQueryDto, buildPaginatedResponse } from '../../common/dto/pagination.dto';
import { CreateAdaViolationDto, UpdateAdaViolationDto, ValidateAdaDto } from './ada.dto';

@Injectable()
export class AdaService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: AppDatabase) {}

  async findByEngagement(engagementId: string, pagination?: PaginationQueryDto) {
    const { adaViolations } = await import('@shared/lib/db/pg-schema');
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;

    const [items, countResult] = await Promise.all([
      this.db
        .select()
        .from(adaViolations)
        .where(eq(adaViolations.engagementId, engagementId))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(adaViolations)
        .where(eq(adaViolations.engagementId, engagementId)),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    return buildPaginatedResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const { adaViolations } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(adaViolations)
      .where(eq(adaViolations.id, id));

    if (results.length === 0) {
      throw new NotFoundException(`ADA violation ${id} not found`);
    }
    return results[0];
  }

  async create(dto: CreateAdaViolationDto) {
    const { adaViolations } = await import('@shared/lib/db/pg-schema');
    const id = uuid();
    const now = new Date().toISOString();

    await this.db.insert(adaViolations).values({
      id,
      engagementId: dto.engagementId,
      appropriationId: dto.appropriationId,
      violationType: dto.violationType,
      statutoryBasis: dto.statutoryBasis,
      amount: dto.amount,
      description: dto.description,
      discoveredDate: dto.discoveredDate || now,
      investigationStatus: dto.investigationStatus || 'detected',
      fiscalYear: dto.fiscalYear || new Date().getFullYear(),
      createdAt: now,
    });

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateAdaViolationDto) {
    const { adaViolations } = await import('@shared/lib/db/pg-schema');

    // Verify exists
    await this.findOne(id);

    const updateData: Record<string, unknown> = {};
    if (dto.investigationStatus !== undefined) updateData.investigationStatus = dto.investigationStatus;
    if (dto.amount !== undefined) updateData.amount = dto.amount;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.correctiveAction !== undefined) updateData.correctiveAction = dto.correctiveAction;
    if (dto.reportedDate !== undefined) updateData.reportedDate = dto.reportedDate;

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(adaViolations)
        .set(updateData)
        .where(eq(adaViolations.id, id));
    }

    return this.findOne(id);
  }

  async validate(dto: ValidateAdaDto) {
    const { appropriations } = await import('@shared/lib/db/pg-schema');

    const appropResults = await this.db
      .select()
      .from(appropriations)
      .where(eq(appropriations.id, dto.appropriationId));

    if (appropResults.length === 0) {
      throw new NotFoundException('Appropriation not found');
    }

    const appropriation = appropResults[0];
    const availableBalance = appropriation.allotted - appropriation.obligated;

    // Real-time ADA validation using the ADA monitor engine
    let adaMonitorResult: any = null;
    try {
      const adaMonitor = await import('@shared/lib/engine/federal-accounting/ada-monitor');
      if (adaMonitor && typeof adaMonitor.validateObligation === 'function') {
        adaMonitorResult = adaMonitor.validateObligation({
          appropriationId: dto.appropriationId,
          amount: dto.amount,
          availableBalance,
          appropriationStatus: appropriation.status,
          fiscalYear: dto.fiscalYear || new Date().getFullYear(),
        });
      }
    } catch {
      // ADA monitor not available; fall back to manual checks
    }

    const exceedsApportionment = dto.amount > (appropriation.apportioned - appropriation.obligated);
    const exceedsAllotment = dto.amount > availableBalance;
    const exceedsTotalAuthority = dto.amount > appropriation.unobligatedBalance;
    const appropriationExpired = appropriation.status !== 'current';

    const hasViolation = exceedsApportionment || exceedsAllotment || exceedsTotalAuthority || appropriationExpired;

    return {
      valid: !hasViolation,
      appropriationId: dto.appropriationId,
      requestedAmount: dto.amount,
      availableBalance,
      appropriationStatus: appropriation.status,
      adaRisk: {
        exceedsApportionment,
        exceedsAllotment,
        exceedsTotalAuthority,
        appropriationExpired,
      },
      adaMonitorResult,
    };
  }
}
