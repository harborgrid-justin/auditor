import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { appropriationId, amount, transactionType } = body;

    if (!appropriationId || amount === undefined || !transactionType) {
      return NextResponse.json(
        { error: 'appropriationId, amount, and transactionType are required' },
        { status: 400 }
      );
    }

    const appropriation = db
      .select()
      .from(schema.appropriations)
      .where(eq(schema.appropriations.id, appropriationId))
      .get();

    if (!appropriation) {
      return NextResponse.json({ error: 'Appropriation not found' }, { status: 404 });
    }

    const auth = await requireEngagementMember(appropriation.engagementId);
    if (auth.error) return auth.error;

    const violations: Array<{
      type: string;
      statutoryBasis: string;
      description: string;
      amount: number;
    }> = [];

    // Check 1: Purpose violation - appropriation status
    if (appropriation.status === 'cancelled') {
      violations.push({
        type: 'unauthorized_purpose',
        statutoryBasis: '31 U.S.C. 1301(a)',
        description: 'Appropriation has been cancelled and is no longer available',
        amount,
      });
    }

    // Check 2: Time violation - expired appropriation for new obligations
    if (appropriation.status === 'expired' && transactionType === 'obligation') {
      violations.push({
        type: 'time_violation',
        statutoryBasis: '31 U.S.C. 1502(a)',
        description: 'Cannot create new obligations against an expired appropriation',
        amount,
      });
    }

    // Check 3: Amount violation - over obligation
    if (transactionType === 'obligation') {
      const availableForObligation = appropriation.allotted - appropriation.obligated;
      if (amount > availableForObligation) {
        violations.push({
          type: 'over_obligation',
          statutoryBasis: '31 U.S.C. 1341(a)',
          description: `Obligation of $${amount} exceeds available balance of $${availableForObligation}`,
          amount: amount - availableForObligation,
        });
      }

      // Check apportionment level
      const availableApportionment = appropriation.apportioned - appropriation.obligated;
      if (amount > availableApportionment) {
        violations.push({
          type: 'over_obligation',
          statutoryBasis: '31 U.S.C. 1517(a)',
          description: `Obligation of $${amount} exceeds apportionment of $${availableApportionment}`,
          amount: amount - availableApportionment,
        });
      }
    }

    // Check 4: Amount violation - over expenditure
    if (transactionType === 'disbursement') {
      const availableForExpenditure = appropriation.obligated - appropriation.disbursed;
      if (amount > availableForExpenditure) {
        violations.push({
          type: 'over_expenditure',
          statutoryBasis: '31 U.S.C. 1341(a)',
          description: `Disbursement of $${amount} exceeds obligated-but-undisbursed balance of $${availableForExpenditure}`,
          amount: amount - availableForExpenditure,
        });
      }
    }

    const isValid = violations.length === 0;

    // If violations detected, record them
    if (!isValid) {
      for (const v of violations) {
        db.insert(schema.adaViolations)
          .values({
            id: uuid(),
            engagementId: appropriation.engagementId,
            appropriationId,
            violationType: v.type as 'over_obligation' | 'over_expenditure' | 'unauthorized_purpose' | 'time_violation',
            statutoryBasis: v.statutoryBasis,
            amount: v.amount,
            description: v.description,
            discoveredDate: new Date().toISOString(),
            investigationStatus: 'detected',
            fiscalYear: appropriation.fiscalYearStart ? parseInt(appropriation.fiscalYearStart) : new Date().getFullYear(),
            createdAt: new Date().toISOString(),
          })
          .run();
      }

      logAuditEvent({
        userId: auth.user.id,
        userName: auth.user.name,
        action: 'create',
        entityType: 'ada_violation',
        engagementId: appropriation.engagementId,
        details: { transactionType, amount, violationCount: violations.length },
      });
    }

    return NextResponse.json({
      valid: isValid,
      appropriationId,
      transactionType,
      requestedAmount: amount,
      violations,
    });
  } catch (error) {
    console.error('ADA validate POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
