import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RemediationService } from './remediation.service';
import { DATABASE_TOKEN } from '../../database/database.module';

jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('test-uuid') }));

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

describe('RemediationService', () => {
  let service: RemediationService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemediationService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<RemediationService>(RemediationService);
  });

  describe('createCAP', () => {
    it('should create a corrective action plan', async () => {
      const dto = {
        engagementId: 'eng-1',
        findingId: 'find-1',
        title: 'Fix controls',
        classification: 'material_weakness',
        responsibleOfficial: 'official-1',
        targetCompletionDate: '2026-06-01',
        milestones: [{ title: 'Step 1', targetDate: '2026-03-01' }],
      };

      const result = await service.createCAP(dto as any);
      expect(result.id).toBe('test-uuid');
      expect(result.status).toBe('draft');
      expect(result.milestones).toHaveLength(1);
      expect(result.statusHistory).toHaveLength(1);
    });
  });

  describe('findByEngagement', () => {
    it('should return CAPs for an engagement', async () => {
      await service.createCAP({
        engagementId: 'eng-1',
        findingId: 'f1',
        title: 'CAP 1',
        classification: 'material_weakness',
        responsibleOfficial: 'off-1',
        targetCompletionDate: '2026-06-01',
        milestones: [],
      } as any);

      const result = await service.findByEngagement('eng-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return a CAP by id', async () => {
      const created = await service.createCAP({
        engagementId: 'eng-1',
        findingId: 'f1',
        title: 'CAP 1',
        classification: 'material_weakness',
        responsibleOfficial: 'off-1',
        targetCompletionDate: '2026-06-01',
        milestones: [],
      } as any);

      const result = await service.findOne(created.id);
      expect(result.title).toBe('CAP 1');
    });

    it('should throw NotFoundException when CAP not found', async () => {
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('should update CAP status', async () => {
      const created = await service.createCAP({
        engagementId: 'eng-1',
        findingId: 'f1',
        title: 'CAP 1',
        classification: 'material_weakness',
        responsibleOfficial: 'off-1',
        targetCompletionDate: '2026-06-01',
        milestones: [],
      } as any);

      const result = await service.updateStatus({
        capId: created.id,
        status: 'active',
        comment: 'Starting work',
      } as any);

      expect(result.status).toBe('active');
      expect(result.statusHistory).toHaveLength(2);
    });
  });

  describe('completeMilestone', () => {
    it('should complete a milestone', async () => {
      const { v4 } = require('uuid');
      (v4 as jest.Mock)
        .mockReturnValueOnce('cap-id')     // CAP id
        .mockReturnValueOnce('mile-id');    // milestone id

      const created = await service.createCAP({
        engagementId: 'eng-1',
        findingId: 'f1',
        title: 'CAP 1',
        classification: 'material_weakness',
        responsibleOfficial: 'off-1',
        targetCompletionDate: '2026-06-01',
        milestones: [{ title: 'Step 1', targetDate: '2026-03-01' }],
      } as any);

      const milestoneId = created.milestones[0].id;
      const result = await service.completeMilestone({
        capId: created.id,
        milestoneId,
        completedDate: '2026-03-01',
        evidenceDescription: 'Evidence provided',
      } as any);

      const milestone = result.milestones.find((m: any) => m.id === milestoneId);
      expect(milestone.status).toBe('completed');
    });

    it('should throw NotFoundException for non-existent milestone', async () => {
      const created = await service.createCAP({
        engagementId: 'eng-1',
        findingId: 'f1',
        title: 'CAP 1',
        classification: 'material_weakness',
        responsibleOfficial: 'off-1',
        targetCompletionDate: '2026-06-01',
        milestones: [],
      } as any);

      await expect(
        service.completeMilestone({
          capId: created.id,
          milestoneId: 'missing',
          completedDate: '2026-03-01',
          evidenceDescription: 'Test',
        } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getFIARStatus', () => {
    it('should return FIAR status report', async () => {
      const result = await service.getFIARStatus({
        engagementId: 'eng-1',
        fiscalYear: 2025,
      } as any);

      expect(result.engagementId).toBe('eng-1');
      expect(result.summary.totalCAPs).toBe(0);
      expect(result.authority).toBe('NDAA Section 1003, DoD FIAR Guidance');
    });
  });

  describe('getRemediationDashboard', () => {
    it('should return remediation dashboard', async () => {
      const result = await service.getRemediationDashboard('eng-1');
      expect(result.engagementId).toBe('eng-1');
      expect(result.total).toBe(0);
    });
  });
});
