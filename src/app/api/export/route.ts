import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';
import { generateAuditReport } from '@/lib/reports/pdf-generator';
import { generateManagementLetter } from '@/lib/reports/management-letter';
import { determineOpinion } from '@/lib/reports/audit-opinion';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const engagementId = searchParams.get('engagementId');
    const format = searchParams.get('format') || 'excel';
    const type = searchParams.get('type') || 'summary';

    if (!engagementId) {
      return NextResponse.json({ error: 'engagementId required' }, { status: 400 });
    }

    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const engagement = db.select().from(schema.engagements).where(eq(schema.engagements.id, engagementId)).get();
    if (!engagement) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const findings = db.select().from(schema.findings).where(eq(schema.findings.engagementId, engagementId)).all();
    const controls = db.select().from(schema.soxControls).where(eq(schema.soxControls.engagementId, engagementId)).all();
    const accounts = db.select().from(schema.accounts).where(eq(schema.accounts.engagementId, engagementId)).all();

    if (format === 'excel') {
      const wb = XLSX.utils.book_new();

      // Executive Summary Sheet
      const summaryData = [
        ['AuditPro - Audit Report'],
        [''],
        ['Entity:', engagement.entityName],
        ['Engagement:', engagement.name],
        ['Fiscal Year End:', engagement.fiscalYearEnd],
        ['Status:', engagement.status],
        ['Materiality Threshold:', engagement.materialityThreshold],
        ['Generated:', new Date().toISOString()],
        [''],
        ['FINDINGS SUMMARY'],
        ['Total Findings:', findings.length],
        ['Critical:', findings.filter(f => f.severity === 'critical').length],
        ['High:', findings.filter(f => f.severity === 'high').length],
        ['Medium:', findings.filter(f => f.severity === 'medium').length],
        ['Low:', findings.filter(f => f.severity === 'low').length],
        ['Info:', findings.filter(f => f.severity === 'info').length],
        [''],
        ['By Framework:'],
        ['GAAP:', findings.filter(f => f.framework === 'GAAP').length],
        ['IRS:', findings.filter(f => f.framework === 'IRS').length],
        ['SOX:', findings.filter(f => f.framework === 'SOX').length],
        ['PCAOB:', findings.filter(f => f.framework === 'PCAOB').length],
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Executive Summary');

      // Detailed Findings Sheet
      const findingsData = [
        ['ID', 'Framework', 'Severity', 'Title', 'Description', 'Citation', 'Remediation', 'Amount Impact', 'Status', 'Date'],
        ...findings.map(f => [
          f.ruleId, f.framework, f.severity, f.title, f.description, f.citation,
          f.remediation, f.amountImpact || '', f.status, f.createdAt
        ])
      ];
      const findingsSheet = XLSX.utils.aoa_to_sheet(findingsData);
      XLSX.utils.book_append_sheet(wb, findingsSheet, 'Findings Detail');

      // SOX Controls Sheet
      if (controls.length > 0) {
        const soxData = [
          ['Control ID', 'Title', 'Description', 'Type', 'Category', 'Frequency', 'Owner', 'Status', 'Risk Level', 'Assertions'],
          ...controls.map(c => [
            c.controlId, c.title, c.description, c.controlType, c.category,
            c.frequency, c.owner, c.status, c.riskLevel, c.assertion
          ])
        ];
        const soxSheet = XLSX.utils.aoa_to_sheet(soxData);
        XLSX.utils.book_append_sheet(wb, soxSheet, 'SOX Controls');
      }

      // Trial Balance Sheet
      if (accounts.length > 0) {
        const tbData = [
          ['Account #', 'Account Name', 'Type', 'Sub-Type', 'Beginning Balance', 'Ending Balance', 'Change', 'Change %'],
          ...accounts.map(a => [
            a.accountNumber, a.accountName, a.accountType, a.subType,
            a.beginningBalance, a.endingBalance,
            a.endingBalance - a.beginningBalance,
            a.beginningBalance !== 0 ? ((a.endingBalance - a.beginningBalance) / Math.abs(a.beginningBalance) * 100).toFixed(1) + '%' : 'N/A'
          ])
        ];
        const tbSheet = XLSX.utils.aoa_to_sheet(tbData);
        XLSX.utils.book_append_sheet(wb, tbSheet, 'Trial Balance');
      }

      const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${engagement.entityName.replace(/[^a-zA-Z0-9]/g, '_')}_Audit_Report.xlsx"`,
        },
      });
    }

    const now = new Date().toISOString();

    // Management letter
    if (type === 'management_letter') {
      const letter = generateManagementLetter({
        entityName: engagement.entityName,
        engagementName: engagement.name,
        fiscalYearEnd: engagement.fiscalYearEnd,
        findings,
        controls,
        materialityThreshold: engagement.materialityThreshold,
        generatedAt: now,
      });

      logAuditEvent({
        userId: auth.user.id,
        userName: auth.user.name,
        action: 'export',
        entityType: 'engagement',
        entityId: engagementId,
        engagementId,
        details: { type: 'management_letter' },
      });

      return new NextResponse(letter, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${engagement.entityName.replace(/[^a-zA-Z0-9]/g, '_')}_Management_Letter.txt"`,
        },
      });
    }

    // Audit opinion
    if (type === 'audit_opinion') {
      const opinion = determineOpinion({
        entityName: engagement.entityName,
        fiscalYearEnd: engagement.fiscalYearEnd,
        findings,
        controls,
        materialityThreshold: engagement.materialityThreshold,
        generatedAt: now,
      });

      logAuditEvent({
        userId: auth.user.id,
        userName: auth.user.name,
        action: 'export',
        entityType: 'engagement',
        entityId: engagementId,
        engagementId,
        details: { type: 'audit_opinion', opinionType: opinion.opinionType },
      });

      return NextResponse.json(opinion);
    }

    // PDF format - full audit report as text document
    if (format === 'pdf') {
      const report = generateAuditReport({
        engagement,
        findings,
        controls,
        accounts,
        generatedBy: auth.user.name,
        generatedAt: now,
      });

      logAuditEvent({
        userId: auth.user.id,
        userName: auth.user.name,
        action: 'export',
        entityType: 'engagement',
        entityId: engagementId,
        engagementId,
        details: { format: 'pdf' },
      });

      return new NextResponse(report, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${engagement.entityName.replace(/[^a-zA-Z0-9]/g, '_')}_Audit_Report.txt"`,
        },
      });
    }

    // Default: return JSON summary
    return NextResponse.json({
      engagement,
      findings,
      controls,
      accounts,
      summary: {
        totalFindings: findings.length,
        critical: findings.filter(f => f.severity === 'critical').length,
        high: findings.filter(f => f.severity === 'high').length,
        medium: findings.filter(f => f.severity === 'medium').length,
        low: findings.filter(f => f.severity === 'low').length,
        gaap: findings.filter(f => f.framework === 'GAAP').length,
        irs: findings.filter(f => f.framework === 'IRS').length,
        sox: findings.filter(f => f.framework === 'SOX').length,
        pcaob: findings.filter(f => f.framework === 'PCAOB').length,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
