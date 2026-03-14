import { Injectable, Inject, Logger } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { DATABASE_TOKEN, AppDatabase } from '../database/database.module';

export type JobType =
  | 'run-dod-fmr-analysis'
  | 'sync-legislation-parameters'
  | 'generate-federal-reports'
  | 'ada-monitoring-sweep'
  | 'obligation-aging-review'
  | 'payment-integrity-scan'
  | 'legislation-ingestion-scan';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobResult {
  jobId: string;
  type: JobType;
  status: JobStatus;
  startedAt: string;
  completedAt?: string;
  result?: any;
  error?: string;
  durationMs?: number;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private runningJobs = new Map<string, JobResult>();

  constructor(@Inject(DATABASE_TOKEN) private readonly db: AppDatabase) {}

  /**
   * Enqueue a job for execution.
   * In a production deployment, this would push to BullMQ/Redis.
   * For now, executes inline with tracking.
   */
  async enqueue(params: {
    type: JobType;
    engagementId: string;
    fiscalYear?: number;
    parameters?: Record<string, any>;
    userId: string;
  }): Promise<JobResult> {
    const jobId = uuid();
    const now = new Date().toISOString();

    const job: JobResult = {
      jobId,
      type: params.type,
      status: 'pending',
      startedAt: now,
    };

    this.runningJobs.set(jobId, job);

    this.logger.log(
      `Job enqueued: ${params.type} (${jobId}) for engagement ${params.engagementId}`
    );

    // In production: push to BullMQ queue
    // For now: store in DB and return
    try {
      const { jobExecutions } = await import('@shared/lib/db/pg-schema');
      await this.db.insert(jobExecutions).values({
        id: jobId,
        type: params.type,
        engagementId: params.engagementId,
        fiscalYear: params.fiscalYear ?? null,
        parametersJson: params.parameters ? JSON.stringify(params.parameters) : null,
        status: 'pending',
        createdBy: params.userId,
        createdAt: now,
      });
    } catch {
      // Table may not exist yet — store in memory only
      this.logger.warn(`Could not persist job ${jobId} to database — table may not exist`);
    }

    return job;
  }

  /**
   * Update job status.
   */
  async updateStatus(jobId: string, status: JobStatus, result?: any, error?: string) {
    const job = this.runningJobs.get(jobId);
    if (job) {
      job.status = status;
      if (result) job.result = result;
      if (error) job.error = error;
      if (status === 'completed' || status === 'failed') {
        job.completedAt = new Date().toISOString();
        job.durationMs =
          new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime();
      }
    }

    try {
      const { jobExecutions } = await import('@shared/lib/db/pg-schema');
      const updateData: Record<string, unknown> = { status };
      if (result) updateData.resultJson = JSON.stringify(result);
      if (error) updateData.error = error;
      if (status === 'completed' || status === 'failed') {
        updateData.completedAt = new Date().toISOString();
      }
      await this.db.update(jobExecutions).set(updateData).where(eq(jobExecutions.id, jobId));
    } catch {
      // Silently fail if table doesn't exist
    }

    return job;
  }

  /**
   * Get job status by ID.
   */
  getJobStatus(jobId: string): JobResult | undefined {
    return this.runningJobs.get(jobId);
  }

  /**
   * List recent jobs.
   */
  async listRecentJobs(engagementId?: string, limit = 20): Promise<JobResult[]> {
    try {
      const { jobExecutions } = await import('@shared/lib/db/pg-schema');
      let query = this.db.select().from(jobExecutions);
      if (engagementId) {
        query = query.where(eq(jobExecutions.engagementId, engagementId));
      }
      const results = await query.limit(limit);
      return results.map((r: any) => ({
        jobId: r.id,
        type: r.type,
        status: r.status,
        startedAt: r.createdAt,
        completedAt: r.completedAt,
        result: r.resultJson ? JSON.parse(r.resultJson) : undefined,
        error: r.error,
      }));
    } catch {
      // Return in-memory jobs if table doesn't exist
      return Array.from(this.runningJobs.values());
    }
  }

  /**
   * Get scheduled jobs from the schedules table.
   */
  async getScheduledJobs() {
    try {
      const { schedules } = await import('@shared/lib/db/pg-schema');
      return this.db.select().from(schedules).where(eq(schedules.enabled, true));
    } catch {
      return [];
    }
  }
}
