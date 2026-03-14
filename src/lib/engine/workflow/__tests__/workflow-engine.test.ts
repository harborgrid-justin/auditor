import { describe, it, expect } from 'vitest';
import {
  WorkflowEngine,
  type WorkflowDefinition,
  type WorkflowInstance,
  type WorkflowStepInstance,
  type WorkflowEntityType,
} from '../workflow-engine';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeWorkflowDefinition(overrides?: Partial<WorkflowDefinition>): WorkflowDefinition {
  return {
    id: 'wf-def-001',
    name: 'Disbursement Approval',
    entityType: 'disbursement',
    steps: [
      {
        stepIndex: 0,
        requiredRole: 'budget_analyst',
        description: 'Budget analyst review',
        escalateAfterHours: 24,
      },
      {
        stepIndex: 1,
        requiredRole: 'certifying_officer',
        description: 'Certifying officer approval',
        escalateAfterHours: 48,
      },
      {
        stepIndex: 2,
        requiredRole: 'disbursing_officer',
        description: 'Disbursing officer final approval',
        escalateAfterHours: 72,
      },
    ],
    escalationRules: [],
    slaHours: 120,
    ...overrides,
  };
}

function makeSingleStepDefinition(overrides?: Partial<WorkflowDefinition>): WorkflowDefinition {
  return {
    id: 'wf-def-single',
    name: 'Simple Approval',
    entityType: 'obligation',
    steps: [
      {
        stepIndex: 0,
        requiredRole: 'approver',
        description: 'Single approval step',
        escalateAfterHours: 24,
      },
    ],
    escalationRules: [],
    slaHours: 48,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkflowEngine', () => {
  const engine = new WorkflowEngine();

  // =========================================================================
  // startWorkflow
  // =========================================================================

  describe('startWorkflow', () => {
    it('creates instance with correct steps from definition', () => {
      const definition = makeWorkflowDefinition();

      const instance = engine.startWorkflow(
        definition,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      expect(instance.id).toBeDefined();
      expect(instance.definitionId).toBe('wf-def-001');
      expect(instance.entityType).toBe('disbursement');
      expect(instance.entityId).toBe('entity-001');
      expect(instance.engagementId).toBe('eng-001');
      expect(instance.status).toBe('pending');
      expect(instance.currentStepIndex).toBe(0);
      expect(instance.steps).toHaveLength(3);
      expect(instance.completedAt).toBeNull();
      expect(instance.startedAt).toBeDefined();
    });

    it('creates step instances with due dates based on escalateAfterHours', () => {
      const definition = makeWorkflowDefinition();

      const instance = engine.startWorkflow(
        definition,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      for (const step of instance.steps) {
        expect(step.id).toBeDefined();
        expect(step.status).toBe('pending');
        expect(step.decision).toBeNull();
        expect(step.assignedTo).toBeNull();
        expect(step.dueDate).toBeDefined();
      }
    });

    it('sets all steps to pending status initially', () => {
      const definition = makeWorkflowDefinition();

      const instance = engine.startWorkflow(
        definition,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      expect(instance.steps.every(s => s.status === 'pending')).toBe(true);
    });

    it('auto-approves first step when entityAmount is below autoApproveBelow', () => {
      const definition = makeWorkflowDefinition({
        steps: [
          {
            stepIndex: 0,
            requiredRole: 'budget_analyst',
            description: 'Budget analyst review',
            autoApproveBelow: 10_000,
            escalateAfterHours: 24,
          },
          {
            stepIndex: 1,
            requiredRole: 'certifying_officer',
            description: 'Certifying officer approval',
            escalateAfterHours: 48,
          },
        ],
      });

      const instance = engine.startWorkflow(
        definition,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
        5_000, // below 10k threshold
      );

      // First step should be auto-approved
      expect(instance.steps[0].status).toBe('approved');
      expect(instance.steps[0].decision).toBe('approve');
      expect(instance.steps[0].assignedTo).toBe('SYSTEM_AUTO_APPROVE');
      // Should advance to next step
      expect(instance.currentStepIndex).toBe(1);
    });

    it('does not auto-approve when entityAmount exceeds autoApproveBelow', () => {
      const definition = makeWorkflowDefinition({
        steps: [
          {
            stepIndex: 0,
            requiredRole: 'budget_analyst',
            description: 'Budget analyst review',
            autoApproveBelow: 10_000,
            escalateAfterHours: 24,
          },
          {
            stepIndex: 1,
            requiredRole: 'certifying_officer',
            description: 'Certifying officer approval',
            escalateAfterHours: 48,
          },
        ],
      });

      const instance = engine.startWorkflow(
        definition,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
        15_000, // above 10k threshold
      );

      expect(instance.steps[0].status).toBe('pending');
      expect(instance.currentStepIndex).toBe(0);
    });
  });

  // =========================================================================
  // processStep — approve
  // =========================================================================

  describe('processStep with approve', () => {
    it('advances to next step on approval', () => {
      const definition = makeWorkflowDefinition();
      const instance = engine.startWorkflow(
        definition,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );
      const firstStepId = instance.steps[0].id;

      const updated = engine.processStep(
        instance,
        firstStepId,
        'approve',
        'actor-001',
        'Looks good',
      );

      expect(updated.steps[0].status).toBe('approved');
      expect(updated.steps[0].decision).toBe('approve');
      expect(updated.steps[0].assignedTo).toBe('actor-001');
      expect(updated.steps[0].comment).toBe('Looks good');
      expect(updated.steps[0].decidedAt).toBeDefined();
      expect(updated.currentStepIndex).toBe(1);
      expect(updated.status).toBe('pending');
    });

    it('completes workflow when all steps are approved', () => {
      const definition = makeWorkflowDefinition();
      let instance = engine.startWorkflow(
        definition,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      // Approve step 0
      instance = engine.processStep(
        instance,
        instance.steps[0].id,
        'approve',
        'actor-001',
        null,
      );

      // Approve step 1
      instance = engine.processStep(
        instance,
        instance.steps[1].id,
        'approve',
        'actor-002',
        null,
      );

      // Approve step 2
      instance = engine.processStep(
        instance,
        instance.steps[2].id,
        'approve',
        'actor-003',
        null,
      );

      expect(instance.status).toBe('approved');
      expect(instance.completedAt).toBeDefined();
    });

    it('completes single-step workflow on approval', () => {
      const definition = makeSingleStepDefinition();
      let instance = engine.startWorkflow(
        definition,
        'obligation',
        'entity-001',
        'eng-001',
        'user-001',
      );

      instance = engine.processStep(
        instance,
        instance.steps[0].id,
        'approve',
        'actor-001',
        'Approved',
      );

      expect(instance.status).toBe('approved');
      expect(instance.completedAt).toBeDefined();
    });
  });

  // =========================================================================
  // processStep — reject
  // =========================================================================

  describe('processStep with reject', () => {
    it('terminates workflow on rejection', () => {
      const definition = makeWorkflowDefinition();
      const instance = engine.startWorkflow(
        definition,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );
      const firstStepId = instance.steps[0].id;

      const updated = engine.processStep(
        instance,
        firstStepId,
        'reject',
        'actor-001',
        'Insufficient documentation',
      );

      expect(updated.status).toBe('rejected');
      expect(updated.completedAt).toBeDefined();
      expect(updated.steps[0].status).toBe('rejected');
      expect(updated.steps[0].decision).toBe('reject');
      expect(updated.steps[0].comment).toBe('Insufficient documentation');
    });

    it('does not advance to next step on rejection', () => {
      const definition = makeWorkflowDefinition();
      const instance = engine.startWorkflow(
        definition,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      const updated = engine.processStep(
        instance,
        instance.steps[0].id,
        'reject',
        'actor-001',
        'Rejected',
      );

      // Steps 1 and 2 remain pending (not processed)
      expect(updated.steps[1].status).toBe('pending');
      expect(updated.steps[2].status).toBe('pending');
      // currentStepIndex stays at 0 (the rejected step)
      expect(updated.currentStepIndex).toBe(0);
    });
  });

  // =========================================================================
  // processStep — error cases
  // =========================================================================

  describe('processStep error handling', () => {
    it('throws when step ID is not found', () => {
      const definition = makeWorkflowDefinition();
      const instance = engine.startWorkflow(
        definition,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      expect(() =>
        engine.processStep(instance, 'nonexistent-step', 'approve', 'actor-001', null),
      ).toThrow('not found');
    });

    it('throws when step is not in pending status', () => {
      const definition = makeWorkflowDefinition();
      let instance = engine.startWorkflow(
        definition,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      // Approve step 0
      instance = engine.processStep(
        instance,
        instance.steps[0].id,
        'approve',
        'actor-001',
        null,
      );

      // Try to process step 0 again
      expect(() =>
        engine.processStep(instance, instance.steps[0].id, 'approve', 'actor-002', null),
      ).toThrow('not in pending status');
    });

    it('throws when processing a step that is not the current step', () => {
      const definition = makeWorkflowDefinition();
      const instance = engine.startWorkflow(
        definition,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      // Try to approve step 1 when current step is 0
      expect(() =>
        engine.processStep(instance, instance.steps[1].id, 'approve', 'actor-001', null),
      ).toThrow('not the current step');
    });

    it('enforces segregation of duties for consecutive step approvals', () => {
      const definition = makeWorkflowDefinition();
      let instance = engine.startWorkflow(
        definition,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      // Approve step 0 as actor-001
      instance = engine.processStep(
        instance,
        instance.steps[0].id,
        'approve',
        'actor-001',
        null,
      );

      // Try to approve step 1 as the same actor
      expect(() =>
        engine.processStep(instance, instance.steps[1].id, 'approve', 'actor-001', null),
      ).toThrow('Segregation of duties');
    });
  });

  // =========================================================================
  // checkSLABreaches
  // =========================================================================

  describe('checkSLABreaches', () => {
    it('identifies overdue steps', () => {
      const pastDueDate = new Date(Date.now() - 48 * 3600000).toISOString(); // 48 hours ago

      const instance: WorkflowInstance = {
        id: 'wf-001',
        definitionId: 'wf-def-001',
        entityType: 'disbursement',
        entityId: 'entity-001',
        engagementId: 'eng-001',
        currentStepIndex: 0,
        status: 'pending',
        startedAt: new Date(Date.now() - 72 * 3600000).toISOString(),
        completedAt: null,
        steps: [
          {
            id: 'step-001',
            stepIndex: 0,
            requiredRole: 'budget_analyst',
            assignedTo: 'user-001',
            status: 'pending',
            decision: null,
            comment: null,
            decidedAt: null,
            dueDate: pastDueDate,
          },
        ],
      };

      const breaches = engine.checkSLABreaches([instance]);

      expect(breaches).toHaveLength(1);
      expect(breaches[0].instanceId).toBe('wf-001');
      expect(breaches[0].stepId).toBe('step-001');
      expect(breaches[0].requiredRole).toBe('budget_analyst');
      expect(breaches[0].assignedTo).toBe('user-001');
      expect(breaches[0].hoursOverdue).toBeGreaterThan(0);
    });

    it('returns empty array when no steps are overdue', () => {
      const futureDueDate = new Date(Date.now() + 48 * 3600000).toISOString();

      const instance: WorkflowInstance = {
        id: 'wf-001',
        definitionId: 'wf-def-001',
        entityType: 'disbursement',
        entityId: 'entity-001',
        engagementId: 'eng-001',
        currentStepIndex: 0,
        status: 'pending',
        startedAt: new Date().toISOString(),
        completedAt: null,
        steps: [
          {
            id: 'step-001',
            stepIndex: 0,
            requiredRole: 'budget_analyst',
            assignedTo: null,
            status: 'pending',
            decision: null,
            comment: null,
            decidedAt: null,
            dueDate: futureDueDate,
          },
        ],
      };

      const breaches = engine.checkSLABreaches([instance]);

      expect(breaches).toHaveLength(0);
    });

    it('skips non-pending workflow instances', () => {
      const pastDueDate = new Date(Date.now() - 48 * 3600000).toISOString();

      const instance: WorkflowInstance = {
        id: 'wf-001',
        definitionId: 'wf-def-001',
        entityType: 'disbursement',
        entityId: 'entity-001',
        engagementId: 'eng-001',
        currentStepIndex: 0,
        status: 'approved', // not pending
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        steps: [
          {
            id: 'step-001',
            stepIndex: 0,
            requiredRole: 'budget_analyst',
            assignedTo: null,
            status: 'pending',
            decision: null,
            comment: null,
            decidedAt: null,
            dueDate: pastDueDate,
          },
        ],
      };

      const breaches = engine.checkSLABreaches([instance]);

      expect(breaches).toHaveLength(0);
    });

    it('sorts breaches by hours overdue descending', () => {
      const makeOverdueInstance = (
        id: string,
        stepId: string,
        hoursAgo: number,
      ): WorkflowInstance => ({
        id,
        definitionId: 'wf-def-001',
        entityType: 'disbursement',
        entityId: 'entity-001',
        engagementId: 'eng-001',
        currentStepIndex: 0,
        status: 'pending',
        startedAt: new Date().toISOString(),
        completedAt: null,
        steps: [
          {
            id: stepId,
            stepIndex: 0,
            requiredRole: 'budget_analyst',
            assignedTo: null,
            status: 'pending',
            decision: null,
            comment: null,
            decidedAt: null,
            dueDate: new Date(Date.now() - hoursAgo * 3600000).toISOString(),
          },
        ],
      });

      const instances = [
        makeOverdueInstance('wf-1', 'step-1', 10),
        makeOverdueInstance('wf-2', 'step-2', 100),
        makeOverdueInstance('wf-3', 'step-3', 50),
      ];

      const breaches = engine.checkSLABreaches(instances);

      expect(breaches).toHaveLength(3);
      expect(breaches[0].instanceId).toBe('wf-2'); // most overdue
      expect(breaches[1].instanceId).toBe('wf-3');
      expect(breaches[2].instanceId).toBe('wf-1'); // least overdue
    });
  });

  // =========================================================================
  // escalateStep
  // =========================================================================

  describe('escalateStep', () => {
    it('sets step and workflow status to escalated', () => {
      const definition = makeWorkflowDefinition();
      const instance = engine.startWorkflow(
        definition,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      const updated = engine.escalateStep(
        instance,
        instance.steps[0].id,
        'SLA breach — 48 hours overdue',
      );

      expect(updated.status).toBe('escalated');
      expect(updated.steps[0].status).toBe('escalated');
      expect(updated.steps[0].comment).toContain('Escalated');
      expect(updated.steps[0].comment).toContain('SLA breach');
    });

    it('throws when step is not pending', () => {
      const definition = makeWorkflowDefinition();
      let instance = engine.startWorkflow(
        definition,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      instance = engine.processStep(
        instance,
        instance.steps[0].id,
        'approve',
        'actor-001',
        null,
      );

      expect(() =>
        engine.escalateStep(instance, instance.steps[0].id, 'Reason'),
      ).toThrow('cannot be escalated');
    });
  });

  // =========================================================================
  // getStatus
  // =========================================================================

  describe('getStatus', () => {
    it('returns correct completion percentage', () => {
      const definition = makeWorkflowDefinition();
      let instance = engine.startWorkflow(
        definition,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      const initialStatus = engine.getStatus(instance);
      expect(initialStatus.percentComplete).toBe(0);
      expect(initialStatus.totalSteps).toBe(3);
      expect(initialStatus.completedSteps).toBe(0);

      // Approve first step
      instance = engine.processStep(
        instance,
        instance.steps[0].id,
        'approve',
        'actor-001',
        null,
      );

      const afterFirstApproval = engine.getStatus(instance);
      expect(afterFirstApproval.percentComplete).toBe(33);
      expect(afterFirstApproval.completedSteps).toBe(1);
    });
  });
});
