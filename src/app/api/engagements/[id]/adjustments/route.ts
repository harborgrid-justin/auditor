import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';
import { evaluateSUD } from '@/lib/engine/adjustments/adjustment-tracker';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const adjustments = db.select().from(schema.auditAdjustments)
      .where(eq(schema.auditAdjustments.engagementId, engagementId))
      .all();

    const engagement = db.select().from(schema.engagements)
      .where(eq(schema.engagements.id, engagementId))
      .get();

    const sudSummary = evaluateSUD(
      adjustments.map(a => ({
        ...a,
        findingId: a.findingId ?? undefined,
      })),
      engagement?.materialityThreshold ?? 0
    );

    return NextResponse.json({ adjustments, sudSummary });
  } catch (error) {
    console.error('Adjustments fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch adjustments' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const body = await req.json();
    const {
      type,
      category = 'factual',
      description,
      debitAccountName,
      creditAccountName,
      amount,
      findingId,
      effectOnIncome = 0,
      effectOnAssets = 0,
      effectOnLiabilities = 0,
      effectOnEquity = 0,
    } = body;

    // Auto-generate adjustment number
    const existing = db.select().from(schema.auditAdjustments)
      .where(eq(schema.auditAdjustments.engagementId, engagementId))
      .all();
    const adjustmentNumber = `AJE-${(existing.length + 1).toString().padStart(3, '0')}`;

    const id = uuid();
    const now = new Date().toISOString();

    db.insert(schema.auditAdjustments).values({
      id,
      engagementId,
      adjustmentNumber,
      type,
      category,
      description,
      debitAccountName,
      creditAccountName,
      amount,
      findingId: findingId ?? null,
      effectOnIncome,
      effectOnAssets,
      effectOnLiabilities,
      effectOnEquity,
      proposedBy: auth.user.id,
      status: 'draft',
      createdAt: now,
    }).run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'engagement',
      entityId: id,
      engagementId,
      details: { type: 'audit_adjustment', adjustmentType: type, amount },
    });

    return NextResponse.json({ id, adjustmentNumber }, { status: 201 });
  } catch (error) {
    console.error('Adjustment creation error:', error);
    return NextResponse.json({ error: 'Failed to create adjustment' }, { status: 500 });
  }
}
