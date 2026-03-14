import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { DATABASE_TOKEN } from '../../database/database.module';

const mockWorkflowInstance = {
  id: 'wf-1',
  definitionId: 'obligation_approval',
  entityType: 'obligation',
  entityId: 'obl-1',
  engagementId: 'eng-1',
  currentStepIndex: 0,
  status: 'pending',
  startedAt: '2025-01-01T00:00:00Z',
  completedAt: null,
  steps: [
    {
      id: 'step-1',
      stepIndex: 0,
      requiredRole: 'certifying_officer',
      assignedTo: null,
      status: 'pending',
      decision: null,
      comment: null,
      decidedAt: null,
      dueDate: null,
    },
  ],
};

jest.mock('@shared/lib/db/pg-schema', () => ({
  approvalChains: { id: 'id', engagementId: 'engagementId', entityType: 'entityType' },
  approvalSteps: { id: 'id', chainId: 'chainId' },
}), { virtual: true });

jest.mock('@shared/lib/engine/workflow/workflow-engine', () => ({
  WorkflowEngine: jest.fn().mockImplementation(() => ({
    startWorkflow: jest.fn().mockReturnValue(mockWorkflowInstance),
    processStep: jest.fn().mockReturnValue({ ...mockWorkflowInstance, status: 'approved' }),
    reassignStep: jest.fn().mockReturnValue(mockWorkflowInstance),
    escalateStep: jest.fn().mockReturnValue(mockWorkflowInstance),
    getStatus: jest.fn().mockReturnValue({ ...mockWorkflowInstance, progress: 50 }),
    checkSLABreaches: jest.fn().mockReturnValue([]),
  })),
}), { virtual: true });

jest.mock('@shared/lib/engine/workflow/workflow-templates', () => ({
  WORKFLOW_TEMPLATES: [
    {
      id: 'obligation_approval',
      name: 'Obligation Approval',
      entityType: 'obligation',
      slaHours: 48,
      steps: [
        {
          stepIndex: 0,
          requiredRole: 'certifying_officer',
          description: 'Certifying officer review',
          escalateAfterHours: 24,
        },
      ],
    },
  ],
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

describe('WorkflowsService', () => {
  let service: WorkflowsService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowsService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<WorkflowsService>(WorkflowsService);
  });

  describe('startWorkflow', () => {
    it('should start a workflow from a template', async () => {
      const result = await service.startWorkflow(
        {
          templateName: 'obligation_approval',
          entityType: 'obligation',
          entityId: 'obl-1',
          engagementId: 'eng-1',
        } as any,
        'user-1',
      );

      expect(result.id).toBe('wf-1');
      expect(result.status).toBe('pending');
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should throw NotFoundException for unknown template', async () => {
      await expect(
        service.startWorkflow(
          { templateName: 'nonexistent', entityType: 'x', entityId: 'x', engagementId: 'x' } as any,
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getWorkflowStatus', () => {
    it('should return workflow status', async () => {
      // Start a workflow first to populate the in-memory cache
      await service.startWorkflow(
        {
          templateName: 'obligation_approval',
          entityType: 'obligation',
          entityId: 'obl-1',
          engagementId: 'eng-1',
        } as any,
        'user-1',
      );

      const result = await service.getWorkflowStatus('wf-1');
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException for unknown workflow', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(service.getWorkflowStatus('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTemplates', () => {
    it('should return available templates', () => {
      const templates = service.getTemplates();
      expect(templates).toHaveLength(1);
      expect(templates[0].id).toBe('obligation_approval');
    });
  });

  describe('getWorkflowsForEngagement', () => {
    it('should return workflows for an engagement', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await service.getWorkflowsForEngagement('eng-1');
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('checkOverdueSLAs', () => {
    it('should check overdue SLAs', async () => {
      mockDb.where.mockResolvedValueOnce([]);

      const result = await service.checkOverdueSLAs('eng-1');
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
