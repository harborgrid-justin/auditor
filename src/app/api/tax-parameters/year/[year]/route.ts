import { NextRequest, NextResponse } from 'next/server';
import { getAllParametersForYear, getParameterRecord } from '@/lib/engine/tax-parameters/registry';
import { requireAuth } from '@/lib/auth/guard';

export async function GET(
  req: NextRequest,
  { params }: { params: { year: string } }
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const year = parseInt(params.year, 10);
    if (isNaN(year) || year < 2000 || year > 2050) {
      return NextResponse.json({ error: 'Invalid tax year' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get('entityType') ?? undefined;
    const code = searchParams.get('code');

    if (code) {
      const param = getParameterRecord(code, year, entityType);
      if (!param) {
        return NextResponse.json({ error: `Parameter '${code}' not found for year ${year}` }, { status: 404 });
      }
      return NextResponse.json({ parameter: param });
    }

    const parameters = getAllParametersForYear(year, entityType);
    return NextResponse.json({
      taxYear: year,
      entityType: entityType ?? 'all',
      parameterCount: parameters.length,
      parameters,
    });
  } catch (error) {
    console.error('Tax parameters year error:', error);
    return NextResponse.json({ error: 'Failed to retrieve tax parameters' }, { status: 500 });
  }
}
