import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { requireEngagementMember } from '@/lib/auth/guard';
import { getTaxYear } from '@/lib/engine/tax-parameters/utils';
import { calculateAccuracyPenalty, calculateFailureToPayPenalty, assessPenaltyExposure } from '@/lib/engine/penalties/penalty-calculator';
import type { PenaltyAssessment } from '@/types/tax-compliance';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireEngagementMember(params.id);
    if (auth.error) return auth.error;

    const engagement = db.select()
      .from(schema.engagements)
      .where(eq(schema.engagements.id, params.id))
      .get();

    if (!engagement) {
      return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });
    }

    const taxYear = getTaxYear(engagement.fiscalYearEnd);

    // Load tax data to assess potential penalties
    const taxData = db.select()
      .from(schema.taxData)
      .where(eq(schema.taxData.engagementId, params.id))
      .all();

    const findings = db.select()
      .from(schema.findings)
      .where(eq(schema.findings.engagementId, params.id))
      .all();

    const assessments: PenaltyAssessment[] = [];

    // Check for accuracy-related penalty risk based on findings
    const materialFindings = findings.filter(f =>
      f.severity === 'critical' || f.severity === 'high'
    );
    const totalImpact = materialFindings.reduce((sum, f) => sum + Math.abs(f.amountImpact ?? 0), 0);

    if (totalImpact > 0) {
      // Estimate tax shown from tax data
      const taxShown = taxData.find(t =>
        t.formType === '1120' && t.lineNumber === '31'
      )?.amount ?? 0;

      if (taxShown > 0) {
        const accuracyAssessment = calculateAccuracyPenalty(
          totalImpact * 0.21, // Rough tax effect
          taxShown,
          false
        );
        if (accuracyAssessment.penaltyAmount > 0) {
          assessments.push(accuracyAssessment);
        }
      }
    }

    const summary = assessPenaltyExposure(params.id, taxYear, assessments);

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Penalties error:', error);
    return NextResponse.json({ error: 'Failed to assess penalty exposure' }, { status: 500 });
  }
}
