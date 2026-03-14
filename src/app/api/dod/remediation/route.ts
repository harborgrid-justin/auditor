import { NextRequest, NextResponse } from 'next/server';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId is required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const plans = db
      .select()
      .from(schema.correctiveActionPlans)
      .where(eq(schema.correctiveActionPlans.engagementId, engagementId))
      .all();

    return NextResponse.json({ data: plans });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { engagementId } = body;

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId is required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const id = uuid();
    const now = new Date().toISOString();

    db.insert(schema.correctiveActionPlans)
      .values({
        id,
        engagementId,
        findingId: body.findingId || null,
        title: body.title,
        classification: body.classification,
        responsibleOfficial: body.responsibleOfficial,
        targetCompletionDate: body.targetCompletionDate,
        status: body.status || 'draft',
        description: body.description,
        createdAt: now,
      })
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'corrective_action_plan',
      entityId: id,
      engagementId,
      details: { classification: body.classification, title: body.title },
    });

    const created = db.select().from(schema.correctiveActionPlans).where(eq(schema.correctiveActionPlans.id, id)).get();
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
