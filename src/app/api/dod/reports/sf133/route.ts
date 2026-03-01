import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { requireEngagementMember } from '@/lib/auth/guard';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');
    const fiscalYearStr = searchParams.get('fiscalYear');
    const period = searchParams.get('period'); // e.g., 'Q1', 'Q2', 'Q3', 'Q4', 'annual'

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId is required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const fiscalYear = fiscalYearStr ? parseInt(fiscalYearStr) : new Date().getFullYear();

    // Fetch all appropriations for this engagement
    const appropriations = db
      .select()
      .from(schema.appropriations)
      .where(eq(schema.appropriations.engagementId, engagementId))
      .all();

    // Fetch obligations for this engagement
    const obligations = db
      .select()
      .from(schema.dodObligations)
      .where(
        and(
          eq(schema.dodObligations.engagementId, engagementId),
          eq(schema.dodObligations.fiscalYear, fiscalYear)
        )
      )
      .all();

    // Fetch disbursements for this engagement
    const disbursements = db
      .select()
      .from(schema.dodDisbursements)
      .where(eq(schema.dodDisbursements.engagementId, engagementId))
      .all();

    // SF-133 Section 1: Budgetary Resources
    const totalBudgetaryResources = appropriations.reduce((sum, a) => sum + a.totalAuthority, 0);
    const totalApportioned = appropriations.reduce((sum, a) => sum + a.apportioned, 0);

    // SF-133 Section 2: Status of Budgetary Resources
    const totalObligationsIncurred = obligations.reduce((sum, o) => sum + o.amount, 0);
    const totalUnobligatedBalance = appropriations.reduce((sum, a) => sum + a.unobligatedBalance, 0);
    const totalApportionedUnobligated = appropriations.reduce(
      (sum, a) => sum + (a.apportioned - a.obligated),
      0
    );

    // SF-133 Section 3: Outlays
    const totalDisbursements = disbursements.reduce((sum, d) => sum + d.amount, 0);
    const totalCollections = 0; // Would need collections table data
    const netOutlays = totalDisbursements - totalCollections;

    // Build per-appropriation detail lines
    const lineItems = appropriations.map((approp) => {
      const appropObligations = obligations.filter((o) => o.appropriationId === approp.id);
      const obligationTotal = appropObligations.reduce((sum, o) => sum + o.amount, 0);

      return {
        treasuryAccountSymbol: approp.treasuryAccountSymbol,
        appropriationTitle: approp.appropriationTitle,
        budgetCategory: approp.budgetCategory,
        totalAuthority: approp.totalAuthority,
        apportioned: approp.apportioned,
        allotted: approp.allotted,
        obligationsIncurred: obligationTotal,
        unobligatedBalance: approp.unobligatedBalance,
        disbursed: approp.disbursed,
        status: approp.status,
      };
    });

    return NextResponse.json({
      report: 'SF-133',
      title: 'Report on Budget Execution and Budgetary Resources',
      engagementId,
      fiscalYear,
      period: period || 'annual',
      generatedAt: new Date().toISOString(),
      section1_budgetaryResources: {
        totalBudgetaryResources,
        appropriationsReceived: totalBudgetaryResources,
        apportioned: totalApportioned,
      },
      section2_statusOfBudgetaryResources: {
        obligationsIncurred: totalObligationsIncurred,
        unobligatedBalance: {
          apportioned: totalApportionedUnobligated,
          unapportioned: totalUnobligatedBalance - totalApportionedUnobligated,
          total: totalUnobligatedBalance,
        },
        totalStatus: totalObligationsIncurred + totalUnobligatedBalance,
      },
      section3_outlays: {
        grossDisbursements: totalDisbursements,
        offsettingCollections: totalCollections,
        netOutlays,
      },
      lineItems,
    });
  } catch (error) {
    console.error('SF-133 report GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
