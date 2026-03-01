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
      .from(schema.civilianPayRecords)
      .where(eq(schema.civilianPayRecords.engagementId, engagementId))
      .all();

    return NextResponse.json({ records });
  } catch (error) {
    console.error('Civilian pay GET error:', error);
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
      (body.localityAdjustment || 0) +
      (body.premiumPay || 0) +
      (body.overtimePay || 0);

    db.insert(schema.civilianPayRecords)
      .values({
        id,
        engagementId,
        employeeId: body.employeeId,
        payPlan: body.payPlan,
        grade: body.grade,
        step: body.step,
        locality: body.locality,
        basicPay: body.basicPay,
        localityAdjustment: body.localityAdjustment || 0,
        fehbContribution: body.fehbContribution || 0,
        fegliContribution: body.fegliContribution || 0,
        retirementContribution: body.retirementContribution || 0,
        retirementPlan: body.retirementPlan,
        tspContribution: body.tspContribution || 0,
        tspMatchAmount: body.tspMatchAmount || 0,
        premiumPay: body.premiumPay || 0,
        overtimePay: body.overtimePay || 0,
        leaveHoursAccrued: body.leaveHoursAccrued || 0,
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
      details: { employeeId: body.employeeId, payPlan: body.payPlan, grade: body.grade },
    });

    const created = db.select().from(schema.civilianPayRecords).where(eq(schema.civilianPayRecords.id, id)).get();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Civilian pay POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
