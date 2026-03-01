import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';
import { evaluateIndependence } from '@/lib/workflow/independence';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const confirmations = db.select().from(schema.independenceConfirmations)
      .where(eq(schema.independenceConfirmations.engagementId, engagementId))
      .all();

    const members = db.select().from(schema.engagementMembers)
      .where(eq(schema.engagementMembers.engagementId, engagementId))
      .all();

    const evaluation = evaluateIndependence(
      confirmations.map(c => ({
        ...c,
        threatsIdentified: c.threatsIdentified ?? undefined,
        safeguardsApplied: c.safeguardsApplied ?? undefined,
        nonAuditServices: c.nonAuditServices ?? undefined,
        feeArrangement: c.feeArrangement ?? undefined,
        confirmedAt: c.confirmedAt ?? undefined,
      })),
      members.length
    );

    return NextResponse.json({ confirmations, evaluation });
  } catch (error) {
    console.error('Independence fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch independence confirmations' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const body = await req.json();
    const {
      confirmationType = 'engagement_level',
      confirmed = true,
      threatsIdentified,
      safeguardsApplied,
      nonAuditServices,
      feeArrangement,
    } = body;

    const id = uuid();
    const now = new Date().toISOString();

    db.insert(schema.independenceConfirmations).values({
      id,
      engagementId,
      userId: auth.user.id,
      userName: auth.user.name,
      confirmationType,
      confirmed,
      threatsIdentified: threatsIdentified ?? null,
      safeguardsApplied: safeguardsApplied ?? null,
      nonAuditServices: nonAuditServices ?? null,
      feeArrangement: feeArrangement ?? null,
      confirmedAt: confirmed ? now : null,
    }).run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'engagement',
      entityId: id,
      engagementId,
      details: { type: 'independence_confirmation', confirmed },
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error('Independence confirmation error:', error);
    return NextResponse.json({ error: 'Failed to create independence confirmation' }, { status: 500 });
  }
}
