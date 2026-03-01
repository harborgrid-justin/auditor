import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { requireEngagementMember } from '@/lib/auth/guard';
import { logAuditEvent } from '@/lib/audit/logger';
import {
  calculateAttributeSampleSize,
  calculateMUSSampleSize,
  selectRandomSample,
  selectSystematicSample,
} from '@/lib/engine/sampling/sampling-plan';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const plans = db.select().from(schema.samplingPlans)
      .where(eq(schema.samplingPlans.engagementId, engagementId))
      .all();

    return NextResponse.json({ plans });
  } catch (error) {
    console.error('Sampling plans fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch sampling plans' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: engagementId } = await params;
    const auth = await requireEngagementMember(engagementId);
    if (auth.error) return auth.error;

    const body = await req.json();
    const {
      name,
      populationType,
      method,
      confidenceLevel = 0.95,
      tolerableRate,
      expectedDeviationRate,
      tolerableMisstatement,
      expectedMisstatement,
      populationSize,
      populationValue,
    } = body;

    // Calculate sample size based on method
    let sampleSizeResult;
    if (method === 'attribute') {
      sampleSizeResult = calculateAttributeSampleSize({
        populationSize,
        confidenceLevel,
        tolerableRate: tolerableRate ?? 0.05,
        expectedDeviationRate: expectedDeviationRate ?? 0.01,
      });
    } else if (method === 'mus') {
      sampleSizeResult = calculateMUSSampleSize({
        populationSize,
        populationValue: populationValue ?? 0,
        confidenceLevel,
        tolerableMisstatement: tolerableMisstatement ?? 0,
        expectedMisstatement: expectedMisstatement ?? 0,
      });
    } else {
      // For random/systematic/stratified, use a reasonable default
      const z = confidenceLevel >= 0.95 ? 1.96 : 1.645;
      const calcSize = Math.min(Math.ceil(z * z * 0.25 / (0.05 * 0.05)), populationSize);
      sampleSizeResult = { sampleSize: Math.max(calcSize, 25), method, parameters: { populationSize }, rationale: `${method} sampling with ${populationSize} items.` };
    }

    // Select sample items
    let selectedItems: number[] = [];
    if (method === 'systematic') {
      selectedItems = selectSystematicSample(populationSize, sampleSizeResult.sampleSize);
    } else {
      selectedItems = selectRandomSample(populationSize, sampleSizeResult.sampleSize);
    }

    const id = uuid();
    const now = new Date().toISOString();

    db.insert(schema.samplingPlans).values({
      id,
      engagementId,
      name,
      populationType,
      method,
      confidenceLevel,
      tolerableRate: tolerableRate ?? null,
      expectedDeviationRate: expectedDeviationRate ?? null,
      tolerableMisstatement: tolerableMisstatement ?? null,
      expectedMisstatement: expectedMisstatement ?? null,
      populationSize,
      populationValue: populationValue ?? null,
      calculatedSampleSize: sampleSizeResult.sampleSize,
      selectedItemsJson: JSON.stringify(selectedItems),
      exceptionsFound: 0,
      conclusion: 'pending',
      createdBy: auth.user.id,
      createdAt: now,
    }).run();

    logAuditEvent({
      userId: auth.user.id,
      userName: auth.user.name,
      action: 'create',
      entityType: 'engagement',
      entityId: id,
      engagementId,
      details: { type: 'sampling_plan', method, sampleSize: sampleSizeResult.sampleSize },
    });

    return NextResponse.json({
      id,
      ...sampleSizeResult,
      selectedItems,
    }, { status: 201 });
  } catch (error) {
    console.error('Sampling plan creation error:', error);
    return NextResponse.json({ error: 'Failed to create sampling plan' }, { status: 500 });
  }
}
