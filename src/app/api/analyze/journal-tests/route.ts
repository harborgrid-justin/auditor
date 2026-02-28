import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { runJournalEntryTests } from '@/lib/engine/analysis/journal-entry-testing';
import type { JournalEntry } from '@/types/financial';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');
    if (!engagementId) return NextResponse.json({ error: 'engagementId required' }, { status: 400 });

    const engagement = db.select().from(schema.engagements).where(eq(schema.engagements.id, engagementId)).get();
    if (!engagement) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const jeRaw = db.select().from(schema.journalEntries)
      .where(eq(schema.journalEntries.engagementId, engagementId)).all();

    const journalEntries: JournalEntry[] = jeRaw.map(je => {
      const lines = db.select().from(schema.journalEntryLines)
        .where(eq(schema.journalEntryLines.journalEntryId, je.id)).all();
      return {
        ...je,
        lines: lines.map(l => ({
          ...l,
          description: l.description || '',
          accountName: l.accountName || undefined,
        })),
      };
    });

    const results = runJournalEntryTests(
      journalEntries,
      engagement.fiscalYearEnd,
      engagement.materialityThreshold
    );

    return NextResponse.json({ results, totalEntries: journalEntries.length });
  } catch (error) {
    console.error('JE testing error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
