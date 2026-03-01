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

    const contracts = db
      .select()
      .from(schema.dodContracts)
      .where(eq(schema.dodContracts.engagementId, engagementId))
      .all();

    return NextResponse.json({ contracts });
  } catch (error) {
    console.error('Contracts GET error:', error);
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

    db.insert(schema.dodContracts)
      .values({
        id,
        engagementId,
        contractNumber: body.contractNumber,
        contractType: body.contractType,
        vendorName: body.vendorName,
        totalValue: body.totalValue,
        obligatedAmount: body.obligatedAmount || 0,
        fundedAmount: body.fundedAmount || 0,
        periodOfPerformance: body.periodOfPerformance,
        contractingOfficer: body.contractingOfficer,
        status: body.status || 'active',
        closeoutDate: body.closeoutDate || null,
        fiscalYear: body.fiscalYear || new Date().getFullYear(),
        createdAt: now,
      })
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'contract_payment',
      entityId: id,
      engagementId,
      details: {
        contractNumber: body.contractNumber,
        contractType: body.contractType,
        vendorName: body.vendorName,
        totalValue: body.totalValue,
      },
    });

    const created = db.select().from(schema.dodContracts).where(eq(schema.dodContracts.id, id)).get();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Contracts POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
