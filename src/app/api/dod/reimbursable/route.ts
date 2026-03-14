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

    const agreements = db
      .select()
      .from(schema.interagencyAgreements)
      .where(eq(schema.interagencyAgreements.engagementId, engagementId))
      .all();

    const wcf = db
      .select()
      .from(schema.workingCapitalFunds)
      .where(eq(schema.workingCapitalFunds.engagementId, engagementId))
      .all();

    return NextResponse.json({ data: { agreements, workingCapitalFunds: wcf } });
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

    db.insert(schema.interagencyAgreements)
      .values({
        id,
        engagementId,
        agreementNumber: body.agreementNumber,
        agreementType: body.agreementType,
        requestingAgency: body.requestingAgency,
        servicingAgency: body.servicingAgency,
        amount: body.amount,
        fiscalYear: body.fiscalYear || new Date().getFullYear(),
        status: body.status || 'draft',
        createdAt: now,
      })
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'interagency_agreement',
      entityId: id,
      engagementId,
      details: { agreementType: body.agreementType },
    });

    const created = db.select().from(schema.interagencyAgreements).where(eq(schema.interagencyAgreements.id, id)).get();
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
