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

    const obligations = db
      .select()
      .from(schema.dodObligations)
      .where(eq(schema.dodObligations.engagementId, engagementId))
      .all();

    return NextResponse.json({ obligations });
  } catch (error) {
    console.error('Obligations GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { engagementId, appropriationId, amount } = body;

    if (!engagementId || !appropriationId) {
      return NextResponse.json({ error: 'engagementId and appropriationId are required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    // ADA validation: check appropriation has sufficient funds
    const appropriation = db
      .select()
      .from(schema.appropriations)
      .where(eq(schema.appropriations.id, appropriationId))
      .get();

    if (!appropriation) {
      return NextResponse.json({ error: 'Appropriation not found' }, { status: 404 });
    }

    if (appropriation.status !== 'current') {
      return NextResponse.json(
        { error: 'Cannot obligate against a non-current appropriation', adaRisk: true },
        { status: 422 }
      );
    }

    const availableBalance = appropriation.allotted - appropriation.obligated;
    if (amount > availableBalance) {
      // Record potential ADA violation
      const violationId = uuid();
      db.insert(schema.adaViolations)
        .values({
          id: violationId,
          engagementId,
          appropriationId,
          violationType: 'over_obligation',
          statutoryBasis: '31 U.S.C. 1341(a)',
          amount: amount - availableBalance,
          description: `Attempted obligation of $${amount} exceeds available balance of $${availableBalance}`,
          discoveredDate: new Date().toISOString(),
          investigationStatus: 'detected',
          fiscalYear: body.fiscalYear || new Date().getFullYear(),
          createdAt: new Date().toISOString(),
        })
        .run();

      return NextResponse.json(
        {
          error: 'Insufficient funds - potential ADA violation',
          adaViolationId: violationId,
          availableBalance,
          requestedAmount: amount,
        },
        { status: 422 }
      );
    }

    const id = uuid();
    const now = new Date().toISOString();

    db.insert(schema.dodObligations)
      .values({
        id,
        engagementId,
        appropriationId,
        obligationNumber: body.obligationNumber,
        documentType: body.documentType,
        vendorOrPayee: body.vendorOrPayee || null,
        amount,
        obligatedDate: body.obligatedDate || now,
        liquidatedAmount: 0,
        unliquidatedBalance: amount,
        adjustmentAmount: 0,
        status: 'open',
        bonafideNeedDate: body.bonafideNeedDate || null,
        fiscalYear: body.fiscalYear || new Date().getFullYear(),
        budgetObjectCode: body.budgetObjectCode,
        budgetActivityCode: body.budgetActivityCode || null,
        programElement: body.programElement || null,
        createdBy: auth.user.id,
        createdAt: now,
      })
      .run();

    // Update appropriation obligated amount
    db.update(schema.appropriations)
      .set({
        obligated: appropriation.obligated + amount,
        unobligatedBalance: appropriation.unobligatedBalance - amount,
      })
      .where(eq(schema.appropriations.id, appropriationId))
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'obligation',
      entityId: id,
      engagementId,
      details: { obligationNumber: body.obligationNumber, amount, appropriationId },
    });

    const created = db.select().from(schema.dodObligations).where(eq(schema.dodObligations.id, id)).get();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Obligations POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
