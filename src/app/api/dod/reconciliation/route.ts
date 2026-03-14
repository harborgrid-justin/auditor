import { NextRequest, NextResponse } from 'next/server';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId is required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const matches = db
      .select()
      .from(schema.threeWayMatches)
      .where(eq(schema.threeWayMatches.engagementId, engagementId))
      .all();

    const suspenseItems = db
      .select()
      .from(schema.suspenseItems)
      .where(eq(schema.suspenseItems.engagementId, engagementId))
      .all();

    return NextResponse.json({ data: { matches, suspenseItems } });
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

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'analyze',
      entityType: 'reconciliation',
      engagementId,
      details: { action: body.action },
    });

    return NextResponse.json({ data: { status: 'reconciliation_initiated' } });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
