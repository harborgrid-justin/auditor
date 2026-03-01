import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { requireEngagementMember } from '@/lib/auth/guard';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId is required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const violations = db
      .select()
      .from(schema.adaViolations)
      .where(eq(schema.adaViolations.engagementId, engagementId))
      .all();

    return NextResponse.json({ violations });
  } catch (error) {
    console.error('ADA violations GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
