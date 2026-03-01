import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const obligation = db
      .select()
      .from(schema.dodObligations)
      .where(eq(schema.dodObligations.id, params.id))
      .get();

    if (!obligation) {
      return NextResponse.json({ error: 'Obligation not found' }, { status: 404 });
    }

    const auth = await requireEngagementMember(obligation.engagementId);
    if (auth.error) return auth.error;

    return NextResponse.json(obligation);
  } catch (error) {
    console.error('Obligation GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const obligation = db
      .select()
      .from(schema.dodObligations)
      .where(eq(schema.dodObligations.id, params.id))
      .get();

    if (!obligation) {
      return NextResponse.json({ error: 'Obligation not found' }, { status: 404 });
    }

    const auth = await requireEngagementMember(obligation.engagementId);
    if (auth.error) return auth.error;

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    // Handle liquidation
    if (body.liquidateAmount !== undefined) {
      const newLiquidated = obligation.liquidatedAmount + body.liquidateAmount;
      if (newLiquidated > obligation.amount) {
        return NextResponse.json(
          { error: 'Liquidation would exceed obligation amount' },
          { status: 422 }
        );
      }
      updates.liquidatedAmount = newLiquidated;
      updates.unliquidatedBalance = obligation.amount - newLiquidated;
      updates.status = newLiquidated >= obligation.amount ? 'fully_liquidated' : 'partially_liquidated';
    }

    // Handle deobligation
    if (body.deobligateAmount !== undefined) {
      const adjustedAmount = obligation.amount - body.deobligateAmount;
      if (adjustedAmount < obligation.liquidatedAmount) {
        return NextResponse.json(
          { error: 'Cannot deobligate below liquidated amount' },
          { status: 422 }
        );
      }
      updates.amount = adjustedAmount;
      updates.adjustmentAmount = obligation.adjustmentAmount + body.deobligateAmount;
      updates.unliquidatedBalance = adjustedAmount - obligation.liquidatedAmount;
      updates.status = adjustedAmount === 0 ? 'deobligated' : 'adjusted';

      // Return funds to appropriation
      const appropriation = db
        .select()
        .from(schema.appropriations)
        .where(eq(schema.appropriations.id, obligation.appropriationId))
        .get();

      if (appropriation) {
        db.update(schema.appropriations)
          .set({
            obligated: appropriation.obligated - body.deobligateAmount,
            unobligatedBalance: appropriation.unobligatedBalance + body.deobligateAmount,
          })
          .where(eq(schema.appropriations.id, obligation.appropriationId))
          .run();
      }
    }

    // Handle direct status update
    if (body.status !== undefined && !body.liquidateAmount && !body.deobligateAmount) {
      updates.status = body.status;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    db.update(schema.dodObligations)
      .set(updates)
      .where(eq(schema.dodObligations.id, params.id))
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'update',
      entityType: 'obligation',
      entityId: params.id,
      engagementId: obligation.engagementId,
      details: { updatedFields: Object.keys(updates), ...body },
    });

    const updated = db.select().from(schema.dodObligations).where(eq(schema.dodObligations.id, params.id)).get();
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Obligation PATCH error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
