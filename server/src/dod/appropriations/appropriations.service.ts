import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN } from '../../database/database.module';
import { CreateAppropriationDto, UpdateAppropriationDto } from './appropriations.dto';

@Injectable()
export class AppropriationsService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: any) {}

  async findByEngagement(engagementId: string) {
    const { appropriations } = await import('@shared/lib/db/pg-schema');
    return this.db
      .select()
      .from(appropriations)
      .where(eq(appropriations.engagementId, engagementId));
  }

  async findOne(id: string) {
    const { appropriations } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(appropriations)
      .where(eq(appropriations.id, id));

    if (results.length === 0) {
      throw new NotFoundException(`Appropriation ${id} not found`);
    }
    return results[0];
  }

  async create(dto: CreateAppropriationDto) {
    const { appropriations } = await import('@shared/lib/db/pg-schema');
    const id = uuid();
    const now = new Date().toISOString();

    await this.db.insert(appropriations).values({
      id,
      engagementId: dto.engagementId,
      treasuryAccountSymbol: dto.treasuryAccountSymbol,
      appropriationType: dto.appropriationType,
      appropriationTitle: dto.appropriationTitle,
      budgetCategory: dto.budgetCategory,
      fiscalYearStart: dto.fiscalYearStart,
      fiscalYearEnd: dto.fiscalYearEnd,
      expirationDate: dto.expirationDate || null,
      cancellationDate: dto.cancellationDate || null,
      totalAuthority: dto.totalAuthority,
      apportioned: dto.apportioned ?? 0,
      allotted: dto.allotted ?? 0,
      committed: dto.committed ?? 0,
      obligated: dto.obligated ?? 0,
      disbursed: dto.disbursed ?? 0,
      unobligatedBalance: dto.unobligatedBalance ?? dto.totalAuthority,
      status: dto.status || 'current',
      sfisDataJson: dto.sfisData ? JSON.stringify(dto.sfisData) : null,
      createdAt: now,
    });

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateAppropriationDto) {
    const { appropriations } = await import('@shared/lib/db/pg-schema');

    // Verify exists
    await this.findOne(id);

    const updateData: Record<string, unknown> = {};
    if (dto.totalAuthority !== undefined) updateData.totalAuthority = dto.totalAuthority;
    if (dto.apportioned !== undefined) updateData.apportioned = dto.apportioned;
    if (dto.allotted !== undefined) updateData.allotted = dto.allotted;
    if (dto.committed !== undefined) updateData.committed = dto.committed;
    if (dto.obligated !== undefined) updateData.obligated = dto.obligated;
    if (dto.disbursed !== undefined) updateData.disbursed = dto.disbursed;
    if (dto.unobligatedBalance !== undefined) updateData.unobligatedBalance = dto.unobligatedBalance;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.sfisData !== undefined) updateData.sfisDataJson = JSON.stringify(dto.sfisData);

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(appropriations)
        .set(updateData)
        .where(eq(appropriations.id, id));
    }

    return this.findOne(id);
  }
}
