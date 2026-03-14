import { Injectable, Inject, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { DATABASE_TOKEN, AppDatabase } from '../../database/database.module';
import { StartBatchDto, CancelBatchDto, BatchType } from './batch.dto';
import {
  BatchProcessor,
  BatchRecord,
  BatchResult,
  BatchRecordValidator,
  BatchRecordProcessor,
  BatchError,
} from '@shared/lib/engine/batch/batch-processor';
import {
  validateObligationImport,
  validateDisbursementImport,
  validateJournalEntryImport,
} from '@shared/lib/engine/batch/batch-validators';

@Injectable()
export class BatchService {
  private readonly logger = new Logger(BatchService.name);

  /**
   * In-memory store for batch results.
   * In production this would be backed by a persistent table (e.g., batchExecutions).
   */
  private readonly batches = new Map<string, BatchResult & { engagementId: string; batchType: BatchType; cancelReason?: string }>();

  constructor(@Inject(DATABASE_TOKEN) private readonly db: AppDatabase) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Start a new batch operation.
   *
   * 1. Converts raw data rows into BatchRecord[].
   * 2. Selects the appropriate validator based on batchType.
   * 3. Runs the BatchProcessor (validation + processing).
   * 4. Persists the result for status queries.
   */
  async startBatch(dto: StartBatchDto): Promise<BatchResult> {
    const batchId = uuid();
    const now = new Date().toISOString();

    this.logger.log(
      `Starting batch ${batchId}: type=${dto.batchType}, engagement=${dto.engagementId}, ` +
      `records=${dto.data.length}, dryRun=${!!dto.dryRun}`,
    );

    // Convert raw data array into BatchRecord[]
    const records: BatchRecord[] = dto.data.map((row, index) => ({
      rowNumber: index + 1,
      data: row,
    }));

    // Select validator and processor based on batch type
    const validator = this.getValidator(dto.batchType);
    const processor = this.getProcessor(dto.batchType, dto.engagementId, dto.fiscalYear);

    // Build the processor engine
    const batchProcessor = new BatchProcessor({
      dryRun: dto.dryRun ?? false,
      continueOnError: true,
      auditTrail: true,
    });

    // Execute
    const result = await batchProcessor.processBatch(batchId, records, validator, processor);

    // Persist result in memory (and optionally to DB)
    this.batches.set(batchId, {
      ...result,
      engagementId: dto.engagementId,
      batchType: dto.batchType,
    });

    await this.persistBatchResult(batchId, dto, result);

    this.logger.log(
      `Batch ${batchId} ${result.status}: ${result.successfulRecords}/${result.totalRecords} succeeded ` +
      `(${result.errors.length} errors) in ${result.durationMs}ms`,
    );

    return result;
  }

  /**
   * Get the current status of a batch by ID.
   */
  async getBatchStatus(batchId: string): Promise<BatchResult> {
    const batch = this.batches.get(batchId);
    if (!batch) {
      // Try loading from DB
      const dbBatch = await this.loadBatchFromDb(batchId);
      if (!dbBatch) {
        throw new NotFoundException(`Batch ${batchId} not found`);
      }
      return dbBatch;
    }

    return batch;
  }

  /**
   * Get detailed error list for a batch.
   */
  async getBatchErrors(batchId: string): Promise<{ batchId: string; errors: BatchError[] }> {
    const batch = await this.getBatchStatus(batchId);
    return {
      batchId,
      errors: batch.errors,
    };
  }

  /**
   * Cancel an in-progress batch.
   */
  async cancelBatch(dto: CancelBatchDto): Promise<BatchResult> {
    const batch = this.batches.get(dto.batchId);
    if (!batch) {
      throw new NotFoundException(`Batch ${dto.batchId} not found`);
    }

    if (batch.status === 'completed' || batch.status === 'failed' || batch.status === 'cancelled') {
      throw new BadRequestException(
        `Cannot cancel batch ${dto.batchId} — current status is "${batch.status}"`,
      );
    }

    batch.status = 'cancelled';
    batch.completedAt = new Date().toISOString();
    batch.durationMs =
      new Date(batch.completedAt).getTime() - new Date(batch.startedAt).getTime();
    batch.cancelReason = dto.reason;

    this.logger.log(`Batch ${dto.batchId} cancelled: ${dto.reason}`);

    return batch;
  }

  /**
   * List all batches for a given engagement.
   */
  async getBatchHistory(engagementId: string): Promise<BatchResult[]> {
    // First try DB
    try {
      const { batchExecutions } = await import('@shared/lib/db/pg-schema');
      const rows = await this.db
        .select()
        .from(batchExecutions)
        .where(eq(batchExecutions.engagementId, engagementId));

      if (rows.length > 0) {
        return rows.map((r: any) => this.mapDbRowToResult(r));
      }
    } catch {
      // Table may not exist — fall through to in-memory
    }

    // Fall back to in-memory store
    const results: BatchResult[] = [];
    for (const batch of this.batches.values()) {
      if (batch.engagementId === engagementId) {
        results.push(batch);
      }
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Select the correct validator for the given batch type.
   */
  private getValidator(batchType: BatchType): BatchRecordValidator {
    switch (batchType) {
      case BatchType.OBLIGATION_IMPORT:
        return validateObligationImport;
      case BatchType.DISBURSEMENT_IMPORT:
        return validateDisbursementImport;
      case BatchType.JOURNAL_ENTRY_IMPORT:
        return validateJournalEntryImport;
      case BatchType.PAYROLL_PROCESSING:
        // Payroll uses obligation validator as baseline plus payroll-specific checks
        return (record: BatchRecord) => {
          const errors: BatchError[] = [];
          const required = ['employeeId', 'payPeriod', 'grossAmount', 'netAmount'];
          for (const field of required) {
            if (!record.data[field] && record.data[field] !== 0) {
              errors.push({
                rowNumber: record.rowNumber,
                field,
                errorCode: `PAYROLL_MISSING_${field.toUpperCase()}`,
                message: `Missing required field: ${field}`,
              });
            }
          }
          return errors;
        };
      case BatchType.YEAR_END_CLOSE:
        return (record: BatchRecord) => {
          const errors: BatchError[] = [];
          const required = ['accountId', 'closingBalance', 'fiscalYear'];
          for (const field of required) {
            if (!record.data[field] && record.data[field] !== 0) {
              errors.push({
                rowNumber: record.rowNumber,
                field,
                errorCode: `YEC_MISSING_${field.toUpperCase()}`,
                message: `Missing required field: ${field}`,
              });
            }
          }
          return errors;
        };
      default:
        throw new BadRequestException(`Unsupported batch type: ${batchType}`);
    }
  }

  /**
   * Select the correct processor for the given batch type.
   * In production, each processor would write to the appropriate database tables.
   */
  private getProcessor(
    batchType: BatchType,
    engagementId: string,
    fiscalYear: number,
  ): BatchRecordProcessor {
    switch (batchType) {
      case BatchType.OBLIGATION_IMPORT:
        return async (record) => {
          // In production: insert into obligations table
          this.logger.debug(
            `[Batch] Processing obligation row ${record.rowNumber}: ` +
            `appropriation=${record.data.appropriationId}, amount=${record.data.amount}`,
          );
          return { type: 'obligation', rowNumber: record.rowNumber };
        };

      case BatchType.DISBURSEMENT_IMPORT:
        return async (record) => {
          this.logger.debug(
            `[Batch] Processing disbursement row ${record.rowNumber}: ` +
            `obligation=${record.data.obligationId}, amount=${record.data.amount}`,
          );
          return { type: 'disbursement', rowNumber: record.rowNumber };
        };

      case BatchType.JOURNAL_ENTRY_IMPORT:
        return async (record) => {
          this.logger.debug(
            `[Batch] Processing journal entry row ${record.rowNumber}: ` +
            `debit=${record.data.debitAccount}, credit=${record.data.creditAccount}, amount=${record.data.amount}`,
          );
          return { type: 'journal_entry', rowNumber: record.rowNumber };
        };

      case BatchType.PAYROLL_PROCESSING:
        return async (record) => {
          this.logger.debug(
            `[Batch] Processing payroll row ${record.rowNumber}: ` +
            `employee=${record.data.employeeId}, gross=${record.data.grossAmount}`,
          );
          return { type: 'payroll', rowNumber: record.rowNumber };
        };

      case BatchType.YEAR_END_CLOSE:
        return async (record) => {
          this.logger.debug(
            `[Batch] Processing year-end close row ${record.rowNumber}: ` +
            `account=${record.data.accountId}, balance=${record.data.closingBalance}`,
          );
          return { type: 'year_end_close', rowNumber: record.rowNumber };
        };

      default:
        throw new BadRequestException(`Unsupported batch type: ${batchType}`);
    }
  }

  /**
   * Persist batch result to database.
   * Silently fails if the table does not exist yet.
   */
  private async persistBatchResult(
    batchId: string,
    dto: StartBatchDto,
    result: BatchResult,
  ): Promise<void> {
    try {
      const { batchExecutions } = await import('@shared/lib/db/pg-schema');
      await this.db.insert(batchExecutions).values({
        id: batchId,
        engagementId: dto.engagementId,
        batchType: dto.batchType,
        fiscalYear: dto.fiscalYear,
        totalRecords: result.totalRecords,
        processedRecords: result.processedRecords,
        successfulRecords: result.successfulRecords,
        failedRecords: result.failedRecords,
        status: result.status,
        dryRun: result.dryRun,
        errorsJson: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
        summaryJson: JSON.stringify(result.summary),
        startedAt: result.startedAt,
        completedAt: result.completedAt ?? null,
        durationMs: result.durationMs ?? null,
      });
    } catch {
      this.logger.warn(`Could not persist batch ${batchId} to database — table may not exist`);
    }
  }

  /**
   * Load a batch result from the database by ID.
   */
  private async loadBatchFromDb(batchId: string): Promise<BatchResult | null> {
    try {
      const { batchExecutions } = await import('@shared/lib/db/pg-schema');
      const rows = await this.db
        .select()
        .from(batchExecutions)
        .where(eq(batchExecutions.id, batchId));

      if (rows.length === 0) return null;
      return this.mapDbRowToResult(rows[0]);
    } catch {
      return null;
    }
  }

  /**
   * Map a database row to a BatchResult.
   */
  private mapDbRowToResult(row: any): BatchResult {
    return {
      batchId: row.id,
      status: row.status,
      totalRecords: row.totalRecords,
      processedRecords: row.processedRecords,
      successfulRecords: row.successfulRecords,
      failedRecords: row.failedRecords,
      errors: row.errorsJson ? JSON.parse(row.errorsJson) : [],
      startedAt: row.startedAt,
      completedAt: row.completedAt ?? undefined,
      durationMs: row.durationMs ?? undefined,
      dryRun: row.dryRun ?? false,
      summary: row.summaryJson ? JSON.parse(row.summaryJson) : {},
    };
  }
}
