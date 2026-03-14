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

    const cases = db
      .select()
      .from(schema.securityCooperationCases)
      .where(eq(schema.securityCooperationCases.engagementId, engagementId))
      .all();

    return NextResponse.json({ data: cases });
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

    db.insert(schema.securityCooperationCases)
      .values({
        id,
        engagementId,
        caseIdentifier: body.caseIdentifier,
        caseType: body.caseType,
        country: body.country,
        totalValue: body.totalValue,
        deliveredValue: body.deliveredValue || 0,
        status: body.status || 'active',
        fiscalYear: body.fiscalYear || new Date().getFullYear(),
        createdAt: now,
      })
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'security_cooperation_case',
      entityId: id,
      engagementId,
      details: { caseType: body.caseType, country: body.country },
    });

    const created = db.select().from(schema.securityCooperationCases).where(eq(schema.securityCooperationCases.id, id)).get();
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
