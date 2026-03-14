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

    const orgs = db.select().from(schema.organizations).all();

    return NextResponse.json({ data: orgs });
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

    db.insert(schema.organizations)
      .values({
        id,
        parentId: body.parentId || null,
        code: body.code,
        name: body.name,
        abbreviation: body.abbreviation,
        componentType: body.componentType,
        status: body.status || 'active',
        dodComponentCode: body.dodComponentCode,
        treasuryAgencyCode: body.treasuryAgencyCode,
        level: body.level || 0,
        path: body.path || '/',
        createdAt: now,
      })
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'organization',
      entityId: id,
      engagementId,
      details: { code: body.code, componentType: body.componentType },
    });

    const created = db.select().from(schema.organizations).where(eq(schema.organizations.id, id)).get();
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
