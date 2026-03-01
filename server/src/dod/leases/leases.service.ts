import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN } from '../../database/database.module';
import { CreateLeaseDto } from './leases.dto';

@Injectable()
export class LeasesService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: any) {}

  async findByEngagement(engagementId: string) {
    const { leaseAmortizationSchedules } = await import('@shared/lib/db/pg-schema');
    return this.db
      .select()
      .from(leaseAmortizationSchedules)
      .where(eq(leaseAmortizationSchedules.engagementId, engagementId));
  }

  async findOne(id: string) {
    const { leaseAmortizationSchedules } = await import('@shared/lib/db/pg-schema');
    const results = await this.db
      .select()
      .from(leaseAmortizationSchedules)
      .where(eq(leaseAmortizationSchedules.id, id));
    if (results.length === 0) {
      throw new NotFoundException(`Lease ${id} not found`);
    }
    return results[0];
  }

  async create(dto: CreateLeaseDto) {
    const { leaseAmortizationSchedules } = await import('@shared/lib/db/pg-schema');
    const id = uuid();
    const now = new Date().toISOString();

    await this.db.insert(leaseAmortizationSchedules).values({
      id,
      engagementId: dto.engagementId,
      leaseDescription: dto.description,
      lessorName: dto.lessorName,
      commencementDate: dto.commencementDate,
      termMonths: dto.termMonths,
      monthlyPayment: dto.monthlyPayment,
      discountRate: dto.discountRate || 0.035,
      isIntragovernmental: dto.isIntragovernmental ? 1 : 0,
      initialDirectCosts: dto.initialDirectCosts || 0,
      prepayments: dto.prepayments || 0,
      fiscalYear: dto.fiscalYear,
      classificationType: null,
      scheduleJson: null,
      createdAt: now,
    });

    return this.findOne(id);
  }

  async classifyLease(leaseId: string) {
    const lease = await this.findOne(leaseId);
    const shortTermThreshold = 24;

    let classification: string;
    if (lease.termMonths <= shortTermThreshold) {
      classification = 'short_term_exempt';
    } else if (lease.isIntragovernmental) {
      classification = 'intragovernmental';
    } else {
      classification = 'operating';
    }

    const { leaseAmortizationSchedules } = await import('@shared/lib/db/pg-schema');
    await this.db
      .update(leaseAmortizationSchedules)
      .set({ classificationType: classification })
      .where(eq(leaseAmortizationSchedules.id, leaseId));

    return {
      leaseId,
      classification,
      termMonths: lease.termMonths,
      isIntragovernmental: !!lease.isIntragovernmental,
      authority: 'SFFAS 54',
    };
  }

  async generateAmortizationSchedule(leaseId: string) {
    const lease = await this.findOne(leaseId);
    const rate = lease.discountRate || 0.035;
    const monthlyRate = rate / 12;
    const n = lease.termMonths;
    const payment = lease.monthlyPayment;

    // PV of lease payments
    const pvFactor = monthlyRate > 0
      ? (1 - Math.pow(1 + monthlyRate, -n)) / monthlyRate
      : n;
    const presentValue = Math.round(payment * pvFactor * 100) / 100;

    const schedule: Array<{
      period: number;
      payment: number;
      interestExpense: number;
      principalReduction: number;
      remainingLiability: number;
    }> = [];

    let balance = presentValue;
    for (let i = 1; i <= n; i++) {
      const interest = Math.round(balance * monthlyRate * 100) / 100;
      const principal = Math.round((payment - interest) * 100) / 100;
      balance = Math.round((balance - principal) * 100) / 100;
      if (balance < 0) balance = 0;

      schedule.push({
        period: i,
        payment,
        interestExpense: interest,
        principalReduction: principal,
        remainingLiability: balance,
      });
    }

    return {
      leaseId,
      presentValue,
      discountRate: rate,
      termMonths: n,
      monthlyPayment: payment,
      totalPayments: Math.round(payment * n * 100) / 100,
      totalInterest: Math.round((payment * n - presentValue) * 100) / 100,
      schedule,
      authority: 'SFFAS 54, paras 18-25',
    };
  }

  async getLeaseDisclosureSummary(engagementId: string) {
    const leases = await this.findByEngagement(engagementId);

    return {
      engagementId,
      totalLeases: leases.length,
      byClassification: leases.reduce((acc: Record<string, number>, l: any) => {
        const cls = l.classificationType || 'unclassified';
        acc[cls] = (acc[cls] || 0) + 1;
        return acc;
      }, {}),
      generatedAt: new Date().toISOString(),
      authority: 'OMB A-136, Section II.3.2',
    };
  }
}
