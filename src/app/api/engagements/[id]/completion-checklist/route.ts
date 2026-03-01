import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';
import { STANDARD_CHECKLIST, evaluateChecklist, performAutoChecks } from '@/lib/workflow/completion-checklist';
import type { ChecklistItemStatus } from '@/lib/workflow/completion-checklist';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    let items = db.select().from(schema.completionChecklist)
      .where(eq(schema.completionChecklist.engagementId, engagementId))
      .all();

    // Initialize checklist if empty
    if (items.length === 0) {
      const now = new Date().toISOString();
      for (const item of STANDARD_CHECKLIST) {
        db.insert(schema.completionChecklist).values({
          id: uuid(),
          engagementId,
          itemKey: item.itemKey,
          category: item.category,
          description: item.description,
          autoCheck: item.autoCheck,
          status: 'not_started',
          required: item.required,
        }).run();
      }
      items = db.select().from(schema.completionChecklist)
        .where(eq(schema.completionChecklist.engagementId, engagementId))
        .all();
    }

    // Perform auto-checks based on database state
    const engagement = db.select().from(schema.engagements)
      .where(eq(schema.engagements.id, engagementId))
      .get();

    const controls = db.select().from(schema.soxControls)
      .where(eq(schema.soxControls.engagementId, engagementId))
      .all();
    const findings = db.select().from(schema.findings)
      .where(eq(schema.findings.engagementId, engagementId))
      .all();
    const samplingPlans = db.select().from(schema.samplingPlans)
      .where(eq(schema.samplingPlans.engagementId, engagementId))
      .all();
    const gcAssessments = db.select().from(schema.goingConcernAssessments)
      .where(eq(schema.goingConcernAssessments.engagementId, engagementId))
      .all();
    const seEvents = db.select().from(schema.subsequentEvents)
      .where(eq(schema.subsequentEvents.engagementId, engagementId))
      .all();
    const adjustments = db.select().from(schema.auditAdjustments)
      .where(eq(schema.auditAdjustments.engagementId, engagementId))
      .all();
    const scopeLims = db.select().from(schema.scopeLimitations)
      .where(eq(schema.scopeLimitations.engagementId, engagementId))
      .all();
    const independence = db.select().from(schema.independenceConfirmations)
      .where(eq(schema.independenceConfirmations.engagementId, engagementId))
      .all();
    const relParties = db.select().from(schema.relatedParties)
      .where(eq(schema.relatedParties.engagementId, engagementId))
      .all();

    const autoCheckResults = performAutoChecks({
      materialitySet: (engagement?.materialityThreshold ?? 0) > 0,
      independenceConfirmed: independence.length > 0 && independence.every(c => c.confirmed),
      controlsTested: controls.length > 0 && controls.some(c => c.status !== 'not_tested'),
      assertionCoverageComplete: false, // would need assertion_coverage data
      samplingCompleted: samplingPlans.length > 0 && samplingPlans.every(p => p.conclusion !== 'pending'),
      analyticsRun: findings.length > 0,
      journalEntryTestingRun: findings.some(f => f.ruleId.startsWith('SOX-JE')),
      relatedPartiesReviewed: relParties.length > 0 || findings.some(f => f.ruleId.includes('RP')),
      findingsDispositioned: findings.length === 0 || findings.every(f => f.status !== 'open' && f.status !== 'in_review'),
      goingConcernAssessed: gcAssessments.length > 0,
      subsequentEventsReviewed: seEvents.length > 0 || findings.some(f => f.ruleId.startsWith('GAAP-SE')),
      sudEvaluated: adjustments.length === 0 || adjustments.some(a => a.type === 'passed'),
      scopeLimitationsResolved: scopeLims.every(l => l.resolved),
    });

    // Map to ChecklistItemStatus
    const checklistItems: ChecklistItemStatus[] = items.map(item => ({
      itemKey: item.itemKey,
      category: item.category as any,
      description: item.description,
      autoCheck: item.autoCheck,
      required: item.required,
      status: item.autoCheck && autoCheckResults[item.itemKey] !== undefined
        ? (autoCheckResults[item.itemKey] ? 'completed' : item.status as any)
        : item.status as any,
      autoCheckResult: item.autoCheck ? autoCheckResults[item.itemKey] : undefined,
      completedBy: item.completedBy ?? undefined,
      completedAt: item.completedAt ?? undefined,
      notes: item.notes ?? undefined,
    }));

    const evaluation = evaluateChecklist(checklistItems);

    return NextResponse.json({ items: checklistItems, evaluation });
  } catch (error) {
    console.error('Completion checklist fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch checklist' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const body = await req.json();
    const { itemKey, status, notes } = body;

    const now = new Date().toISOString();

    db.update(schema.completionChecklist)
      .set({
        status,
        completedBy: status === 'completed' ? auth.user.id : null,
        completedAt: status === 'completed' ? now : null,
        notes: notes ?? null,
      })
      .where(
        eq(schema.completionChecklist.itemKey, itemKey)
      )
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'update',
      entityType: 'engagement',
      entityId: itemKey,
      engagementId,
      details: { type: 'checklist_item', status },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Checklist update error:', error);
    return NextResponse.json({ error: 'Failed to update checklist' }, { status: 500 });
  }
}
