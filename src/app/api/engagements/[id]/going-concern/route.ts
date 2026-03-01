import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';
import { assessGoingConcern } from '@/lib/engine/going-concern/going-concern-evaluator';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const assessments = db.select().from(schema.goingConcernAssessments)
      .where(eq(schema.goingConcernAssessments.engagementId, engagementId))
      .all();

    // Parse JSON fields
    const parsed = assessments.map(a => ({
      ...a,
      quantitativeIndicators: JSON.parse(a.quantitativeIndicatorsJson),
      qualitativeIndicators: a.qualitativeIndicatorsJson ? JSON.parse(a.qualitativeIndicatorsJson) : [],
      cashFlowProjection: a.cashFlowProjectionJson ? JSON.parse(a.cashFlowProjectionJson) : [],
      managementPlan: a.managementPlanJson ? JSON.parse(a.managementPlanJson) : [],
      mitigatingFactors: a.mitigatingFactorsJson ? JSON.parse(a.mitigatingFactorsJson) : [],
    }));

    return NextResponse.json({ assessments: parsed });
  } catch (error) {
    console.error('Going concern fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch going concern assessments' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const body = await req.json();

    // Run assessment
    const assessment = assessGoingConcern(body);

    const id = uuid();
    const now = new Date().toISOString();

    db.insert(schema.goingConcernAssessments).values({
      id,
      engagementId,
      assessmentDate: now,
      quantitativeIndicatorsJson: JSON.stringify(assessment.quantitativeIndicators),
      qualitativeIndicatorsJson: JSON.stringify(assessment.qualitativeIndicators),
      cashFlowProjectionJson: JSON.stringify(assessment.cashFlowProjection),
      managementPlanJson: JSON.stringify(assessment.managementPlans),
      mitigatingFactorsJson: JSON.stringify([]),
      conclusion: assessment.conclusion,
      opinionImpact: assessment.opinionImpact,
      disclosureAdequate: assessment.disclosureAdequate,
      assessedBy: auth.user.id,
      notes: assessment.rationale,
    }).run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'analyze',
      entityType: 'engagement',
      entityId: id,
      engagementId,
      details: { type: 'going_concern', conclusion: assessment.conclusion, opinionImpact: assessment.opinionImpact },
    });

    return NextResponse.json({ id, assessment }, { status: 201 });
  } catch (error) {
    console.error('Going concern assessment error:', error);
    return NextResponse.json({ error: 'Failed to create going concern assessment' }, { status: 500 });
  }
}
