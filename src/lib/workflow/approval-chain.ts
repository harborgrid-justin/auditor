/**
 * Multi-Level Approval Workflow Engine
 *
 * Implements configurable approval chains for DoD financial actions that
 * require multi-level authorization before execution.
 *
 * References:
 *   - DoD FMR Vol 5 Ch 2: Certifying and Disbursing Officer responsibilities
 *   - DoD FMR Vol 3 Ch 6: Reprogramming (congressional notification thresholds)
 *   - DoD FMR Vol 14 Ch 7: Debt write-off authority levels
 *   - 31 U.S.C. §1517: ADA violation reporting chain
 */

import type {
  ApprovalChain,
  ApprovalStep,
  ApprovalStatus,
  ApprovalEntityType,
} from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Predefined Approval Chain Templates
// ---------------------------------------------------------------------------

export interface ApprovalChainTemplate {
  entityType: ApprovalEntityType;
  name: string;
  description: string;
  steps: { requiredRole: string; dueDays: number }[];
  thresholdAmount?: number;
}

const APPROVAL_TEMPLATES: ApprovalChainTemplate[] = [
  {
    entityType: 'disbursement',
    name: 'Disbursement Dual Signature',
    description: 'Certifying officer certifies, disbursing officer approves (Vol 5 Ch 2)',
    steps: [
      { requiredRole: 'certifying_officer', dueDays: 2 },
      { requiredRole: 'disbursing_officer', dueDays: 1 },
    ],
  },
  {
    entityType: 'ada_violation',
    name: 'ADA Investigation Chain',
    description: 'Investigation → Component Head → IG per 31 U.S.C. §1351',
    steps: [
      { requiredRole: 'ada_investigator', dueDays: 5 },
      { requiredRole: 'component_head', dueDays: 3 },
      { requiredRole: 'inspector_general', dueDays: 5 },
    ],
  },
  {
    entityType: 'reprogramming',
    name: 'Reprogramming Below Threshold',
    description: 'Program Manager → Comptroller (below congressional threshold)',
    steps: [
      { requiredRole: 'program_manager', dueDays: 3 },
      { requiredRole: 'comptroller', dueDays: 5 },
    ],
  },
  {
    entityType: 'reprogramming',
    name: 'Reprogramming Above Threshold',
    description: 'Program Manager → Comptroller → Congressional notification (Vol 3 Ch 6)',
    thresholdAmount: 10_000_000,
    steps: [
      { requiredRole: 'program_manager', dueDays: 3 },
      { requiredRole: 'comptroller', dueDays: 5 },
      { requiredRole: 'congressional_liaison', dueDays: 15 },
    ],
  },
  {
    entityType: 'debt_writeoff',
    name: 'Debt Write-off Chain',
    description: 'Debt Manager → Legal Review → Approval Authority (Vol 14 Ch 7)',
    steps: [
      { requiredRole: 'debt_manager', dueDays: 5 },
      { requiredRole: 'legal_counsel', dueDays: 10 },
      { requiredRole: 'writeoff_authority', dueDays: 5 },
    ],
  },
  {
    entityType: 'report',
    name: 'Report Signoff Chain',
    description: 'Preparer → Reviewer → Authorizing Official',
    steps: [
      { requiredRole: 'report_preparer', dueDays: 3 },
      { requiredRole: 'report_reviewer', dueDays: 5 },
      { requiredRole: 'authorizing_official', dueDays: 3 },
    ],
  },
];

// ---------------------------------------------------------------------------
// In-Memory State (production: replace with DB via schema.ts tables)
// ---------------------------------------------------------------------------

const chains = new Map<string, ApprovalChain>();

let nextId = 1;
function generateId(): string {
  return `approval-${Date.now()}-${nextId++}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return available templates for an entity type.
 */
export function getApprovalTemplates(
  entityType?: ApprovalEntityType,
): ApprovalChainTemplate[] {
  if (!entityType) return APPROVAL_TEMPLATES;
  return APPROVAL_TEMPLATES.filter(t => t.entityType === entityType);
}

/**
 * Create and initiate a new approval chain from a template.
 */
export function createApprovalChain(params: {
  engagementId: string;
  entityType: ApprovalEntityType;
  entityId: string;
  initiatedBy: string;
  amount?: number;
}): ApprovalChain {
  // Pick the right template (threshold-aware for reprogramming)
  const candidates = APPROVAL_TEMPLATES.filter(
    t => t.entityType === params.entityType,
  );
  let template = candidates[0];
  if (params.amount !== undefined) {
    const thresholded = candidates.find(
      t => t.thresholdAmount !== undefined && params.amount! >= t.thresholdAmount,
    );
    if (thresholded) template = thresholded;
  }

  if (!template) {
    throw new Error(`No approval template for entity type: ${params.entityType}`);
  }

  const chainId = generateId();
  const now = new Date().toISOString();

  const steps: ApprovalStep[] = template.steps.map((s, idx) => {
    const due = new Date();
    due.setDate(due.getDate() + s.dueDays);
    return {
      id: `${chainId}-step-${idx}`,
      chainId,
      stepIndex: idx,
      requiredRole: s.requiredRole,
      status: idx === 0 ? 'pending' : ('pending' as ApprovalStatus),
      dueDate: due.toISOString(),
    };
  });

  const chain: ApprovalChain = {
    id: chainId,
    engagementId: params.engagementId,
    entityType: params.entityType,
    entityId: params.entityId,
    steps,
    currentStepIndex: 0,
    overallStatus: 'pending',
    initiatedBy: params.initiatedBy,
    initiatedAt: now,
  };

  chains.set(chainId, chain);
  return chain;
}

/**
 * Submit a decision (approve/reject) for the current step.
 */
export function submitDecision(params: {
  chainId: string;
  stepId: string;
  userId: string;
  decision: 'approve' | 'reject';
  comment?: string;
}): ApprovalChain {
  const chain = chains.get(params.chainId);
  if (!chain) throw new Error(`Approval chain not found: ${params.chainId}`);

  const currentStep = chain.steps[chain.currentStepIndex];
  if (!currentStep || currentStep.id !== params.stepId) {
    throw new Error(
      `Step ${params.stepId} is not the current active step for chain ${params.chainId}`,
    );
  }

  if (currentStep.status !== 'pending') {
    throw new Error(`Step ${params.stepId} already decided: ${currentStep.status}`);
  }

  // Record decision
  currentStep.assignedTo = params.userId;
  currentStep.decision = params.decision;
  currentStep.comment = params.comment;
  currentStep.decidedAt = new Date().toISOString();
  currentStep.status = params.decision === 'approve' ? 'approved' : 'rejected';

  if (params.decision === 'reject') {
    chain.overallStatus = 'rejected';
    chain.completedAt = new Date().toISOString();
  } else {
    // Advance to next step or complete chain
    if (chain.currentStepIndex < chain.steps.length - 1) {
      chain.currentStepIndex += 1;
    } else {
      chain.overallStatus = 'approved';
      chain.completedAt = new Date().toISOString();
    }
  }

  chains.set(chain.id, chain);
  return chain;
}

/**
 * Approve the current step (convenience wrapper).
 */
export function approveStep(
  chainId: string,
  stepId: string,
  userId: string,
  comment?: string,
): ApprovalChain {
  return submitDecision({ chainId, stepId, userId, decision: 'approve', comment });
}

/**
 * Reject the current step (convenience wrapper).
 */
export function rejectStep(
  chainId: string,
  stepId: string,
  userId: string,
  comment?: string,
): ApprovalChain {
  return submitDecision({ chainId, stepId, userId, decision: 'reject', comment });
}

/**
 * Get current approval status for a chain.
 */
export function getApprovalStatus(chainId: string): ApprovalChain | undefined {
  return chains.get(chainId);
}

/**
 * Find approval chains for a specific entity.
 */
export function findChainsForEntity(
  entityType: ApprovalEntityType,
  entityId: string,
): ApprovalChain[] {
  return Array.from(chains.values()).filter(
    c => c.entityType === entityType && c.entityId === entityId,
  );
}

/**
 * Find approval chains pending action from a specific role.
 */
export function findPendingByRole(role: string): ApprovalChain[] {
  return Array.from(chains.values()).filter(c => {
    if (c.overallStatus !== 'pending') return false;
    const currentStep = c.steps[c.currentStepIndex];
    return currentStep?.requiredRole === role && currentStep.status === 'pending';
  });
}

/**
 * Escalate overdue steps. Returns chains that were escalated.
 */
export function escalateOverdueSteps(): ApprovalChain[] {
  const now = new Date();
  const escalated: ApprovalChain[] = [];

  for (const chain of Array.from(chains.values())) {
    if (chain.overallStatus !== 'pending') continue;

    const currentStep = chain.steps[chain.currentStepIndex];
    if (
      currentStep?.status === 'pending' &&
      currentStep.dueDate &&
      new Date(currentStep.dueDate) < now
    ) {
      currentStep.status = 'escalated';
      chain.overallStatus = 'escalated';
      escalated.push(chain);
    }
  }

  return escalated;
}
