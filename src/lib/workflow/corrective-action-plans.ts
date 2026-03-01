/**
 * Corrective Action Plan (CAP) Tracking
 *
 * Manages the full lifecycle of corrective action plans generated from
 * DoD financial audit findings. Per FIAR (Financial Improvement and Audit
 * Remediation) and OMB Circular A-123, every material weakness and
 * significant deficiency must have an associated CAP with:
 *
 *   1. Clear description of the deficiency
 *   2. Root cause analysis
 *   3. Specific corrective actions with milestones
 *   4. Responsible party and target completion date
 *   5. Evidence of remediation (closure documentation)
 *
 * CAPs are tracked through a defined workflow:
 *   Draft → Active → In Progress → Pending Validation → Closed
 *
 * References:
 *   - OMB Circular A-123 (Management's Responsibility for Internal Control)
 *   - OMB Circular A-136, Section II.4 (Material Weakness Reporting)
 *   - DoD FMR Vol. 1, Ch. 1 (Financial Management Responsibilities)
 *   - DoD Instruction 5010.40 (Managers' Internal Control Program)
 *   - FIAR Guidance (Financial Improvement and Audit Remediation)
 */

import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CAPStatus = 'draft' | 'active' | 'in_progress' | 'pending_validation' | 'closed' | 'cancelled';

export type CAPPriority = 'critical' | 'high' | 'medium' | 'low';

export type CAPCategory =
  | 'material_weakness'
  | 'significant_deficiency'
  | 'non_compliance'
  | 'internal_control'
  | 'it_system'
  | 'process_improvement';

export interface CAPMilestone {
  id: string;
  title: string;
  description: string;
  targetDate: string;
  completedDate?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  responsible: string;
  evidenceRequired: string[];
  evidenceProvided: string[];
}

export interface CAPEvidence {
  id: string;
  title: string;
  description: string;
  documentType: 'policy' | 'procedure' | 'test_result' | 'screenshot' | 'report' | 'signoff' | 'other';
  uploadedBy: string;
  uploadedDate: string;
  filePath?: string;
  verified: boolean;
  verifiedBy?: string;
  verifiedDate?: string;
}

export interface CorrectiveActionPlan {
  id: string;
  engagementId: string;
  findingId?: string;
  findingTitle: string;
  category: CAPCategory;
  priority: CAPPriority;
  status: CAPStatus;

  // Description
  deficiencyDescription: string;
  rootCause: string;
  correctiveAction: string;
  expectedOutcome: string;

  // Assignment
  responsibleParty: string;
  responsibleOrg: string;
  oversightOfficial?: string;

  // Timeline
  createdDate: string;
  targetDate: string;
  revisedTargetDate?: string;
  closedDate?: string;
  closedBy?: string;

  // Tracking
  milestones: CAPMilestone[];
  evidence: CAPEvidence[];
  progressNotes: Array<{
    date: string;
    author: string;
    note: string;
  }>;

  // Validation
  validationCriteria: string[];
  validatedBy?: string;
  validationDate?: string;
  validationResult?: 'passed' | 'failed' | 'partial';
}

export interface CAPSummary {
  total: number;
  byStatus: Record<CAPStatus, number>;
  byPriority: Record<CAPPriority, number>;
  byCategory: Record<CAPCategory, number>;
  overdue: number;
  averageAgeDays: number;
  closedThisPeriod: number;
  closureRate: number;
}

// ---------------------------------------------------------------------------
// CAP Manager
// ---------------------------------------------------------------------------

export class CorrectiveActionPlanManager {
  private plans: CorrectiveActionPlan[] = [];

  constructor(existingPlans?: CorrectiveActionPlan[]) {
    if (existingPlans) {
      this.plans = [...existingPlans];
    }
  }

  /**
   * Create a new CAP from an audit finding.
   */
  createFromFinding(params: {
    engagementId: string;
    findingId: string;
    findingTitle: string;
    category: CAPCategory;
    priority: CAPPriority;
    deficiencyDescription: string;
    rootCause: string;
    correctiveAction: string;
    expectedOutcome: string;
    responsibleParty: string;
    responsibleOrg: string;
    targetDate: string;
    milestones?: Array<{ title: string; description: string; targetDate: string; responsible: string; evidenceRequired: string[] }>;
    validationCriteria?: string[];
  }): CorrectiveActionPlan {
    const cap: CorrectiveActionPlan = {
      id: uuid(),
      engagementId: params.engagementId,
      findingId: params.findingId,
      findingTitle: params.findingTitle,
      category: params.category,
      priority: params.priority,
      status: 'draft',
      deficiencyDescription: params.deficiencyDescription,
      rootCause: params.rootCause,
      correctiveAction: params.correctiveAction,
      expectedOutcome: params.expectedOutcome,
      responsibleParty: params.responsibleParty,
      responsibleOrg: params.responsibleOrg,
      createdDate: new Date().toISOString(),
      targetDate: params.targetDate,
      milestones: (params.milestones ?? []).map((m) => ({
        id: uuid(),
        title: m.title,
        description: m.description,
        targetDate: m.targetDate,
        status: 'pending' as const,
        responsible: m.responsible,
        evidenceRequired: m.evidenceRequired,
        evidenceProvided: [],
      })),
      evidence: [],
      progressNotes: [],
      validationCriteria: params.validationCriteria ?? [],
    };

    this.plans.push(cap);
    return cap;
  }

  /**
   * Activate a draft CAP.
   */
  activate(capId: string): CorrectiveActionPlan {
    const cap = this.findById(capId);
    if (cap.status !== 'draft') {
      throw new Error(`Cannot activate CAP in ${cap.status} status — must be in draft`);
    }
    cap.status = 'active';
    return cap;
  }

  /**
   * Start work on a CAP (transition from active to in_progress).
   */
  startWork(capId: string, note?: string): CorrectiveActionPlan {
    const cap = this.findById(capId);
    if (cap.status !== 'active') {
      throw new Error(`Cannot start work on CAP in ${cap.status} status — must be active`);
    }
    cap.status = 'in_progress';
    if (note) {
      cap.progressNotes.push({
        date: new Date().toISOString(),
        author: cap.responsibleParty,
        note,
      });
    }
    return cap;
  }

  /**
   * Update milestone status.
   */
  updateMilestone(
    capId: string,
    milestoneId: string,
    update: { status?: CAPMilestone['status']; completedDate?: string; evidenceProvided?: string[] }
  ): CAPMilestone {
    const cap = this.findById(capId);
    const milestone = cap.milestones.find((m) => m.id === milestoneId);
    if (!milestone) throw new Error(`Milestone ${milestoneId} not found in CAP ${capId}`);

    if (update.status) milestone.status = update.status;
    if (update.completedDate) milestone.completedDate = update.completedDate;
    if (update.evidenceProvided) {
      milestone.evidenceProvided.push(...update.evidenceProvided);
    }

    return milestone;
  }

  /**
   * Add evidence to a CAP.
   */
  addEvidence(capId: string, evidence: Omit<CAPEvidence, 'id' | 'verified' | 'verifiedBy' | 'verifiedDate'>): CAPEvidence {
    const cap = this.findById(capId);
    const entry: CAPEvidence = {
      ...evidence,
      id: uuid(),
      verified: false,
    };
    cap.evidence.push(entry);
    return entry;
  }

  /**
   * Verify evidence.
   */
  verifyEvidence(capId: string, evidenceId: string, verifiedBy: string): CAPEvidence {
    const cap = this.findById(capId);
    const evidence = cap.evidence.find((e) => e.id === evidenceId);
    if (!evidence) throw new Error(`Evidence ${evidenceId} not found in CAP ${capId}`);

    evidence.verified = true;
    evidence.verifiedBy = verifiedBy;
    evidence.verifiedDate = new Date().toISOString();
    return evidence;
  }

  /**
   * Add a progress note.
   */
  addProgressNote(capId: string, author: string, note: string): void {
    const cap = this.findById(capId);
    cap.progressNotes.push({
      date: new Date().toISOString(),
      author,
      note,
    });
  }

  /**
   * Submit for validation (all milestones must be completed).
   */
  submitForValidation(capId: string): CorrectiveActionPlan {
    const cap = this.findById(capId);
    if (cap.status !== 'in_progress') {
      throw new Error(`Cannot submit CAP in ${cap.status} status — must be in_progress`);
    }

    const incompleteMilestones = cap.milestones.filter((m) => m.status !== 'completed');
    if (incompleteMilestones.length > 0) {
      throw new Error(
        `Cannot submit for validation: ${incompleteMilestones.length} milestone(s) incomplete: ${incompleteMilestones.map((m) => m.title).join(', ')}`
      );
    }

    cap.status = 'pending_validation';
    return cap;
  }

  /**
   * Validate and close a CAP.
   */
  validate(
    capId: string,
    validatedBy: string,
    result: 'passed' | 'failed' | 'partial',
    note?: string
  ): CorrectiveActionPlan {
    const cap = this.findById(capId);
    if (cap.status !== 'pending_validation') {
      throw new Error(`Cannot validate CAP in ${cap.status} status — must be pending_validation`);
    }

    cap.validatedBy = validatedBy;
    cap.validationDate = new Date().toISOString();
    cap.validationResult = result;

    if (result === 'passed') {
      cap.status = 'closed';
      cap.closedDate = new Date().toISOString();
      cap.closedBy = validatedBy;
    } else {
      // Failed or partial — send back to in_progress
      cap.status = 'in_progress';
      if (note) {
        cap.progressNotes.push({
          date: new Date().toISOString(),
          author: validatedBy,
          note: `Validation ${result}: ${note}`,
        });
      }
    }

    return cap;
  }

  /**
   * Cancel a CAP (with reason).
   */
  cancel(capId: string, cancelledBy: string, reason: string): CorrectiveActionPlan {
    const cap = this.findById(capId);
    if (cap.status === 'closed') {
      throw new Error('Cannot cancel a closed CAP');
    }
    cap.status = 'cancelled';
    cap.closedDate = new Date().toISOString();
    cap.closedBy = cancelledBy;
    cap.progressNotes.push({
      date: new Date().toISOString(),
      author: cancelledBy,
      note: `CAP cancelled: ${reason}`,
    });
    return cap;
  }

  /**
   * Check for overdue milestones and update their status.
   */
  checkOverdueMilestones(): Array<{ capId: string; milestone: CAPMilestone }> {
    const now = new Date();
    const overdue: Array<{ capId: string; milestone: CAPMilestone }> = [];

    for (const cap of this.plans) {
      if (cap.status === 'closed' || cap.status === 'cancelled') continue;

      for (const milestone of cap.milestones) {
        if (milestone.status === 'completed') continue;
        if (new Date(milestone.targetDate) < now) {
          milestone.status = 'overdue';
          overdue.push({ capId: cap.id, milestone });
        }
      }
    }

    return overdue;
  }

  /**
   * Generate a summary of all CAPs.
   */
  getSummary(): CAPSummary {
    const now = new Date();
    const byStatus: Record<CAPStatus, number> = {
      draft: 0, active: 0, in_progress: 0, pending_validation: 0, closed: 0, cancelled: 0,
    };
    const byPriority: Record<CAPPriority, number> = {
      critical: 0, high: 0, medium: 0, low: 0,
    };
    const byCategory: Record<CAPCategory, number> = {
      material_weakness: 0, significant_deficiency: 0, non_compliance: 0,
      internal_control: 0, it_system: 0, process_improvement: 0,
    };

    let overdue = 0;
    let totalAgeDays = 0;
    let closedThisPeriod = 0;
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const cap of this.plans) {
      byStatus[cap.status]++;
      byPriority[cap.priority]++;
      byCategory[cap.category]++;

      // Age calculation
      const createdDate = new Date(cap.createdDate);
      const endDate = cap.closedDate ? new Date(cap.closedDate) : now;
      totalAgeDays += (endDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);

      // Overdue check
      if (
        cap.status !== 'closed' &&
        cap.status !== 'cancelled' &&
        new Date(cap.revisedTargetDate ?? cap.targetDate) < now
      ) {
        overdue++;
      }

      // Closed this period
      if (cap.status === 'closed' && cap.closedDate && new Date(cap.closedDate) >= thirtyDaysAgo) {
        closedThisPeriod++;
      }
    }

    const closedCount = byStatus.closed;
    const total = this.plans.length;

    return {
      total,
      byStatus,
      byPriority,
      byCategory,
      overdue,
      averageAgeDays: total > 0 ? totalAgeDays / total : 0,
      closedThisPeriod,
      closureRate: total > 0 ? (closedCount / total) * 100 : 0,
    };
  }

  /**
   * Generate a CAP aging report.
   */
  getAgingReport(): Array<{
    capId: string;
    findingTitle: string;
    priority: CAPPriority;
    status: CAPStatus;
    ageDays: number;
    targetDate: string;
    daysUntilDue: number;
    isOverdue: boolean;
    completionPct: number;
  }> {
    const now = new Date();
    return this.plans
      .filter((cap) => cap.status !== 'closed' && cap.status !== 'cancelled')
      .map((cap) => {
        const createdDate = new Date(cap.createdDate);
        const target = new Date(cap.revisedTargetDate ?? cap.targetDate);
        const ageDays = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
        const daysUntilDue = Math.floor((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const completedMilestones = cap.milestones.filter((m) => m.status === 'completed').length;
        const completionPct =
          cap.milestones.length > 0 ? (completedMilestones / cap.milestones.length) * 100 : 0;

        return {
          capId: cap.id,
          findingTitle: cap.findingTitle,
          priority: cap.priority,
          status: cap.status,
          ageDays,
          targetDate: cap.revisedTargetDate ?? cap.targetDate,
          daysUntilDue,
          isOverdue: daysUntilDue < 0,
          completionPct,
        };
      })
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  }

  // Helpers
  getAll(): CorrectiveActionPlan[] {
    return [...this.plans];
  }

  findById(capId: string): CorrectiveActionPlan {
    const cap = this.plans.find((p) => p.id === capId);
    if (!cap) throw new Error(`Corrective Action Plan ${capId} not found`);
    return cap;
  }

  getByEngagement(engagementId: string): CorrectiveActionPlan[] {
    return this.plans.filter((p) => p.engagementId === engagementId);
  }

  getByFinding(findingId: string): CorrectiveActionPlan[] {
    return this.plans.filter((p) => p.findingId === findingId);
  }
}
