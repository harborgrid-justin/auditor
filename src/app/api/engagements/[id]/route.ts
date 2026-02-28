import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const engagement = db.select().from(schema.engagements).where(eq(schema.engagements.id, params.id)).get();
    if (!engagement) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json(engagement);
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const { status, materialityThreshold } = body;

    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (materialityThreshold !== undefined) updates.materialityThreshold = materialityThreshold;

    if (Object.keys(updates).length > 0) {
      db.update(schema.engagements).set(updates).where(eq(schema.engagements.id, params.id)).run();
    }

    const updated = db.select().from(schema.engagements).where(eq(schema.engagements.id, params.id)).get();
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
