import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { requireEngagementMember } from '@/lib/auth/guard';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');
    const fiscalYearStr = searchParams.get('fiscalYear');
    const trackType = searchParams.get('trackType'); // 'proprietary' | 'budgetary' | 'all'

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId is required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const conditions = [eq(schema.ussglAccounts.engagementId, engagementId)];

    if (fiscalYearStr) {
      conditions.push(eq(schema.ussglAccounts.fiscalYear, parseInt(fiscalYearStr)));
    }

    if (trackType && trackType !== 'all') {
      conditions.push(eq(schema.ussglAccounts.accountType, trackType as 'proprietary' | 'budgetary'));
    }

    const accounts = db
      .select()
      .from(schema.ussglAccounts)
      .where(and(...conditions))
      .all();

    // Compute trial balance totals
    let totalDebits = 0;
    let totalCredits = 0;
    const proprietaryAccounts: typeof accounts = [];
    const budgetaryAccounts: typeof accounts = [];

    for (const account of accounts) {
      if (account.normalBalance === 'debit') {
        totalDebits += account.endBalance;
      } else {
        totalCredits += account.endBalance;
      }

      if (account.accountType === 'proprietary') {
        proprietaryAccounts.push(account);
      } else {
        budgetaryAccounts.push(account);
      }
    }

    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

    return NextResponse.json({
      accounts,
      trialBalance: {
        totalDebits,
        totalCredits,
        difference: totalDebits - totalCredits,
        isBalanced,
      },
      proprietary: {
        accounts: proprietaryAccounts,
        count: proprietaryAccounts.length,
      },
      budgetary: {
        accounts: budgetaryAccounts,
        count: budgetaryAccounts.length,
      },
      fiscalYear: fiscalYearStr ? parseInt(fiscalYearStr) : null,
    });
  } catch (error) {
    console.error('USSGL GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
