import { NextRequest, NextResponse } from 'next/server';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';
import { EvidencePackageGenerator } from '@/lib/reports/evidence-package';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { engagementId, fiscalYear } = body;

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId is required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const generator = new EvidencePackageGenerator();
    const evidencePackage = await generator.generatePackage(
      {
        engagementId,
        fiscalYear: fiscalYear || new Date().getFullYear(),
        classification: body.classification || 'unclassified',
        sections: body.sections || ['findings', 'trial_balance', 'journal_entries'],
        includeWorkpapers: body.includeWorkpapers ?? true,
        includeAuditLogs: body.includeAuditLogs ?? true,
        generatedBy: auth.user!.id,
      },
      body.engagementData || {
        engagementName: '',
        entityName: '',
        findings: [],
        correctiveActionPlans: [],
        trialBalance: [],
        journalEntries: [],
        ruleResults: [],
        auditLogs: [],
        workpapers: [],
        reconciliationResults: [],
        complianceScores: {},
      },
    );

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'evidence_package',
      engagementId,
      details: { fiscalYear, classification: body.classification },
    });

    return NextResponse.json({ data: evidencePackage }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
