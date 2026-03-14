import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN, AppDatabase } from '../../database/database.module';
import { PaginationQueryDto, buildPaginatedResponse } from '../../common/dto/pagination.dto';
import { CreateMilitaryPayDto, UpdateMilitaryPayDto } from './military-pay.dto';

@Injectable()
export class MilitaryPayService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: AppDatabase) {}

  async findByEngagement(engagementId: string, pagination?: PaginationQueryDto) {
    const { militaryPayRecords } = await import('@shared/lib/db/pg-schema');
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;

    const [items, countResult] = await Promise.all([
      this.db
        .select()
        .from(militaryPayRecords)
        .where(eq(militaryPayRecords.engagementId, engagementId))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(militaryPayRecords)
        .where(eq(militaryPayRecords.engagementId, engagementId)),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    return buildPaginatedResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const { militaryPayRecords } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(militaryPayRecords)
      .where(eq(militaryPayRecords.id, id));

    if (results.length === 0) {
      throw new NotFoundException(`Military pay record ${id} not found`);
    }
    return results[0];
  }

  async create(dto: CreateMilitaryPayDto) {
    const { militaryPayRecords } = await import('@shared/lib/db/pg-schema');
    const id = uuid();
    const now = new Date().toISOString();

    const totalCompensation = dto.totalCompensation ??
      (dto.basicPay || 0) +
      (dto.bah || 0) +
      (dto.bas || 0) +
      (dto.separationPay || 0) +
      (dto.retirementPay || 0);

    await this.db.insert(militaryPayRecords).values({
      id,
      engagementId: dto.engagementId,
      memberId: dto.memberId,
      payGrade: dto.payGrade,
      yearsOfService: dto.yearsOfService,
      basicPay: dto.basicPay,
      bah: dto.bah || 0,
      bas: dto.bas || 0,
      specialPaysJson: dto.specialPaysJson ? JSON.stringify(dto.specialPaysJson) : null,
      incentivePaysJson: dto.incentivePaysJson ? JSON.stringify(dto.incentivePaysJson) : null,
      combatZoneExclusion: dto.combatZoneExclusion || false,
      tspContribution: dto.tspContribution || 0,
      tspMatchAmount: dto.tspMatchAmount || 0,
      separationPay: dto.separationPay || 0,
      retirementPay: dto.retirementPay || 0,
      totalCompensation,
      fiscalYear: dto.fiscalYear || new Date().getFullYear(),
      payPeriod: dto.payPeriod,
      status: dto.status || 'active',
      createdAt: now,
    });

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateMilitaryPayDto) {
    const { militaryPayRecords } = await import('@shared/lib/db/pg-schema');

    // Verify exists
    await this.findOne(id);

    const updateData: Record<string, unknown> = {};
    if (dto.basicPay !== undefined) updateData.basicPay = dto.basicPay;
    if (dto.bah !== undefined) updateData.bah = dto.bah;
    if (dto.bas !== undefined) updateData.bas = dto.bas;
    if (dto.tspContribution !== undefined) updateData.tspContribution = dto.tspContribution;
    if (dto.tspMatchAmount !== undefined) updateData.tspMatchAmount = dto.tspMatchAmount;
    if (dto.totalCompensation !== undefined) updateData.totalCompensation = dto.totalCompensation;
    if (dto.status !== undefined) updateData.status = dto.status;

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(militaryPayRecords)
        .set(updateData)
        .where(eq(militaryPayRecords.id, id));
    }

    return this.findOne(id);
  }
}
