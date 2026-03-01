import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { requireEngagementMember } from '@/lib/auth/guard';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const appropriationId = searchParams.get('appropriationId');
    const amountStr = searchParams.get('amount');

    if (!appropriationId) {
      return NextResponse.json({ error: 'appropriationId is required' }, { status: 400 });
    }

    const appropriation = db
      .select()
      .from(schema.appropriations)
      .where(eq(schema.appropriations.id, appropriationId))
      .get();

    if (!appropriation) {
      return NextResponse.json({ error: 'Appropriation not found' }, { status: 404 });
    }

    const auth = await requireEngagementMember(appropriation.engagementId);
    if (auth.error) return auth.error;

    // Get fund control records for this appropriation
    const fundControls = db
      .select()
      .from(schema.fundControls)
      .where(eq(schema.fundControls.appropriationId, appropriationId))
      .all();

    const totalAuthority = appropriation.totalAuthority;
    const apportioned = appropriation.apportioned;
    const allotted = appropriation.allotted;
    const obligated = appropriation.obligated;
    const disbursed = appropriation.disbursed;
    const unobligatedBalance = appropriation.unobligatedBalance;

    const requestedAmount = amountStr ? parseFloat(amountStr) : 0;
    const isFundsAvailable = requestedAmount <= unobligatedBalance;
    const exceedsApportionment = requestedAmount > (apportioned - obligated);
    const exceedsAllotment = requestedAmount > (allotted - obligated);

    return NextResponse.json({
      appropriationId,
      status: appropriation.status,
      totalAuthority,
      apportioned,
      allotted,
      obligated,
      disbursed,
      unobligatedBalance,
      fundControls,
      requestedAmount,
      fundsAvailable: isFundsAvailable,
      adaRisk: {
        exceedsApportionment,
        exceedsAllotment,
        exceedsTotalAuthority: requestedAmount > unobligatedBalance,
        appropriationExpired: appropriation.status !== 'current',
      },
    });
  } catch (error) {
    console.error('Fund control GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
