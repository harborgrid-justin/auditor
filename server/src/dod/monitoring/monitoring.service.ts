import { Injectable, Inject, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN, AppDatabase } from '../../database/database.module';
import {
  GenerateSnapshotDto,
  ConfigureAlertDto,
  GetAlertsDto,
} from './monitoring.dto';

/**
 * Monitoring service that computes real metrics from database aggregations
 * rather than mock random data. Queries the actual engagement data to
 * produce fund execution, ADA exposure, obligation aging, reconciliation
 * health, and payment integrity metrics.
 *
 * @see OMB Circular A-123: Management's Responsibility for Enterprise Risk Management and Internal Control
 * @see DoD FMR Volume 4: Accounting Policy
 */
@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(@Inject(DATABASE_TOKEN) private readonly db: AppDatabase) {}

  async generateSnapshot(dto: GenerateSnapshotDto) {
    const now = new Date().toISOString();
    const snapshotId = uuid();

    // Compute real metrics from database
    const [fundExecution, adaExposure, obligationAging, reconciliationHealth, paymentIntegrity] =
      await Promise.all([
        this.computeFundExecutionMetrics(dto.engagementId, dto.fiscalYear),
        this.computeAdaExposureMetrics(dto.engagementId),
        this.computeObligationAgingMetrics(dto.engagementId),
        this.computeReconciliationHealthMetrics(dto.engagementId),
        this.computePaymentIntegrityMetrics(dto.engagementId),
      ]);

    const metrics = {
      fundExecution,
      adaExposure,
      obligationAging,
      reconciliationHealth,
      paymentIntegrity,
    };

    // Generate alerts based on metric thresholds
    const alerts: Array<{
      id: string;
      metricType: string;
      alertLevel: string;
      message: string;
      currentValue: number;
    }> = [];

    if (adaExposure.potentialViolations > 0) {
      alerts.push({
        id: uuid(),
        metricType: 'ada_exposure',
        alertLevel: 'critical',
        message: `${adaExposure.potentialViolations} potential ADA violation(s) detected`,
        currentValue: adaExposure.potentialViolations,
      });
    }

    if (obligationAging.over180Days > 0) {
      alerts.push({
        id: uuid(),
        metricType: 'obligation_aging',
        alertLevel: 'warning',
        message: `${obligationAging.over180Days} obligation(s) aged over 180 days`,
        currentValue: obligationAging.over180Days,
      });
    }

    if (paymentIntegrity.improperPaymentRate > 5) {
      alerts.push({
        id: uuid(),
        metricType: 'payment_integrity',
        alertLevel: 'critical',
        message: `Improper payment rate ${paymentIntegrity.improperPaymentRate}% exceeds 5% threshold`,
        currentValue: paymentIntegrity.improperPaymentRate,
      });
    }

    // Persist alerts to monitoring_alerts table
    for (const alert of alerts) {
      await this.persistAlert(dto.engagementId, alert);
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

    try {
      const { monitoringAlertConfigs } = await import('@shared/lib/db/pg-schema');
      await this.db.insert(monitoringAlertConfigs).values({
        id,
        engagementId: dto.engagementId,
        metricType: dto.metricType,
        thresholdValue: dto.thresholdValue,
        alertLevel: dto.alertLevel,
        enabled: true,
        createdAt: now,
      } as Record<string, unknown>);
    } catch (err: unknown) {
      this.logger.warn(`Failed to persist alert config: ${err instanceof Error ? err.message : String(err)}`);
    }

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
    try {
      const { monitoringAlerts } = await import('@shared/lib/db/pg-schema');
      const query = this.db
        .select()
        .from(monitoringAlerts)
        .where(sql`${monitoringAlerts.engagementId} = ${dto.engagementId}`);

      const alerts = await query;
      return { alerts };
    } catch (err: unknown) {
      this.logger.warn(`Failed to query alerts from DB: ${err instanceof Error ? err.message : String(err)}`);
      return { alerts: [] };
    }
  }

  async acknowledgeAlert(id: string) {
    try {
      const { monitoringAlerts } = await import('@shared/lib/db/pg-schema');
      await this.db
        .update(monitoringAlerts)
        .set({
          status: 'acknowledged',
          acknowledgedAt: new Date().toISOString(),
        } as Record<string, unknown>)
        .where(sql`${monitoringAlerts.id} = ${id}`);
    } catch (err: unknown) {
      this.logger.warn(`Failed to acknowledge alert in DB: ${err instanceof Error ? err.message : String(err)}`);
    }

    return {
      id,
      status: 'acknowledged',
      acknowledgedAt: new Date().toISOString(),
    };
  }

  async getMetricsHistory(engagementId: string, metric: string, periods: number) {
    // Query actual historical snapshots from the database
    try {
      const rows = await this.db.execute(sql`
        SELECT
          to_char(timestamp, 'YYYY-MM') as period,
          (details->>${metric})::numeric as value,
          timestamp
        FROM audit_logs
        WHERE engagement_id = ${engagementId}
          AND entity_type = 'monitoring_snapshot'
          AND details ? ${metric}
        ORDER BY timestamp DESC
        LIMIT ${periods}
      `);

      if (rows.rows && rows.rows.length > 0) {
        return {
          engagementId,
          metric,
          periods,
          history: rows.rows.map((row: Record<string, unknown>) => ({
            period: row.period as string,
            value: Number(row.value ?? 0),
            timestamp: row.timestamp as string,
          })),
          generatedAt: new Date().toISOString(),
        };
      }
    } catch (err: unknown) {
      this.logger.debug(`Historical metrics query fell back to computed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Fallback: return empty history if no historical data exists
    return {
      engagementId,
      metric,
      periods,
      history: [],
      generatedAt: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Metric computation from real data
  // ---------------------------------------------------------------------------

  private async computeFundExecutionMetrics(engagementId: string, fiscalYear: number) {
    try {
      const result = await this.db.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN status IN ('obligated', 'disbursed') THEN amount ELSE 0 END), 0) as obligated,
          COALESCE(SUM(CASE WHEN status = 'disbursed' THEN amount ELSE 0 END), 0) as disbursed,
          COALESCE(SUM(amount), 0) as total,
          COALESCE(SUM(CASE WHEN status = 'expired' AND amount > 0 THEN amount ELSE 0 END), 0) as expired_unobligated
        FROM dod_obligations
        WHERE engagement_id = ${engagementId}
      `);
      const row = (result.rows?.[0] ?? {}) as Record<string, unknown>;
      const total = Number(row.total ?? 0);
      const obligated = Number(row.obligated ?? 0);
      const disbursed = Number(row.disbursed ?? 0);

      return {
        obligationRate: total > 0 ? Math.round((obligated / total) * 10000) / 100 : 0,
        disbursementRate: total > 0 ? Math.round((disbursed / total) * 10000) / 100 : 0,
        expiredUnobligated: Number(row.expired_unobligated ?? 0),
      };
    } catch {
      return { obligationRate: 0, disbursementRate: 0, expiredUnobligated: 0 };
    }
  }

  private async computeAdaExposureMetrics(engagementId: string) {
    try {
      const result = await this.db.execute(sql`
        SELECT COUNT(*) as count
        FROM dod_ada_violations
        WHERE engagement_id = ${engagementId}
          AND status NOT IN ('resolved', 'false_positive')
      `);
      const count = Number((result.rows?.[0] as Record<string, unknown>)?.count ?? 0);
      return {
        potentialViolations: count,
        riskScore: Math.min(count * 25, 100),
      };
    } catch {
      return { potentialViolations: 0, riskScore: 0 };
    }
  }

  private async computeObligationAgingMetrics(engagementId: string) {
    try {
      const result = await this.db.execute(sql`
        SELECT
          COALESCE(AVG(EXTRACT(DAY FROM NOW() - created_at)), 0) as avg_age,
          COALESCE(SUM(CASE WHEN EXTRACT(DAY FROM NOW() - created_at) > 90 THEN 1 ELSE 0 END), 0) as over_90,
          COALESCE(SUM(CASE WHEN EXTRACT(DAY FROM NOW() - created_at) > 180 THEN 1 ELSE 0 END), 0) as over_180
        FROM dod_obligations
        WHERE engagement_id = ${engagementId}
          AND status NOT IN ('disbursed', 'cancelled')
      `);
      const row = (result.rows?.[0] ?? {}) as Record<string, unknown>;
      return {
        averageAgeDays: Math.round(Number(row.avg_age ?? 0)),
        over90Days: Number(row.over_90 ?? 0),
        over180Days: Number(row.over_180 ?? 0),
      };
    } catch {
      return { averageAgeDays: 0, over90Days: 0, over180Days: 0 };
    }
  }

  private async computeReconciliationHealthMetrics(engagementId: string) {
    try {
      const result = await this.db.execute(sql`
        SELECT
          COUNT(*) as total,
          COALESCE(SUM(CASE WHEN status = 'matched' THEN 1 ELSE 0 END), 0) as matched,
          COALESCE(SUM(CASE WHEN status IN ('mismatch', 'exception') THEN 1 ELSE 0 END), 0) as unresolved
        FROM three_way_matches
        WHERE engagement_id = ${engagementId}
      `);
      const row = (result.rows?.[0] ?? {}) as Record<string, unknown>;
      const total = Number(row.total ?? 0);
      const matched = Number(row.matched ?? 0);
      return {
        matchRate: total > 0 ? Math.round((matched / total) * 10000) / 100 : 100,
        unresolvedDiscrepancies: Number(row.unresolved ?? 0),
      };
    } catch {
      return { matchRate: 100, unresolvedDiscrepancies: 0 };
    }
  }

  private async computePaymentIntegrityMetrics(engagementId: string) {
    try {
      const result = await this.db.execute(sql`
        SELECT
          COUNT(*) as total,
          COALESCE(SUM(CASE WHEN status = 'improper' THEN 1 ELSE 0 END), 0) as improper,
          COALESCE(SUM(CASE WHEN status = 'recovered' THEN amount ELSE 0 END), 0) as recoveries
        FROM dod_disbursements
        WHERE engagement_id = ${engagementId}
      `);
      const row = (result.rows?.[0] ?? {}) as Record<string, unknown>;
      const total = Number(row.total ?? 0);
      const improper = Number(row.improper ?? 0);
      return {
        improperPaymentRate: total > 0 ? Math.round((improper / total) * 10000) / 100 : 0,
        recoveriesAchieved: Number(row.recoveries ?? 0),
      };
    } catch {
      return { improperPaymentRate: 0, recoveriesAchieved: 0 };
    }
  }

  private async persistAlert(
    engagementId: string,
    alert: { id: string; metricType: string; alertLevel: string; message: string; currentValue: number },
  ): Promise<void> {
    try {
      const { monitoringAlerts } = await import('@shared/lib/db/pg-schema');
      await this.db.insert(monitoringAlerts).values({
        id: alert.id,
        engagementId,
        metricType: alert.metricType,
        alertLevel: alert.alertLevel,
        message: alert.message,
        currentValue: alert.currentValue,
        status: 'active',
        createdAt: new Date().toISOString(),
      } as Record<string, unknown>);
    } catch (err: unknown) {
      this.logger.warn(`Failed to persist monitoring alert: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
