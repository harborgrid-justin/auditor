import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN, AppDatabase } from '../../database/database.module';
import { PaginationQueryDto, buildPaginatedResponse } from '../../common/dto/pagination.dto';
import { CreateCivilianPayDto, UpdateCivilianPayDto } from './civilian-pay.dto';

@Injectable()
export class CivilianPayService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: AppDatabase) {}

  async findByEngagement(engagementId: string, pagination?: PaginationQueryDto) {
    const { civilianPayRecords } = await import('@shared/lib/db/pg-schema');
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;

    const [items, countResult] = await Promise.all([
      this.db
        .select()
        .from(civilianPayRecords)
        .where(eq(civilianPayRecords.engagementId, engagementId))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(civilianPayRecords)
        .where(eq(civilianPayRecords.engagementId, engagementId)),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    return buildPaginatedResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const { civilianPayRecords } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(civilianPayRecords)
      .where(eq(civilianPayRecords.id, id));

    if (results.length === 0) {
      throw new NotFoundException(`Civilian pay record ${id} not found`);
    }
    return results[0];
  }

  async create(dto: CreateCivilianPayDto) {
    const { civilianPayRecords } = await import('@shared/lib/db/pg-schema');
    const id = uuid();
    const now = new Date().toISOString();

    const totalCompensation = dto.totalCompensation ??
      (dto.basicPay || 0) +
      (dto.localityAdjustment || 0) +
      (dto.premiumPay || 0) +
      (dto.overtimePay || 0);

    await this.db.insert(civilianPayRecords).values({
      id,
      engagementId: dto.engagementId,
      employeeId: dto.employeeId,
      payPlan: dto.payPlan,
      grade: dto.grade,
      step: dto.step,
      locality: dto.locality,
      basicPay: dto.basicPay,
      localityAdjustment: dto.localityAdjustment || 0,
      fehbContribution: dto.fehbContribution || 0,
      fegliContribution: dto.fegliContribution || 0,
      retirementContribution: dto.retirementContribution || 0,
      retirementPlan: dto.retirementPlan,
      tspContribution: dto.tspContribution || 0,
      tspMatchAmount: dto.tspMatchAmount || 0,
      premiumPay: dto.premiumPay || 0,
      overtimePay: dto.overtimePay || 0,
      leaveHoursAccrued: dto.leaveHoursAccrued || 0,
      totalCompensation,
      fiscalYear: dto.fiscalYear || new Date().getFullYear(),
      payPeriod: dto.payPeriod,
      status: dto.status || 'active',
      createdAt: now,
    });

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateCivilianPayDto) {
    const { civilianPayRecords } = await import('@shared/lib/db/pg-schema');

    // Verify exists
    await this.findOne(id);

    const updateData: Record<string, unknown> = {};
    if (dto.basicPay !== undefined) updateData.basicPay = dto.basicPay;
    if (dto.localityAdjustment !== undefined) updateData.localityAdjustment = dto.localityAdjustment;
    if (dto.fehbContribution !== undefined) updateData.fehbContribution = dto.fehbContribution;
    if (dto.retirementContribution !== undefined) updateData.retirementContribution = dto.retirementContribution;
    if (dto.tspContribution !== undefined) updateData.tspContribution = dto.tspContribution;
    if (dto.tspMatchAmount !== undefined) updateData.tspMatchAmount = dto.tspMatchAmount;
    if (dto.premiumPay !== undefined) updateData.premiumPay = dto.premiumPay;
    if (dto.overtimePay !== undefined) updateData.overtimePay = dto.overtimePay;
    if (dto.totalCompensation !== undefined) updateData.totalCompensation = dto.totalCompensation;
    if (dto.status !== undefined) updateData.status = dto.status;

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(civilianPayRecords)
        .set(updateData)
        .where(eq(civilianPayRecords.id, id));
    }

    return this.findOne(id);
  }
}
