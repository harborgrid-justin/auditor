import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { requireEngagementMember } from '@/lib/auth/guard';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireEngagementMember(params.id);
    if (auth.error) return auth.error;

    const controls = db.select().from(schema.soxControls)
      .where(eq(schema.soxControls.engagementId, params.id))
      .all();

    const controlsWithTests = controls.map(c => {
      const tests = db.select().from(schema.soxTestResults)
        .where(eq(schema.soxTestResults.controlId, c.id))
        .all();
      return {
        ...c,
        assertion: JSON.parse(c.assertion),
        testResults: tests,
      };
    });

    return NextResponse.json({ controls: controlsWithTests });
  } catch (error) {
    return NextResponse.json({ controls: [] }, { status: 500 });
  }
}
