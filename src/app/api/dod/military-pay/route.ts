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

    const records = db
      .select()
      .from(schema.militaryPayRecords)
      .where(eq(schema.militaryPayRecords.engagementId, engagementId))
      .all();

    return NextResponse.json({ records });
  } catch (error) {
    console.error('Military pay GET error:', error);
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

    const totalCompensation = (body.basicPay || 0) +
      (body.bah || 0) +
      (body.bas || 0) +
      (body.separationPay || 0) +
      (body.retirementPay || 0);

    db.insert(schema.militaryPayRecords)
      .values({
        id,
        engagementId,
        memberId: body.memberId,
        payGrade: body.payGrade,
        yearsOfService: body.yearsOfService,
        basicPay: body.basicPay,
        bah: body.bah || 0,
        bas: body.bas || 0,
        specialPaysJson: body.specialPaysJson ? JSON.stringify(body.specialPaysJson) : null,
        incentivePaysJson: body.incentivePaysJson ? JSON.stringify(body.incentivePaysJson) : null,
        combatZoneExclusion: body.combatZoneExclusion || false,
        tspContribution: body.tspContribution || 0,
        tspMatchAmount: body.tspMatchAmount || 0,
        separationPay: body.separationPay || 0,
        retirementPay: body.retirementPay || 0,
        totalCompensation: body.totalCompensation ?? totalCompensation,
        fiscalYear: body.fiscalYear || new Date().getFullYear(),
        payPeriod: body.payPeriod,
        status: body.status || 'active',
        createdAt: now,
      })
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'obligation',
      entityId: id,
      engagementId,
      details: { memberId: body.memberId, payGrade: body.payGrade, totalCompensation },
    });

    const created = db.select().from(schema.militaryPayRecords).where(eq(schema.militaryPayRecords.id, id)).get();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Military pay POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
