import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const appropriation = db
      .select()
      .from(schema.appropriations)
      .where(eq(schema.appropriations.id, params.id))
      .get();

    if (!appropriation) {
      return NextResponse.json({ error: 'Appropriation not found' }, { status: 404 });
    }

    const auth = await requireEngagementMember(appropriation.engagementId);
    if (auth.error) return auth.error;

    return NextResponse.json(appropriation);
  } catch (error) {
    console.error('Appropriation GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const appropriation = db
      .select()
      .from(schema.appropriations)
      .where(eq(schema.appropriations.id, params.id))
      .get();

    if (!appropriation) {
      return NextResponse.json({ error: 'Appropriation not found' }, { status: 404 });
    }

    const auth = await requireEngagementMember(appropriation.engagementId);
    if (auth.error) return auth.error;

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.apportioned !== undefined) updates.apportioned = body.apportioned;
    if (body.allotted !== undefined) updates.allotted = body.allotted;
    if (body.committed !== undefined) updates.committed = body.committed;
    if (body.obligated !== undefined) updates.obligated = body.obligated;
    if (body.disbursed !== undefined) updates.disbursed = body.disbursed;
    if (body.unobligatedBalance !== undefined) updates.unobligatedBalance = body.unobligatedBalance;
    if (body.status !== undefined) updates.status = body.status;
    if (body.expirationDate !== undefined) updates.expirationDate = body.expirationDate;
    if (body.cancellationDate !== undefined) updates.cancellationDate = body.cancellationDate;
    if (body.totalAuthority !== undefined) updates.totalAuthority = body.totalAuthority;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    db.update(schema.appropriations)
      .set(updates)
      .where(eq(schema.appropriations.id, params.id))
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'update',
      entityType: 'appropriation',
      entityId: params.id,
      engagementId: appropriation.engagementId,
      details: { updatedFields: Object.keys(updates) },
    });

    const updated = db.select().from(schema.appropriations).where(eq(schema.appropriations.id, params.id)).get();
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Appropriation PATCH error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
