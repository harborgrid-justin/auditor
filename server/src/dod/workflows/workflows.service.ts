import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN, AppDatabase } from '../../database/database.module';
import {
  WorkflowEngine,
  type WorkflowInstance,
  type WorkflowEntityType,
} from '@shared/lib/engine/workflow/workflow-engine';
import { WORKFLOW_TEMPLATES } from '@shared/lib/engine/workflow/workflow-templates';
import type {
  StartWorkflowDto,
  ProcessStepDto,
  ReassignStepDto,
  EscalateStepDto,
} from './workflows.dto';

@Injectable()
export class WorkflowsService {
  private readonly engine = new WorkflowEngine();

  /**
   * In-memory store for workflow instances. In a production deployment this
   * would be backed by the approval_chains / approval_steps tables via
   * Drizzle, but the in-memory approach keeps the implementation portable
   * and mirrors the pattern used elsewhere in the codebase.
   */
  private readonly instances = new Map<string, WorkflowInstance>();

  constructor(@Inject(DATABASE_TOKEN) private readonly db: AppDatabase) {}

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Starts a new workflow from a named template. Persists the resulting
   * approval chain and steps to the database and keeps a local copy for
   * fast engine operations.
   */
  async startWorkflow(dto: StartWorkflowDto, initiatedBy: string): Promise<WorkflowInstance> {
    const template = WORKFLOW_TEMPLATES.find(
      (t) => t.id === dto.templateName || t.name === dto.templateName,
    );
    if (!template) {
      throw new NotFoundException(
        `Workflow template "${dto.templateName}" not found. ` +
          `Available: ${WORKFLOW_TEMPLATES.map((t) => t.id).join(', ')}`,
      );
    }

    const instance = this.engine.startWorkflow(
      template,
      dto.entityType as WorkflowEntityType,
      dto.entityId,
      dto.engagementId,
      initiatedBy,
    );

    // Persist to approval_chains / approval_steps tables
    await this.persistInstance(instance, initiatedBy);
    this.instances.set(instance.id, instance);

    return instance;
  }

  /**
   * Processes an approve/reject decision on a workflow step.
   * Enforces segregation of duties via the engine.
   */
  async processStep(dto: ProcessStepDto, actorId: string): Promise<WorkflowInstance> {
    const instance = await this.loadInstance(dto.instanceId);

    const template = WORKFLOW_TEMPLATES.find((t) => t.id === instance.definitionId);

    const updated = this.engine.processStep(
      instance,
      dto.stepId,
      dto.decision,
      actorId,
      dto.comment ?? null,
      template,
    );

    await this.syncInstanceToDb(updated);
    this.instances.set(updated.id, updated);

    return updated;
  }

  /**
   * Reassigns a pending step to a different user.
   */
  async reassignStep(dto: ReassignStepDto): Promise<WorkflowInstance> {
    const instance = await this.loadInstance(dto.instanceId);

    const template = WORKFLOW_TEMPLATES.find((t) => t.id === instance.definitionId);
    const stepDef = template?.steps.find(
      (s) => s.stepIndex === instance.steps.find((si) => si.id === dto.stepId)?.stepIndex,
    );

    const updated = this.engine.reassignStep(
      instance,
      dto.stepId,
      dto.newAssigneeId,
      stepDef?.escalateAfterHours,
    );

    await this.syncInstanceToDb(updated);
    this.instances.set(updated.id, updated);

    return updated;
  }

  /**
   * Escalates a pending step with a stated reason.
   */
  async escalateStep(dto: EscalateStepDto): Promise<WorkflowInstance> {
    const instance = await this.loadInstance(dto.instanceId);

    const updated = this.engine.escalateStep(instance, dto.stepId, dto.reason);

    await this.syncInstanceToDb(updated);
    this.instances.set(updated.id, updated);

    return updated;
  }

  /**
   * Returns the enriched status of a single workflow instance.
   */
  async getWorkflowStatus(instanceId: string) {
    const instance = await this.loadInstance(instanceId);
    return this.engine.getStatus(instance);
  }

  /**
   * Lists all workflow instances for a given engagement.
   */
  async getWorkflowsForEngagement(engagementId: string): Promise<WorkflowInstance[]> {
    const { approvalChains, approvalSteps } = await import('@shared/lib/db/pg-schema');

    const chains = await this.db
      .select()
      .from(approvalChains)
      .where(eq(approvalChains.engagementId, engagementId));

    const results: WorkflowInstance[] = [];

    for (const chain of chains) {
      // Check cache first
      if (this.instances.has(chain.id)) {
        results.push(this.instances.get(chain.id)!);
        continue;
      }

      const steps = await this.db
        .select()
        .from(approvalSteps)
        .where(eq(approvalSteps.chainId, chain.id));

      const instance: WorkflowInstance = {
        id: chain.id,
        definitionId: chain.entityType,
        entityType: chain.entityType as WorkflowEntityType,
        entityId: chain.entityId,
        engagementId: chain.engagementId,
        currentStepIndex: chain.currentStepIndex,
        status: chain.overallStatus,
        startedAt: chain.initiatedAt,
        completedAt: chain.completedAt ?? null,
        steps: steps.map((s: any) => ({
          id: s.id,
          stepIndex: s.stepIndex,
          requiredRole: s.requiredRole,
          assignedTo: s.assignedTo ?? null,
          status: s.status,
          decision: s.decision ?? null,
          comment: s.comment ?? null,
          decidedAt: s.decidedAt ?? null,
          dueDate: s.dueDate ?? null,
        })),
      };

      this.instances.set(instance.id, instance);
      results.push(instance);
    }

    return results;
  }

  /**
   * Returns all available workflow templates.
   */
  getTemplates() {
    return WORKFLOW_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      entityType: t.entityType,
      stepCount: t.steps.length,
      slaHours: t.slaHours,
      steps: t.steps.map((s) => ({
        stepIndex: s.stepIndex,
        requiredRole: s.requiredRole,
        description: s.description,
        autoApproveBelow: s.autoApproveBelow ?? null,
        escalateAfterHours: s.escalateAfterHours,
      })),
    }));
  }

  /**
   * Checks all active workflows in an engagement for SLA breaches.
   */
  async checkOverdueSLAs(engagementId: string) {
    const workflows = await this.getWorkflowsForEngagement(engagementId);
    const activeWorkflows = workflows.filter((w) => w.status === 'pending');
    return this.engine.checkSLABreaches(activeWorkflows);
  }

  // ── Persistence Helpers ─────────────────────────────────────────────

  /**
   * Loads a workflow instance from the in-memory cache, falling back to
   * the database if not cached.
   */
  private async loadInstance(instanceId: string): Promise<WorkflowInstance> {
    if (this.instances.has(instanceId)) {
      return this.instances.get(instanceId)!;
    }

    const { approvalChains, approvalSteps } = await import('@shared/lib/db/pg-schema');

    const chains = await this.db
      .select()
      .from(approvalChains)
      .where(eq(approvalChains.id, instanceId));

    if (chains.length === 0) {
      throw new NotFoundException(`Workflow instance ${instanceId} not found`);
    }

    const chain = chains[0];
    const steps = await this.db
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.chainId, instanceId));

    const instance: WorkflowInstance = {
      id: chain.id,
      definitionId: chain.entityType,
      entityType: chain.entityType as WorkflowEntityType,
      entityId: chain.entityId,
      engagementId: chain.engagementId,
      currentStepIndex: chain.currentStepIndex,
      status: chain.overallStatus,
      startedAt: chain.initiatedAt,
      completedAt: chain.completedAt ?? null,
      steps: steps.map((s: any) => ({
        id: s.id,
        stepIndex: s.stepIndex,
        requiredRole: s.requiredRole,
        assignedTo: s.assignedTo ?? null,
        status: s.status,
        decision: s.decision ?? null,
        comment: s.comment ?? null,
        decidedAt: s.decidedAt ?? null,
        dueDate: s.dueDate ?? null,
      })),
    };

    this.instances.set(instance.id, instance);
    return instance;
  }

  /**
   * Persists a newly created workflow instance to the approval_chains and
   * approval_steps tables.
   */
  private async persistInstance(instance: WorkflowInstance, initiatedBy: string): Promise<void> {
    const { approvalChains, approvalSteps } = await import('@shared/lib/db/pg-schema');

    await this.db.insert(approvalChains).values({
      id: instance.id,
      engagementId: instance.engagementId,
      entityType: instance.entityType,
      entityId: instance.entityId,
      currentStepIndex: instance.currentStepIndex,
      overallStatus: instance.status,
      initiatedBy,
      initiatedAt: instance.startedAt,
      completedAt: instance.completedAt,
    });

    for (const step of instance.steps) {
      await this.db.insert(approvalSteps).values({
        id: step.id,
        chainId: instance.id,
        stepIndex: step.stepIndex,
        requiredRole: step.requiredRole,
        assignedTo: step.assignedTo,
        status: step.status,
        decision: step.decision,
        comment: step.comment,
        decidedAt: step.decidedAt,
        dueDate: step.dueDate,
      });
    }
  }

  /**
   * Synchronises an updated workflow instance back to the database.
   * Updates the approval_chains row and each approval_steps row.
   */
  private async syncInstanceToDb(instance: WorkflowInstance): Promise<void> {
    const { approvalChains, approvalSteps } = await import('@shared/lib/db/pg-schema');

    await this.db
      .update(approvalChains)
      .set({
        currentStepIndex: instance.currentStepIndex,
        overallStatus: instance.status,
        completedAt: instance.completedAt,
      })
      .where(eq(approvalChains.id, instance.id));

    for (const step of instance.steps) {
      await this.db
        .update(approvalSteps)
        .set({
          assignedTo: step.assignedTo,
          status: step.status,
          decision: step.decision,
          comment: step.comment,
          decidedAt: step.decidedAt,
          dueDate: step.dueDate,
        })
        .where(eq(approvalSteps.id, step.id));
    }
  }
}
