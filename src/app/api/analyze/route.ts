import { NextRequest, NextResponse } from 'next/server';
import { db, rawDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { gaapRules } from '@/lib/engine/rules/gaap';
import { irsRules } from '@/lib/engine/rules/irs';
import { soxRules } from '@/lib/engine/rules/sox';
import { pcaobRules } from '@/lib/engine/rules/pcaob';
import { runRules } from '@/lib/engine/rule-runner';
import type { EngagementData } from '@/types/findings';
import type { JournalEntry, JournalEntryLine, FinancialStatement, Account } from '@/types/financial';
import { getTaxYear } from '@/lib/engine/tax-parameters/utils';
import type { SOXControl } from '@/types/sox';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { engagementId, frameworks } = body;

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const engagement = db.select().from(schema.engagements).where(eq(schema.engagements.id, engagementId)).get();
    if (!engagement) {
      return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });
    }

    // Load all engagement data
    const accountsRaw = db.select().from(schema.accounts).where(eq(schema.accounts.engagementId, engagementId)).all();
    const accounts: Account[] = accountsRaw.map(a => ({
      ...a,
      accountType: a.accountType as Account['accountType'],
      subType: a.subType as Account['subType'],
    }));

    const trialBalance = db.select().from(schema.trialBalanceEntries).where(eq(schema.trialBalanceEntries.engagementId, engagementId)).all();

    const jeRaw = db.select().from(schema.journalEntries).where(eq(schema.journalEntries.engagementId, engagementId)).all();
    const journalEntries: JournalEntry[] = jeRaw.map(je => {
      const lines = db.select().from(schema.journalEntryLines).where(eq(schema.journalEntryLines.journalEntryId, je.id)).all();
      return {
        ...je,
        lines: lines.map(l => ({
          ...l,
          description: l.description || '',
          accountName: l.accountName || undefined,
        })),
      };
    });

    const fsRaw = db.select().from(schema.financialStatements).where(eq(schema.financialStatements.engagementId, engagementId)).all();
    const financialStatements: FinancialStatement[] = fsRaw.map(fs => ({
      ...fs,
      statementType: fs.statementType as FinancialStatement['statementType'],
      data: JSON.parse(fs.dataJson),
    }));

    const taxData = db.select().from(schema.taxData).where(eq(schema.taxData.engagementId, engagementId)).all();

    const soxControlsRaw = db.select().from(schema.soxControls).where(eq(schema.soxControls.engagementId, engagementId)).all();
    const soxControls: SOXControl[] = soxControlsRaw.map(c => ({
      ...c,
      controlType: c.controlType as SOXControl['controlType'],
      category: c.category as SOXControl['category'],
      frequency: c.frequency as SOXControl['frequency'],
      status: c.status as SOXControl['status'],
      assertion: JSON.parse(c.assertion),
      riskLevel: c.riskLevel as SOXControl['riskLevel'],
      automatedManual: c.automatedManual as SOXControl['automatedManual'],
    }));

    const engagementData: EngagementData = {
      engagementId,
      accounts,
      trialBalance,
      journalEntries,
      financialStatements,
      taxData,
      soxControls,
      materialityThreshold: engagement.materialityThreshold,
      fiscalYearEnd: engagement.fiscalYearEnd,
      taxYear: getTaxYear(engagement.fiscalYearEnd),
      entityType: engagement.entityType ?? undefined,
    };

    // Clear existing findings for re-analysis
    const frameworkList = frameworks || ['GAAP', 'IRS', 'SOX', 'PCAOB'];
    for (const fw of frameworkList) {
      db.delete(schema.findings)
        .where(eq(schema.findings.engagementId, engagementId))
        .run();
    }

    // Run rules for each framework
    const results: Record<string, any> = {};
    const allFindings: any[] = [];

    if (frameworkList.includes('GAAP')) {
      const gaapResult = runRules(gaapRules, engagementData);
      results.GAAP = { ...gaapResult, findings: gaapResult.findings.length };
      allFindings.push(...gaapResult.findings);
    }

    if (frameworkList.includes('IRS')) {
      const irsResult = runRules(irsRules, engagementData);
      results.IRS = { ...irsResult, findings: irsResult.findings.length };
      allFindings.push(...irsResult.findings);
    }

    if (frameworkList.includes('SOX')) {
      const soxResult = runRules(soxRules, engagementData);
      results.SOX = { ...soxResult, findings: soxResult.findings.length };
      allFindings.push(...soxResult.findings);
    }

    if (frameworkList.includes('PCAOB')) {
      const pcaobResult = runRules(pcaobRules, engagementData);
      results.PCAOB = { ...pcaobResult, findings: pcaobResult.findings.length };
      allFindings.push(...pcaobResult.findings);
    }

    // Save findings to database using raw SQLite for batch insert performance
    const insertFinding = rawDb.prepare(`INSERT INTO findings (id, engagement_id, rule_id, framework, severity, title, description, citation, remediation, amount_impact, affected_accounts, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    const insertAll = rawDb.transaction(() => {
      for (const f of allFindings) {
        insertFinding.run(
          f.id, f.engagementId, f.ruleId, f.framework, f.severity,
          f.title, f.description, f.citation, f.remediation,
          f.amountImpact, JSON.stringify(f.affectedAccounts),
          f.status, f.createdAt
        );
      }
    });

    insertAll();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'analyze',
      entityType: 'engagement',
      entityId: engagementId,
      engagementId,
      details: { frameworks: frameworkList, totalFindings: allFindings.length },
    });

    return NextResponse.json({
      success: true,
      totalFindings: allFindings.length,
      results,
      findings: allFindings,
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: 'Analysis failed: ' + (error as Error).message }, { status: 500 });
  }
}
