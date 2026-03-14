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

/** Validator that passes all records */
const passAllValidator: BatchRecordValidator = () => [];

/** Validator that fails records where amount > 500 */
const amountCapValidator: BatchRecordValidator = (record) => {
  if (record.data.amount > 500) {
    return [
      {
        rowNumber: record.rowNumber,
        errorCode: 'AMOUNT_TOO_HIGH',
        message: `Amount ${record.data.amount} exceeds cap of 500`,
      },
    ];
  }
  return [];
};

/** Processor that succeeds for all records */
const successProcessor: BatchRecordProcessor = async () => {
  return { processed: true };
};

/** Processor that throws on odd row numbers */
const oddRowFailProcessor: BatchRecordProcessor = async (record) => {
  if (record.rowNumber % 2 !== 0) {
    throw new Error(`Processing failed for row ${record.rowNumber}`);
  }
  return { processed: true };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BatchProcessor', () => {
  // =========================================================================
  // processBatch with valid records
  // =========================================================================

  describe('processBatch with valid records', () => {
    it('processes all records successfully', async () => {
      const processor = new BatchProcessor({ chunkSize: 10 });
      const records = makeRecords(5);

      const result = await processor.processBatch(
        'batch-001',
        records,
        passAllValidator,
        successProcessor,
      );

      expect(result.batchId).toBe('batch-001');
      expect(result.status).toBe('completed');
      expect(result.totalRecords).toBe(5);
      expect(result.processedRecords).toBe(5);
      expect(result.successfulRecords).toBe(5);
      expect(result.failedRecords).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.completedAt).toBeDefined();
      expect(result.durationMs).toBeDefined();
    });

    it('tracks progress with totalRecords and processedRecords', async () => {
      const processor = new BatchProcessor({ chunkSize: 3 });
      const records = makeRecords(10);

      const result = await processor.processBatch(
        'batch-002',
        records,
        passAllValidator,
        successProcessor,
      );

      expect(result.totalRecords).toBe(10);
      expect(result.processedRecords).toBe(10);
      expect(result.successfulRecords).toBe(10);
      expect(result.summary.successRate).toBe(100);
    });

    it('returns completed status with correct duration', async () => {
      const processor = new BatchProcessor();
      const records = makeRecords(3);

      const result = await processor.processBatch(
        'batch-003',
        records,
        passAllValidator,
        successProcessor,
      );

      expect(result.status).toBe('completed');
      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // processBatch with continueOnError=true
  // =========================================================================

  describe('processBatch with continueOnError=true', () => {
    it('isolates validation failures and processes valid records', async () => {
      const processor = new BatchProcessor({ continueOnError: true, chunkSize: 10 });
      const records = makeRecords(10); // records 6-10 have amount > 500

      const result = await processor.processBatch(
        'batch-004',
        records,
        amountCapValidator,
        successProcessor,
      );

      expect(result.status).toBe('completed');
      // Records 1-5 are valid (amounts 100-500), records 6-10 are invalid (600-1000)
      expect(result.successfulRecords).toBe(5);
      expect(result.failedRecords).toBe(5);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('isolates processing failures and continues with remaining records', async () => {
      const processor = new BatchProcessor({ continueOnError: true, chunkSize: 10 });
      const records = makeRecords(4); // rows 1,2,3,4 — odd rows fail

      const result = await processor.processBatch(
        'batch-005',
        records,
        passAllValidator,
        oddRowFailProcessor,
      );

      expect(result.status).toBe('completed');
      expect(result.processedRecords).toBe(4);
      expect(result.successfulRecords).toBe(2); // rows 2 and 4
      expect(result.errors.length).toBe(2); // rows 1 and 3
    });

    it('reports both validation and processing errors', async () => {
      const processor = new BatchProcessor({ continueOnError: true, chunkSize: 10 });
      // Records with amounts: 100, 200, 300, 400, 500, 600, 700
      const records = makeRecords(7);

      // amountCapValidator fails rows 6,7 (amounts 600, 700)
      // oddRowFailProcessor fails rows 1,3,5 from the valid set (rows 1-5)
      const result = await processor.processBatch(
        'batch-006',
        records,
        amountCapValidator,
        oddRowFailProcessor,
      );

      expect(result.status).toBe('completed');
      // Validation errors for rows 6,7
      const validationErrors = result.errors.filter(e => e.errorCode === 'AMOUNT_TOO_HIGH');
      expect(validationErrors.length).toBe(2);
      // Processing errors for odd rows among valid records (1,3,5)
      const processingErrors = result.errors.filter(e => e.errorCode === 'PROCESSING_ERROR');
      expect(processingErrors.length).toBe(3);
    });
  });

  // =========================================================================
  // processBatch with continueOnError=false
  // =========================================================================

  describe('processBatch with continueOnError=false', () => {
    it('stops immediately on validation failure', async () => {
      const processor = new BatchProcessor({ continueOnError: false, chunkSize: 10 });
      const records = makeRecords(10); // records 6-10 fail validation

      const result = await processor.processBatch(
        'batch-007',
        records,
        amountCapValidator,
        successProcessor,
      );

      expect(result.status).toBe('failed');
      expect(result.processedRecords).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // processBatch with dryRun=true
  // =========================================================================

  describe('processBatch with dryRun=true', () => {
    it('validates without committing', async () => {
      let processorCalled = false;
      const trackingProcessor: BatchRecordProcessor = async () => {
        processorCalled = true;
      };

      const processor = new BatchProcessor({ dryRun: true, chunkSize: 10 });
      const records = makeRecords(5);

      const result = await processor.processBatch(
        'batch-008',
        records,
        passAllValidator,
        trackingProcessor,
      );

      expect(result.dryRun).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.processedRecords).toBe(0);
      expect(processorCalled).toBe(false);
      expect(result.summary.dryRun).toBe(true);
      expect(result.summary.validRecords).toBe(5);
    });

    it('reports validation errors in dry run mode', async () => {
      const processor = new BatchProcessor({ dryRun: true, continueOnError: true, chunkSize: 10 });
      const records = makeRecords(10);

      const result = await processor.processBatch(
        'batch-009',
        records,
        amountCapValidator,
        successProcessor,
      );

      expect(result.dryRun).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.summary.invalidRecords).toBe(5);
      expect(result.summary.validRecords).toBe(5);
      expect(result.errors.length).toBe(5);
    });
  });

  // =========================================================================
  // Batch progress tracking
  // =========================================================================

  describe('batch progress tracking', () => {
    it('tracks totalRecords, processedRecords, successfulRecords, and failedRecords', async () => {
      const processor = new BatchProcessor({ continueOnError: true, chunkSize: 5 });
      const records = makeRecords(8);

      const result = await processor.processBatch(
        'batch-010',
        records,
        passAllValidator,
        oddRowFailProcessor,
      );

      expect(result.totalRecords).toBe(8);
      expect(result.processedRecords).toBe(8);
      expect(result.successfulRecords).toBe(4); // even rows: 2,4,6,8
      expect(result.failedRecords).toBe(4); // odd rows: 1,3,5,7
    });

    it('calculates success rate in summary', async () => {
      const processor = new BatchProcessor({ continueOnError: true, chunkSize: 10 });
      const records = makeRecords(4);

      const result = await processor.processBatch(
        'batch-011',
        records,
        passAllValidator,
        oddRowFailProcessor,
      );

      // 2 out of 4 succeed = 50%
      expect(result.summary.successRate).toBe(50);
    });

    it('handles empty batch', async () => {
      const processor = new BatchProcessor();
      const records: BatchRecord[] = [];

      const result = await processor.processBatch(
        'batch-012',
        records,
        passAllValidator,
        successProcessor,
      );

      expect(result.totalRecords).toBe(0);
      expect(result.processedRecords).toBe(0);
      expect(result.successfulRecords).toBe(0);
      expect(result.failedRecords).toBe(0);
      expect(result.status).toBe('completed');
    });
  });
});
