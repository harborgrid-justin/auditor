import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '@/lib/auth/guard';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId required' }, { status: 400 });
    }

    const engagement = db
      .select()
      .from(schema.engagements)
      .where(eq(schema.engagements.id, engagementId))
      .get();

    if (!engagement) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Fetch findings for this engagement
    const findings = db
      .select({
        id: schema.findings.id,
        framework: schema.findings.framework,
        severity: schema.findings.severity,
        title: schema.findings.title,
        description: schema.findings.description,
        remediation: schema.findings.remediation,
        status: schema.findings.status,
        createdAt: schema.findings.createdAt,
      })
      .from(schema.findings)
      .where(eq(schema.findings.engagementId, engagementId))
      .orderBy(desc(schema.findings.createdAt))
      .all();

    return NextResponse.json({
      entityName: engagement.entityName,
      engagementName: engagement.name,
      status: engagement.status,
      findings,
    });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch findings' }, { status: 500 });
  }
}
