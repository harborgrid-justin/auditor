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

    const disbursements = db
      .select()
      .from(schema.dodDisbursements)
      .where(eq(schema.dodDisbursements.engagementId, engagementId))
      .all();

    return NextResponse.json({ disbursements });
  } catch (error) {
    console.error('Disbursements GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { engagementId, obligationId, amount } = body;

    if (!engagementId || !obligationId) {
      return NextResponse.json({ error: 'engagementId and obligationId are required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    // Fund control check: verify obligation has sufficient unliquidated balance
    const obligation = db
      .select()
      .from(schema.dodObligations)
      .where(eq(schema.dodObligations.id, obligationId))
      .get();

    if (!obligation) {
      return NextResponse.json({ error: 'Obligation not found' }, { status: 404 });
    }

    if (obligation.status === 'deobligated') {
      return NextResponse.json({ error: 'Cannot disburse against a deobligated obligation' }, { status: 422 });
    }

    if (amount > obligation.unliquidatedBalance) {
      return NextResponse.json(
        {
          error: 'Disbursement exceeds unliquidated balance',
          unliquidatedBalance: obligation.unliquidatedBalance,
          requestedAmount: amount,
        },
        { status: 422 }
      );
    }

    // Check appropriation-level fund availability
    const appropriation = db
      .select()
      .from(schema.appropriations)
      .where(eq(schema.appropriations.id, obligation.appropriationId))
      .get();

    if (appropriation && appropriation.status === 'cancelled') {
      return NextResponse.json({ error: 'Cannot disburse from a cancelled appropriation' }, { status: 422 });
    }

    const id = uuid();
    const now = new Date().toISOString();

    db.insert(schema.dodDisbursements)
      .values({
        id,
        engagementId,
        obligationId,
        disbursementNumber: body.disbursementNumber,
        voucherNumber: body.voucherNumber || null,
        payeeId: body.payeeId || null,
        amount,
        disbursementDate: body.disbursementDate || now,
        paymentMethod: body.paymentMethod,
        certifiedBy: body.certifiedBy || null,
        status: 'pending',
        promptPayDueDate: body.promptPayDueDate || null,
        discountDate: body.discountDate || null,
        discountAmount: body.discountAmount || 0,
        interestPenalty: body.interestPenalty || 0,
        createdAt: now,
      })
      .run();

    // Update obligation liquidation
    const newLiquidated = obligation.liquidatedAmount + amount;
    db.update(schema.dodObligations)
      .set({
        liquidatedAmount: newLiquidated,
        unliquidatedBalance: obligation.amount - newLiquidated,
        status: newLiquidated >= obligation.amount ? 'fully_liquidated' : 'partially_liquidated',
      })
      .where(eq(schema.dodObligations.id, obligationId))
      .run();

    // Update appropriation disbursed amount
    if (appropriation) {
      db.update(schema.appropriations)
        .set({ disbursed: appropriation.disbursed + amount })
        .where(eq(schema.appropriations.id, obligation.appropriationId))
        .run();
    }

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'disbursement',
      entityId: id,
      engagementId,
      details: { disbursementNumber: body.disbursementNumber, amount, obligationId },
    });

    const created = db.select().from(schema.dodDisbursements).where(eq(schema.dodDisbursements.id, id)).get();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Disbursements POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
