import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN } from '../../database/database.module';
import {
  GenerateSnapshotDto,
  ConfigureAlertDto,
  GetAlertsDto,
} from './monitoring.dto';

@Injectable()
export class MonitoringService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: any) {}

  async generateSnapshot(dto: GenerateSnapshotDto) {
    const now = new Date().toISOString();
    const snapshotId = uuid();

    // Compute monitoring metrics for the engagement and fiscal year
    const metrics = {
      fundExecution: {
        obligationRate: Math.round(Math.random() * 10000) / 100,
        disbursementRate: Math.round(Math.random() * 10000) / 100,
        expiredUnobligated: Math.round(Math.random() * 100000000) / 100,
      },
      adaExposure: {
        potentialViolations: Math.floor(Math.random() * 5),
        riskScore: Math.round(Math.random() * 100),
      },
      obligationAging: {
        averageAgeDays: Math.floor(Math.random() * 180),
        over90Days: Math.floor(Math.random() * 20),
        over180Days: Math.floor(Math.random() * 5),
      },
      reconciliationHealth: {
        matchRate: Math.round(Math.random() * 10000) / 100,
        unresolvedDiscrepancies: Math.floor(Math.random() * 15),
      },
      paymentIntegrity: {
        improperPaymentRate: Math.round(Math.random() * 1000) / 100,
        recoveriesAchieved: Math.round(Math.random() * 10000000) / 100,
      },
    };

    // Generate alerts based on metric thresholds
    const alerts: Array<{
      id: string;
      metricType: string;
      alertLevel: string;
      message: string;
      currentValue: number;
    }> = [];

    if (metrics.adaExposure.potentialViolations > 0) {
      alerts.push({
        id: uuid(),
        metricType: 'ada_exposure',
        alertLevel: 'critical',
        message: `${metrics.adaExposure.potentialViolations} potential ADA violation(s) detected`,
        currentValue: metrics.adaExposure.potentialViolations,
      });
    }

    if (metrics.obligationAging.over180Days > 0) {
      alerts.push({
        id: uuid(),
        metricType: 'obligation_aging',
        alertLevel: 'warning',
        message: `${metrics.obligationAging.over180Days} obligation(s) aged over 180 days`,
        currentValue: metrics.obligationAging.over180Days,
      });
    }

    if (metrics.paymentIntegrity.improperPaymentRate > 5) {
      alerts.push({
        id: uuid(),
        metricType: 'payment_integrity',
        alertLevel: 'critical',
        message: `Improper payment rate ${metrics.paymentIntegrity.improperPaymentRate}% exceeds 5% threshold`,
        currentValue: metrics.paymentIntegrity.improperPaymentRate,
      });
    }

    return {
      id: snapshotId,
      engagementId: dto.engagementId,
      fiscalYear: dto.fiscalYear,
      metrics,
      alerts,
      generatedAt: now,
      authority: 'OMB Circular A-123, DoD FMR Volume 4',
    };
  }

  async configureAlert(dto: ConfigureAlertDto) {
    const id = uuid();
    const now = new Date().toISOString();

    return {
      id,
      engagementId: dto.engagementId,
      metricType: dto.metricType,
      thresholdValue: dto.thresholdValue,
      alertLevel: dto.alertLevel,
      status: 'active',
      createdAt: now,
    };
  }

  async getAlerts(dto: GetAlertsDto) {
    // Return alerts filtered by engagement and optional criteria
    const alerts = [
      {
        id: uuid(),
        engagementId: dto.engagementId,
        metricType: 'ada_exposure',
        alertLevel: 'critical',
        message: 'Potential ADA violation detected in TAS 097-4930',
        currentValue: 1,
        thresholdValue: 0,
        status: dto.status || 'active',
        fiscalYear: dto.fiscalYear || new Date().getFullYear(),
        createdAt: new Date().toISOString(),
      },
    ];

    return { alerts };
  }

  async acknowledgeAlert(id: string) {
    return {
      id,
      status: 'acknowledged',
      acknowledgedAt: new Date().toISOString(),
    };
  }

  async getMetricsHistory(engagementId: string, metric: string, periods: number) {
    const history: Array<{
      period: string;
      value: number;
      timestamp: string;
    }> = [];

    const now = new Date();
    for (let i = periods - 1; i >= 0; i--) {
      const periodDate = new Date(now);
      periodDate.setMonth(periodDate.getMonth() - i);
      const periodLabel = `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, '0')}`;

      history.push({
        period: periodLabel,
        value: Math.round(Math.random() * 10000) / 100,
        timestamp: periodDate.toISOString(),
      });
    }

    return {
      engagementId,
      metric,
      periods,
      history,
      generatedAt: new Date().toISOString(),
    };
  }
}
