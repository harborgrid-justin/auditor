import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId is required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const appropriations = db
      .select()
      .from(schema.appropriations)
      .where(eq(schema.appropriations.engagementId, engagementId))
      .all();

    return NextResponse.json({ appropriations });
  } catch (error) {
    console.error('Appropriations GET error:', error);
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

    db.insert(schema.appropriations)
      .values({
        id,
        engagementId,
        treasuryAccountSymbol: body.treasuryAccountSymbol,
        appropriationType: body.appropriationType,
        appropriationTitle: body.appropriationTitle,
        budgetCategory: body.budgetCategory,
        fiscalYearStart: body.fiscalYearStart,
        fiscalYearEnd: body.fiscalYearEnd,
        expirationDate: body.expirationDate || null,
        cancellationDate: body.cancellationDate || null,
        totalAuthority: body.totalAuthority || 0,
        apportioned: body.apportioned || 0,
        allotted: body.allotted || 0,
        committed: body.committed || 0,
        obligated: body.obligated || 0,
        disbursed: body.disbursed || 0,
        unobligatedBalance: body.unobligatedBalance ?? (body.totalAuthority || 0),
        status: body.status || 'current',
        sfisDataJson: body.sfisDataJson ? JSON.stringify(body.sfisDataJson) : null,
        createdAt: now,
      })
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'appropriation',
      entityId: id,
      engagementId,
      details: { treasuryAccountSymbol: body.treasuryAccountSymbol, totalAuthority: body.totalAuthority },
    });

    const created = db.select().from(schema.appropriations).where(eq(schema.appropriations.id, id)).get();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Appropriations POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
