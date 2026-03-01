import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const items = db
      .select()
      .from(schema.schedules)
      .where(eq(schema.schedules.engagementId, engagementId))
      .orderBy(desc(schema.schedules.createdAt))
      .all();

    return NextResponse.json({ schedules: items });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch schedules' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { engagementId, name, cronExpression, frameworks, enabled } = body;

    if (!engagementId || !name || !cronExpression || !frameworks?.length) {
      return NextResponse.json(
        { error: 'engagementId, name, cronExpression, and frameworks are required' },
        { status: 400 }
      );
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const id = uuid();
    const now = new Date().toISOString();

    db.insert(schema.schedules)
      .values({
        id,
        engagementId,
        name,
        cronExpression,
        frameworksJson: JSON.stringify(frameworks),
        enabled: enabled !== false,
        lastRunAt: null,
        nextRunAt: null,
        createdBy: auth.user.id,
        createdAt: now,
      })
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'schedule',
      entityId: id,
      engagementId,
      details: { name, cronExpression },
    });

    return NextResponse.json({ id, name }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create schedule' }, { status: 500 });
  }
}
