import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BatchStatus =
  | 'pending'
  | 'validating'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface BatchConfig {
  /** Records per chunk (default: 100) */
  chunkSize: number;
  /** Parallel chunks (default: 1) */
  maxParallel: number;
  /** Don't abort on individual record failure (default: true) */
  continueOnError: boolean;
  /** Validate only, don't commit (default: false) */
  dryRun: boolean;
  /** Log each record processed (default: true) */
  auditTrail: boolean;
}

export interface BatchRecord {
  rowNumber: number;
  data: Record<string, any>;
}

export interface BatchResult {
  batchId: string;
  status: BatchStatus;
  totalRecords: number;
  processedRecords: number;
  successfulRecords: number;
  failedRecords: number;
  errors: BatchError[];
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  dryRun: boolean;
  summary: Record<string, any>;
}

export interface BatchError {
  rowNumber: number;
  field?: string;
  errorCode: string;
  message: string;
}

/** Validates a single record and returns any errors found. */
export type BatchRecordValidator = (record: BatchRecord) => BatchError[];

/** Processes a single record and returns an optional summary fragment. */
export type BatchRecordProcessor = (
  record: BatchRecord,
) => Promise<Record<string, any> | void>;

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: BatchConfig = {
  chunkSize: 100,
  maxParallel: 1,
  continueOnError: true,
  dryRun: false,
  auditTrail: true,
};

// ---------------------------------------------------------------------------
// BatchProcessor
// ---------------------------------------------------------------------------

export class BatchProcessor {
  private readonly config: BatchConfig;

  constructor(config: Partial<BatchConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Process an entire batch of records.
   *
   * 1. Pre-validate every record using `validator`.
   * 2. If validation fails and `continueOnError` is false, return immediately.
   * 3. Split valid records into chunks of `chunkSize`.
   * 4. Process up to `maxParallel` chunks concurrently.
   * 5. Return a consolidated {@link BatchResult}.
   */
  async processBatch(
    batchId: string,
    records: BatchRecord[],
    validator: BatchRecordValidator,
    processor: BatchRecordProcessor,
  ): Promise<BatchResult> {
    const startedAt = new Date().toISOString();

    const result: BatchResult = {
      batchId,
      status: 'pending',
      totalRecords: records.length,
      processedRecords: 0,
      successfulRecords: 0,
      failedRecords: 0,
      errors: [],
      startedAt,
      dryRun: this.config.dryRun,
      summary: {},
    };

    // --- Validation phase ---------------------------------------------------
    result.status = 'validating';
    const validationErrors = this.validateRecords(records, validator);

    if (validationErrors.length > 0) {
      result.errors.push(...validationErrors);
      result.failedRecords = new Set(validationErrors.map((e) => e.rowNumber)).size;

      if (!this.config.continueOnError) {
        result.status = 'failed';
        result.completedAt = new Date().toISOString();
        result.durationMs =
          new Date(result.completedAt).getTime() - new Date(startedAt).getTime();
        return result;
      }
    }

    // Build set of rows that failed validation so we can skip them
    const failedRows = new Set(validationErrors.map((e) => e.rowNumber));
    const validRecords = records.filter((r) => !failedRows.has(r.rowNumber));

    // --- Dry-run short-circuit -----------------------------------------------
    if (this.config.dryRun) {
      result.status = 'completed';
      result.processedRecords = 0;
      result.successfulRecords = 0;
      result.failedRecords = failedRows.size;
      result.completedAt = new Date().toISOString();
      result.durationMs =
        new Date(result.completedAt).getTime() - new Date(startedAt).getTime();
      result.summary = {
        dryRun: true,
        validRecords: validRecords.length,
        invalidRecords: failedRows.size,
      };
      return result;
    }

    // --- Processing phase ----------------------------------------------------
    result.status = 'processing';

    const chunks = this.chunkArray(validRecords, this.config.chunkSize);
    const processingErrors: BatchError[] = [];
    let processedCount = 0;
    let successCount = 0;

    // Process chunks respecting maxParallel concurrency
    for (let i = 0; i < chunks.length; i += this.config.maxParallel) {
      const batch = chunks.slice(i, i + this.config.maxParallel);
      const chunkResults = await Promise.all(
        batch.map((chunk) => this.processChunk(chunk, processor, processingErrors)),
      );

      for (const cr of chunkResults) {
        processedCount += cr.processed;
        successCount += cr.succeeded;
      }
    }

    result.errors.push(...processingErrors);
    result.processedRecords = processedCount;
    result.successfulRecords = successCount;
    result.failedRecords = failedRows.size + processingErrors.length;
    result.status = processingErrors.length > 0 && !this.config.continueOnError
      ? 'failed'
      : 'completed';
    result.completedAt = new Date().toISOString();
    result.durationMs =
      new Date(result.completedAt).getTime() - new Date(startedAt).getTime();
    result.summary = {
      totalRecords: records.length,
      validationErrors: validationErrors.length,
      processingErrors: processingErrors.length,
      successRate:
        records.length > 0
          ? Math.round((successCount / records.length) * 10000) / 100
          : 0,
    };

    return result;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async processChunk(
    records: BatchRecord[],
    processor: BatchRecordProcessor,
    errors: BatchError[],
  ): Promise<{ processed: number; succeeded: number }> {
    let processed = 0;
    let succeeded = 0;

    for (const record of records) {
      try {
        await processor(record);
        processed++;
        succeeded++;
      } catch (err: any) {
        processed++;
        const batchError: BatchError = {
          rowNumber: record.rowNumber,
          errorCode: 'PROCESSING_ERROR',
          message: err?.message ?? 'Unknown error during processing',
        };
        errors.push(batchError);

        if (!this.config.continueOnError) {
          break;
        }
      }
    }

    return { processed, succeeded };
  }

  private validateRecords(
    records: BatchRecord[],
    validator: BatchRecordValidator,
  ): BatchError[] {
    const errors: BatchError[] = [];
    for (const record of records) {
      const recordErrors = validator(record);
      if (recordErrors.length > 0) {
        errors.push(...recordErrors);
      }
    }
    return errors;
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
