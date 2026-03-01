import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId is required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const orders = db
      .select()
      .from(schema.travelOrders)
      .where(eq(schema.travelOrders.engagementId, engagementId))
      .all();

    return NextResponse.json({ orders });
  } catch (error) {
    console.error('Travel orders GET error:', error);
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

    db.insert(schema.travelOrders)
      .values({
        id,
        engagementId,
        travelerId: body.travelerId,
        orderType: body.orderType,
        purpose: body.purpose,
        originLocation: body.originLocation,
        destinationLocation: body.destinationLocation,
        departDate: body.departDate,
        returnDate: body.returnDate,
        authorizedAmount: body.authorizedAmount,
        actualAmount: body.actualAmount || 0,
        perDiemRate: body.perDiemRate,
        lodgingRate: body.lodgingRate,
        mieRate: body.mieRate || 0,
        status: body.status || 'authorized',
        authorizingOfficial: body.authorizingOfficial,
        fiscalYear: body.fiscalYear || new Date().getFullYear(),
        createdAt: now,
      })
      .run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'travel_order',
      entityId: id,
      engagementId,
      details: {
        travelerId: body.travelerId,
        orderType: body.orderType,
        destination: body.destinationLocation,
        authorizedAmount: body.authorizedAmount,
      },
    });

    const created = db.select().from(schema.travelOrders).where(eq(schema.travelOrders.id, id)).get();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Travel orders POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
