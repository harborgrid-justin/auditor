import { describe, it, expect } from 'vitest';
import {
  WorkflowEngine,
  type WorkflowDefinition,
  type WorkflowInstance,
  type WorkflowStepInstance,
} from '../workflow-engine';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeWorkflowDefinition(
  overrides?: Partial<WorkflowDefinition>,
): WorkflowDefinition {
  return {
    id: 'wf-def-001',
    name: 'Disbursement Approval',
    entityType: 'disbursement',
    steps: [
      {
        stepIndex: 0,
        requiredRole: 'certifying_officer',
        description: 'Initial certification',
        escalateAfterHours: 24,
      },
      {
        stepIndex: 1,
        requiredRole: 'approving_official',
        description: 'Management approval',
        escalateAfterHours: 48,
      },
      {
        stepIndex: 2,
        requiredRole: 'disbursing_officer',
        description: 'Final disbursement authorization',
        escalateAfterHours: 24,
      },
    ],
    escalationRules: [],
    slaHours: 72,
    ...overrides,
  };
}

function makeSingleStepDefinition(
  overrides?: Partial<WorkflowDefinition>,
): WorkflowDefinition {
  return {
    id: 'wf-def-single',
    name: 'Simple Approval',
    entityType: 'obligation',
    steps: [
      {
        stepIndex: 0,
        requiredRole: 'approving_official',
        description: 'Sole approval step',
        escalateAfterHours: 24,
      },
    ],
    escalationRules: [],
    slaHours: 24,
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
    it('creates instance with correct steps', () => {
      const def = makeWorkflowDefinition();

      const instance = engine.startWorkflow(
        def,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      expect(instance.definitionId).toBe('wf-def-001');
      expect(instance.entityType).toBe('disbursement');
      expect(instance.entityId).toBe('entity-001');
      expect(instance.engagementId).toBe('eng-001');
      expect(instance.status).toBe('pending');
      expect(instance.currentStepIndex).toBe(0);
      expect(instance.completedAt).toBeNull();
      expect(instance.steps).toHaveLength(3);

      // All steps should be pending initially
      for (const step of instance.steps) {
        expect(step.status).toBe('pending');
        expect(step.decision).toBeNull();
        expect(step.assignedTo).toBeNull();
        expect(step.decidedAt).toBeNull();
        expect(step.dueDate).toBeTruthy();
      }

      // Steps should have correct roles
      expect(instance.steps[0].requiredRole).toBe('certifying_officer');
      expect(instance.steps[1].requiredRole).toBe('approving_official');
      expect(instance.steps[2].requiredRole).toBe('disbursing_officer');
    });

    it('auto-approves first step when amount is below threshold', () => {
      const def = makeWorkflowDefinition({
        steps: [
          {
            stepIndex: 0,
            requiredRole: 'certifying_officer',
            description: 'Initial certification',
            autoApproveBelow: 5000,
            escalateAfterHours: 24,
          },
          {
            stepIndex: 1,
            requiredRole: 'approving_official',
            description: 'Management approval',
            escalateAfterHours: 48,
          },
        ],
      });

      const instance = engine.startWorkflow(
        def,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
        1000, // below 5000 threshold
      );

      // First step should be auto-approved
      expect(instance.steps[0].status).toBe('approved');
      expect(instance.steps[0].decision).toBe('approve');
      expect(instance.steps[0].assignedTo).toBe('SYSTEM_AUTO_APPROVE');

      // Workflow should advance to next step
      expect(instance.currentStepIndex).toBe(1);
    });

    it('does not auto-approve when amount exceeds threshold', () => {
      const def = makeWorkflowDefinition({
        steps: [
          {
            stepIndex: 0,
            requiredRole: 'certifying_officer',
            description: 'Initial certification',
            autoApproveBelow: 5000,
            escalateAfterHours: 24,
          },
          {
            stepIndex: 1,
            requiredRole: 'approving_official',
            description: 'Management approval',
            escalateAfterHours: 48,
          },
        ],
      });

      const instance = engine.startWorkflow(
        def,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
        10_000, // above 5000 threshold
      );

      expect(instance.steps[0].status).toBe('pending');
      expect(instance.currentStepIndex).toBe(0);
    });

    it('sets due dates based on escalateAfterHours', () => {
      const def = makeWorkflowDefinition();

      const instance = engine.startWorkflow(
        def,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      // Due dates should be set for all steps
      for (const step of instance.steps) {
        expect(step.dueDate).toBeTruthy();
        const dueDate = new Date(step.dueDate!);
        expect(dueDate.getTime()).toBeGreaterThan(Date.now() - 60_000); // within last minute
      }
    });
  });

  // =========================================================================
  // processStep — approve
  // =========================================================================

  describe('processStep with approve', () => {
    it('advances to next step on approval', () => {
      const def = makeWorkflowDefinition();
      const instance = engine.startWorkflow(
        def,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      const stepId = instance.steps[0].id;
      const updated = engine.processStep(
        instance,
        stepId,
        'approve',
        'actor-001',
        'Looks good',
      );

      expect(updated.currentStepIndex).toBe(1);
      expect(updated.status).toBe('pending'); // workflow still in progress
      expect(updated.steps[0].status).toBe('approved');
      expect(updated.steps[0].decision).toBe('approve');
      expect(updated.steps[0].assignedTo).toBe('actor-001');
      expect(updated.steps[0].comment).toBe('Looks good');
      expect(updated.steps[0].decidedAt).toBeTruthy();
    });

    it('completes workflow when all steps approved', () => {
      const def = makeWorkflowDefinition();
      let instance = engine.startWorkflow(
        def,
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
      expect(instance.currentStepIndex).toBe(1);

      // Approve step 1
      instance = engine.processStep(
        instance,
        instance.steps[1].id,
        'approve',
        'actor-002',
        null,
      );
      expect(instance.currentStepIndex).toBe(2);

      // Approve step 2 (final)
      instance = engine.processStep(
        instance,
        instance.steps[2].id,
        'approve',
        'actor-003',
        null,
      );

      expect(instance.status).toBe('approved');
      expect(instance.completedAt).toBeTruthy();
      expect(instance.steps.every(s => s.status === 'approved')).toBe(true);
    });

    it('completes single-step workflow on approval', () => {
      const def = makeSingleStepDefinition();
      const instance = engine.startWorkflow(
        def,
        'obligation',
        'entity-001',
        'eng-001',
        'user-001',
      );

      const updated = engine.processStep(
        instance,
        instance.steps[0].id,
        'approve',
        'actor-001',
        'Approved',
      );

      expect(updated.status).toBe('approved');
      expect(updated.completedAt).toBeTruthy();
    });
  });

  // =========================================================================
  // processStep — reject
  // =========================================================================

  describe('processStep with reject', () => {
    it('terminates workflow on rejection', () => {
      const def = makeWorkflowDefinition();
      const instance = engine.startWorkflow(
        def,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      const stepId = instance.steps[0].id;
      const updated = engine.processStep(
        instance,
        stepId,
        'reject',
        'actor-001',
        'Insufficient documentation',
      );

      expect(updated.status).toBe('rejected');
      expect(updated.completedAt).toBeTruthy();
      expect(updated.steps[0].status).toBe('rejected');
      expect(updated.steps[0].decision).toBe('reject');
      expect(updated.steps[0].comment).toBe('Insufficient documentation');
    });

    it('terminates workflow when rejected at a later step', () => {
      const def = makeWorkflowDefinition();
      let instance = engine.startWorkflow(
        def,
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

      // Reject step 1
      instance = engine.processStep(
        instance,
        instance.steps[1].id,
        'reject',
        'actor-002',
        'Budget exceeded',
      );

      expect(instance.status).toBe('rejected');
      expect(instance.completedAt).toBeTruthy();
      expect(instance.steps[0].status).toBe('approved');
      expect(instance.steps[1].status).toBe('rejected');
      expect(instance.steps[2].status).toBe('pending'); // never reached
    });
  });

  // =========================================================================
  // processStep — error cases
  // =========================================================================

  describe('processStep error handling', () => {
    it('throws when step ID is not found', () => {
      const def = makeWorkflowDefinition();
      const instance = engine.startWorkflow(
        def,
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
      const def = makeWorkflowDefinition();
      let instance = engine.startWorkflow(
        def,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      const stepId = instance.steps[0].id;
      instance = engine.processStep(instance, stepId, 'approve', 'actor-001', null);

      // Try to process the same step again
      expect(() =>
        engine.processStep(instance, stepId, 'approve', 'actor-002', null),
      ).toThrow('not in pending status');
    });

    it('throws when attempting to process a step out of order', () => {
      const def = makeWorkflowDefinition();
      const instance = engine.startWorkflow(
        def,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      // Try to approve step 1 while step 0 is current
      expect(() =>
        engine.processStep(instance, instance.steps[1].id, 'approve', 'actor-001', null),
      ).toThrow('not the current step');
    });

    it('throws segregation of duties violation when same actor approves consecutive steps', () => {
      const def = makeWorkflowDefinition();
      let instance = engine.startWorkflow(
        def,
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

      // Try to approve step 1 as the same actor-001
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
      const pastDue = new Date(Date.now() - 48 * 3600000).toISOString(); // 48 hours ago

      const instance: WorkflowInstance = {
        id: 'inst-001',
        definitionId: 'wf-def-001',
        entityType: 'disbursement',
        entityId: 'entity-001',
        engagementId: 'eng-001',
        currentStepIndex: 0,
        status: 'pending',
        startedAt: pastDue,
        completedAt: null,
        steps: [
          {
            id: 'step-001',
            stepIndex: 0,
            requiredRole: 'certifying_officer',
            assignedTo: 'user-001',
            status: 'pending',
            decision: null,
            comment: null,
            decidedAt: null,
            dueDate: pastDue, // already past
          },
        ],
      };

      const breaches = engine.checkSLABreaches([instance]);

      expect(breaches).toHaveLength(1);
      expect(breaches[0].instanceId).toBe('inst-001');
      expect(breaches[0].stepId).toBe('step-001');
      expect(breaches[0].requiredRole).toBe('certifying_officer');
      expect(breaches[0].assignedTo).toBe('user-001');
      expect(breaches[0].hoursOverdue).toBeGreaterThan(0);
    });

    it('returns empty array when no breaches exist', () => {
      const futureDue = new Date(Date.now() + 48 * 3600000).toISOString();

      const instance: WorkflowInstance = {
        id: 'inst-001',
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
            requiredRole: 'certifying_officer',
            assignedTo: null,
            status: 'pending',
            decision: null,
            comment: null,
            decidedAt: null,
            dueDate: futureDue,
          },
        ],
      };

      const breaches = engine.checkSLABreaches([instance]);
      expect(breaches).toHaveLength(0);
    });

    it('ignores completed workflow instances', () => {
      const pastDue = new Date(Date.now() - 48 * 3600000).toISOString();

      const instance: WorkflowInstance = {
        id: 'inst-001',
        definitionId: 'wf-def-001',
        entityType: 'disbursement',
        entityId: 'entity-001',
        engagementId: 'eng-001',
        currentStepIndex: 1,
        status: 'approved', // completed workflow
        startedAt: pastDue,
        completedAt: new Date().toISOString(),
        steps: [
          {
            id: 'step-001',
            stepIndex: 0,
            requiredRole: 'certifying_officer',
            assignedTo: 'user-001',
            status: 'approved',
            decision: 'approve',
            comment: null,
            decidedAt: pastDue,
            dueDate: pastDue,
          },
        ],
      };

      const breaches = engine.checkSLABreaches([instance]);
      expect(breaches).toHaveLength(0);
    });

    it('sorts breaches by hoursOverdue descending', () => {
      const earlyPastDue = new Date(Date.now() - 96 * 3600000).toISOString(); // 96 hours ago
      const recentPastDue = new Date(Date.now() - 12 * 3600000).toISOString(); // 12 hours ago

      const instances: WorkflowInstance[] = [
        {
          id: 'inst-001',
          definitionId: 'wf-def-001',
          entityType: 'disbursement',
          entityId: 'entity-001',
          engagementId: 'eng-001',
          currentStepIndex: 0,
          status: 'pending',
          startedAt: earlyPastDue,
          completedAt: null,
          steps: [
            {
              id: 'step-recent',
              stepIndex: 0,
              requiredRole: 'officer_a',
              assignedTo: null,
              status: 'pending',
              decision: null,
              comment: null,
              decidedAt: null,
              dueDate: recentPastDue,
            },
          ],
        },
        {
          id: 'inst-002',
          definitionId: 'wf-def-001',
          entityType: 'disbursement',
          entityId: 'entity-002',
          engagementId: 'eng-002',
          currentStepIndex: 0,
          status: 'pending',
          startedAt: earlyPastDue,
          completedAt: null,
          steps: [
            {
              id: 'step-old',
              stepIndex: 0,
              requiredRole: 'officer_b',
              assignedTo: null,
              status: 'pending',
              decision: null,
              comment: null,
              decidedAt: null,
              dueDate: earlyPastDue,
            },
          ],
        },
      ];

      const breaches = engine.checkSLABreaches(instances);

      expect(breaches).toHaveLength(2);
      expect(breaches[0].hoursOverdue).toBeGreaterThan(breaches[1].hoursOverdue);
      expect(breaches[0].stepId).toBe('step-old');
      expect(breaches[1].stepId).toBe('step-recent');
    });
  });

  // =========================================================================
  // escalateStep
  // =========================================================================

  describe('escalateStep', () => {
    it('sets step and workflow status to escalated', () => {
      const def = makeWorkflowDefinition();
      const instance = engine.startWorkflow(
        def,
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

    it('throws when escalating a non-pending step', () => {
      const def = makeWorkflowDefinition();
      let instance = engine.startWorkflow(
        def,
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
        engine.escalateStep(instance, instance.steps[0].id, 'Too late'),
      ).toThrow('cannot be escalated');
    });
  });

  // =========================================================================
  // getStatus
  // =========================================================================

  describe('getStatus', () => {
    it('returns correct completion percentage', () => {
      const def = makeWorkflowDefinition();
      let instance = engine.startWorkflow(
        def,
        'disbursement',
        'entity-001',
        'eng-001',
        'user-001',
      );

      let status = engine.getStatus(instance);
      expect(status.totalSteps).toBe(3);
      expect(status.completedSteps).toBe(0);
      expect(status.percentComplete).toBe(0);

      // Approve first step
      instance = engine.processStep(
        instance,
        instance.steps[0].id,
        'approve',
        'actor-001',
        null,
      );

      status = engine.getStatus(instance);
      expect(status.completedSteps).toBe(1);
      expect(status.percentComplete).toBe(33); // 1/3 rounded
    });
  });
});
