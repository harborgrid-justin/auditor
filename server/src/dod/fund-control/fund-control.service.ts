import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN } from '../../database/database.module';
import { CreateFundControlDto, UpdateFundControlDto } from './fund-control.dto';

@Injectable()
export class FundControlService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: any) {}

  async checkFundAvailability(appropriationId: string, amount?: number) {
    const { appropriations, fundControls } = await import('@shared/lib/db/pg-schema');

    const appropResults = await this.db
      .select()
      .from(appropriations)
      .where(eq(appropriations.id, appropriationId));

    if (appropResults.length === 0) {
      throw new NotFoundException('Appropriation not found');
    }

    const appropriation = appropResults[0];

    // Get fund control records for this appropriation
    const fundControlRecords = await this.db
      .select()
      .from(fundControls)
      .where(eq(fundControls.appropriationId, appropriationId));

    const totalAuthority = appropriation.totalAuthority;
    const apportioned = appropriation.apportioned;
    const allotted = appropriation.allotted;
    const obligated = appropriation.obligated;
    const disbursed = appropriation.disbursed;
    const unobligatedBalance = appropriation.unobligatedBalance;

    const requestedAmount = amount || 0;
    const isFundsAvailable = requestedAmount <= unobligatedBalance;
    const exceedsApportionment = requestedAmount > (apportioned - obligated);
    const exceedsAllotment = requestedAmount > (allotted - obligated);

    return {
      appropriationId,
      status: appropriation.status,
      totalAuthority,
      apportioned,
      allotted,
      obligated,
      disbursed,
      unobligatedBalance,
      fundControls: fundControlRecords,
      requestedAmount,
      fundsAvailable: isFundsAvailable,
      adaRisk: {
        exceedsApportionment,
        exceedsAllotment,
        exceedsTotalAuthority: requestedAmount > unobligatedBalance,
        appropriationExpired: appropriation.status !== 'current',
      },
    };
  }

  async findOne(id: string) {
    const { fundControls } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(fundControls)
      .where(eq(fundControls.id, id));

    if (results.length === 0) {
      throw new NotFoundException(`Fund control record ${id} not found`);
    }
    return results[0];
  }

  async create(dto: CreateFundControlDto) {
    const { fundControls } = await import('@shared/lib/db/pg-schema');
    const id = uuid();
    const now = new Date().toISOString();

    await this.db.insert(fundControls).values({
      id,
      appropriationId: dto.appropriationId,
      controlLevel: dto.controlLevel,
      authorizedAmount: dto.authorizedAmount,
      obligatedAmount: dto.obligatedAmount ?? 0,
      expendedAmount: dto.expendedAmount ?? 0,
      responsibleOrg: dto.responsibleOrg || null,
      fiscalYear: dto.fiscalYear || new Date().getFullYear(),
      createdAt: now,
    });

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateFundControlDto) {
    const { fundControls } = await import('@shared/lib/db/pg-schema');

    // Verify exists
    await this.findOne(id);

    const updateData: Record<string, unknown> = {};
    if (dto.authorizedAmount !== undefined) updateData.authorizedAmount = dto.authorizedAmount;
    if (dto.obligatedAmount !== undefined) updateData.obligatedAmount = dto.obligatedAmount;
    if (dto.expendedAmount !== undefined) updateData.expendedAmount = dto.expendedAmount;
    if (dto.responsibleOrg !== undefined) updateData.responsibleOrg = dto.responsibleOrg;

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(fundControls)
        .set(updateData)
        .where(eq(fundControls.id, id));
    }

    return this.findOne(id);
  }
}
