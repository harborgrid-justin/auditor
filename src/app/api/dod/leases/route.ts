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

    const leases = db
      .select()
      .from(schema.dodLeases)
      .where(eq(schema.dodLeases.engagementId, engagementId))
      .all();

    return NextResponse.json({ data: leases });
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

    db.insert(schema.dodLeases)
      .values({
        id,
        engagementId,
        leaseType: body.leaseType,
        assetDescription: body.assetDescription,
        lesseeEntity: body.lesseeEntity,
        annualPayment: body.annualPayment,
        leaseTermMonths: body.leaseTermMonths,
        commencementDate: body.commencementDate,
        status: body.status || 'active',
        createdAt: now,
      })
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'lease',
      entityId: id,
      engagementId,
      details: { leaseType: body.leaseType },
    });

    const created = db.select().from(schema.dodLeases).where(eq(schema.dodLeases.id, id)).get();
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
