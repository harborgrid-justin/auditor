import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';
import { generateCoverageMatrix, getDefaultCoverageEntries } from '@/lib/engine/assertions/assertion-coverage';
import type { AssertionCoverageEntry } from '@/lib/engine/assertions/assertion-coverage';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const coverageEntries = db.select().from(schema.assertionCoverage)
      .where(eq(schema.assertionCoverage.engagementId, engagementId))
      .all();

    const accounts = db.select().from(schema.accounts)
      .where(eq(schema.accounts.engagementId, engagementId))
      .all();

    const engagement = db.select().from(schema.engagements)
      .where(eq(schema.engagements.id, engagementId))
      .get();

    const entries: AssertionCoverageEntry[] = coverageEntries.map(e => ({
      accountName: e.accountName,
      accountType: e.accountType,
      assertion: e.assertion as any,
      procedureType: e.procedureType as any,
      procedureDescription: e.procedureDescription,
      evidenceReference: e.evidenceReference ?? undefined,
      coveredBy: e.coveredBy,
      status: e.status as any,
    }));

    const matrix = generateCoverageMatrix(
      accounts.map(a => ({
        accountName: a.accountName,
        accountType: a.accountType,
        endingBalance: a.endingBalance,
      })),
      entries,
      engagement?.materialityThreshold ?? 0
    );

    return NextResponse.json({ entries: coverageEntries, matrix });
  } catch (error) {
    console.error('Assertion coverage fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch assertion coverage' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const body = await req.json();

    // If action is 'initialize', generate default coverage for all accounts
    if (body.action === 'initialize') {
      const accounts = db.select().from(schema.accounts)
        .where(eq(schema.accounts.engagementId, engagementId))
        .all();

      const engagement = db.select().from(schema.engagements)
        .where(eq(schema.engagements.id, engagementId))
        .get();

      const materialAccounts = accounts.filter(
        a => Math.abs(a.endingBalance) >= (engagement?.materialityThreshold ?? 0)
      );

      let created = 0;
      for (const account of materialAccounts) {
        const defaults = getDefaultCoverageEntries(
          account.accountName,
          account.accountType,
          auth.user.name
        );

        for (const entry of defaults) {
          db.insert(schema.assertionCoverage).values({
            id: uuid(),
            engagementId,
            accountId: account.id,
            accountName: entry.accountName,
            accountType: entry.accountType,
            assertion: entry.assertion,
            procedureType: entry.procedureType,
            procedureDescription: entry.procedureDescription,
            coveredBy: entry.coveredBy,
            status: 'planned',
          }).run();
          created++;
        }
      }

      logAuditEvent({
        userId: auth.user.id,
        userName: auth.user.name,
        action: 'create',
        entityType: 'engagement',
        entityId: engagementId,
        engagementId,
        details: { type: 'assertion_coverage_init', entriesCreated: created },
      });

      return NextResponse.json({ created }, { status: 201 });
    }

    // Single entry creation
    const {
      accountName,
      accountType,
      assertion,
      procedureType,
      procedureDescription,
      evidenceReference,
    } = body;

    const id = uuid();

    db.insert(schema.assertionCoverage).values({
      id,
      engagementId,
      accountName,
      accountType,
      assertion,
      procedureType,
      procedureDescription,
      evidenceReference: evidenceReference ?? null,
      coveredBy: auth.user.name,
      status: 'planned',
    }).run();

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    console.error('Assertion coverage creation error:', error);
    return NextResponse.json({ error: 'Failed to create assertion coverage' }, { status: 500 });
  }
}
