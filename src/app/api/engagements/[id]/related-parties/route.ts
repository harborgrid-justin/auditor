import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';
import { evaluateRelatedParties } from '@/lib/engine/related-parties/related-party-analysis';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const parties = db.select().from(schema.relatedParties)
      .where(eq(schema.relatedParties.engagementId, engagementId))
      .all();

    const transactions = db.select().from(schema.relatedPartyTransactions)
      .where(eq(schema.relatedPartyTransactions.engagementId, engagementId))
      .all();

    const engagement = db.select().from(schema.engagements)
      .where(eq(schema.engagements.id, engagementId))
      .get();

    const analysis = evaluateRelatedParties(
      parties.map(p => ({
        ...p,
        ownershipPct: p.ownershipPct ?? undefined,
        controlIndicators: p.controlIndicators ?? undefined,
      })),
      transactions.map(t => ({
        ...t,
        partyName: parties.find(p => p.id === t.relatedPartyId)?.partyName ?? 'Unknown',
        terms: t.terms ?? undefined,
        businessPurpose: t.businessPurpose ?? undefined,
      })),
      engagement?.materialityThreshold ?? 0
    );

    return NextResponse.json({ parties, transactions, analysis });
  } catch (error) {
    console.error('Related parties fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch related parties' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const body = await req.json();
    const { partyName, relationship, ownershipPct, controlIndicators } = body;

    const id = uuid();
    const now = new Date().toISOString();

    db.insert(schema.relatedParties).values({
      id,
      engagementId,
      partyName,
      relationship,
      ownershipPct: ownershipPct ?? null,
      controlIndicators: controlIndicators ?? null,
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
      details: { type: 'related_party', partyName, relationship },
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error('Related party creation error:', error);
    return NextResponse.json({ error: 'Failed to create related party' }, { status: 500 });
  }
}
