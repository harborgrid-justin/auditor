import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireEngagementMember(params.id);
    if (auth.error) return auth.error;

    const positions = db.select()
      .from(schema.uncertainTaxPositions)
      .where(eq(schema.uncertainTaxPositions.engagementId, params.id))
      .all();

    const totalReserve = positions.reduce((sum, p) => sum + p.totalReserve, 0);
    const totalInterest = positions.reduce((sum, p) => sum + p.interestAccrual, 0);
    const totalPenalties = positions.reduce((sum, p) => sum + p.penaltyAccrual, 0);

    return NextResponse.json({
      positions,
      summary: {
        count: positions.length,
        totalReserve,
        totalInterest,
        totalPenalties,
        totalExposure: totalReserve + totalInterest + totalPenalties,
      },
    });
  } catch (error) {
    console.error('UTP error:', error);
    return NextResponse.json({ error: 'Failed to retrieve uncertain tax positions' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireEngagementMember(params.id);
    if (auth.error) return auth.error;

    const body = await req.json();
    const {
      positionDescription, ircSection, taxYear, grossAmount,
      recognitionThresholdMet, technicalMeritsRating, measurementAmount,
      interestAccrual, penaltyAccrual, expirationDate,
    } = body;

    if (!positionDescription || !ircSection || !taxYear || grossAmount === undefined) {
      return NextResponse.json({ error: 'positionDescription, ircSection, taxYear, and grossAmount are required' }, { status: 400 });
    }

    const totalReserve = (measurementAmount ?? 0) + (interestAccrual ?? 0) + (penaltyAccrual ?? 0);
    const id = uuid();
    const now = new Date().toISOString();

    db.insert(schema.uncertainTaxPositions).values({
      id,
      engagementId: params.id,
      positionDescription,
      ircSection,
      taxYear,
      grossAmount,
      recognitionThresholdMet: recognitionThresholdMet ?? false,
      technicalMeritsRating: technicalMeritsRating ?? null,
      measurementAmount: measurementAmount ?? null,
      interestAccrual: interestAccrual ?? 0,
      penaltyAccrual: penaltyAccrual ?? 0,
      totalReserve,
      status: 'identified',
      expirationDate: expirationDate ?? null,
      createdBy: auth.user.id,
      createdAt: now,
    }).run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'engagement',
      entityId: id,
      engagementId: params.id,
      details: { type: 'uncertain_tax_position', ircSection, grossAmount },
    });

    return NextResponse.json({ id, success: true });
  } catch (error) {
    console.error('UTP creation error:', error);
    return NextResponse.json({ error: 'Failed to create uncertain tax position' }, { status: 500 });
  }
}
