import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';
import { evaluateSubsequentEvents, getRequiredProcedures } from '@/lib/workflow/subsequent-events';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const events = db.select().from(schema.subsequentEvents)
      .where(eq(schema.subsequentEvents.engagementId, engagementId))
      .all();

    const procedures = getRequiredProcedures();

    const evaluation = evaluateSubsequentEvents(
      events.map(e => ({
        ...e,
        adjustmentAmount: e.adjustmentAmount ?? undefined,
        reviewedBy: e.reviewedBy ?? undefined,
      })),
      procedures
    );

    return NextResponse.json({ events, procedures, evaluation });
  } catch (error) {
    console.error('Subsequent events fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch subsequent events' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const body = await req.json();
    const {
      eventDescription,
      eventDate,
      eventType,
      procedurePerformed,
      conclusion,
      adjustmentRequired = false,
      disclosureRequired = false,
      adjustmentAmount,
    } = body;

    const id = uuid();
    const now = new Date().toISOString();

    db.insert(schema.subsequentEvents).values({
      id,
      engagementId,
      eventDescription,
      eventDate,
      eventType,
      procedurePerformed,
      conclusion,
      adjustmentRequired,
      disclosureRequired,
      adjustmentAmount: adjustmentAmount ?? null,
      identifiedBy: auth.user.id,
      identifiedAt: now,
    }).run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'engagement',
      entityId: id,
      engagementId,
      details: { type: 'subsequent_event', eventType },
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error('Subsequent event creation error:', error);
    return NextResponse.json({ error: 'Failed to create subsequent event' }, { status: 500 });
  }
}
