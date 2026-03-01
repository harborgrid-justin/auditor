import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, desc, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireAuth, requireRole } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const allEngagements = db.select().from(schema.engagements).orderBy(desc(schema.engagements.createdAt)).all();

    const engagements = allEngagements.map(eng => {
      const findingsData = db.select().from(schema.findings).where(eq(schema.findings.engagementId, eng.id)).all();
      const filesData = db.select().from(schema.uploadedFiles).where(eq(schema.uploadedFiles.engagementId, eng.id)).all();

      return {
        ...eng,
        totalFindings: findingsData.length,
        criticalFindings: findingsData.filter(f => f.severity === 'critical').length,
        highFindings: findingsData.filter(f => f.severity === 'high').length,
        filesUploaded: filesData.length,
        lastAnalysis: null,
        riskScore: null,
        complianceScore: null,
      };
    });

    const stats = {
      totalEngagements: engagements.length,
      activeEngagements: engagements.filter(e => e.status !== 'archived' && e.status !== 'completed').length,
      totalFindings: engagements.reduce((sum, e) => sum + e.totalFindings, 0),
      criticalFindings: engagements.reduce((sum, e) => sum + e.criticalFindings, 0),
      resolvedFindings: 0,
      avgRiskScore: 0,
    };

    return NextResponse.json({ engagements, stats });
  } catch (error) {
    console.error('Engagements error:', error);
    return NextResponse.json({ engagements: [], stats: {} }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireRole(['admin', 'auditor', 'reviewer']);
    if (auth.error) return auth.error;

    const body = await req.json();
    const { name, entityName, fiscalYearEnd, materialityThreshold, industry, entityType } = body;

    if (!name || !entityName || !fiscalYearEnd) {
      return NextResponse.json({ error: 'Name, entity name, and fiscal year end are required' }, { status: 400 });
    }

    const id = uuid();
    const now = new Date().toISOString();

    db.insert(schema.engagements).values({
      id,
      name,
      entityName,
      fiscalYearEnd,
      materialityThreshold: materialityThreshold || 0,
      industry: industry || null,
      entityType: entityType || null,
      status: 'planning',
      createdBy: auth.user.id,
      createdAt: now,
    }).run();

    // Create default SOX controls for new engagement
    const { DEFAULT_SOX_CONTROLS } = require('@/types/sox');
    for (const ctrl of DEFAULT_SOX_CONTROLS) {
      db.insert(schema.soxControls).values({
        id: uuid(),
        engagementId: id,
        controlId: ctrl.controlId,
        title: ctrl.title,
        description: ctrl.description,
        controlType: ctrl.controlType,
        category: ctrl.category,
        frequency: ctrl.frequency,
        owner: '',
        status: 'not_tested',
        assertion: JSON.stringify(ctrl.assertion),
        riskLevel: ctrl.riskLevel,
        automatedManual: ctrl.automatedManual,
      }).run();
    }

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'engagement',
      entityId: id,
      engagementId: id,
      details: { name, entityName },
    });

    return NextResponse.json({ id, name, entityName }, { status: 201 });
  } catch (error) {
    console.error('Create engagement error:', error);
    return NextResponse.json({ error: 'Failed to create engagement' }, { status: 500 });
  }
}
