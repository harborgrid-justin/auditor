import { Injectable, Inject, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN, AppDatabase } from '../../database/database.module';
import { PaginationQueryDto, buildPaginatedResponse } from '../../common/dto/pagination.dto';
import { CreateObligationDto, UpdateObligationDto } from './obligations.dto';

@Injectable()
export class ObligationsService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: AppDatabase) {}

  async findByEngagement(engagementId: string, pagination?: PaginationQueryDto) {
    const { dodObligations } = await import('@shared/lib/db/pg-schema');
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;

    const [items, countResult] = await Promise.all([
      this.db
        .select()
        .from(dodObligations)
        .where(eq(dodObligations.engagementId, engagementId))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(dodObligations)
        .where(eq(dodObligations.engagementId, engagementId)),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    return buildPaginatedResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const { dodObligations } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(dodObligations)
      .where(eq(dodObligations.id, id));

    if (results.length === 0) {
      throw new NotFoundException(`Obligation ${id} not found`);
    }
    return results[0];
  }

  async create(dto: CreateObligationDto) {
    const { dodObligations, appropriations, adaViolations } = await import('@shared/lib/db/pg-schema');

    // Validate appropriation exists
    const appropResults = await this.db
      .select()
      .from(appropriations)
      .where(eq(appropriations.id, dto.appropriationId));

    if (appropResults.length === 0) {
      throw new NotFoundException('Appropriation not found');
    }

    const appropriation = appropResults[0];

    if (appropriation.status !== 'current') {
      throw new UnprocessableEntityException({
        error: 'Cannot obligate against a non-current appropriation',
        adaRisk: true,
      });
    }

    // ADA validation: check appropriation has sufficient funds
    const availableBalance = appropriation.allotted - appropriation.obligated;

    if (dto.amount > availableBalance) {
      // Record potential ADA violation
      const violationId = uuid();
      const now = new Date().toISOString();

      await this.db.insert(adaViolations).values({
        id: violationId,
        engagementId: dto.engagementId,
        appropriationId: dto.appropriationId,
        violationType: 'over_obligation',
        statutoryBasis: '31 U.S.C. 1341(a)',
        amount: dto.amount - availableBalance,
        description: `Attempted obligation of $${dto.amount} exceeds available balance of $${availableBalance}`,
        discoveredDate: now,
        investigationStatus: 'detected',
        fiscalYear: dto.fiscalYear || new Date().getFullYear(),
        createdAt: now,
      });

      throw new UnprocessableEntityException({
        error: 'Insufficient funds - potential ADA violation',
        adaViolationId: violationId,
        availableBalance,
        requestedAmount: dto.amount,
      });
    }

    const id = uuid();
    const now = new Date().toISOString();

    await this.db.insert(dodObligations).values({
      id,
      engagementId: dto.engagementId,
      appropriationId: dto.appropriationId,
      obligationNumber: dto.obligationNumber,
      documentType: dto.documentType,
      vendorOrPayee: dto.vendorOrPayee || null,
      amount: dto.amount,
      obligatedDate: dto.obligatedDate || now,
      liquidatedAmount: 0,
      unliquidatedBalance: dto.amount,
      adjustmentAmount: 0,
      status: 'open',
      bonafideNeedDate: dto.bonafideNeedDate || null,
      fiscalYear: dto.fiscalYear || new Date().getFullYear(),
      budgetObjectCode: dto.budgetObjectCode,
      budgetActivityCode: dto.budgetActivityCode || null,
      programElement: dto.programElement || null,
      createdAt: now,
    });

    // Update appropriation obligated amount
    await this.db
      .update(appropriations)
      .set({
        obligated: appropriation.obligated + dto.amount,
        unobligatedBalance: appropriation.unobligatedBalance - dto.amount,
      })
      .where(eq(appropriations.id, dto.appropriationId));

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateObligationDto) {
    const { dodObligations } = await import('@shared/lib/db/pg-schema');

    // Verify exists
    await this.findOne(id);

    const updateData: Record<string, unknown> = {};
    if (dto.amount !== undefined) updateData.amount = dto.amount;
    if (dto.liquidatedAmount !== undefined) updateData.liquidatedAmount = dto.liquidatedAmount;
    if (dto.unliquidatedBalance !== undefined) updateData.unliquidatedBalance = dto.unliquidatedBalance;
    if (dto.adjustmentAmount !== undefined) updateData.adjustmentAmount = dto.adjustmentAmount;
    if (dto.status !== undefined) updateData.status = dto.status;

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(dodObligations)
        .set(updateData)
        .where(eq(dodObligations.id, id));
    }

    return this.findOne(id);
  }

  async bulkCreate(dtos: CreateObligationDto[]) {
    const results = [];
    const errors = [];

    for (let i = 0; i < dtos.length; i++) {
      try {
        const result = await this.create(dtos[i]);
        results.push(result);
      } catch (err) {
        errors.push({
          index: i,
          obligationNumber: dtos[i].obligationNumber,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return { created: results.length, failed: errors.length, obligations: results, errors };
  }
}
