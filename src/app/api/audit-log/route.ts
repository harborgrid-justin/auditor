import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { requireRole } from '@/lib/auth/guard';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireRole(['admin', 'reviewer']);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');
    const action = searchParams.get('action');
    const entityType = searchParams.get('entityType');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 1000);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const conditions = [];

    if (engagementId) {
      conditions.push(eq(schema.auditLogs.engagementId, engagementId));
    }
    if (action) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      conditions.push(eq(schema.auditLogs.action, action as any));
    }
    if (entityType) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      conditions.push(eq(schema.auditLogs.entityType, entityType as any));
    }
    if (startDate) {
      conditions.push(gte(schema.auditLogs.timestamp, startDate));
    }
    if (endDate) {
      conditions.push(lte(schema.auditLogs.timestamp, endDate));
    }

    const logs = db
      .select()
      .from(schema.auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(schema.auditLogs.timestamp))
      .limit(limit)
      .offset(offset)
      .all();

    return NextResponse.json({ logs, count: logs.length });
  } catch (error) {
    console.error('Audit log query error:', error);
    return NextResponse.json({ error: 'Failed to query audit logs' }, { status: 500 });
  }
}
