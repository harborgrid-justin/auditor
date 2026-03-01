/**
 * Enhanced Audit Opinion Determination Engine
 *
 * Integrates all enterprise modules to produce a production-ready
 * unqualified audit opinion with full supporting evidence:
 *
 * - Original findings & controls assessment
 * - Summary of Unadjusted Differences (SUD)
 * - Going concern evaluation (ASC 205-40)
 * - Scope limitation assessment (AU-C 705)
 * - Assertion coverage verification
 * - Sampling conclusions
 * - Engagement completion checklist
 * - Independence confirmation
 * - Emphasis of Matter / Other Matter paragraphs
 * - Critical Audit Matters (CAM) for PCAOB audits
 */

import type { OpinionType } from './audit-opinion';
import type { SUDSummary } from '../engine/adjustments/adjustment-tracker';
import type { GoingConcernAssessment } from '../engine/going-concern/going-concern-evaluator';
import type { ScopeEvaluation } from '../engine/scope/scope-tracker';
import type { CoverageMatrix } from '../engine/assertions/assertion-coverage';
import type { SamplingConclusion } from '../engine/sampling/sampling-plan';
import type { ChecklistEvaluation } from '../workflow/completion-checklist';
import type { IndependenceEvaluation } from '../workflow/independence';

export interface EnhancedOpinionData {
  entityName: string;
  fiscalYearEnd: string;
  auditorFirmName: string;

  // Original inputs
  findings: Array<{
    severity: string;
    framework: string;
    amountImpact: number | null;
    status: string;
    title?: string;
  }>;
  controls: Array<{
    status: string;
  }>;
  materialityThreshold: number;
  generatedAt: string;

  // Enterprise module inputs
  sudSummary?: SUDSummary;
  goingConcern?: GoingConcernAssessment;
  scopeEvaluation?: ScopeEvaluation;
  assertionCoverage?: CoverageMatrix;
  samplingConclusions?: Array<{
    name: string;
    conclusion: SamplingConclusion;
    rationale: string;
  }>;
  checklistEvaluation?: ChecklistEvaluation;
  independenceEvaluation?: IndependenceEvaluation;
  subsequentEventsComplete?: boolean;
  relatedPartiesDisclosed?: boolean;
  representationLetterObtained?: boolean;
  isPCAOBAudit?: boolean;
}

export interface BlockingCondition {
  category: string;
  description: string;
  severity: 'blocker' | 'warning';
  resolution: string;
}

export interface EmphasisOfMatter {
  title: string;
  paragraph: string;
  reference: string;
}

export interface CriticalAuditMatter {
  title: string;
  description: string;
  howAddressed: string;
  accountsInvolved: string;
}

export interface EnhancedOpinionResult {
  opinionType: OpinionType;
  opinionLabel: string;
  rationale: string;
  draftText: string;

  factors: {
    materialWeaknessCount: number;
    significantDeficiencyCount: number;
    criticalFindingCount: number;
    totalMaterialImpact: number;
    exceedsMateriality: boolean;
    unresolvedCriticalFindings: number;
    sudExceedsMateriality: boolean;
    goingConcernDoubt: boolean;
    scopeLimitationImpact: string;
    assertionCoverageComplete: boolean;
    samplingSupportsReliance: boolean;
    checklistComplete: boolean;
    independenceConfirmed: boolean;
  };

  blockingConditions: BlockingCondition[];
  emphasisOfMatter: EmphasisOfMatter[];
  otherMatter: string[];
  criticalAuditMatters: CriticalAuditMatter[];
  readyForIssuance: boolean;
}

/**
 * Determine the audit opinion type integrating all enterprise modules.
 */
export function determineEnhancedOpinion(data: EnhancedOpinionData): EnhancedOpinionResult {
  const blockingConditions: BlockingCondition[] = [];
  const emphasisOfMatter: EmphasisOfMatter[] = [];
  const otherMatter: string[] = [];
  const criticalAuditMatters: CriticalAuditMatter[] = [];

  // ── Original analysis ──
  const materialWeaknessCount = data.controls.filter(c => c.status === 'material_weakness').length;
  const significantDeficiencyCount = data.controls.filter(c => c.status === 'significant_deficiency').length;
  const criticalFindings = data.findings.filter(f => f.severity === 'critical');
  const unresolvedCriticalFindings = criticalFindings.filter(
    f => f.status === 'open' || f.status === 'in_review'
  ).length;
  const totalMaterialImpact = data.findings
    .filter(f => (f.severity === 'critical' || f.severity === 'high') && f.amountImpact && f.amountImpact > data.materialityThreshold)
    .reduce((sum, f) => sum + (f.amountImpact || 0), 0);
  const exceedsMateriality = totalMaterialImpact > data.materialityThreshold;

  // ── SUD evaluation ──
  const sudExceedsMateriality = data.sudSummary?.exceedsMateriality ?? false;
  if (sudExceedsMateriality) {
    blockingConditions.push({
      category: 'Uncorrected Misstatements',
      description: `Aggregate uncorrected misstatements exceed materiality ($${Math.round(data.sudSummary!.aggregateImpactOnIncome).toLocaleString()} vs. $${Math.round(data.materialityThreshold).toLocaleString()}).`,
      severity: 'blocker',
      resolution: 'Management must record the adjustments or the opinion must be modified to qualified/adverse.',
    });
  } else if (data.sudSummary?.exceedsPerformanceMateriality) {
    blockingConditions.push({
      category: 'Uncorrected Misstatements',
      description: 'Aggregate uncorrected misstatements exceed performance materiality.',
      severity: 'warning',
      resolution: 'Perform additional procedures to determine if remaining misstatement is material.',
    });
  }

  // ── Going concern evaluation ──
  const goingConcernDoubt = data.goingConcern?.conclusion === 'substantial_doubt_exists'
    || data.goingConcern?.conclusion === 'substantial_doubt_mitigated';
  if (data.goingConcern?.conclusion === 'substantial_doubt_exists') {
    emphasisOfMatter.push({
      title: 'Going Concern',
      paragraph: `As discussed in Note [X] to the financial statements, ${data.entityName} has experienced conditions that raise substantial doubt about its ability to continue as a going concern. Management's plans regarding these matters are also described in Note [X]. The financial statements do not include any adjustments that might result from the outcome of this uncertainty.`,
      reference: 'ASC 205-40',
    });
    if (!data.goingConcern.disclosureAdequate) {
      blockingConditions.push({
        category: 'Going Concern',
        description: 'Going concern disclosures are not adequate.',
        severity: 'blocker',
        resolution: 'Entity must provide adequate going concern disclosures per ASC 205-40-50 or the opinion must be modified.',
      });
    }
  } else if (data.goingConcern?.conclusion === 'substantial_doubt_mitigated') {
    emphasisOfMatter.push({
      title: 'Going Concern — Mitigated',
      paragraph: `As discussed in Note [X] to the financial statements, certain conditions existed that raised substantial doubt about ${data.entityName}'s ability to continue as a going concern. Management has implemented plans that have mitigated this doubt.`,
      reference: 'ASC 205-40',
    });
  }

  // ── Scope limitation evaluation ──
  const scopeImpact = data.scopeEvaluation?.opinionImpact ?? 'none';
  if (scopeImpact === 'disclaimer') {
    blockingConditions.push({
      category: 'Scope Limitations',
      description: `Pervasive scope limitations prevent forming an opinion. ${data.scopeEvaluation?.rationale}`,
      severity: 'blocker',
      resolution: 'Resolve scope limitations or issue disclaimer of opinion.',
    });
  } else if (scopeImpact === 'qualified') {
    blockingConditions.push({
      category: 'Scope Limitations',
      description: `Material scope limitations exist. ${data.scopeEvaluation?.rationale}`,
      severity: 'blocker',
      resolution: 'Resolve scope limitations or modify the opinion to qualified.',
    });
  }

  // ── Assertion coverage ──
  const assertionCoverageComplete = data.assertionCoverage?.readyForOpinion ?? false;
  if (data.assertionCoverage && !assertionCoverageComplete) {
    blockingConditions.push({
      category: 'Assertion Coverage',
      description: `${data.assertionCoverage.gaps.length} material account(s) have assertion coverage gaps.`,
      severity: 'blocker',
      resolution: 'Complete testing for all required assertions on all material accounts.',
    });
  }

  // ── Sampling conclusions ──
  const unsupportedSamples = data.samplingConclusions?.filter(s => s.conclusion === 'does_not_support') ?? [];
  const samplingSupportsReliance = unsupportedSamples.length === 0;
  if (unsupportedSamples.length > 0) {
    blockingConditions.push({
      category: 'Sampling Results',
      description: `${unsupportedSamples.length} sampling plan(s) do not support reliance: ${unsupportedSamples.map(s => s.name).join(', ')}.`,
      severity: 'blocker',
      resolution: 'Expand sample size, perform alternative procedures, or modify the opinion.',
    });
  }

  // ── Completion checklist ──
  const checklistComplete = data.checklistEvaluation?.readyForOpinion ?? false;
  if (data.checklistEvaluation && !checklistComplete) {
    blockingConditions.push({
      category: 'Engagement Completion',
      description: `${data.checklistEvaluation.blockingItems.length} required checklist item(s) incomplete.`,
      severity: 'blocker',
      resolution: 'Complete all required engagement procedures before issuing opinion.',
    });
  }

  // ── Independence ──
  const independenceConfirmed = data.independenceEvaluation?.allConfirmed ?? false;
  if (data.independenceEvaluation && !independenceConfirmed) {
    blockingConditions.push({
      category: 'Independence',
      description: 'Independence has not been confirmed for all team members.',
      severity: 'blocker',
      resolution: 'Obtain independence confirmations from all engagement team members.',
    });
  }

  // ── Representation letter ──
  if (data.representationLetterObtained === false) {
    blockingConditions.push({
      category: 'Management Representations',
      description: 'Management representation letter has not been obtained.',
      severity: 'blocker',
      resolution: 'Obtain signed management representation letter (AU-C 580) before issuing opinion.',
    });
  }

  // ── Subsequent events ──
  if (data.subsequentEventsComplete === false) {
    blockingConditions.push({
      category: 'Subsequent Events',
      description: 'Subsequent events procedures have not been completed.',
      severity: 'blocker',
      resolution: 'Complete all required subsequent events procedures (AU-C 560).',
    });
  }

  // ── Related parties ──
  if (data.relatedPartiesDisclosed === false) {
    blockingConditions.push({
      category: 'Related Parties',
      description: 'Related party disclosures are incomplete.',
      severity: 'warning',
      resolution: 'Ensure all related party transactions are properly disclosed per ASC 850.',
    });
  }

  // ── Critical Audit Matters (PCAOB AS 3101) ──
  if (data.isPCAOBAudit) {
    // Auto-generate CAMs from high-risk areas
    if (data.goingConcern && goingConcernDoubt) {
      criticalAuditMatters.push({
        title: 'Assessment of Going Concern',
        description: 'The entity has conditions raising substantial doubt about its ability to continue as a going concern, requiring significant auditor judgment in evaluating management\'s plans and financial projections.',
        howAddressed: 'We evaluated management\'s projections for reasonableness, tested key assumptions, and considered the feasibility of management\'s plans to mitigate the going concern conditions.',
        accountsInvolved: 'All financial statement accounts',
      });
    }
    if (materialWeaknessCount > 0) {
      criticalAuditMatters.push({
        title: 'Material Weakness in Internal Control over Financial Reporting',
        description: `${materialWeaknessCount} material weakness(es) were identified in internal control over financial reporting, requiring enhanced substantive testing procedures.`,
        howAddressed: 'We expanded our substantive audit procedures in areas affected by the material weaknesses, including increased sample sizes and additional analytical procedures.',
        accountsInvolved: 'Accounts affected by identified material weaknesses',
      });
    }
  }

  // ── Determine opinion type ──
  const blockers = blockingConditions.filter(bc => bc.severity === 'blocker');
  let opinionType: OpinionType;
  let rationale: string;

  // Scope limitations take precedence for disclaimer
  if (scopeImpact === 'disclaimer') {
    opinionType = 'disclaimer';
    rationale = 'A disclaimer of opinion is required due to pervasive scope limitations that prevent the auditor from obtaining sufficient appropriate audit evidence.';
  } else if (
    materialWeaknessCount >= 3 ||
    (exceedsMateriality && unresolvedCriticalFindings >= 3) ||
    (sudExceedsMateriality && materialWeaknessCount >= 1) ||
    (data.goingConcern?.opinionImpact === 'adverse')
  ) {
    opinionType = 'adverse';
    rationale = buildAdverseRationale(materialWeaknessCount, unresolvedCriticalFindings, sudExceedsMateriality, data.goingConcern);
  } else if (
    materialWeaknessCount >= 1 ||
    (exceedsMateriality && unresolvedCriticalFindings >= 1) ||
    sudExceedsMateriality ||
    scopeImpact === 'qualified' ||
    (data.goingConcern?.opinionImpact === 'qualified')
  ) {
    opinionType = 'qualified';
    rationale = buildQualifiedRationale(materialWeaknessCount, unresolvedCriticalFindings, sudExceedsMateriality, scopeImpact, data.goingConcern);
  } else if (
    unresolvedCriticalFindings === 0 &&
    materialWeaknessCount === 0 &&
    !sudExceedsMateriality &&
    scopeImpact === 'none'
  ) {
    opinionType = 'unqualified';
    rationale = 'No material misstatements identified. Internal controls are operating effectively. Aggregate uncorrected misstatements are below materiality. No scope limitations. Financial statements present fairly, in all material respects.';
  } else {
    opinionType = 'qualified';
    rationale = 'Certain findings require attention but do not rise to the level of an adverse opinion.';
  }

  const readyForIssuance = opinionType !== 'unqualified' || blockers.length === 0;

  const opinionLabels: Record<OpinionType, string> = {
    unqualified: 'Unqualified (Clean) Opinion',
    qualified: 'Qualified Opinion',
    adverse: 'Adverse Opinion',
    disclaimer: 'Disclaimer of Opinion',
  };

  const factors = {
    materialWeaknessCount,
    significantDeficiencyCount,
    criticalFindingCount: criticalFindings.length,
    totalMaterialImpact,
    exceedsMateriality,
    unresolvedCriticalFindings,
    sudExceedsMateriality,
    goingConcernDoubt,
    scopeLimitationImpact: scopeImpact,
    assertionCoverageComplete,
    samplingSupportsReliance,
    checklistComplete,
    independenceConfirmed,
  };

  const draftText = generateEnhancedOpinionText(opinionType, data, factors, emphasisOfMatter, otherMatter, criticalAuditMatters);

  return {
    opinionType,
    opinionLabel: opinionLabels[opinionType],
    rationale,
    draftText,
    factors,
    blockingConditions,
    emphasisOfMatter,
    otherMatter,
    criticalAuditMatters,
    readyForIssuance: opinionType === 'unqualified' ? blockers.length === 0 : true,
  };
}

function buildAdverseRationale(
  mwCount: number,
  unresolvedCritical: number,
  sudExceeds: boolean,
  gc?: GoingConcernAssessment
): string {
  const reasons: string[] = [];
  if (mwCount >= 3) reasons.push(`${mwCount} material weaknesses in internal control`);
  if (unresolvedCritical >= 3) reasons.push(`${unresolvedCritical} unresolved critical findings`);
  if (sudExceeds) reasons.push('aggregate uncorrected misstatements exceed materiality');
  if (gc?.opinionImpact === 'adverse') reasons.push('inadequate going concern disclosures');
  return `An adverse opinion is warranted because: ${reasons.join('; ')}. These misstatements are material and pervasive to the financial statements.`;
}

function buildQualifiedRationale(
  mwCount: number,
  unresolvedCritical: number,
  sudExceeds: boolean,
  scopeImpact: string,
  gc?: GoingConcernAssessment
): string {
  const reasons: string[] = [];
  if (mwCount >= 1) reasons.push(`${mwCount} material weakness(es) in internal control`);
  if (unresolvedCritical >= 1) reasons.push(`${unresolvedCritical} unresolved critical finding(s)`);
  if (sudExceeds) reasons.push('aggregate uncorrected misstatements exceed materiality');
  if (scopeImpact === 'qualified') reasons.push('material scope limitations');
  if (gc?.opinionImpact === 'qualified') reasons.push('inadequate going concern disclosures');
  return `A qualified opinion is warranted because: ${reasons.join('; ')}. The effects are material but not pervasive to the financial statements as a whole.`;
}

function generateEnhancedOpinionText(
  type: OpinionType,
  data: EnhancedOpinionData,
  factors: EnhancedOpinionResult['factors'],
  eom: EmphasisOfMatter[],
  om: string[],
  cam: CriticalAuditMatter[]
): string {
  const today = new Date(data.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const firmName = data.auditorFirmName || '[Audit Firm Name]';

  let text = `
INDEPENDENT AUDITOR'S REPORT
${'='.repeat(60)}

To the Board of Directors and Stockholders of ${data.entityName}

Report on the Audit of the Financial Statements
`;

  // Opinion paragraph comes first (per revised AU-C 700)
  switch (type) {
    case 'unqualified':
      text += `
Opinion

In our opinion, the accompanying financial statements present fairly, in all material respects, the financial position of ${data.entityName} as of ${data.fiscalYearEnd}, and the results of its operations and its cash flows for the year then ended in accordance with accounting principles generally accepted in the United States of America.
`;
      break;
    case 'qualified':
      text += `
Qualified Opinion

In our opinion, except for the effects of the matter(s) described in the Basis for Qualified Opinion section of our report, the accompanying financial statements present fairly, in all material respects, the financial position of ${data.entityName} as of ${data.fiscalYearEnd}, and the results of its operations and its cash flows for the year then ended in accordance with accounting principles generally accepted in the United States of America.
`;
      break;
    case 'adverse':
      text += `
Adverse Opinion

In our opinion, because of the significance of the matter(s) described in the Basis for Adverse Opinion section of our report, the accompanying financial statements do not present fairly, in accordance with accounting principles generally accepted in the United States of America, the financial position of ${data.entityName} as of ${data.fiscalYearEnd}, or the results of its operations or its cash flows for the year then ended.
`;
      break;
    case 'disclaimer':
      text += `
Disclaimer of Opinion

We do not express an opinion on the accompanying financial statements of ${data.entityName}. Because of the significance of the matter(s) described in the Basis for Disclaimer of Opinion section of our report, we have not been able to obtain sufficient appropriate audit evidence to provide a basis for an audit opinion on these financial statements.
`;
      break;
  }

  // Basis for opinion
  if (type === 'qualified' || type === 'adverse') {
    const basisTitle = type === 'qualified' ? 'Basis for Qualified Opinion' : 'Basis for Adverse Opinion';
    text += `
${basisTitle}

`;
    if (factors.materialWeaknessCount > 0) {
      text += `During our audit, we identified ${factors.materialWeaknessCount} material weakness(es) in the entity's internal control over financial reporting. `;
    }
    if (factors.unresolvedCriticalFindings > 0) {
      text += `${factors.unresolvedCriticalFindings} critical finding(s) remain unresolved. `;
    }
    if (factors.sudExceedsMateriality) {
      text += `The aggregate effect of uncorrected misstatements exceeds the materiality threshold of $${data.materialityThreshold.toLocaleString()}. `;
    }
    if (factors.exceedsMateriality) {
      text += `The total estimated impact of $${factors.totalMaterialImpact.toLocaleString()} exceeds the materiality threshold. `;
    }
    text += '\n';
  } else if (type === 'disclaimer') {
    text += `
Basis for Disclaimer of Opinion

We were unable to obtain sufficient appropriate audit evidence to provide a basis for an audit opinion due to scope limitations${data.scopeEvaluation ? ': ' + data.scopeEvaluation.rationale : ''}.
`;
  } else {
    text += `
Basis for Opinion

We conducted our audit in accordance with auditing standards generally accepted in the United States of America${data.isPCAOBAudit ? ' and the standards of the Public Company Accounting Oversight Board (United States)' : ''}. Our responsibilities under those standards are further described in the Auditor's Responsibilities for the Audit of the Financial Statements section of our report. We are required to be independent of ${data.entityName} and to meet our other ethical responsibilities, in accordance with the relevant ethical requirements relating to our audit. We believe that the audit evidence we have obtained is sufficient and appropriate to provide a basis for our audit opinion.
`;
  }

  // Emphasis of Matter paragraphs
  if (eom.length > 0) {
    for (const item of eom) {
      text += `
Emphasis of Matter — ${item.title}

${item.paragraph}

Our opinion is not modified with respect to this matter.
`;
    }
  }

  // Critical Audit Matters (PCAOB)
  if (cam.length > 0) {
    text += `
Critical Audit Matters

The critical audit matters communicated below are matters arising from the current-period audit of the financial statements that were communicated or required to be communicated to the audit committee and that: (1) relate to accounts or disclosures that are material to the financial statements and (2) involved our especially challenging, subjective, or complex auditor judgments.
`;
    for (const matter of cam) {
      text += `
${matter.title}

${matter.description}

How the Critical Audit Matter Was Addressed in the Audit:
${matter.howAddressed}

Principal Accounts/Disclosures Involved: ${matter.accountsInvolved}
`;
    }
  }

  // Management's and auditor's responsibilities
  text += `
Responsibilities of Management for the Financial Statements

Management is responsible for the preparation and fair presentation of these financial statements in accordance with accounting principles generally accepted in the United States of America, and for the design, implementation, and maintenance of internal control relevant to the preparation and fair presentation of financial statements that are free from material misstatement, whether due to fraud or error.

In preparing the financial statements, management is required to evaluate whether there are conditions or events, considered in the aggregate, that raise substantial doubt about ${data.entityName}'s ability to continue as a going concern for one year after the date that the financial statements are available to be issued.

Auditor's Responsibilities for the Audit of the Financial Statements

Our objectives are to obtain reasonable assurance about whether the financial statements as a whole are free from material misstatement, whether due to fraud or error, and to issue an auditor's report that includes our opinion. Reasonable assurance is a high level of assurance but is not absolute assurance and therefore is not a guarantee that an audit conducted in accordance with GAAS will always detect a material misstatement when it exists. The risk of not detecting a material misstatement resulting from fraud is higher than for one resulting from error, as fraud may involve collusion, forgery, intentional omissions, misrepresentations, or the override of internal control.
`;

  // Other Matter paragraphs
  if (om.length > 0) {
    for (const item of om) {
      text += `
Other Matter

${item}
`;
    }
  }

  text += `
${firmName}
${today}

[DRAFT — This opinion is generated based on automated analysis and requires professional review before issuance.]
`;

  return text.trim();
}
