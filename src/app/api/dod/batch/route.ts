import { NextRequest, NextResponse } from 'next/server';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId is required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const jobs = db
      .select()
      .from(schema.batchJobs)
      .where(eq(schema.batchJobs.engagementId, engagementId))
      .all();

    return NextResponse.json({ data: jobs });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { engagementId } = body;

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId is required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const id = uuid();
    const now = new Date().toISOString();

    db.insert(schema.batchJobs)
      .values({
        id,
        engagementId,
        batchType: body.batchType,
        status: 'pending',
        totalRecords: body.totalRecords || 0,
        processedRecords: 0,
        successfulRecords: 0,
        failedRecords: 0,
        dryRun: body.dryRun || false,
        fiscalYear: body.fiscalYear || new Date().getFullYear(),
        startedBy: auth.user.id,
        startedAt: now,
      })
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'batch_job',
      entityId: id,
      engagementId,
      details: { batchType: body.batchType, dryRun: body.dryRun },
    });

    const created = db.select().from(schema.batchJobs).where(eq(schema.batchJobs.id, id)).get();
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
