import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { requireAuth, requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent, logFindingChange } from '@/lib/audit/logger';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');
    const framework = searchParams.get('framework');
    const severity = searchParams.get('severity');

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const query = db.select().from(schema.findings);

    if (engagementId) {
      const conditions = [eq(schema.findings.engagementId, engagementId)];
      if (framework) {
        conditions.push(eq(schema.findings.framework, framework as 'GAAP' | 'IRS' | 'SOX' | 'PCAOB'));
      }
      if (severity) {
        conditions.push(eq(schema.findings.severity, severity as 'critical' | 'high' | 'medium' | 'low' | 'info'));
      }

      const results = db.select().from(schema.findings)
        .where(and(...conditions))
        .orderBy(desc(schema.findings.createdAt))
        .all();

      return NextResponse.json({ findings: results });
    }

    return NextResponse.json({ findings: [] });
  } catch (error) {
    console.error('Findings error:', error);
    return NextResponse.json({ findings: [] }, { status: 500 });
  }
}

const ALLOWED_STATUSES = ['open', 'resolved', 'accepted', 'in_review', 'reviewer_approved', 'reviewer_rejected'] as const;
type FindingStatus = (typeof ALLOWED_STATUSES)[number];

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = await req.json();
    const { id, status, comment } = body;

    if (!id || typeof status !== 'string' || !ALLOWED_STATUSES.includes(status as FindingStatus)) {
      return NextResponse.json({ error: 'id and valid status required' }, { status: 400 });
    }

    // Get current finding to track the change
    const existing = db.select().from(schema.findings).where(eq(schema.findings.id, id)).get();
    if (!existing) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
    }

    const typedStatus = status as FindingStatus;

    db.update(schema.findings)
      .set({ status: typedStatus })
      .where(eq(schema.findings.id, id))
      .run();

    // Log finding history change
    logFindingChange(
      id,
      existing.engagementId,
      auth.user.id,
      'status',
      existing.status,
      typedStatus
    );

    // Log workflow transition
    db.insert(schema.workflowTransitions).values({
      id: uuid(),
      findingId: id,
      engagementId: existing.engagementId,
      fromStatus: existing.status,
      toStatus: typedStatus,
      changedBy: auth.user.id,
      changerName: auth.user.name,
      comment: comment || null,
      changedAt: new Date().toISOString(),
    }).run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'update',
      entityType: 'finding',
      entityId: id,
      engagementId: existing.engagementId,
      details: { oldStatus: existing.status, newStatus: typedStatus },
    });

    return NextResponse.json({ success: true });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
