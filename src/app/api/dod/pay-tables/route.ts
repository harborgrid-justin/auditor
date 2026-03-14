import { NextRequest, NextResponse } from 'next/server';
import { requireEngagementMember } from '@/lib/auth/guard';
import { lookupBasePay, type MilitaryGrade } from '@/lib/engine/dod-pay/military-pay-tables';
import { lookupGSBasePay, type GSGrade, type GSStep } from '@/lib/engine/dod-pay/civilian-pay-tables';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');
    const payType = searchParams.get('type') || 'military';
    const payGrade = searchParams.get('payGrade') || 'E-1';
    const yearsOfService = parseInt(searchParams.get('yearsOfService') || '0', 10);
    const fiscalYear = parseInt(searchParams.get('fiscalYear') || String(new Date().getFullYear()), 10);

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId is required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    if (payType === 'civilian') {
      const grade = parseInt(searchParams.get('grade') || '1', 10);
      const step = parseInt(searchParams.get('step') || '1', 10);
      const result = lookupGSBasePay(fiscalYear, grade as unknown as GSGrade, step as unknown as GSStep);
      return NextResponse.json({ data: { type: payType, fiscalYear, result } });
    }

    const result = lookupBasePay(fiscalYear, payGrade as unknown as MilitaryGrade, yearsOfService);
    return NextResponse.json({ data: { type: payType, fiscalYear, result } });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
