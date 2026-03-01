/**
 * Corrective Action Plan (CAP) / NFR Lifecycle Engine
 *
 * Manages the lifecycle of audit findings from initial identification through
 * corrective action plan development, milestone tracking, and remediation
 * validation. Supports multi-year tracking since DoD audit findings often
 * take 2-3 years to fully remediate.
 *
 * References:
 *   - OMB Circular A-123: Management's Responsibility for Internal Control
 *   - DoD FMR Vol 1, Ch 1: Financial Improvement and Audit Remediation
 *   - Government Auditing Standards (Yellow Book)
 */

import type { EngagementData } from '@/types/findings';
import type {
  CorrectiveActionPlan,
  RemediationMilestone,
  FindingClassification,
  CAPStatus,
} from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CAPValidationResult {
  fiscalYear: number;
  totalCAPs: number;
  activeCAPs: number;
  overdueCAPs: number;
  completedCAPs: number;
  materialWeaknessCAPs: number;
  significantDeficiencyCAPs: number;
  findings: CAPFinding[];
  remediationProgress: RemediationProgressSummary;
}

export interface CAPFinding {
  capId: string;
  findingType: 'overdue' | 'stale' | 'missing_milestones' | 'incomplete_evidence' | 'classification_mismatch' | 'no_responsible_official';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
}

export interface RemediationProgressSummary {
  totalMilestones: number;
  completedMilestones: number;
  overdueMilestones: number;
  percentComplete: number;
  averageDaysToRemediate: number;
  byClassification: Record<FindingClassification, { total: number; remediated: number; percentage: number }>;
}

export interface FIARStatusReport {
  fiscalYear: number;
  component: string;
  auditReadinessScore: number;
  materialWeaknessCount: number;
  significantDeficiencyCount: number;
  nfrCount: number;
  capsInProgress: number;
  capsCompleted: number;
  capsOverdue: number;
  overallProgress: number;
  riskAreas: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate corrective action plans from engagement data.
 */
export function validateCorrectiveActionPlans(data: EngagementData): CAPValidationResult {
  const caps: CorrectiveActionPlan[] = data.dodData?.correctiveActionPlans ?? [];
  const fy = data.taxYear;
  const now = new Date();
  const findings: CAPFinding[] = [];

  let activeCount = 0;
  let overdueCount = 0;
  let completedCount = 0;
  let mwCount = 0;
  let sdCount = 0;
  let totalMilestones = 0;
  let completedMilestones = 0;
  let overdueMilestones = 0;
  const remediationDays: number[] = [];

  const classificationCounts: Record<FindingClassification, { total: number; remediated: number }> = {
    material_weakness: { total: 0, remediated: 0 },
    significant_deficiency: { total: 0, remediated: 0 },
    noncompliance: { total: 0, remediated: 0 },
    other: { total: 0, remediated: 0 },
  };

  for (const cap of caps) {
    classificationCounts[cap.findingClassification].total++;

    if (cap.status === 'completed') {
      completedCount++;
      classificationCounts[cap.findingClassification].remediated++;
      if (cap.actualCompletionDate) {
        const start = new Date(cap.createdAt);
        const end = new Date(cap.actualCompletionDate);
        remediationDays.push(Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      }
      continue;
    }

    if (cap.status === 'active' || cap.status === 'in_progress') {
      activeCount++;
    }

    if (cap.findingClassification === 'material_weakness') mwCount++;
    if (cap.findingClassification === 'significant_deficiency') sdCount++;

    // Check for overdue CAPs
    const targetDate = new Date(cap.targetCompletionDate);
    if (targetDate < now && cap.status !== 'cancelled') {
      overdueCount++;
      findings.push({
        capId: cap.id,
        findingType: 'overdue',
        severity: cap.findingClassification === 'material_weakness' ? 'critical' : 'high',
        description: `CAP '${cap.id}' for ${cap.findingClassification} finding is overdue. ` +
          `Target date: ${cap.targetCompletionDate}. Current progress: ${cap.percentComplete}%.`,
      });
    }

    // Check for missing milestones
    if (cap.milestones.length === 0) {
      findings.push({
        capId: cap.id,
        findingType: 'missing_milestones',
        severity: 'medium',
        description: `CAP '${cap.id}' has no defined milestones. OMB A-123 requires ` +
          `measurable milestones for tracking remediation progress.`,
      });
    }

    // Check for incomplete evidence
    if (cap.evidenceRequired.length > cap.evidenceProvided.length) {
      findings.push({
        capId: cap.id,
        findingType: 'incomplete_evidence',
        severity: 'medium',
        description: `CAP '${cap.id}' is missing ${cap.evidenceRequired.length - cap.evidenceProvided.length} ` +
          `of ${cap.evidenceRequired.length} required evidence items.`,
      });
    }

    // Check for responsible official
    if (!cap.responsibleOfficial) {
      findings.push({
        capId: cap.id,
        findingType: 'no_responsible_official',
        severity: 'high',
        description: `CAP '${cap.id}' has no assigned responsible official.`,
      });
    }

    // Analyze milestones
    for (const milestone of cap.milestones) {
      totalMilestones++;
      if (milestone.status === 'completed') {
        completedMilestones++;
      } else if (new Date(milestone.targetDate) < now) {
        overdueMilestones++;
      }
    }
  }

  const avgDays = remediationDays.length > 0
    ? Math.round(remediationDays.reduce((s, d) => s + d, 0) / remediationDays.length)
    : 0;

  const byClassification = Object.fromEntries(
    Object.entries(classificationCounts).map(([key, val]) => [
      key,
      {
        total: val.total,
        remediated: val.remediated,
        percentage: val.total > 0 ? Math.round((val.remediated / val.total) * 100) : 0,
      },
    ])
  ) as RemediationProgressSummary['byClassification'];

  return {
    fiscalYear: fy,
    totalCAPs: caps.length,
    activeCAPs: activeCount,
    overdueCAPs: overdueCount,
    completedCAPs: completedCount,
    materialWeaknessCAPs: mwCount,
    significantDeficiencyCAPs: sdCount,
    findings,
    remediationProgress: {
      totalMilestones,
      completedMilestones,
      overdueMilestones,
      percentComplete: totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0,
      averageDaysToRemediate: avgDays,
      byClassification,
    },
  };
}

/**
 * Generate FIAR status report for a component.
 */
export function generateFIARStatusReport(data: EngagementData): FIARStatusReport {
  const capResult = validateCorrectiveActionPlans(data);
  const fiarAssessments = data.dodData?.fiarAssessments ?? [];
  const latestAssessment = fiarAssessments.length > 0
    ? fiarAssessments.sort((a, b) => new Date(b.assessmentDate).getTime() - new Date(a.assessmentDate).getTime())[0]
    : null;

  return {
    fiscalYear: data.taxYear,
    component: data.dodData?.dodComponent ?? 'Unknown',
    auditReadinessScore: latestAssessment?.auditReadinessScore ?? 0,
    materialWeaknessCount: capResult.materialWeaknessCAPs,
    significantDeficiencyCount: capResult.significantDeficiencyCAPs,
    nfrCount: latestAssessment?.noticeOfFindings?.length ?? 0,
    capsInProgress: capResult.activeCAPs,
    capsCompleted: capResult.completedCAPs,
    capsOverdue: capResult.overdueCAPs,
    overallProgress: capResult.remediationProgress.percentComplete,
    riskAreas: latestAssessment?.materialWeaknesses ?? [],
  };
}
