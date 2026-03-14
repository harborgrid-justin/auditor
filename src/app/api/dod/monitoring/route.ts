import { NextRequest, NextResponse } from 'next/server';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId is required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const alerts = db
      .select()
      .from(schema.monitoringAlerts)
      .where(eq(schema.monitoringAlerts.engagementId, engagementId))
      .all();

    const configs = db
      .select()
      .from(schema.monitoringAlertConfigs)
      .where(eq(schema.monitoringAlertConfigs.engagementId, engagementId))
      .all();

    return NextResponse.json({ data: { alerts, configs } });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { engagementId, action } = body;

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId is required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    if (action === 'acknowledge' && body.alertId) {
      db.update(schema.monitoringAlerts)
        .set({
          status: 'acknowledged',
          acknowledgedBy: auth.user.id,
          acknowledgedAt: new Date().toISOString(),
        })
        .where(eq(schema.monitoringAlerts.id, body.alertId))
        .run();

      logAuditEvent({
        userId: auth.user.id,
        userName: auth.user.name,
        action: 'update',
        entityType: 'monitoring_alert',
        entityId: body.alertId,
        engagementId,
        details: { action: 'acknowledge' },
      });

      return NextResponse.json({ data: { id: body.alertId, status: 'acknowledged' } });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
