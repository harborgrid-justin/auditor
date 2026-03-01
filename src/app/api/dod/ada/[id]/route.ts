import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const violation = db
      .select()
      .from(schema.adaViolations)
      .where(eq(schema.adaViolations.id, params.id))
      .get();

    if (!violation) {
      return NextResponse.json({ error: 'ADA violation not found' }, { status: 404 });
    }

    const auth = await requireEngagementMember(violation.engagementId);
    if (auth.error) return auth.error;

    // Include related appropriation details
    let appropriation = null;
    if (violation.appropriationId) {
      appropriation = db
        .select()
        .from(schema.appropriations)
        .where(eq(schema.appropriations.id, violation.appropriationId))
        .get();
    }

    return NextResponse.json({ violation, appropriation });
  } catch (error) {
    console.error('ADA violation GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const violation = db
      .select()
      .from(schema.adaViolations)
      .where(eq(schema.adaViolations.id, params.id))
      .get();

    if (!violation) {
      return NextResponse.json({ error: 'ADA violation not found' }, { status: 404 });
    }

    const auth = await requireEngagementMember(violation.engagementId);
    if (auth.error) return auth.error;

    const body = await req.json();
    const updates: Record<string, unknown> = {};

    if (body.investigationStatus !== undefined) updates.investigationStatus = body.investigationStatus;
    if (body.responsibleOfficer !== undefined) updates.responsibleOfficer = body.responsibleOfficer;
    if (body.correctiveAction !== undefined) updates.correctiveAction = body.correctiveAction;
    if (body.reportedDate !== undefined) updates.reportedDate = body.reportedDate;
    if (body.violationDetails !== undefined) updates.violationDetails = body.violationDetails;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    db.update(schema.adaViolations)
      .set(updates)
      .where(eq(schema.adaViolations.id, params.id))
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'update',
      entityType: 'ada_violation',
      entityId: params.id,
      engagementId: violation.engagementId,
      details: { updatedFields: Object.keys(updates), previousStatus: violation.investigationStatus },
    });

    const updated = db.select().from(schema.adaViolations).where(eq(schema.adaViolations.id, params.id)).get();
    return NextResponse.json(updated);
  } catch (error) {
    console.error('ADA violation PATCH error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
