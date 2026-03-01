import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireRole } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';

export async function GET() {
  try {
    const auth = await requireRole(['admin', 'auditor', 'reviewer']);
    if (auth.error) return auth.error;

    const templates = db
      .select()
      .from(schema.engagementTemplates)
      .orderBy(desc(schema.engagementTemplates.createdAt))
      .all();

    return NextResponse.json({ templates });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(['admin']);
    if (auth.error) return auth.error;

    const body = await req.json();
    const { name, description, entityType, industry, defaultMateriality, frameworksJson, soxControlsJson } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const id = uuid();
    const now = new Date().toISOString();

    db.insert(schema.engagementTemplates)
      .values({
        id,
        name,
        description: description || null,
        entityType: entityType || null,
        industry: industry || null,
        defaultMateriality: defaultMateriality || 0,
        frameworksJson: frameworksJson || null,
        soxControlsJson: soxControlsJson || null,
        createdBy: auth.user.id,
        createdAt: now,
      })
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'template',
      entityId: id,
      details: { name },
    });

    return NextResponse.json({ id, name }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
