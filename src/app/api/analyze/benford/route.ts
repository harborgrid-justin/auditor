import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { performBenfordAnalysis, performSecondDigitAnalysis } from '@/lib/engine/analysis/benford-analysis';
import { requireEngagementMember } from '@/lib/auth/guard';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');
    if (!engagementId) return NextResponse.json({ error: 'engagementId required' }, { status: 400 });

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    // Collect all monetary amounts from the engagement
    const amounts: number[] = [];

    // Trial balance amounts
    const tbEntries = db.select().from(schema.trialBalanceEntries)
      .where(eq(schema.trialBalanceEntries.engagementId, engagementId)).all();
    for (const tb of tbEntries) {
      if (tb.debit > 0) amounts.push(tb.debit);
      if (tb.credit > 0) amounts.push(tb.credit);
    }

    // Journal entry line amounts
    const jeRaw = db.select().from(schema.journalEntries)
      .where(eq(schema.journalEntries.engagementId, engagementId)).all();
    for (const je of jeRaw) {
      const lines = db.select().from(schema.journalEntryLines)
        .where(eq(schema.journalEntryLines.journalEntryId, je.id)).all();
      for (const line of lines) {
        if (line.debit > 0) amounts.push(line.debit);
        if (line.credit > 0) amounts.push(line.credit);
      }
    }

    // Account balances
    const accounts = db.select().from(schema.accounts)
      .where(eq(schema.accounts.engagementId, engagementId)).all();
    for (const acct of accounts) {
      if (acct.endingBalance !== 0) amounts.push(Math.abs(acct.endingBalance));
      if (acct.beginningBalance !== 0) amounts.push(Math.abs(acct.beginningBalance));
    }

    const firstDigit = performBenfordAnalysis(amounts);
    const secondDigit = performSecondDigitAnalysis(amounts);

    return NextResponse.json({ firstDigit, secondDigit, totalAmounts: amounts.length });
  } catch (error) {
    console.error('Benford analysis error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
