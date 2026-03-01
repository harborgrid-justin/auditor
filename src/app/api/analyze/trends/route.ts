import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { performTrendAnalysis } from '@/lib/engine/analysis/trend-analysis';
import type { Account } from '@/types/financial';
import { requireEngagementMember } from '@/lib/auth/guard';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');
    if (!engagementId) return NextResponse.json({ error: 'engagementId required' }, { status: 400 });

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const engagement = db.select().from(schema.engagements).where(eq(schema.engagements.id, engagementId)).get();
    if (!engagement) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const accountsRaw = db.select().from(schema.accounts)
      .where(eq(schema.accounts.engagementId, engagementId)).all();

    const accounts: Account[] = accountsRaw.map(a => ({
      ...a,
      accountType: a.accountType as Account['accountType'],
      subType: a.subType as Account['subType'],
    }));

    const analysis = performTrendAnalysis(accounts, engagement.materialityThreshold);

    return NextResponse.json(analysis);
  } catch (error) {
    console.error('Trend analysis error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
