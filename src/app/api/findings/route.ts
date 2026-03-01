import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');
    const framework = searchParams.get('framework');
    const severity = searchParams.get('severity');

    let query = db.select().from(schema.findings);

    if (engagementId) {
      const conditions = [eq(schema.findings.engagementId, engagementId)];
      if (framework) {
        conditions.push(eq(schema.findings.framework, framework as 'GAAP' | 'IRS' | 'SOX' | 'PCAOB'));
      }
      if (severity) {
        conditions.push(eq(schema.findings.severity, severity as 'critical' | 'high' | 'medium' | 'low' | 'info'));
      }

      const results = db.select().from(schema.findings)
        .where(and(...conditions))
        .orderBy(desc(schema.findings.createdAt))
        .all();

      return NextResponse.json({ findings: results });
    }

    return NextResponse.json({ findings: [] });
  } catch (error) {
    console.error('Findings error:', error);
    return NextResponse.json({ findings: [] }, { status: 500 });
  }
}

const ALLOWED_STATUSES = ['open', 'resolved', 'accepted', 'in_review'] as const;
type FindingStatus = (typeof ALLOWED_STATUSES)[number];

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status } = body;

    if (!id || typeof status !== 'string' || !ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ error: 'id and valid status required' }, { status: 400 });
    }

    const typedStatus: FindingStatus = status;

    db.update(schema.findings)
      .set({ status: typedStatus })
      .where(eq(schema.findings.id, id))
      .run();

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
