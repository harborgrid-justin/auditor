import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EvidenceService } from './evidence.service';
import { DATABASE_TOKEN } from '../../database/database.module';

jest.mock('@shared/lib/db/pg-schema', () => ({
  engagements: { id: 'id' },
  findings: { engagementId: 'engagementId' },
  auditLogs: { engagementId: 'engagementId' },
}), { virtual: true });

jest.mock('drizzle-orm', () => ({
  eq: jest.fn().mockReturnValue('eq-condition'),
}), { virtual: true });

jest.mock('@shared/lib/reports/evidence-package', () => ({
  EvidencePackageGenerator: jest.fn().mockImplementation(() => ({
    generatePackage: jest.fn().mockResolvedValue({
      id: 'pkg-1',
      engagementId: 'eng-1',
      fiscalYear: 2025,
      status: 'completed',
      classification: 'unclassified',
      metadata: { totalSections: 3, totalItems: 10 },
      generatedAt: '2025-01-01T00:00:00Z',
      expiresAt: '2025-07-01T00:00:00Z',
    }),
  })),
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

describe('EvidenceService', () => {
  let service: EvidenceService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvidenceService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<EvidenceService>(EvidenceService);
  });

  describe('generatePackage', () => {
    it('should generate an evidence package', async () => {
      const engagement = { id: 'eng-1', name: 'Test Engagement', entityName: 'Test Entity' };
      const findings = [{ id: 'f1', engagementId: 'eng-1' }];
      const logs = [{ id: 'l1', engagementId: 'eng-1' }];

      mockDb.where
        .mockResolvedValueOnce([engagement])
        .mockResolvedValueOnce(findings)
        .mockResolvedValueOnce(logs);

      const result = await service.generatePackage(
        { engagementId: 'eng-1', fiscalYear: 2025 } as any,
        'user-1',
      );

      expect(result.packageId).toBe('pkg-1');
      expect(result.status).toBe('completed');
      expect(result.totalSections).toBe(3);
    });

    it('should throw NotFoundException when engagement not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      await expect(
        service.generatePackage({ engagementId: 'missing', fiscalYear: 2025 } as any, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPackage', () => {
    it('should throw NotFoundException for unknown package', async () => {
      await expect(service.getPackage('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listPackages', () => {
    it('should return empty list when no packages exist', async () => {
      const result = await service.listPackages('eng-1');
      expect(result.packages).toEqual([]);
    });
  });
});
