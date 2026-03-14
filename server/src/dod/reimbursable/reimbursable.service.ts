import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN } from '../../database/database.module';
import {
  CreateInteragencyAgreementDto,
  UpdateIAAStatusDto,
  CreateWorkingCapitalFundDto,
  RunIAAAnalysisDto,
} from './reimbursable.dto';

@Injectable()
export class ReimbursableService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: any) {}

  async createAgreement(dto: CreateInteragencyAgreementDto) {
    const { interagencyAgreements } = await import('@shared/lib/db/pg-schema');
    const id = uuid();
    const now = new Date().toISOString();

    await this.db.insert(interagencyAgreements).values({
      id,
      engagementId: dto.engagementId,
      agreementNumber: dto.agreementNumber,
      agreementType: dto.agreementType,
      requestingAgency: dto.requestingAgency,
      servicingAgency: dto.servicingAgency,
      authority: dto.authority,
      amount: dto.amount,
      obligatedAmount: dto.obligatedAmount,
      billedAmount: dto.billedAmount,
      collectedAmount: dto.collectedAmount,
      advanceReceived: dto.advanceReceived,
      status: dto.status,
      periodOfPerformance: dto.periodOfPerformance,
      fiscalYear: dto.fiscalYear,
      description: dto.description || null,
      createdAt: now,
    });

    return this.findOne(id);
  }

  async findByEngagement(engagementId: string) {
    const { interagencyAgreements } = await import('@shared/lib/db/pg-schema');
    return this.db
      .select()
      .from(interagencyAgreements)
      .where(eq(interagencyAgreements.engagementId, engagementId));
  }

  async findOne(id: string) {
    const { interagencyAgreements } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(interagencyAgreements)
      .where(eq(interagencyAgreements.id, id));
    if (results.length === 0) {
      throw new NotFoundException(`Interagency agreement ${id} not found`);
    }
    return results[0];
  }

  async updateStatus(dto: UpdateIAAStatusDto) {
    const { interagencyAgreements } = await import('@shared/lib/db/pg-schema');
    const existing = await this.findOne(dto.id);

    await this.db
      .update(interagencyAgreements)
      .set({
        status: dto.status,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(interagencyAgreements.id, dto.id));

    return this.findOne(dto.id);
  }

  async createWorkingCapitalFund(dto: CreateWorkingCapitalFundDto) {
    const { workingCapitalFunds } = await import('@shared/lib/db/pg-schema');
    const id = uuid();
    const now = new Date().toISOString();

    await this.db.insert(workingCapitalFunds).values({
      id,
      engagementId: dto.engagementId,
      fundName: dto.fundName,
      fundType: dto.fundType,
      revenueFromOperations: dto.revenueFromOperations,
      costOfOperations: dto.costOfOperations,
      netOperatingResult: dto.netOperatingResult,
      cashBalance: dto.cashBalance,
      fiscalYear: dto.fiscalYear,
      createdAt: now,
    });

    const results = await this.db
      .select()
      .from(workingCapitalFunds)
      .where(eq(workingCapitalFunds.id, id));
    return results[0];
  }

  async findWorkingCapitalFunds(engagementId: string) {
    const { workingCapitalFunds } = await import('@shared/lib/db/pg-schema');
    return this.db
      .select()
      .from(workingCapitalFunds)
      .where(eq(workingCapitalFunds.engagementId, engagementId));
  }

  async runAnalysis(dto: RunIAAAnalysisDto) {
    const agreements = await this.findByEngagement(dto.engagementId);
    const fiscalYearAgreements = agreements.filter(
      (a: any) => a.fiscalYear === dto.fiscalYear,
    );

    const totalAmount = fiscalYearAgreements.reduce(
      (sum: number, a: any) => sum + (a.amount || 0),
      0,
    );
    const totalBilled = fiscalYearAgreements.reduce(
      (sum: number, a: any) => sum + (a.billedAmount || 0),
      0,
    );
    const totalCollected = fiscalYearAgreements.reduce(
      (sum: number, a: any) => sum + (a.collectedAmount || 0),
      0,
    );
    const totalObligated = fiscalYearAgreements.reduce(
      (sum: number, a: any) => sum + (a.obligatedAmount || 0),
      0,
    );

    const economyActAgreements = fiscalYearAgreements.filter(
      (a: any) => a.agreementType === 'economy_act',
    );
    const economyActWithAuthority = economyActAgreements.filter(
      (a: any) => a.authority && a.authority.trim().length > 0,
    );
    const economyActCompliance =
      economyActAgreements.length > 0
        ? Math.round(
            (economyActWithAuthority.length / economyActAgreements.length) * 10000,
          ) / 100
        : 100;

    const billingAccuracy =
      totalAmount > 0
        ? Math.round((totalBilled / totalAmount) * 10000) / 100
        : 0;

    const collectionTimeliness =
      totalBilled > 0
        ? Math.round((totalCollected / totalBilled) * 10000) / 100
        : 0;

    const findings: string[] = [];

    if (economyActCompliance < 100) {
      findings.push(
        'Not all Economy Act agreements have proper authority documentation.',
      );
    }

    if (billingAccuracy < 90) {
      findings.push(
        'Billing accuracy is below 90% threshold — review unbilled agreements.',
      );
    }

    if (collectionTimeliness < 80) {
      findings.push(
        'Collection timeliness is below 80% threshold — follow up on outstanding receivables.',
      );
    }

    const overObligated = fiscalYearAgreements.filter(
      (a: any) => a.obligatedAmount > a.amount,
    );
    if (overObligated.length > 0) {
      findings.push(
        `${overObligated.length} agreement(s) have obligations exceeding the agreement amount.`,
      );
    }

    return {
      id: uuid(),
      engagementId: dto.engagementId,
      fiscalYear: dto.fiscalYear,
      totalAgreements: fiscalYearAgreements.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      totalObligated: Math.round(totalObligated * 100) / 100,
      totalBilled: Math.round(totalBilled * 100) / 100,
      totalCollected: Math.round(totalCollected * 100) / 100,
      metrics: {
        economy_act_compliance: economyActCompliance,
        billing_accuracy: billingAccuracy,
        collection_timeliness: collectionTimeliness,
      },
      findings,
      generatedAt: new Date().toISOString(),
      authority: 'DoD FMR Volume 11A, OMB Circular A-11',
    };
  }
}
