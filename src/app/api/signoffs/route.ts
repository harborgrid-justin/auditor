import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireRole } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireRole(['admin', 'auditor', 'reviewer']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');
    const entityType = searchParams.get('entityType');
    const entityId = searchParams.get('entityId');

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId required' }, { status: 400 });
    }

    const conditions = [eq(schema.signoffs.engagementId, engagementId)];
    if (entityType) conditions.push(eq(schema.signoffs.entityType, entityType as 'finding' | 'control' | 'engagement'));
    if (entityId) conditions.push(eq(schema.signoffs.entityId, entityId));

    const sigs = db
      .select()
      .from(schema.signoffs)
      .where(and(...conditions))
      .orderBy(desc(schema.signoffs.signedAt))
      .all();

    return NextResponse.json({ signoffs: sigs });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch signoffs' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Only reviewers and admins can sign off
    const auth = await requireRole(['admin', 'reviewer']);
    if (auth.error) return auth.error;

    const body = await req.json();
    const { engagementId, entityType, entityId, opinion } = body;

    if (!engagementId || !entityType || !entityId) {
      return NextResponse.json(
        { error: 'engagementId, entityType, and entityId are required' },
        { status: 400 }
      );
    }

    const id = uuid();
    const now = new Date().toISOString();

    // Sign-off records are immutable — append only
    db.insert(schema.signoffs)
      .values({
        id,
        engagementId,
        entityType: body.entityType as 'finding' | 'control' | 'engagement',
        entityId,
        signedBy: auth.user.id,
        signerName: auth.user.name,
        role: auth.user.role,
        opinion: opinion || null,
        signedAt: now,
      })
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'signoff',
      entityId: id,
      engagementId,
      details: { entityType, entityId, opinion },
    });

    return NextResponse.json({ id, signedAt: now }, { status: 201 });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create signoff' }, { status: 500 });
  }
}
