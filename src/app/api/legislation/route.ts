import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { getActiveLegislation, getSunsetAlerts } from '@/lib/engine/legislation/tracker';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const taxYear = searchParams.get('taxYear');
    const alertsOnly = searchParams.get('alerts') === 'true';

    if (!taxYear) {
      return NextResponse.json({ error: 'taxYear query parameter required' }, { status: 400 });
    }

    const year = parseInt(taxYear, 10);
    if (isNaN(year) || year < 2000 || year > 2050) {
      return NextResponse.json({ error: 'Invalid tax year' }, { status: 400 });
    }

    if (alertsOnly) {
      const alerts = getSunsetAlerts(year);
      return NextResponse.json({ taxYear: year, alertCount: alerts.length, alerts });
    }

    const legislation = getActiveLegislation(year);
    const alerts = getSunsetAlerts(year);

    return NextResponse.json({
      taxYear: year,
      legislationCount: legislation.length,
      legislation,
      alertCount: alerts.length,
      alerts,
    });
  } catch (error) {
    console.error('Legislation error:', error);
    return NextResponse.json({ error: 'Failed to retrieve legislation data' }, { status: 500 });
  }
}
