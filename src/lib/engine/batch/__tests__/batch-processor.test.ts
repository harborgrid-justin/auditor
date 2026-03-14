import { describe, it, expect } from 'vitest';
import {
  BatchProcessor,
  type BatchRecord,
  type BatchRecordValidator,
  type BatchRecordProcessor,
  type BatchError,
} from '../batch-processor';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeRecords(count: number): BatchRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    rowNumber: i + 1,
    data: { amount: (i + 1) * 100, description: `Record ${i + 1}` },
  }));
}

/** Validator that always passes */
const validValidator: BatchRecordValidator = () => [];

/** Validator that rejects records with amount > 500 */
const thresholdValidator: BatchRecordValidator = (record) => {
  const errors: BatchError[] = [];
  if (record.data.amount > 500) {
    errors.push({
      rowNumber: record.rowNumber,
      field: 'amount',
      errorCode: 'AMOUNT_TOO_HIGH',
      message: `Amount ${record.data.amount} exceeds maximum of 500`,
    });
  }
  return errors;
};

/** Processor that always succeeds */
const successProcessor: BatchRecordProcessor = async () => {
  // no-op
};

/** Processor that throws on even row numbers */
const partialFailProcessor: BatchRecordProcessor = async (record) => {
  if (record.rowNumber % 2 === 0) {
    throw new Error(`Processing failed for row ${record.rowNumber}`);
  }
};

/** Processor that always throws */
const failProcessor: BatchRecordProcessor = async (record) => {
  throw new Error(`Fatal error on row ${record.rowNumber}`);
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BatchProcessor', () => {
  // =========================================================================
  // processBatch — all valid records
  // =========================================================================

  describe('processBatch with valid records', () => {
    it('processes all records successfully', async () => {
      const processor = new BatchProcessor({ continueOnError: true });
      const records = makeRecords(5);

      const result = await processor.processBatch(
        'batch-001',
        records,
        validValidator,
        successProcessor,
      );

      expect(result.batchId).toBe('batch-001');
      expect(result.status).toBe('completed');
      expect(result.totalRecords).toBe(5);
      expect(result.processedRecords).toBe(5);
      expect(result.successfulRecords).toBe(5);
      expect(result.failedRecords).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.completedAt).toBeTruthy();
      expect(result.durationMs).toBeDefined();
      expect(result.dryRun).toBe(false);
    });

    it('records success rate in summary', async () => {
      const processor = new BatchProcessor();
      const records = makeRecords(10);

      const result = await processor.processBatch(
        'batch-002',
        records,
        validValidator,
        successProcessor,
      );

      expect(result.summary.successRate).toBe(100);
    });
  });

  // =========================================================================
  // processBatch — continueOnError
  // =========================================================================

  describe('processBatch with continueOnError=true', () => {
    it('isolates failures and continues processing remaining records', async () => {
      const processor = new BatchProcessor({ continueOnError: true });
      const records = makeRecords(6);

      const result = await processor.processBatch(
        'batch-003',
        records,
        validValidator,
        partialFailProcessor, // fails on even rows: 2, 4, 6
      );

      expect(result.status).toBe('completed');
      expect(result.totalRecords).toBe(6);
      expect(result.processedRecords).toBe(6);
      expect(result.successfulRecords).toBe(3); // rows 1, 3, 5
      expect(result.failedRecords).toBe(3); // rows 2, 4, 6
      expect(result.errors).toHaveLength(3);

      // Check that errors reference the correct rows
      const errorRows = result.errors.map(e => e.rowNumber);
      expect(errorRows).toContain(2);
      expect(errorRows).toContain(4);
      expect(errorRows).toContain(6);
    });

    it('continues past validation errors when continueOnError is true', async () => {
      const processor = new BatchProcessor({ continueOnError: true });
      const records = makeRecords(8); // records 6,7,8 have amounts 600,700,800

      const result = await processor.processBatch(
        'batch-004',
        records,
        thresholdValidator, // rejects amount > 500 (rows 6,7,8)
        successProcessor,
      );

      expect(result.status).toBe('completed');
      expect(result.totalRecords).toBe(8);
      // 5 valid records processed, 3 failed validation
      expect(result.successfulRecords).toBe(5);
      expect(result.failedRecords).toBe(3);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('processBatch with continueOnError=false', () => {
    it('stops immediately on validation failure', async () => {
      const processor = new BatchProcessor({ continueOnError: false });
      const records = makeRecords(8);

      const result = await processor.processBatch(
        'batch-005',
        records,
        thresholdValidator, // rejects rows 6,7,8
        successProcessor,
      );

      expect(result.status).toBe('failed');
      expect(result.processedRecords).toBe(0); // never reached processing
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // processBatch — dryRun
  // =========================================================================

  describe('processBatch with dryRun=true', () => {
    it('validates without committing (no records processed)', async () => {
      const processor = new BatchProcessor({ dryRun: true });
      const records = makeRecords(5);

      const result = await processor.processBatch(
        'batch-006',
        records,
        validValidator,
        successProcessor,
      );

      expect(result.status).toBe('completed');
      expect(result.dryRun).toBe(true);
      expect(result.processedRecords).toBe(0);
      expect(result.successfulRecords).toBe(0);
      expect(result.summary.dryRun).toBe(true);
      expect(result.summary.validRecords).toBe(5);
      expect(result.summary.invalidRecords).toBe(0);
      expect(result.completedAt).toBeTruthy();
    });

    it('reports validation errors in dry run without processing', async () => {
      const processor = new BatchProcessor({ dryRun: true });
      const records = makeRecords(8);

      const result = await processor.processBatch(
        'batch-007',
        records,
        thresholdValidator,
        successProcessor,
      );

      expect(result.status).toBe('completed');
      expect(result.dryRun).toBe(true);
      expect(result.processedRecords).toBe(0);
      expect(result.summary.validRecords).toBe(5); // rows 1-5
      expect(result.summary.invalidRecords).toBe(3); // rows 6-8
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  // =========================================================================
  // Batch progress tracking
  // =========================================================================

  describe('batch progress tracking', () => {
    it('tracks totalRecords, processedRecords, successfulRecords, failedRecords', async () => {
      const processor = new BatchProcessor({ continueOnError: true });
      const records = makeRecords(10);

      const result = await processor.processBatch(
        'batch-008',
        records,
        validValidator,
        partialFailProcessor, // fails on even rows (2,4,6,8,10)
      );

      expect(result.totalRecords).toBe(10);
      expect(result.processedRecords).toBe(10);
      expect(result.successfulRecords).toBe(5);
      expect(result.failedRecords).toBe(5);
    });

    it('records duration in milliseconds', async () => {
      const processor = new BatchProcessor();
      const records = makeRecords(3);

      const result = await processor.processBatch(
        'batch-009',
        records,
        validValidator,
        successProcessor,
      );

      expect(result.durationMs).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('handles empty batch gracefully', async () => {
      const processor = new BatchProcessor();
      const records: BatchRecord[] = [];

      const result = await processor.processBatch(
        'batch-010',
        records,
        validValidator,
        successProcessor,
      );

      expect(result.status).toBe('completed');
      expect(result.totalRecords).toBe(0);
      expect(result.processedRecords).toBe(0);
      expect(result.successfulRecords).toBe(0);
      expect(result.failedRecords).toBe(0);
    });
  });

  // =========================================================================
  // Chunk processing
  // =========================================================================

  describe('chunk processing', () => {
    it('respects chunkSize configuration', async () => {
      const processor = new BatchProcessor({ chunkSize: 3 });
      const records = makeRecords(9);

      const result = await processor.processBatch(
        'batch-011',
        records,
        validValidator,
        successProcessor,
      );

      expect(result.status).toBe('completed');
      expect(result.totalRecords).toBe(9);
      expect(result.processedRecords).toBe(9);
      expect(result.successfulRecords).toBe(9);
    });
  });
});
