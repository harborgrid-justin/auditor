import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN } from '../../database/database.module';
import { CreateContractDto, UpdateContractDto } from './contracts.dto';

@Injectable()
export class ContractsService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: any) {}

  async findByEngagement(engagementId: string) {
    const { dodContracts } = await import('@shared/lib/db/pg-schema');
    return this.db
      .select()
      .from(dodContracts)
      .where(eq(dodContracts.engagementId, engagementId));
  }

  async findOne(id: string) {
    const { dodContracts } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(dodContracts)
      .where(eq(dodContracts.id, id));

    if (results.length === 0) {
      throw new NotFoundException(`Contract ${id} not found`);
    }
    return results[0];
  }

  async create(dto: CreateContractDto) {
    const { dodContracts } = await import('@shared/lib/db/pg-schema');
    const id = uuid();
    const now = new Date().toISOString();

    await this.db.insert(dodContracts).values({
      id,
      engagementId: dto.engagementId,
      contractNumber: dto.contractNumber,
      contractType: dto.contractType,
      vendorName: dto.vendorName,
      totalValue: dto.totalValue,
      obligatedAmount: dto.obligatedAmount || 0,
      fundedAmount: dto.fundedAmount || 0,
      periodOfPerformance: dto.periodOfPerformance,
      contractingOfficer: dto.contractingOfficer,
      status: dto.status || 'active',
      closeoutDate: dto.closeoutDate || null,
      fiscalYear: dto.fiscalYear || new Date().getFullYear(),
      createdAt: now,
    });

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateContractDto) {
    const { dodContracts } = await import('@shared/lib/db/pg-schema');

    // Verify exists
    await this.findOne(id);

    const updateData: Record<string, unknown> = {};
    if (dto.totalValue !== undefined) updateData.totalValue = dto.totalValue;
    if (dto.obligatedAmount !== undefined) updateData.obligatedAmount = dto.obligatedAmount;
    if (dto.fundedAmount !== undefined) updateData.fundedAmount = dto.fundedAmount;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.closeoutDate !== undefined) updateData.closeoutDate = dto.closeoutDate;
    if (dto.contractingOfficer !== undefined) updateData.contractingOfficer = dto.contractingOfficer;

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(dodContracts)
        .set(updateData)
        .where(eq(dodContracts.id, id));
    }

    return this.findOne(id);
  }
}
