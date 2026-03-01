import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireAuth, requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');
    const findingId = searchParams.get('findingId');
    const controlId = searchParams.get('controlId');

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId required' }, { status: 400 });
    }

    const conditions = [eq(schema.workpapers.engagementId, engagementId)];
    if (findingId) conditions.push(eq(schema.workpapers.findingId, findingId));
    if (controlId) conditions.push(eq(schema.workpapers.controlId, controlId));

    const papers = db
      .select()
      .from(schema.workpapers)
      .where(and(...conditions))
      .orderBy(desc(schema.workpapers.uploadedAt))
      .all();

    return NextResponse.json({ workpapers: papers });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch workpapers' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const engagementId = formData.get('engagementId') as string;
    const findingId = formData.get('findingId') as string | null;
    const controlId = formData.get('controlId') as string | null;
    const description = formData.get('description') as string | null;

    if (!file || !engagementId) {
      return NextResponse.json({ error: 'file and engagementId required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 50MB limit' }, { status: 400 });
    }

    const id = uuid();
    const now = new Date().toISOString();

    db.insert(schema.workpapers)
      .values({
        id,
        engagementId,
        findingId: findingId || null,
        controlId: controlId || null,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        uploadedBy: auth.user.id,
        uploadedAt: now,
        description: description || null,
      })
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'upload',
      entityType: 'workpaper',
      entityId: id,
      engagementId,
      details: { fileName: file.name, fileSize: file.size },
    });

    return NextResponse.json({ id, fileName: file.name }, { status: 201 });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    return NextResponse.json({ error: 'Failed to upload workpaper' }, { status: 500 });
  }
}
