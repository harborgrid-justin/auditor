import { describe, it, expect } from 'vitest';
import { determineEnhancedOpinion } from '../enhanced-opinion';
import type { EnhancedOpinionData } from '../enhanced-opinion';

function makeBaseData(overrides: Partial<EnhancedOpinionData> = {}): EnhancedOpinionData {
  return {
    entityName: 'Test Corporation',
    fiscalYearEnd: '2025-12-31',
    auditorFirmName: 'Test Audit LLP',
    findings: [],
    controls: [],
    materialityThreshold: 100000,
    generatedAt: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

describe('determineEnhancedOpinion', () => {
  it('returns unqualified when all modules are clear', () => {
    const data = makeBaseData({
      findings: [{ severity: 'low', framework: 'GAAP', amountImpact: 500, status: 'resolved' }],
      controls: [{ status: 'effective' }],
      sudSummary: {
        totalProposed: 0, totalRecorded: 0, totalPassed: 0,
        passedAdjustments: [],
        aggregatePassedEffect: { income: 0, assets: 0, liabilities: 0, equity: 0 },
        byCategory: { factual: { count: 0, totalAmount: 0 }, judgmental: { count: 0, totalAmount: 0 }, projected: { count: 0, totalAmount: 0 } },
        exceedsMateriality: false, exceedsPerformanceMateriality: false,
        materialityThreshold: 100000, performanceMateriality: 75000,
        aggregateImpactOnIncome: 0, conclusion: 'acceptable', rationale: '',
      },
      scopeEvaluation: {
        limitations: [], unresolvedCount: 0, clientImposedCount: 0,
        circumstantialCount: 0, pervasiveCount: 0, totalEstimatedImpact: 0,
        opinionImpact: 'none', rationale: '',
      },
    });

    const result = determineEnhancedOpinion(data);
    expect(result.opinionType).toBe('unqualified');
    expect(result.opinionLabel).toBe('Unqualified (Clean) Opinion');
    expect(result.draftText).toContain('present fairly');
    expect(result.draftText).toContain('Test Corporation');
  });

  it('returns qualified when material weaknesses exist', () => {
    const data = makeBaseData({
      controls: [{ status: 'material_weakness' }, { status: 'effective' }],
    });

    const result = determineEnhancedOpinion(data);
    expect(result.opinionType).toBe('qualified');
    expect(result.factors.materialWeaknessCount).toBe(1);
  });

  it('returns adverse when 3+ material weaknesses exist', () => {
    const data = makeBaseData({
      controls: [
        { status: 'material_weakness' },
        { status: 'material_weakness' },
        { status: 'material_weakness' },
      ],
    });

    const result = determineEnhancedOpinion(data);
    expect(result.opinionType).toBe('adverse');
  });

  it('returns disclaimer for pervasive scope limitations', () => {
    const data = makeBaseData({
      scopeEvaluation: {
        limitations: [],
        unresolvedCount: 1,
        clientImposedCount: 1,
        circumstantialCount: 0,
        pervasiveCount: 1,
        totalEstimatedImpact: 500000,
        opinionImpact: 'disclaimer',
        rationale: 'Pervasive scope limitation',
      },
    });

    const result = determineEnhancedOpinion(data);
    expect(result.opinionType).toBe('disclaimer');
    expect(result.draftText).toContain('Disclaimer');
  });

  it('blocks unqualified opinion when SUD exceeds materiality', () => {
    const data = makeBaseData({
      findings: [],
      controls: [{ status: 'effective' }],
      sudSummary: {
        totalProposed: 0, totalRecorded: 0, totalPassed: 2,
        passedAdjustments: [],
        aggregatePassedEffect: { income: -120000, assets: -120000, liabilities: 0, equity: -120000 },
        byCategory: { factual: { count: 2, totalAmount: 120000 }, judgmental: { count: 0, totalAmount: 0 }, projected: { count: 0, totalAmount: 0 } },
        exceedsMateriality: true, exceedsPerformanceMateriality: true,
        materialityThreshold: 100000, performanceMateriality: 75000,
        aggregateImpactOnIncome: 120000, conclusion: 'material', rationale: '',
      },
    });

    const result = determineEnhancedOpinion(data);
    expect(result.opinionType).toBe('qualified');
    expect(result.factors.sudExceedsMateriality).toBe(true);
    expect(result.blockingConditions.length).toBeGreaterThan(0);
  });

  it('adds emphasis of matter for going concern', () => {
    const data = makeBaseData({
      goingConcern: {
        conclusion: 'substantial_doubt_exists',
        opinionImpact: 'emphasis_of_matter',
        quantitativeIndicators: [],
        qualitativeIndicators: [],
        cashFlowProjection: [],
        managementPlans: [],
        triggeredIndicatorCount: 3,
        highSeverityCount: 2,
        cashShortfallProjected: true,
        totalMitigationImpact: 0,
        disclosureAdequate: true,
        rationale: 'Substantial doubt exists',
      },
    });

    const result = determineEnhancedOpinion(data);
    expect(result.emphasisOfMatter.length).toBeGreaterThan(0);
    expect(result.emphasisOfMatter[0].title).toContain('Going Concern');
    expect(result.factors.goingConcernDoubt).toBe(true);
  });

  it('blocks opinion when independence is not confirmed', () => {
    const data = makeBaseData({
      independenceEvaluation: {
        confirmations: [],
        totalMembers: 3,
        confirmedMembers: 1,
        pendingMembers: 2,
        threatsIdentified: false,
        safeguardsDocumented: true,
        allConfirmed: false,
        rationale: 'Pending confirmations',
      },
    });

    const result = determineEnhancedOpinion(data);
    expect(result.blockingConditions.some(bc => bc.category === 'Independence')).toBe(true);
  });

  it('blocks opinion when completion checklist is incomplete', () => {
    const data = makeBaseData({
      checklistEvaluation: {
        items: [],
        totalItems: 20,
        completedItems: 10,
        requiredItems: 15,
        requiredCompleted: 10,
        completionRate: 0.5,
        requiredCompletionRate: 0.67,
        readyForOpinion: false,
        blockingItems: [{ itemKey: 'test', category: 'fieldwork', description: 'Test item', autoCheck: false, required: true, status: 'not_started' }],
        summary: 'Incomplete',
      },
    });

    const result = determineEnhancedOpinion(data);
    expect(result.blockingConditions.some(bc => bc.category === 'Engagement Completion')).toBe(true);
  });

  it('generates CAMs for PCAOB audits with going concern', () => {
    const data = makeBaseData({
      isPCAOBAudit: true,
      goingConcern: {
        conclusion: 'substantial_doubt_exists',
        opinionImpact: 'emphasis_of_matter',
        quantitativeIndicators: [],
        qualitativeIndicators: [],
        cashFlowProjection: [],
        managementPlans: [],
        triggeredIndicatorCount: 3,
        highSeverityCount: 2,
        cashShortfallProjected: true,
        totalMitigationImpact: 0,
        disclosureAdequate: true,
        rationale: '',
      },
    });

    const result = determineEnhancedOpinion(data);
    expect(result.criticalAuditMatters.length).toBeGreaterThan(0);
    expect(result.criticalAuditMatters[0].title).toContain('Going Concern');
    expect(result.draftText).toContain('Critical Audit Matters');
  });

  it('blocks opinion when representation letter not obtained', () => {
    const data = makeBaseData({
      representationLetterObtained: false,
    });

    const result = determineEnhancedOpinion(data);
    expect(result.blockingConditions.some(bc => bc.category === 'Management Representations')).toBe(true);
  });

  it('includes firm name in draft text', () => {
    const data = makeBaseData({ auditorFirmName: 'Big Four LLP' });
    const result = determineEnhancedOpinion(data);
    expect(result.draftText).toContain('Big Four LLP');
  });
});
