import { NextRequest, NextResponse } from 'next/server';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';
import { matchTradingPartners } from '@/lib/engine/federal-accounting/igt-reconciliation';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { engagementId } = body;

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId is required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const result = matchTradingPartners(body.buyerEntries || [], body.sellerEntries || []);

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'analyze',
      entityType: 'igt_reconciliation',
      engagementId,
      details: { fiscalYear: body.fiscalYear },
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
