import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';
import { evaluateScopeLimitations } from '@/lib/engine/scope/scope-tracker';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const limitations = db.select().from(schema.scopeLimitations)
      .where(eq(schema.scopeLimitations.engagementId, engagementId))
      .all();

    const engagement = db.select().from(schema.engagements)
      .where(eq(schema.engagements.id, engagementId))
      .get();

    const evaluation = evaluateScopeLimitations(
      limitations.map(l => ({
        ...l,
        estimatedImpact: l.estimatedImpact ?? null,
        resolutionNotes: l.resolutionNotes ?? undefined,
      })),
      engagement?.materialityThreshold ?? 0
    );

    return NextResponse.json({ limitations, evaluation });
  } catch (error) {
    console.error('Scope limitations fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch scope limitations' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const body = await req.json();
    const { description, accountsAffected, estimatedImpact, pervasive = false, imposedBy } = body;

    const id = uuid();
    const now = new Date().toISOString();

    db.insert(schema.scopeLimitations).values({
      id,
      engagementId,
      description,
      accountsAffected,
      estimatedImpact: estimatedImpact ?? null,
      pervasive,
      imposedBy,
      resolved: false,
      identifiedBy: auth.user.id,
      identifiedAt: now,
    }).run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'engagement',
      entityId: id,
      engagementId,
      details: { type: 'scope_limitation', pervasive, imposedBy },
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error('Scope limitation creation error:', error);
    return NextResponse.json({ error: 'Failed to create scope limitation' }, { status: 500 });
  }
}
