import { Injectable, Inject, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN } from '../../database/database.module';
import { CreateDisbursementDto, UpdateDisbursementDto } from './disbursements.dto';

@Injectable()
export class DisbursementsService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: any) {}

  async findByEngagement(engagementId: string) {
    const { dodDisbursements } = await import('@shared/lib/db/pg-schema');
    return this.db
      .select()
      .from(dodDisbursements)
      .where(eq(dodDisbursements.engagementId, engagementId));
  }

  async findOne(id: string) {
    const { dodDisbursements } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(dodDisbursements)
      .where(eq(dodDisbursements.id, id));

    if (results.length === 0) {
      throw new NotFoundException(`Disbursement ${id} not found`);
    }
    return results[0];
  }

  async create(dto: CreateDisbursementDto) {
    const { dodDisbursements, dodObligations, appropriations } = await import('@shared/lib/db/pg-schema');

    // Verify obligation exists
    const obligationResults = await this.db
      .select()
      .from(dodObligations)
      .where(eq(dodObligations.id, dto.obligationId));

    if (obligationResults.length === 0) {
      throw new NotFoundException('Obligation not found');
    }

    const obligation = obligationResults[0];

    if (obligation.status === 'deobligated') {
      throw new UnprocessableEntityException('Cannot disburse against a deobligated obligation');
    }

    if (dto.amount > obligation.unliquidatedBalance) {
      throw new UnprocessableEntityException({
        error: 'Disbursement exceeds unliquidated balance',
        unliquidatedBalance: obligation.unliquidatedBalance,
        requestedAmount: dto.amount,
      });
    }

    // Check appropriation-level fund availability
    const appropResults = await this.db
      .select()
      .from(appropriations)
      .where(eq(appropriations.id, obligation.appropriationId));

    if (appropResults.length > 0 && appropResults[0].status === 'cancelled') {
      throw new UnprocessableEntityException('Cannot disburse from a cancelled appropriation');
    }

    const id = uuid();
    const now = new Date().toISOString();

    await this.db.insert(dodDisbursements).values({
      id,
      engagementId: dto.engagementId,
      obligationId: dto.obligationId,
      disbursementNumber: dto.disbursementNumber,
      voucherNumber: dto.voucherNumber || null,
      payeeId: dto.payeeId || null,
      amount: dto.amount,
      disbursementDate: dto.disbursementDate || now,
      paymentMethod: dto.paymentMethod,
      certifiedBy: dto.certifiedBy || null,
      status: 'pending',
      promptPayDueDate: dto.promptPayDueDate || null,
      discountDate: dto.discountDate || null,
      discountAmount: dto.discountAmount || 0,
      interestPenalty: dto.interestPenalty || 0,
      createdAt: now,
    });

    // Update obligation liquidation
    const newLiquidated = obligation.liquidatedAmount + dto.amount;
    await this.db
      .update(dodObligations)
      .set({
        liquidatedAmount: newLiquidated,
        unliquidatedBalance: obligation.amount - newLiquidated,
        status: newLiquidated >= obligation.amount ? 'fully_liquidated' : 'partially_liquidated',
      })
      .where(eq(dodObligations.id, dto.obligationId));

    // Update appropriation disbursed amount
    if (appropResults.length > 0) {
      const appropriation = appropResults[0];
      await this.db
        .update(appropriations)
        .set({ disbursed: appropriation.disbursed + dto.amount })
        .where(eq(appropriations.id, obligation.appropriationId));
    }

    return this.findOne(id);
  }

  async update(id: string, dto: UpdateDisbursementDto) {
    const { dodDisbursements } = await import('@shared/lib/db/pg-schema');

    // Verify exists
    await this.findOne(id);

    const updateData: Record<string, unknown> = {};
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.certifiedBy !== undefined) updateData.certifiedBy = dto.certifiedBy;
    if (dto.interestPenalty !== undefined) updateData.interestPenalty = dto.interestPenalty;

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(dodDisbursements)
        .set(updateData)
        .where(eq(dodDisbursements.id, id));
    }

    return this.findOne(id);
  }
}
