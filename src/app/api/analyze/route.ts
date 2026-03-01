import { NextRequest, NextResponse } from 'next/server';
import { db, rawDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { v4 as uuid } from 'uuid';
import { gaapRules } from '@/lib/engine/rules/gaap';
import { irsRules } from '@/lib/engine/rules/irs';
import { soxRules } from '@/lib/engine/rules/sox';
import { pcaobRules } from '@/lib/engine/rules/pcaob';
import { dodFmrRules } from '@/lib/engine/rules/dod_fmr';
import { runRules } from '@/lib/engine/rule-runner';
import type { EngagementData } from '@/types/findings';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { JournalEntry, JournalEntryLine, FinancialStatement, Account } from '@/types/financial';
import type { DoDEngagementData } from '@/types/dod-fmr';
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const fw of frameworkList) {
      db.delete(schema.findings)
        .where(eq(schema.findings.engagementId, engagementId))
        .run();
    }

    // Run rules for each framework
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: Record<string, any> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    if (frameworkList.includes('DOD_FMR')) {
      // Load DoD-specific data into engagementData
      const dodAppropriations = db.select().from(schema.appropriations).where(eq(schema.appropriations.engagementId, engagementId)).all();
      const dodObligations = db.select().from(schema.dodObligations).where(eq(schema.dodObligations.engagementId, engagementId)).all();
      const dodDisbursements = db.select().from(schema.dodDisbursements).where(eq(schema.dodDisbursements.engagementId, engagementId)).all();
      const dodCollections = db.select().from(schema.dodCollections).where(eq(schema.dodCollections.engagementId, engagementId)).all();
      const ussglAccts = db.select().from(schema.ussglAccounts).where(eq(schema.ussglAccounts.engagementId, engagementId)).all();
      const ussglTxns = db.select().from(schema.ussglTransactions).where(eq(schema.ussglTransactions.engagementId, engagementId)).all();
      const milPayRecords = db.select().from(schema.militaryPayRecords).where(eq(schema.militaryPayRecords.engagementId, engagementId)).all();
      const civPayRecords = db.select().from(schema.civilianPayRecords).where(eq(schema.civilianPayRecords.engagementId, engagementId)).all();
      const travelOrd = db.select().from(schema.travelOrders).where(eq(schema.travelOrders.engagementId, engagementId)).all();
      const travelVch = db.select().from(schema.dodTravelVouchers).where(eq(schema.dodTravelVouchers.engagementId, engagementId)).all();
      const travelCards = db.select().from(schema.travelCardTransactions).where(eq(schema.travelCardTransactions.engagementId, engagementId)).all();
      const dodContracts = db.select().from(schema.dodContracts).where(eq(schema.dodContracts.engagementId, engagementId)).all();
      const dodContractPmts = db.select().from(schema.dodContractPayments).where(eq(schema.dodContractPayments.engagementId, engagementId)).all();
      const iaaRecords = db.select().from(schema.interagencyAgreements).where(eq(schema.interagencyAgreements.engagementId, engagementId)).all();
      const igtRecords = db.select().from(schema.intragovernmentalTransactions).where(eq(schema.intragovernmentalTransactions.engagementId, engagementId)).all();
      const wcfRecords = db.select().from(schema.workingCapitalFunds).where(eq(schema.workingCapitalFunds.engagementId, engagementId)).all();
      const specAccts = db.select().from(schema.specialAccountsTable).where(eq(schema.specialAccountsTable.engagementId, engagementId)).all();
      const nafAccts = db.select().from(schema.nafAccounts).where(eq(schema.nafAccounts.engagementId, engagementId)).all();
      const adaViols = db.select().from(schema.adaViolations).where(eq(schema.adaViolations.engagementId, engagementId)).all();
      const fiarRecs = db.select().from(schema.fiarAssessments).where(eq(schema.fiarAssessments.engagementId, engagementId)).all();
      const fundCtls = db.select().from(schema.fundControls).where(eq(schema.fundControls.engagementId, engagementId)).all();
      const bocRecords = db.select().from(schema.budgetObjectCodes).all();
      const sfisRecs = db.select().from(schema.sfisElements).where(eq(schema.sfisElements.engagementId, engagementId)).all();

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const dodData: DoDEngagementData = {
        appropriations: dodAppropriations as any,
        obligations: dodObligations as any,
        disbursements: dodDisbursements as any,
        collections: dodCollections as any,
        ussglAccounts: ussglAccts as any,
        ussglTransactions: ussglTxns as any,
        militaryPayRecords: milPayRecords as any,
        civilianPayRecords: civPayRecords as any,
        travelOrders: travelOrd as any,
        travelVouchers: travelVch as any,
        travelCardTransactions: travelCards as any,
        contractPayments: dodContractPmts as any,
        contracts: dodContracts as any,
        interagencyAgreements: iaaRecords as any,
        intragovernmentalTransactions: igtRecords as any,
        workingCapitalFunds: wcfRecords as any,
        specialAccounts: specAccts as any,
        nafAccounts: nafAccts as any,
        adaViolations: adaViols as any,
        fiarAssessments: fiarRecs as any,
        fundControls: fundCtls as any,
        budgetObjectCodes: bocRecords as any,
        sfisElements: sfisRecs as any,
        fiscalYear: getTaxYear(engagement.fiscalYearEnd),
        dodComponent: engagement.entityName,
      };
      /* eslint-enable @typescript-eslint/no-explicit-any */

      engagementData.dodData = dodData;

      const dodResult = runRules(dodFmrRules, engagementData);
      results.DOD_FMR = { ...dodResult, findings: dodResult.findings.length };
      allFindings.push(...dodResult.findings);
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
