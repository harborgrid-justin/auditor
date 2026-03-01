import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireAuth } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const comments = db
      .select()
      .from(schema.reviewComments)
      .where(eq(schema.reviewComments.findingId, params.id))
      .orderBy(desc(schema.reviewComments.createdAt))
      .all();

    return NextResponse.json({ comments });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = await req.json();
    const { comment, engagementId } = body;

    if (!comment || !engagementId) {
      return NextResponse.json({ error: 'comment and engagementId required' }, { status: 400 });
    }

    const id = uuid();
    const now = new Date().toISOString();

    db.insert(schema.reviewComments)
      .values({
        id,
        engagementId,
        findingId: params.id,
        userId: auth.user.id,
        userName: auth.user.name,
        comment,
        createdAt: now,
      })
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'finding',
      entityId: params.id,
      engagementId,
      details: { type: 'comment', commentId: id },
    });

    return NextResponse.json({ id, comment, createdAt: now }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
  }
}
