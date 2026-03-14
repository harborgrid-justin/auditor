import { NextRequest, NextResponse } from 'next/server';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { engagementId, statementType, fiscalYear } = body;

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId is required' }, { status: 400 });
    }

    if (!statementType) {
      return NextResponse.json({ error: 'statementType is required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    // Dynamically load the appropriate report generator
    const generators: Record<string, () => Promise<unknown>> = {
      balance_sheet: async () => {
        const { generateBalanceSheet } = await import('@/lib/reports/federal/balance-sheet');
        return generateBalanceSheet({ engagementId, fiscalYear } as never);
      },
      net_cost: async () => {
        const { generateNetCostStatement } = await import('@/lib/reports/federal/net-cost-statement');
        return generateNetCostStatement({ engagementId, fiscalYear } as never);
      },
      changes_net_position: async () => {
        const { generateChangesInNetPosition } = await import('@/lib/reports/federal/changes-net-position');
        return generateChangesInNetPosition(body.data as never, fiscalYear);
      },
      custodial_activity: async () => {
        const { generateCustodialActivity } = await import('@/lib/reports/federal/custodial-activity');
        return generateCustodialActivity(body.data as never, fiscalYear);
      },
    };

    const generator = generators[statementType];
    if (!generator) {
      return NextResponse.json(
        { error: `Unknown statement type: ${statementType}` },
        { status: 400 },
      );
    }

    const result = await generator();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'financial_statement',
      engagementId,
      details: { statementType, fiscalYear },
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
