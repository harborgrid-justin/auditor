import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { BatchService } from './batch.service';
import { DATABASE_TOKEN } from '../../database/database.module';
import { BatchType } from './batch.dto';

jest.mock('@shared/lib/db/pg-schema', () => ({
  batchExecutions: { id: 'id', engagementId: 'engagementId' },
}), { virtual: true });

jest.mock('@shared/lib/engine/batch/batch-processor', () => {
  return {
    BatchProcessor: jest.fn().mockImplementation(() => ({
      processBatch: jest.fn().mockResolvedValue({
        batchId: 'batch-1',
        status: 'completed',
        totalRecords: 2,
        processedRecords: 2,
        successfulRecords: 2,
        failedRecords: 0,
        errors: [],
        startedAt: '2025-01-01T00:00:00Z',
        completedAt: '2025-01-01T00:00:01Z',
        durationMs: 1000,
        dryRun: false,
        summary: {},
      }),
    })),
  };
}, { virtual: true });

jest.mock('@shared/lib/engine/batch/batch-validators', () => ({
  validateObligationImport: jest.fn().mockReturnValue([]),
  validateDisbursementImport: jest.fn().mockReturnValue([]),
  validateJournalEntryImport: jest.fn().mockReturnValue([]),
}), { virtual: true });

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

function createMockDb() {
  const mockWhere = jest.fn().mockResolvedValue([]);
  const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = jest.fn().mockReturnValue({ from: mockFrom });
  const mockSet = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
  const mockUpdate = jest.fn().mockReturnValue({ set: mockSet });
  const mockValues = jest.fn().mockResolvedValue(undefined);
  const mockInsert = jest.fn().mockReturnValue({ values: mockValues });

  return { select: mockSelect, from: mockFrom, where: mockWhere, insert: mockInsert, values: mockValues, update: mockUpdate, set: mockSet };
}

describe('BatchService', () => {
  let service: BatchService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<BatchService>(BatchService);
  });

  describe('startBatch', () => {
    it('should start a batch operation', async () => {
      const dto = {
        engagementId: 'eng-1',
        batchType: BatchType.OBLIGATION_IMPORT,
        fiscalYear: 2025,
        data: [{ amount: 1000 }, { amount: 2000 }],
      };

      const result = await service.startBatch(dto as any);
      expect(result.status).toBe('completed');
      expect(result.totalRecords).toBe(2);
    });
  });

  describe('getBatchStatus', () => {
    it('should throw NotFoundException for unknown batch', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(service.getBatchStatus('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getBatchErrors', () => {
    it('should return errors for a batch', async () => {
      // Start a batch to populate in-memory store
      await service.startBatch({
        engagementId: 'eng-1',
        batchType: BatchType.OBLIGATION_IMPORT,
        fiscalYear: 2025,
        data: [{ amount: 1000 }],
      } as any);

      // getBatchErrors calls getBatchStatus which checks the in-memory store
      // Since the batch was started with a mocked uuid, use that
      const status = await service.getBatchStatus('test-uuid');
      const result = await service.getBatchErrors('test-uuid');
      expect(result.batchId).toBe('test-uuid');
      expect(result.errors).toBeDefined();
    });
  });

  describe('cancelBatch', () => {
    it('should throw NotFoundException for unknown batch', async () => {
      await expect(
        service.cancelBatch({ batchId: 'missing', reason: 'test' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getBatchHistory', () => {
    it('should return batch history for engagement from in-memory store', async () => {
      // DB query throws/returns empty, falls through to in-memory
      mockDb.where.mockResolvedValueOnce([]);

      const result = await service.getBatchHistory('eng-1');
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
