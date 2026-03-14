/**
 * Enterprise Workflow Engine
 *
 * Manages multi-step approval workflows for DoD financial management
 * operations. Integrates with the approval_chains and approval_steps
 * tables defined in pg-schema.ts.
 *
 * Supports:
 * - Threshold-based auto-approval
 * - SLA tracking and breach detection
 * - Step escalation and reassignment
 * - Segregation of duties enforcement
 *
 * Authority: DoD FMR 7000.14-R, OMB Circular A-123
 */

import { v4 as uuid } from 'uuid';

// ── Type Definitions ──

export type WorkflowStatus = 'pending' | 'approved' | 'rejected' | 'escalated' | 'expired';
export type StepDecision = 'approve' | 'reject';
export type WorkflowEntityType =
  | 'disbursement'
  | 'ada_violation'
  | 'reprogramming'
  | 'debt_writeoff'
  | 'report'
  | 'obligation'
  | 'journal_entry'
  | 'year_end_closing'
  | 'reimbursable_agreement';

export interface EscalationRule {
  /** Hours after which a pending step should trigger escalation */
  afterHours: number;
  /** Role to escalate to */
  escalateTo: string;
  /** Whether to notify the original assignee */
  notifyOriginal: boolean;
}

export interface WorkflowStepDef {
  /** Zero-based index within the definition */
  stepIndex: number;
  /** Role required to act on this step */
  requiredRole: string;
  /** Human-readable description of what this step entails */
  description: string;
  /** If set, amounts below this threshold are auto-approved at this step */
  autoApproveBelow?: number;
  /** Hours after which the step should be escalated if still pending */
  escalateAfterHours: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  /** The entity type this workflow applies to */
  entityType: WorkflowEntityType;
  /** Ordered list of approval steps */
  steps: WorkflowStepDef[];
  /** Global escalation rules applied to all steps unless overridden */
  escalationRules: EscalationRule[];
  /** Default SLA hours for the entire workflow from start to completion */
  slaHours: number;
}

export interface WorkflowStepInstance {
  id: string;
  stepIndex: number;
  requiredRole: string;
  assignedTo: string | null;
  status: WorkflowStatus;
  decision: StepDecision | null;
  comment: string | null;
  decidedAt: string | null;
  dueDate: string | null;
}

export interface WorkflowInstance {
  id: string;
  definitionId: string;
  entityType: WorkflowEntityType;
  entityId: string;
  engagementId: string;
  currentStepIndex: number;
  status: WorkflowStatus;
  startedAt: string;
  completedAt: string | null;
  steps: WorkflowStepInstance[];
}

export interface SLABreach {
  instanceId: string;
  stepId: string;
  stepIndex: number;
  requiredRole: string;
  assignedTo: string | null;
  dueDate: string;
  hoursOverdue: number;
}

// ── Engine Implementation ──

export class WorkflowEngine {
  /**
   * Creates a new workflow instance from a definition.
   *
   * Each step defined in the WorkflowDefinition becomes a WorkflowStepInstance
   * with a calculated due date based on the step's escalateAfterHours value.
   * The first step is set to 'pending' while remaining steps are also 'pending'
   * but will not be actionable until prior steps complete.
   *
   * If the first step has an autoApproveBelow threshold and the entity amount
   * is provided and falls below that threshold, the step is auto-approved and
   * the workflow advances.
   */
  startWorkflow(
    definition: WorkflowDefinition,
    entityType: WorkflowEntityType,
    entityId: string,
    engagementId: string,
    initiatedBy: string,
    entityAmount?: number,
  ): WorkflowInstance {
    const now = new Date();
    const instanceId = uuid();

    const steps: WorkflowStepInstance[] = definition.steps.map((stepDef) => {
      const dueDate = new Date(now.getTime() + stepDef.escalateAfterHours * 3600000);
      return {
        id: uuid(),
        stepIndex: stepDef.stepIndex,
        requiredRole: stepDef.requiredRole,
        assignedTo: null,
        status: 'pending' as WorkflowStatus,
        decision: null,
        comment: null,
        decidedAt: null,
        dueDate: dueDate.toISOString(),
      };
    });

    let instance: WorkflowInstance = {
      id: instanceId,
      definitionId: definition.id,
      entityType,
      entityId,
      engagementId,
      currentStepIndex: 0,
      status: 'pending',
      startedAt: now.toISOString(),
      completedAt: null,
      steps,
    };

    // Check auto-approve on the first step
    if (entityAmount !== undefined && definition.steps.length > 0) {
      const firstStepDef = definition.steps[0];
      if (
        firstStepDef.autoApproveBelow !== undefined &&
        entityAmount < firstStepDef.autoApproveBelow
      ) {
        instance = this.autoApproveStep(instance, steps[0].id, definition, entityAmount);
      }
    }

    return instance;
  }

  /**
   * Processes a step decision (approve or reject).
   *
   * On approval: advances to the next step or completes the workflow if this
   * was the final step. Checks auto-approve thresholds on subsequent steps.
   *
   * On rejection: the workflow status is set to 'rejected' and completedAt
   * is recorded. No further steps are processed.
   *
   * Enforces segregation of duties: the same actor cannot approve consecutive
   * steps in the same workflow.
   */
  processStep(
    instance: WorkflowInstance,
    stepId: string,
    decision: StepDecision,
    actorId: string,
    comment: string | null,
    definition?: WorkflowDefinition,
    entityAmount?: number,
  ): WorkflowInstance {
    const stepIdx = instance.steps.findIndex((s) => s.id === stepId);
    if (stepIdx === -1) {
      throw new Error(`Step ${stepId} not found in workflow instance ${instance.id}`);
    }

    const step = instance.steps[stepIdx];

    if (step.status !== 'pending') {
      throw new Error(`Step ${stepId} is not in pending status (current: ${step.status})`);
    }

    if (step.stepIndex !== instance.currentStepIndex) {
      throw new Error(
        `Step ${stepId} (index ${step.stepIndex}) is not the current step (current index: ${instance.currentStepIndex})`,
      );
    }

    // Segregation of duties: check previous step was not approved by the same actor
    if (stepIdx > 0) {
      const previousStep = instance.steps[stepIdx - 1];
      if (previousStep.assignedTo === actorId && previousStep.decision === 'approve') {
        throw new Error(
          'Segregation of duties violation: the same actor cannot approve consecutive steps',
        );
      }
    }

    const now = new Date().toISOString();
    const updatedSteps = [...instance.steps];
    updatedSteps[stepIdx] = {
      ...step,
      status: decision === 'approve' ? 'approved' : 'rejected',
      decision,
      assignedTo: actorId,
      comment,
      decidedAt: now,
    };

    let updatedInstance: WorkflowInstance = {
      ...instance,
      steps: updatedSteps,
    };

    if (decision === 'reject') {
      updatedInstance = {
        ...updatedInstance,
        status: 'rejected',
        completedAt: now,
      };
    } else {
      updatedInstance = this.advanceToNextStep(updatedInstance, definition, entityAmount);
    }

    return updatedInstance;
  }

  /**
   * Escalates a pending step to a higher authority.
   *
   * Sets the step status to 'escalated' and the overall workflow status
   * to 'escalated'. The reason is recorded in the step comment.
   */
  escalateStep(
    instance: WorkflowInstance,
    stepId: string,
    reason: string,
  ): WorkflowInstance {
    const stepIdx = instance.steps.findIndex((s) => s.id === stepId);
    if (stepIdx === -1) {
      throw new Error(`Step ${stepId} not found in workflow instance ${instance.id}`);
    }

    const step = instance.steps[stepIdx];
    if (step.status !== 'pending') {
      throw new Error(`Step ${stepId} cannot be escalated (current status: ${step.status})`);
    }

    const now = new Date().toISOString();
    const updatedSteps = [...instance.steps];
    updatedSteps[stepIdx] = {
      ...step,
      status: 'escalated',
      comment: `Escalated: ${reason}`,
      decidedAt: now,
    };

    return {
      ...instance,
      steps: updatedSteps,
      status: 'escalated',
    };
  }

  /**
   * Reassigns a pending step to a different user.
   *
   * The step must still be in 'pending' status. The due date is recalculated
   * from the current time to give the new assignee a full window.
   */
  reassignStep(
    instance: WorkflowInstance,
    stepId: string,
    newAssignee: string,
    escalateAfterHours?: number,
  ): WorkflowInstance {
    const stepIdx = instance.steps.findIndex((s) => s.id === stepId);
    if (stepIdx === -1) {
      throw new Error(`Step ${stepId} not found in workflow instance ${instance.id}`);
    }

    const step = instance.steps[stepIdx];
    if (step.status !== 'pending') {
      throw new Error(`Step ${stepId} cannot be reassigned (current status: ${step.status})`);
    }

    const updatedSteps = [...instance.steps];
    const now = new Date();
    const newDueDate = escalateAfterHours
      ? new Date(now.getTime() + escalateAfterHours * 3600000)
      : step.dueDate;

    updatedSteps[stepIdx] = {
      ...step,
      assignedTo: newAssignee,
      dueDate: typeof newDueDate === 'string' ? newDueDate : newDueDate!.toISOString(),
    };

    return {
      ...instance,
      steps: updatedSteps,
    };
  }

  /**
   * Returns the current status of a workflow instance including
   * completion percentage and the current active step details.
   */
  getStatus(instance: WorkflowInstance): {
    instanceId: string;
    status: WorkflowStatus;
    currentStepIndex: number;
    totalSteps: number;
    completedSteps: number;
    percentComplete: number;
    startedAt: string;
    completedAt: string | null;
    currentStep: WorkflowStepInstance | null;
    steps: WorkflowStepInstance[];
  } {
    const completedSteps = instance.steps.filter(
      (s) => s.status === 'approved' || s.status === 'rejected',
    ).length;

    const currentStep =
      instance.steps.find((s) => s.stepIndex === instance.currentStepIndex && s.status === 'pending') ?? null;

    return {
      instanceId: instance.id,
      status: instance.status,
      currentStepIndex: instance.currentStepIndex,
      totalSteps: instance.steps.length,
      completedSteps,
      percentComplete:
        instance.steps.length > 0
          ? Math.round((completedSteps / instance.steps.length) * 100)
          : 0,
      startedAt: instance.startedAt,
      completedAt: instance.completedAt,
      currentStep,
      steps: instance.steps,
    };
  }

  /**
   * Scans a list of workflow instances for steps that have exceeded their
   * SLA due dates. Returns a list of breaches with overdue duration.
   */
  checkSLABreaches(instances: WorkflowInstance[]): SLABreach[] {
    const now = new Date();
    const breaches: SLABreach[] = [];

    for (const instance of instances) {
      if (instance.status !== 'pending') continue;

      for (const step of instance.steps) {
        if (step.status !== 'pending' || !step.dueDate) continue;

        const dueDate = new Date(step.dueDate);
        if (now > dueDate) {
          const hoursOverdue = Math.round(
            (now.getTime() - dueDate.getTime()) / 3600000 * 100,
          ) / 100;

          breaches.push({
            instanceId: instance.id,
            stepId: step.id,
            stepIndex: step.stepIndex,
            requiredRole: step.requiredRole,
            assignedTo: step.assignedTo,
            dueDate: step.dueDate,
            hoursOverdue,
          });
        }
      }
    }

    return breaches.sort((a, b) => b.hoursOverdue - a.hoursOverdue);
  }

  // ── Private Helpers ──

  /**
   * Advances the workflow to the next step after a successful approval.
   * If the current step was the last one, marks the workflow as approved
   * and records the completion time.
   */
  private advanceToNextStep(
    instance: WorkflowInstance,
    definition?: WorkflowDefinition,
    entityAmount?: number,
  ): WorkflowInstance {
    const nextStepIndex = instance.currentStepIndex + 1;

    if (nextStepIndex >= instance.steps.length) {
      // All steps completed — workflow is approved
      return {
        ...instance,
        currentStepIndex: nextStepIndex,
        status: 'approved',
        completedAt: new Date().toISOString(),
      };
    }

    let updatedInstance: WorkflowInstance = {
      ...instance,
      currentStepIndex: nextStepIndex,
    };

    // Check auto-approve on the next step
    if (definition && entityAmount !== undefined) {
      const nextStepDef = definition.steps.find((s) => s.stepIndex === nextStepIndex);
      if (
        nextStepDef?.autoApproveBelow !== undefined &&
        entityAmount < nextStepDef.autoApproveBelow
      ) {
        updatedInstance = this.autoApproveStep(
          updatedInstance,
          updatedInstance.steps[nextStepIndex].id,
          definition,
          entityAmount,
        );
      }
    }

    return updatedInstance;
  }

  /**
   * Auto-approves a step when the entity amount falls below the step's
   * autoApproveBelow threshold. Records the decision as system-generated.
   */
  private autoApproveStep(
    instance: WorkflowInstance,
    stepId: string,
    definition: WorkflowDefinition,
    entityAmount: number,
  ): WorkflowInstance {
    const stepIdx = instance.steps.findIndex((s) => s.id === stepId);
    if (stepIdx === -1) return instance;

    const step = instance.steps[stepIdx];
    const now = new Date().toISOString();

    const updatedSteps = [...instance.steps];
    updatedSteps[stepIdx] = {
      ...step,
      status: 'approved',
      decision: 'approve',
      assignedTo: 'SYSTEM_AUTO_APPROVE',
      comment: `Auto-approved: amount $${entityAmount.toLocaleString()} below threshold`,
      decidedAt: now,
    };

    const updatedInstance: WorkflowInstance = {
      ...instance,
      steps: updatedSteps,
    };

    return this.advanceToNextStep(updatedInstance, definition, entityAmount);
  }
}
