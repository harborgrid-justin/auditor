import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';
import { determineEnhancedOpinion } from '@/lib/reports/enhanced-opinion';
import { evaluateSUD } from '@/lib/engine/adjustments/adjustment-tracker';
import { evaluateScopeLimitations } from '@/lib/engine/scope/scope-tracker';
import { generateCoverageMatrix } from '@/lib/engine/assertions/assertion-coverage';
import { evaluateChecklist, performAutoChecks, STANDARD_CHECKLIST } from '@/lib/workflow/completion-checklist';
import { evaluateIndependence } from '@/lib/workflow/independence';
import { evaluateSubsequentEvents, getRequiredProcedures } from '@/lib/workflow/subsequent-events';
import type { AssertionCoverageEntry } from '@/lib/engine/assertions/assertion-coverage';
import type { ChecklistItemStatus } from '@/lib/workflow/completion-checklist';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    // Fetch all engagement data
    const engagement = db.select().from(schema.engagements)
      .where(eq(schema.engagements.id, engagementId))
      .get();

    if (!engagement) {
      return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });
    }

    const findings = db.select().from(schema.findings)
      .where(eq(schema.findings.engagementId, engagementId))
      .all();
    const controls = db.select().from(schema.soxControls)
      .where(eq(schema.soxControls.engagementId, engagementId))
      .all();
    const accounts = db.select().from(schema.accounts)
      .where(eq(schema.accounts.engagementId, engagementId))
      .all();
    const adjustments = db.select().from(schema.auditAdjustments)
      .where(eq(schema.auditAdjustments.engagementId, engagementId))
      .all();
    const gcAssessments = db.select().from(schema.goingConcernAssessments)
      .where(eq(schema.goingConcernAssessments.engagementId, engagementId))
      .all();
    const scopeLims = db.select().from(schema.scopeLimitations)
      .where(eq(schema.scopeLimitations.engagementId, engagementId))
      .all();
    const coverageEntries = db.select().from(schema.assertionCoverage)
      .where(eq(schema.assertionCoverage.engagementId, engagementId))
      .all();
    const samplingPlans = db.select().from(schema.samplingPlans)
      .where(eq(schema.samplingPlans.engagementId, engagementId))
      .all();
    const checklistItems = db.select().from(schema.completionChecklist)
      .where(eq(schema.completionChecklist.engagementId, engagementId))
      .all();
    const independenceConfs = db.select().from(schema.independenceConfirmations)
      .where(eq(schema.independenceConfirmations.engagementId, engagementId))
      .all();
    const members = db.select().from(schema.engagementMembers)
      .where(eq(schema.engagementMembers.engagementId, engagementId))
      .all();
    const seEvents = db.select().from(schema.subsequentEvents)
      .where(eq(schema.subsequentEvents.engagementId, engagementId))
      .all();
    const relParties = db.select().from(schema.relatedParties)
      .where(eq(schema.relatedParties.engagementId, engagementId))
      .all();
    const rpTransactions = db.select().from(schema.relatedPartyTransactions)
      .where(eq(schema.relatedPartyTransactions.engagementId, engagementId))
      .all();

    // Build module evaluations
    const sudSummary = evaluateSUD(
      adjustments.map(a => ({ ...a, findingId: a.findingId ?? undefined })),
      engagement.materialityThreshold
    );

    const scopeEvaluation = evaluateScopeLimitations(
      scopeLims.map(l => ({ ...l, estimatedImpact: l.estimatedImpact ?? null, resolutionNotes: l.resolutionNotes ?? undefined })),
      engagement.materialityThreshold
    );

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const assertionEntries: AssertionCoverageEntry[] = coverageEntries.map(e => ({
      accountName: e.accountName,
      accountType: e.accountType,
      assertion: e.assertion as any,
      procedureType: e.procedureType as any,
      procedureDescription: e.procedureDescription,
      evidenceReference: e.evidenceReference ?? undefined,
      coveredBy: e.coveredBy,
      status: e.status as any,
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const assertionCoverage = generateCoverageMatrix(
      accounts.map(a => ({ accountName: a.accountName, accountType: a.accountType, endingBalance: a.endingBalance })),
      assertionEntries,
      engagement.materialityThreshold
    );

    const samplingConclusions = samplingPlans.map(p => ({
      name: p.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      conclusion: p.conclusion as any,
      rationale: p.conclusionNotes ?? '',
    }));

    const independenceEvaluation = evaluateIndependence(
      independenceConfs.map(c => ({
        ...c,
        threatsIdentified: c.threatsIdentified ?? undefined,
        safeguardsApplied: c.safeguardsApplied ?? undefined,
        nonAuditServices: c.nonAuditServices ?? undefined,
        feeArrangement: c.feeArrangement ?? undefined,
        confirmedAt: c.confirmedAt ?? undefined,
      })),
      members.length
    );

    const seEvaluation = evaluateSubsequentEvents(
      seEvents.map(e => ({
        ...e,
        adjustmentAmount: e.adjustmentAmount ?? undefined,
        reviewedBy: e.reviewedBy ?? undefined,
      })),
      getRequiredProcedures()
    );

    // Latest going concern assessment
    const latestGC = gcAssessments.length > 0
      ? {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          conclusion: gcAssessments[gcAssessments.length - 1].conclusion as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          opinionImpact: gcAssessments[gcAssessments.length - 1].opinionImpact as any,
          disclosureAdequate: gcAssessments[gcAssessments.length - 1].disclosureAdequate,
          quantitativeIndicators: JSON.parse(gcAssessments[gcAssessments.length - 1].quantitativeIndicatorsJson),
          qualitativeIndicators: gcAssessments[gcAssessments.length - 1].qualitativeIndicatorsJson
            ? JSON.parse(gcAssessments[gcAssessments.length - 1].qualitativeIndicatorsJson!)
            : [],
          cashFlowProjection: gcAssessments[gcAssessments.length - 1].cashFlowProjectionJson
            ? JSON.parse(gcAssessments[gcAssessments.length - 1].cashFlowProjectionJson!)
            : [],
          managementPlans: gcAssessments[gcAssessments.length - 1].managementPlanJson
            ? JSON.parse(gcAssessments[gcAssessments.length - 1].managementPlanJson!)
            : [],
          triggeredIndicatorCount: 0,
          highSeverityCount: 0,
          cashShortfallProjected: false,
          totalMitigationImpact: 0,
          rationale: gcAssessments[gcAssessments.length - 1].notes ?? '',
        }
      : undefined;

    // Build checklist evaluation
    const autoCheckResults = performAutoChecks({
      materialitySet: engagement.materialityThreshold > 0,
      independenceConfirmed: independenceEvaluation.allConfirmed,
      controlsTested: controls.length > 0 && controls.some(c => c.status !== 'not_tested'),
      assertionCoverageComplete: assertionCoverage.readyForOpinion,
      samplingCompleted: samplingPlans.length > 0 && samplingPlans.every(p => p.conclusion !== 'pending'),
      analyticsRun: findings.length > 0,
      journalEntryTestingRun: findings.some(f => f.ruleId.startsWith('SOX-JE')),
      relatedPartiesReviewed: relParties.length > 0,
      findingsDispositioned: findings.length === 0 || findings.every(f => f.status !== 'open' && f.status !== 'in_review'),
      goingConcernAssessed: gcAssessments.length > 0,
      subsequentEventsReviewed: seEvaluation.readyForOpinion,
      sudEvaluated: sudSummary.conclusion !== 'material',
      scopeLimitationsResolved: scopeEvaluation.opinionImpact === 'none',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clItems: ChecklistItemStatus[] = (checklistItems.length > 0 ? checklistItems : STANDARD_CHECKLIST.map(item => ({
      ...item,
      id: '',
      engagementId,
      autoCheckResult: null,
      status: 'not_started',
      completedBy: null,
      completedAt: null,
      notes: null,
    }))).map(item => ({
      itemKey: item.itemKey,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      category: item.category as any,
      description: item.description,
      autoCheck: item.autoCheck,
      required: item.required,
      status: item.autoCheck && autoCheckResults[item.itemKey]
        ? 'completed'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : (item.status as any) || 'not_started',
      autoCheckResult: item.autoCheck ? autoCheckResults[item.itemKey] : undefined,
      completedBy: ('completedBy' in item ? item.completedBy : undefined) as string | undefined,
      completedAt: ('completedAt' in item ? item.completedAt : undefined) as string | undefined,
      notes: ('notes' in item ? item.notes : undefined) as string | undefined,
    }));

    const checklistEvaluation = evaluateChecklist(clItems);

    // Determine enhanced opinion
    const opinionResult = determineEnhancedOpinion({
      entityName: engagement.entityName,
      fiscalYearEnd: engagement.fiscalYearEnd,
      auditorFirmName: 'AuditPro',
      findings,
      controls,
      materialityThreshold: engagement.materialityThreshold,
      generatedAt: new Date().toISOString(),
      sudSummary,
      goingConcern: latestGC,
      scopeEvaluation,
      assertionCoverage,
      samplingConclusions,
      checklistEvaluation,
      independenceEvaluation,
      subsequentEventsComplete: seEvaluation.readyForOpinion,
      relatedPartiesDisclosed: rpTransactions.every(t => t.disclosed),
    });

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'read',
      entityType: 'engagement',
      entityId: engagementId,
      engagementId,
      details: { type: 'opinion_readiness', opinionType: opinionResult.opinionType, readyForIssuance: opinionResult.readyForIssuance },
    });

    return NextResponse.json({
      engagement: {
        id: engagement.id,
        entityName: engagement.entityName,
        fiscalYearEnd: engagement.fiscalYearEnd,
        materialityThreshold: engagement.materialityThreshold,
        status: engagement.status,
      },
      opinion: opinionResult,
      modules: {
        sud: sudSummary,
        goingConcern: latestGC ? { conclusion: latestGC.conclusion, opinionImpact: latestGC.opinionImpact } : null,
        scopeLimitations: scopeEvaluation,
        assertionCoverage: {
          coverageRate: assertionCoverage.materialAccountCoverageRate,
          gaps: assertionCoverage.gaps.length,
          readyForOpinion: assertionCoverage.readyForOpinion,
        },
        sampling: {
          totalPlans: samplingPlans.length,
          unsupported: samplingConclusions.filter(s => s.conclusion === 'does_not_support').length,
          pending: samplingConclusions.filter(s => s.conclusion === 'pending').length,
        },
        checklist: {
          completionRate: checklistEvaluation.requiredCompletionRate,
          blocking: checklistEvaluation.blockingItems.length,
          readyForOpinion: checklistEvaluation.readyForOpinion,
        },
        independence: {
          confirmed: independenceEvaluation.confirmedMembers,
          total: independenceEvaluation.totalMembers,
          allConfirmed: independenceEvaluation.allConfirmed,
        },
        subsequentEvents: {
          eventsIdentified: seEvents.length,
          proceduresComplete: seEvaluation.proceduresComplete,
          readyForOpinion: seEvaluation.readyForOpinion,
        },
        relatedParties: {
          partiesIdentified: relParties.length,
          transactions: rpTransactions.length,
          allDisclosed: rpTransactions.every(t => t.disclosed),
        },
      },
    });
  } catch (error) {
    console.error('Opinion readiness error:', error);
    return NextResponse.json({ error: 'Failed to evaluate opinion readiness' }, { status: 500 });
  }
}
