import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN, AppDatabase } from '../../database/database.module';
import { CreateBudgetFormulationDto, SubmitUnfundedRequirementDto } from './budget-formulation.dto';

@Injectable()
export class BudgetFormulationService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: AppDatabase) {}

  async findByEngagement(engagementId: string, fiscalYear?: number) {
    const { budgetFormulations } = await import('@shared/lib/db/pg-schema');
    const query = this.db
      .select()
      .from(budgetFormulations)
      .where(eq(budgetFormulations.engagementId, engagementId));
    return query;
  }

  async findOne(id: string) {
    const { budgetFormulations } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(budgetFormulations)
      .where(eq(budgetFormulations.id, id));
    if (results.length === 0) {
      throw new NotFoundException(`Budget formulation ${id} not found`);
    }
    return results[0];
  }

  async create(dto: CreateBudgetFormulationDto) {
    const { budgetFormulations } = await import('@shared/lib/db/pg-schema');
    const id = uuid();
    const now = new Date().toISOString();

    await this.db.insert(budgetFormulations).values({
      id,
      engagementId: dto.engagementId,
      fiscalYear: dto.fiscalYear,
      ppbePhase: dto.ppbePhase,
      programElement: dto.programElement,
      budgetActivity: dto.budgetActivity,
      budgetSubActivity: dto.budgetSubActivity,
      requestedAmount: dto.requestedAmount,
      justification: dto.justification || null,
      fydpProfileJson: dto.fydpProfile ? JSON.stringify(dto.fydpProfile) : null,
      status: 'draft',
      createdAt: now,
    });

    return this.findOne(id);
  }

  async submitUnfundedRequirement(dto: SubmitUnfundedRequirementDto) {
    return {
      id: uuid(),
      engagementId: dto.engagementId,
      fiscalYear: dto.fiscalYear,
      title: dto.title,
      description: dto.description,
      amount: dto.amount,
      priority: dto.priority,
      missionImpact: dto.missionImpact || null,
      status: 'submitted',
      submittedAt: new Date().toISOString(),
    };
  }

  async getPPBESummary(engagementId: string, fiscalYear: number) {
    const formulations = await this.findByEngagement(engagementId, fiscalYear);
    const byPhase: Record<string, { count: number; totalAmount: number }> = {};

    for (const f of formulations) {
      if (!byPhase[f.ppbePhase]) {
        byPhase[f.ppbePhase] = { count: 0, totalAmount: 0 };
      }
      byPhase[f.ppbePhase].count++;
      byPhase[f.ppbePhase].totalAmount += f.requestedAmount || 0;
    }

    return {
      engagementId,
      fiscalYear,
      totalFormulations: formulations.length,
      byPhase,
      generatedAt: new Date().toISOString(),
    };
  }
}
