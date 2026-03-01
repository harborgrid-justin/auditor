import { NextRequest, NextResponse } from 'next/server';
import { getAllParametersForYear, getParameterDefinitions } from '@/lib/engine/tax-parameters/registry';
import { requireAuth, requireRole } from '@/lib/auth/guard';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const taxYear = searchParams.get('taxYear');
    const entityType = searchParams.get('entityType') ?? undefined;

    if (!taxYear) {
      // Return parameter definitions (metadata)
      const definitions = getParameterDefinitions();
      return NextResponse.json({ definitions });
    }

    const year = parseInt(taxYear, 10);
    if (isNaN(year) || year < 2000 || year > 2050) {
      return NextResponse.json({ error: 'Invalid tax year' }, { status: 400 });
    }

    const parameters = getAllParametersForYear(year, entityType);
    return NextResponse.json({
      taxYear: year,
      entityType: entityType ?? 'all',
      parameterCount: parameters.length,
      parameters,
    });
  } catch (error) {
    console.error('Tax parameters error:', error);
    return NextResponse.json({ error: 'Failed to retrieve tax parameters' }, { status: 500 });
  }
}
