/**
 * Federal Audit Opinion Generator
 *
 * Extends the enhanced opinion pattern to produce federal audit opinions
 * compliant with FASAB/SFFAS standards (not GAAP). Federal audit reports
 * include three components per OMB Bulletin on Audit Requirements:
 *
 * 1. Opinion on Financial Statements (FASAB/SFFAS-based)
 * 2. Report on Internal Control over Financial Reporting
 * 3. Report on Compliance with Laws and Regulations
 *    - Including Anti-Deficiency Act (ADA) compliance statement
 *
 * The ADA compliance assessment is a critical component unique to federal
 * audits. Any confirmed ADA violation is an automatic blocker for an
 * unqualified opinion on compliance.
 *
 * References:
 *   - OMB Bulletin on Audit Requirements for Federal Financial Statements
 *   - OMB Circular A-136: Financial Reporting Requirements
 *   - Government Auditing Standards (Yellow Book / GAGAS)
 *   - FASAB SFFAS 1-7: Federal Accounting Standards
 *   - 31 USC §1341-1342: Anti-Deficiency Act
 *   - DoD 7000.14-R, Volume 6A: Reporting Policy
 *   - Chief Financial Officers Act of 1990 (31 USC §3515)
 *   - Federal Financial Management Improvement Act (FFMIA)
 */

import type { EnhancedOpinionData, EnhancedOpinionResult } from '@/lib/reports/enhanced-opinion';
import type { ADAViolation, FIARAssessment } from '@/types/dod-fmr';
import type { OpinionType } from '@/lib/reports/audit-opinion';

// ---------------------------------------------------------------------------
// Federal-Specific Types
// ---------------------------------------------------------------------------

/**
 * Federal opinion data extending the enhanced opinion pattern with DoD/federal-
 * specific data elements required for FASAB-based opinions.
 */
export interface FederalOpinionData extends EnhancedOpinionData {
  /** DoD component name (e.g., "Department of the Army", "Defense Logistics Agency") */
  dodComponent: string;

  /** Anti-Deficiency Act violations identified during the audit */
  adaViolations: ADAViolation[];

  /** Financial Improvement and Audit Remediation (FIAR) assessment */
  fiarAssessment?: FIARAssessment;

  /** Whether USSGL accounts are compliant with Treasury requirements */
  ussglCompliant: boolean;

  /** Whether intragovernmental transactions are reconciled with trading partners */
  intragovernmentalReconciled: boolean;
}

/**
 * Federal opinion result extending the enhanced opinion result with
 * federal-specific report components.
 */
export interface FederalOpinionResult extends EnhancedOpinionResult {
  /** Report on Compliance with Laws and Regulations */
  complianceReport: string;

  /** Report on Internal Control over Financial Reporting */
  internalControlReport: string;

  /** Anti-Deficiency Act compliance statement */
  adaComplianceStatement: string;
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Determine the federal audit opinion integrating all enhanced opinion
 * factors plus federal-specific requirements (FASAB, ADA, FIAR, USSGL).
 *
 * Key differences from commercial (GAAP) opinions:
 * - Framework is FASAB/SFFAS, not GAAP/ASC
 * - ADA violations are automatic blockers for compliance opinion
 * - FIAR assessment readiness affects the overall opinion
 * - USSGL compliance is required for unqualified opinions
 * - IGT reconciliation status may affect the opinion
 * - Three-part report structure (financial statements, internal control, compliance)
 *
 * Per Government Auditing Standards (GAGAS) and OMB Bulletin on Audit
 * Requirements for Federal Financial Statements.
 *
 * @param data - FederalOpinionData with all inputs
 * @returns FederalOpinionResult with opinion, compliance report, and IC report
 */
export function determineFederalOpinion(data: FederalOpinionData): FederalOpinionResult {
  // Start with the base enhanced opinion logic
  const blockingConditions: EnhancedOpinionResult['blockingConditions'] = [];
  const emphasisOfMatter: EnhancedOpinionResult['emphasisOfMatter'] = [];
  const otherMatter: string[] = [];
  const criticalAuditMatters: EnhancedOpinionResult['criticalAuditMatters'] = [];

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 1: Standard enhanced opinion factors (recomputed for FASAB context)
  // ══════════════════════════════════════════════════════════════════════════

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

  // SUD evaluation
  const sudExceedsMateriality = data.sudSummary?.exceedsMateriality ?? false;
  if (sudExceedsMateriality) {
    blockingConditions.push({
      category: 'Uncorrected Misstatements',
      description: `Aggregate uncorrected misstatements exceed materiality. Ref: GAGAS 6.27-6.30.`,
      severity: 'blocker',
      resolution: 'Management must record the adjustments or the opinion must be modified.',
    });
  }

  // Going concern (applicable to federal entities under SFFAS 1)
  const goingConcernDoubt = data.goingConcern?.conclusion === 'substantial_doubt_exists'
    || data.goingConcern?.conclusion === 'substantial_doubt_mitigated';
  if (data.goingConcern?.conclusion === 'substantial_doubt_exists') {
    emphasisOfMatter.push({
      title: 'Going Concern',
      paragraph: `As discussed in the notes to the financial statements, ${data.dodComponent} ` +
        `has experienced conditions that raise substantial doubt about its ability to ` +
        `continue operations at current levels. The financial statements do not include ` +
        `any adjustments that might result from the outcome of this uncertainty.`,
      reference: 'SFFAS 1',
    });
  }

  // Scope limitations
  const scopeImpact = data.scopeEvaluation?.opinionImpact ?? 'none';
  if (scopeImpact === 'disclaimer') {
    blockingConditions.push({
      category: 'Scope Limitations',
      description: `Pervasive scope limitations prevent forming an opinion. ${data.scopeEvaluation?.rationale ?? ''}`,
      severity: 'blocker',
      resolution: 'Resolve scope limitations or issue disclaimer of opinion.',
    });
  } else if (scopeImpact === 'qualified') {
    blockingConditions.push({
      category: 'Scope Limitations',
      description: `Material scope limitations exist. ${data.scopeEvaluation?.rationale ?? ''}`,
      severity: 'blocker',
      resolution: 'Resolve scope limitations or modify the opinion.',
    });
  }

  // Assertion coverage
  const assertionCoverageComplete = data.assertionCoverage?.readyForOpinion ?? false;
  if (data.assertionCoverage && !assertionCoverageComplete) {
    blockingConditions.push({
      category: 'Assertion Coverage',
      description: `${data.assertionCoverage.gaps.length} material account(s) have assertion coverage gaps.`,
      severity: 'blocker',
      resolution: 'Complete testing for all required assertions on all material accounts.',
    });
  }

  // Sampling
  const unsupportedSamples = data.samplingConclusions?.filter(s => s.conclusion === 'does_not_support') ?? [];
  const samplingSupportsReliance = unsupportedSamples.length === 0;
  if (unsupportedSamples.length > 0) {
    blockingConditions.push({
      category: 'Sampling Results',
      description: `${unsupportedSamples.length} sampling plan(s) do not support reliance.`,
      severity: 'blocker',
      resolution: 'Expand sample size, perform alternative procedures, or modify the opinion.',
    });
  }

  // Completion checklist
  const checklistComplete = data.checklistEvaluation?.readyForOpinion ?? false;
  if (data.checklistEvaluation && !checklistComplete) {
    blockingConditions.push({
      category: 'Engagement Completion',
      description: `${data.checklistEvaluation.blockingItems.length} required checklist item(s) incomplete.`,
      severity: 'blocker',
      resolution: 'Complete all required engagement procedures before issuing opinion.',
    });
  }

  // Independence
  const independenceConfirmed = data.independenceEvaluation?.allConfirmed ?? false;
  if (data.independenceEvaluation && !independenceConfirmed) {
    blockingConditions.push({
      category: 'Independence',
      description: 'Independence has not been confirmed for all team members.',
      severity: 'blocker',
      resolution: 'Obtain independence confirmations from all engagement team members per GAGAS.',
    });
  }

  // Representation letter
  if (data.representationLetterObtained === false) {
    blockingConditions.push({
      category: 'Management Representations',
      description: 'Management representation letter has not been obtained.',
      severity: 'blocker',
      resolution: 'Obtain signed management representation letter per GAGAS.',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 2: Federal-specific factors
  // ══════════════════════════════════════════════════════════════════════════

  // ── Anti-Deficiency Act violations ──
  // Per 31 USC §1341-1342: ADA violations are AUTOMATIC BLOCKERS for an
  // unqualified compliance opinion. They must be reported to the President,
  // Congress, and the Comptroller General.
  const confirmedADAViolations = data.adaViolations.filter(
    v => v.investigationStatus === 'confirmed' || v.investigationStatus === 'reported_to_president'
  );
  const pendingADAViolations = data.adaViolations.filter(
    v => v.investigationStatus === 'detected' || v.investigationStatus === 'under_investigation'
  );

  if (confirmedADAViolations.length > 0) {
    const totalADAAmount = confirmedADAViolations.reduce((sum, v) => sum + v.amount, 0);
    blockingConditions.push({
      category: 'Anti-Deficiency Act',
      description:
        `${confirmedADAViolations.length} confirmed ADA violation(s) totaling ` +
        `$${totalADAAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}. ` +
        `ADA violations are automatic blockers for an unqualified compliance opinion.`,
      severity: 'blocker',
      resolution:
        'ADA violations must be reported to the President and Congress per 31 USC §1351. ' +
        'The compliance opinion must be modified to reflect noncompliance.',
    });
  }

  if (pendingADAViolations.length > 0) {
    blockingConditions.push({
      category: 'Anti-Deficiency Act',
      description:
        `${pendingADAViolations.length} potential ADA violation(s) under investigation. ` +
        `Pending resolution may affect the compliance opinion.`,
      severity: 'warning',
      resolution:
        'Complete ADA investigations promptly per DoD FMR Vol 14, Ch 3. ' +
        'Report confirmed violations per 31 USC §1351.',
    });
  }

  // ── FIAR Assessment ──
  // Per DoD FIAR Plan: Components must demonstrate audit readiness
  if (data.fiarAssessment) {
    if (data.fiarAssessment.conclusion === 'not_ready') {
      blockingConditions.push({
        category: 'FIAR Readiness',
        description:
          `FIAR assessment conclusion is "not ready" (readiness score: ` +
          `${data.fiarAssessment.auditReadinessScore}). The component has not ` +
          `demonstrated sufficient audit readiness.`,
        severity: 'warning',
        resolution: 'Address FIAR corrective action plans and reassess audit readiness.',
      });
    }

    // Material weaknesses from FIAR
    if (data.fiarAssessment.materialWeaknesses && data.fiarAssessment.materialWeaknesses.length > 0) {
      for (const mw of data.fiarAssessment.materialWeaknesses) {
        otherMatter.push(
          `FIAR Material Weakness: ${mw}. Per the FIAR assessment dated ` +
          `${formatDate(data.fiarAssessment.assessmentDate)}, this material weakness ` +
          `requires corrective action.`
        );
      }
    }

    // Notice of Findings and Recommendations (NFR)
    if (data.fiarAssessment.noticeOfFindings && data.fiarAssessment.noticeOfFindings.length > 0) {
      otherMatter.push(
        `${data.fiarAssessment.noticeOfFindings.length} Notice(s) of Findings and ` +
        `Recommendations (NFR) were issued during the FIAR assessment period.`
      );
    }
  }

  // ── USSGL Compliance ──
  // Per TFM and OMB Circular A-136: USSGL compliance is required for
  // accurate federal financial reporting
  if (!data.ussglCompliant) {
    blockingConditions.push({
      category: 'USSGL Compliance',
      description:
        'USSGL account balances are not compliant with Treasury requirements. ' +
        'Non-compliance affects the reliability of financial statement line items.',
      severity: 'blocker',
      resolution:
        'Remediate USSGL posting errors and ensure all accounts comply with ' +
        'the USSGL TFM Supplement. Ref: TFM Part 2, Chapter 4700.',
    });
  }

  // ── Intragovernmental Reconciliation ──
  if (!data.intragovernmentalReconciled) {
    blockingConditions.push({
      category: 'Intragovernmental Reconciliation',
      description:
        'Intragovernmental transactions have not been fully reconciled with ' +
        'trading partners. Unreconciled differences may constitute material ' +
        'misstatements on the Balance Sheet and Statement of Net Cost.',
      severity: 'blocker',
      resolution:
        'Complete intragovernmental reconciliation with all trading partners. ' +
        'Ref: TFM Part 2, Chapter 4700; OMB Circular A-136.',
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 3: Determine the financial statement opinion
  // ══════════════════════════════════════════════════════════════════════════

  const blockers = blockingConditions.filter(bc => bc.severity === 'blocker');
  let opinionType: OpinionType;
  let rationale: string;

  if (scopeImpact === 'disclaimer') {
    opinionType = 'disclaimer';
    rationale =
      'A disclaimer of opinion is required due to pervasive scope limitations that ' +
      'prevent the auditor from obtaining sufficient appropriate audit evidence to provide ' +
      'a basis for an audit opinion on the financial statements. Ref: GAGAS 6.40.';
  } else if (
    materialWeaknessCount >= 3 ||
    (exceedsMateriality && unresolvedCriticalFindings >= 3) ||
    (sudExceedsMateriality && materialWeaknessCount >= 1) ||
    (!data.ussglCompliant && !data.intragovernmentalReconciled)
  ) {
    opinionType = 'adverse';
    rationale = buildFederalAdverseRationale(
      materialWeaknessCount, unresolvedCriticalFindings,
      sudExceedsMateriality, data.ussglCompliant, data.intragovernmentalReconciled
    );
  } else if (
    materialWeaknessCount >= 1 ||
    (exceedsMateriality && unresolvedCriticalFindings >= 1) ||
    sudExceedsMateriality ||
    scopeImpact === 'qualified' ||
    !data.ussglCompliant ||
    !data.intragovernmentalReconciled
  ) {
    opinionType = 'qualified';
    rationale = buildFederalQualifiedRationale(
      materialWeaknessCount, unresolvedCriticalFindings,
      sudExceedsMateriality, scopeImpact,
      data.ussglCompliant, data.intragovernmentalReconciled
    );
  } else if (
    unresolvedCriticalFindings === 0 &&
    materialWeaknessCount === 0 &&
    !sudExceedsMateriality &&
    scopeImpact === 'none' &&
    data.ussglCompliant &&
    data.intragovernmentalReconciled
  ) {
    opinionType = 'unqualified';
    rationale =
      'No material misstatements identified. Internal controls are operating effectively. ' +
      'USSGL accounts are compliant. Intragovernmental transactions are reconciled. ' +
      'Financial statements present fairly, in all material respects, in accordance with ' +
      'accounting standards issued by FASAB. Ref: GAGAS 6.20.';
  } else {
    opinionType = 'qualified';
    rationale =
      'Certain findings require attention but do not rise to the level of an adverse opinion. ' +
      'Ref: GAGAS 6.30.';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Phase 4: Build the three-part federal report
  // ══════════════════════════════════════════════════════════════════════════

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

  const opinionLabels: Record<OpinionType, string> = {
    unqualified: 'Unqualified (Clean) Opinion',
    qualified: 'Qualified Opinion',
    adverse: 'Adverse Opinion',
    disclaimer: 'Disclaimer of Opinion',
  };

  // Generate the three report components
  const complianceReport = generateComplianceReport(data, confirmedADAViolations, pendingADAViolations);
  const internalControlReport = generateInternalControlReport(data, factors);
  const adaComplianceStatement = generateADAStatement(data, confirmedADAViolations, pendingADAViolations);
  const draftText = generateFederalOpinionText(opinionType, data, factors, emphasisOfMatter, otherMatter);

  const readyForIssuance = opinionType === 'unqualified' ? blockers.length === 0 : true;

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
    readyForIssuance,
    complianceReport,
    internalControlReport,
    adaComplianceStatement,
  };
}

/**
 * Generate the full formatted federal audit report text combining all three
 * components of the federal audit report.
 *
 * Per OMB Bulletin on Audit Requirements for Federal Financial Statements:
 * The audit report includes:
 * 1. Independent Auditor's Report on Financial Statements
 * 2. Independent Auditor's Report on Internal Control over Financial Reporting
 * 3. Independent Auditor's Report on Compliance with Laws and Regulations
 *
 * @param result - the FederalOpinionResult
 * @param data - the FederalOpinionData
 * @returns Full formatted federal audit report text
 */
export function generateFederalAuditReportText(
  result: FederalOpinionResult,
  data: FederalOpinionData,
): string {
  const sep = '='.repeat(80);
  const parts: string[] = [];

  // ── Cover Page ──
  parts.push(sep);
  parts.push('INDEPENDENT AUDITOR\'S REPORT');
  parts.push('');
  parts.push(`${data.dodComponent}`);
  parts.push(`Fiscal Year Ended ${data.fiscalYearEnd}`);
  parts.push('');
  parts.push(`Audit Firm: ${data.auditorFirmName || '[Audit Firm Name]'}`);
  parts.push(`Report Date: ${formatDate(data.generatedAt)}`);
  parts.push(sep);

  // ── Part I: Financial Statement Opinion ──
  parts.push('');
  parts.push(sep);
  parts.push('PART I: INDEPENDENT AUDITOR\'S REPORT ON THE FINANCIAL STATEMENTS');
  parts.push(sep);
  parts.push('');
  parts.push(result.draftText);

  // ── Part II: Internal Control Report ──
  parts.push('');
  parts.push(sep);
  parts.push('PART II: INDEPENDENT AUDITOR\'S REPORT ON INTERNAL CONTROL');
  parts.push('OVER FINANCIAL REPORTING');
  parts.push(sep);
  parts.push('');
  parts.push(result.internalControlReport);

  // ── Part III: Compliance Report ──
  parts.push('');
  parts.push(sep);
  parts.push('PART III: INDEPENDENT AUDITOR\'S REPORT ON COMPLIANCE');
  parts.push('WITH LAWS AND REGULATIONS');
  parts.push(sep);
  parts.push('');
  parts.push(result.complianceReport);

  // ── ADA Statement (within compliance report) ──
  if (result.adaComplianceStatement) {
    parts.push('');
    parts.push(result.adaComplianceStatement);
  }

  // ── Appendix: Blocking Conditions ──
  if (result.blockingConditions.length > 0) {
    parts.push('');
    parts.push(sep);
    parts.push('APPENDIX: BLOCKING CONDITIONS AND REQUIRED ACTIONS');
    parts.push(sep);
    parts.push('');

    for (let i = 0; i < result.blockingConditions.length; i++) {
      const bc = result.blockingConditions[i];
      parts.push(`  ${i + 1}. [${bc.severity.toUpperCase()}] ${bc.category}`);
      parts.push(`     ${bc.description}`);
      parts.push(`     Resolution: ${bc.resolution}`);
      parts.push('');
    }
  }

  // ── Footer ──
  parts.push(sep);
  parts.push('[DRAFT — This federal audit report is generated based on automated');
  parts.push('analysis and requires professional review before issuance. The report');
  parts.push('has been prepared in accordance with Government Auditing Standards');
  parts.push('(GAGAS) and OMB Bulletin on Audit Requirements for Federal Financial');
  parts.push('Statements.]');
  parts.push(sep);

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Internal: Rationale Builders
// ---------------------------------------------------------------------------

function buildFederalAdverseRationale(
  mwCount: number,
  unresolvedCritical: number,
  sudExceeds: boolean,
  ussglCompliant: boolean,
  igtReconciled: boolean,
): string {
  const reasons: string[] = [];
  if (mwCount >= 3) reasons.push(`${mwCount} material weaknesses in internal control`);
  if (unresolvedCritical >= 3) reasons.push(`${unresolvedCritical} unresolved critical findings`);
  if (sudExceeds) reasons.push('aggregate uncorrected misstatements exceed materiality');
  if (!ussglCompliant) reasons.push('USSGL accounts are non-compliant with Treasury requirements');
  if (!igtReconciled) reasons.push('intragovernmental transactions are not reconciled');
  return (
    `An adverse opinion is warranted because: ${reasons.join('; ')}. ` +
    `These misstatements are material and pervasive to the financial statements ` +
    `prepared in accordance with FASAB standards. Ref: GAGAS 6.35.`
  );
}

function buildFederalQualifiedRationale(
  mwCount: number,
  unresolvedCritical: number,
  sudExceeds: boolean,
  scopeImpact: string,
  ussglCompliant: boolean,
  igtReconciled: boolean,
): string {
  const reasons: string[] = [];
  if (mwCount >= 1) reasons.push(`${mwCount} material weakness(es) in internal control`);
  if (unresolvedCritical >= 1) reasons.push(`${unresolvedCritical} unresolved critical finding(s)`);
  if (sudExceeds) reasons.push('aggregate uncorrected misstatements exceed materiality');
  if (scopeImpact === 'qualified') reasons.push('material scope limitations');
  if (!ussglCompliant) reasons.push('USSGL non-compliance');
  if (!igtReconciled) reasons.push('unreconciled intragovernmental transactions');
  return (
    `A qualified opinion is warranted because: ${reasons.join('; ')}. ` +
    `The effects are material but not pervasive to the financial statements as a whole. ` +
    `Ref: GAGAS 6.30.`
  );
}

// ---------------------------------------------------------------------------
// Internal: Report Text Generators
// ---------------------------------------------------------------------------

function generateFederalOpinionText(
  type: OpinionType,
  data: FederalOpinionData,
  factors: FederalOpinionResult['factors'],
  eom: FederalOpinionResult['emphasisOfMatter'],
  om: string[],
): string {
  const firmName = data.auditorFirmName || '[Audit Firm Name]';
  const today = formatDate(data.generatedAt);
  const lines: string[] = [];

  lines.push(`To the Secretary of Defense and Inspector General`);
  lines.push(`${data.dodComponent}`);
  lines.push('');
  lines.push('Report on the Financial Statements');
  lines.push('');

  // ── Opinion paragraph ──
  // Federal opinions reference FASAB/SFFAS, NOT GAAP
  switch (type) {
    case 'unqualified':
      lines.push('Opinion');
      lines.push('');
      lines.push(
        `In our opinion, the accompanying financial statements of ${data.dodComponent} ` +
        `present fairly, in all material respects, the financial position of ` +
        `${data.dodComponent} as of ${data.fiscalYearEnd}, and its net cost of operations, ` +
        `changes in net position, and budgetary resources for the year then ended, ` +
        `in accordance with U.S. generally accepted accounting principles applicable ` +
        `to federal entities as promulgated by the Federal Accounting Standards ` +
        `Advisory Board (FASAB).`
      );
      break;

    case 'qualified':
      lines.push('Qualified Opinion');
      lines.push('');
      lines.push(
        `In our opinion, except for the effects of the matter(s) described in the ` +
        `Basis for Qualified Opinion section of our report, the accompanying financial ` +
        `statements of ${data.dodComponent} present fairly, in all material respects, ` +
        `the financial position of ${data.dodComponent} as of ${data.fiscalYearEnd}, ` +
        `and its net cost of operations, changes in net position, and budgetary resources ` +
        `for the year then ended, in accordance with U.S. generally accepted accounting ` +
        `principles applicable to federal entities as promulgated by FASAB.`
      );
      break;

    case 'adverse':
      lines.push('Adverse Opinion');
      lines.push('');
      lines.push(
        `In our opinion, because of the significance of the matter(s) described in the ` +
        `Basis for Adverse Opinion section of our report, the accompanying financial ` +
        `statements of ${data.dodComponent} do not present fairly, in accordance with ` +
        `U.S. generally accepted accounting principles applicable to federal entities ` +
        `as promulgated by FASAB, the financial position of ${data.dodComponent} ` +
        `as of ${data.fiscalYearEnd}, or its net cost of operations, changes in net ` +
        `position, or budgetary resources for the year then ended.`
      );
      break;

    case 'disclaimer':
      lines.push('Disclaimer of Opinion');
      lines.push('');
      lines.push(
        `We do not express an opinion on the accompanying financial statements of ` +
        `${data.dodComponent}. Because of the significance of the matter(s) described ` +
        `in the Basis for Disclaimer of Opinion section of our report, we have not been ` +
        `able to obtain sufficient appropriate audit evidence to provide a basis for an ` +
        `audit opinion on these financial statements.`
      );
      break;
  }
  lines.push('');

  // ── Basis for opinion ──
  if (type === 'qualified' || type === 'adverse') {
    const basisTitle = type === 'qualified' ? 'Basis for Qualified Opinion' : 'Basis for Adverse Opinion';
    lines.push(basisTitle);
    lines.push('');

    if (factors.materialWeaknessCount > 0) {
      lines.push(
        `We identified ${factors.materialWeaknessCount} material weakness(es) in the ` +
        `entity's internal control over financial reporting.`
      );
    }
    if (factors.unresolvedCriticalFindings > 0) {
      lines.push(
        `${factors.unresolvedCriticalFindings} critical finding(s) remain unresolved.`
      );
    }
    if (factors.sudExceedsMateriality) {
      lines.push(
        `The aggregate effect of uncorrected misstatements exceeds the materiality ` +
        `threshold of $${data.materialityThreshold.toLocaleString()}.`
      );
    }
    lines.push('');
  } else if (type === 'disclaimer') {
    lines.push('Basis for Disclaimer of Opinion');
    lines.push('');
    lines.push(
      `We were unable to obtain sufficient appropriate audit evidence to provide a ` +
      `basis for an audit opinion due to pervasive scope limitations.`
    );
    lines.push('');
  } else {
    lines.push('Basis for Opinion');
    lines.push('');
    lines.push(
      `We conducted our audit in accordance with auditing standards generally accepted ` +
      `in the United States of America; the standards applicable to financial audits ` +
      `contained in Government Auditing Standards, issued by the Comptroller General ` +
      `of the United States; and OMB Bulletin on Audit Requirements for Federal ` +
      `Financial Statements. Our responsibilities under those standards are further ` +
      `described in the Auditor's Responsibilities section of our report.`
    );
    lines.push('');
  }

  // ── Emphasis of Matter paragraphs ──
  for (const item of eom) {
    lines.push(`Emphasis of Matter — ${item.title}`);
    lines.push('');
    lines.push(item.paragraph);
    lines.push('');
    lines.push('Our opinion is not modified with respect to this matter.');
    lines.push('');
  }

  // ── Other Matter paragraphs ──
  for (const item of om) {
    lines.push('Other Matter');
    lines.push('');
    lines.push(item);
    lines.push('');
  }

  // ── Management's responsibility ──
  lines.push('Responsibilities of Management for the Financial Statements');
  lines.push('');
  lines.push(
    `Management is responsible for the preparation and fair presentation of these ` +
    `financial statements in accordance with U.S. generally accepted accounting ` +
    `principles applicable to federal entities as promulgated by FASAB, and for the ` +
    `design, implementation, and maintenance of internal control relevant to the ` +
    `preparation and fair presentation of financial statements that are free from ` +
    `material misstatement, whether due to fraud or error.`
  );
  lines.push('');

  // ── Auditor's responsibility ──
  lines.push('Auditor\'s Responsibilities for the Audit of the Financial Statements');
  lines.push('');
  lines.push(
    `Our objectives are to obtain reasonable assurance about whether the financial ` +
    `statements as a whole are free from material misstatement, whether due to fraud ` +
    `or error, and to issue an auditor's report that includes our opinion. Reasonable ` +
    `assurance is a high level of assurance but is not absolute assurance. We conducted ` +
    `our audit in accordance with Government Auditing Standards (GAGAS) and the OMB ` +
    `Bulletin on Audit Requirements for Federal Financial Statements.`
  );
  lines.push('');

  // ── Signature ──
  lines.push(firmName);
  lines.push(today);

  return lines.join('\n');
}

function generateComplianceReport(
  data: FederalOpinionData,
  confirmedADA: ADAViolation[],
  pendingADA: ADAViolation[],
): string {
  const lines: string[] = [];
  const firmName = data.auditorFirmName || '[Audit Firm Name]';
  const today = formatDate(data.generatedAt);

  lines.push(`To the Secretary of Defense and Inspector General`);
  lines.push(`${data.dodComponent}`);
  lines.push('');
  lines.push(
    `In connection with our audit of the financial statements of ${data.dodComponent} ` +
    `as of and for the year ended ${data.fiscalYearEnd}, we tested compliance with ` +
    `selected provisions of applicable laws, regulations, contracts, and grant ` +
    `agreements consistent with our professional responsibilities under Government ` +
    `Auditing Standards and the OMB Bulletin on Audit Requirements for Federal ` +
    `Financial Statements.`
  );
  lines.push('');

  // Laws tested
  lines.push('Laws and Regulations Tested:');
  lines.push('  - Anti-Deficiency Act (31 USC Chapter 13, Subchapter III)');
  lines.push('  - Federal Financial Management Improvement Act of 1996 (FFMIA)');
  lines.push('  - Federal Managers\' Financial Integrity Act (FMFIA)');
  lines.push('  - Chief Financial Officers Act of 1990 (31 USC §3515)');
  lines.push('  - Federal Information Security Modernization Act (FISMA)');
  lines.push('  - Prompt Payment Act (31 USC §3901-3907)');
  lines.push('  - Debt Collection Improvement Act (31 USC §3711-3720E)');
  lines.push('  - Pay and Allowance provisions (37 USC; 5 USC)');
  lines.push('');

  // ADA compliance
  if (confirmedADA.length === 0 && pendingADA.length === 0) {
    lines.push(
      'Anti-Deficiency Act Compliance: No violations of the Anti-Deficiency Act ' +
      'were identified during our audit.'
    );
  } else {
    if (confirmedADA.length > 0) {
      const totalAmount = confirmedADA.reduce((s, v) => s + v.amount, 0);
      lines.push(
        `Anti-Deficiency Act Compliance: We identified ${confirmedADA.length} confirmed ` +
        `ADA violation(s) totaling $${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}:`
      );
      for (const v of confirmedADA) {
        lines.push(
          `  - ${v.violationType.replace(/_/g, ' ').toUpperCase()}: ${v.description} ` +
          `($${v.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}) — ` +
          `Statutory basis: ${v.statutoryBasis}. Status: ${v.investigationStatus.replace(/_/g, ' ')}.`
        );
      }
      lines.push('');
      lines.push(
        'These violations have been reported as required by 31 USC §1351 and ' +
        '31 USC §1517.'
      );
    }

    if (pendingADA.length > 0) {
      lines.push('');
      lines.push(
        `Additionally, ${pendingADA.length} potential ADA violation(s) are under ` +
        `investigation and have not yet been confirmed.`
      );
    }
  }
  lines.push('');

  // FFMIA compliance
  lines.push('FFMIA Compliance:');
  if (data.ussglCompliant && data.intragovernmentalReconciled) {
    lines.push(
      `  ${data.dodComponent}'s financial management systems substantially comply ` +
      `with the three FFMIA requirements:`
    );
    lines.push('  1. Federal financial management systems requirements');
    lines.push('  2. Applicable Federal accounting standards (FASAB)');
    lines.push('  3. United States Standard General Ledger (USSGL) at the transaction level');
  } else {
    lines.push(
      `  ${data.dodComponent}'s financial management systems do not substantially comply ` +
      `with one or more FFMIA requirements:`
    );
    if (!data.ussglCompliant) {
      lines.push('  - USSGL accounts do not comply with Treasury requirements.');
    }
    if (!data.intragovernmentalReconciled) {
      lines.push('  - Intragovernmental transactions are not fully reconciled.');
    }
  }
  lines.push('');

  lines.push(
    'The objective of our tests of compliance was not to provide an opinion on ' +
    'compliance with laws and regulations. Accordingly, we do not express such an ' +
    'opinion. However, our tests disclosed the instances of noncompliance noted above.'
  );
  lines.push('');

  lines.push(firmName);
  lines.push(today);

  return lines.join('\n');
}

function generateInternalControlReport(
  data: FederalOpinionData,
  factors: FederalOpinionResult['factors'],
): string {
  const lines: string[] = [];
  const firmName = data.auditorFirmName || '[Audit Firm Name]';
  const today = formatDate(data.generatedAt);

  lines.push(`To the Secretary of Defense and Inspector General`);
  lines.push(`${data.dodComponent}`);
  lines.push('');
  lines.push(
    `In planning and performing our audit of the financial statements of ` +
    `${data.dodComponent} as of and for the year ended ${data.fiscalYearEnd}, ` +
    `we considered ${data.dodComponent}'s internal control over financial reporting ` +
    `(internal control) as a basis for designing audit procedures that are appropriate ` +
    `in the circumstances for the purpose of expressing our opinion on the financial ` +
    `statements, but not for the purpose of expressing an opinion on the effectiveness ` +
    `of ${data.dodComponent}'s internal control. Accordingly, we do not express an ` +
    `opinion on the effectiveness of ${data.dodComponent}'s internal control over ` +
    `financial reporting.`
  );
  lines.push('');

  // ── Material Weaknesses ──
  if (factors.materialWeaknessCount > 0) {
    lines.push(
      'A deficiency in internal control exists when the design or operation of a ' +
      'control does not allow management or employees, in the normal course of ' +
      'performing their assigned functions, to prevent, or detect and correct, ' +
      'misstatements on a timely basis. A material weakness is a deficiency, or a ' +
      'combination of deficiencies, in internal control, such that there is a ' +
      'reasonable possibility that a material misstatement of the entity\'s financial ' +
      'statements will not be prevented, or detected and corrected, on a timely basis.'
    );
    lines.push('');
    lines.push(
      `We identified ${factors.materialWeaknessCount} material weakness(es) ` +
      `during our audit:`
    );
    lines.push('');

    // List material weaknesses from findings
    const mwFindings = data.findings.filter(
      f => f.severity === 'critical' && (f.status === 'open' || f.status === 'in_review')
    );
    for (let i = 0; i < mwFindings.length; i++) {
      lines.push(
        `  ${i + 1}. ${mwFindings[i].title || `Material Weakness #${i + 1}`}: ` +
        `${mwFindings[i].framework || 'General'} — ` +
        `Impact: $${(mwFindings[i].amountImpact ?? 0).toLocaleString()}.`
      );
    }
    lines.push('');
  } else {
    lines.push(
      'Our consideration of internal control was for the limited purpose described in ' +
      'the first paragraph and was not designed to identify all deficiencies in internal ' +
      'control that might be material weaknesses or significant deficiencies.'
    );
    lines.push('');
  }

  // ── Significant Deficiencies ──
  if (factors.significantDeficiencyCount > 0) {
    lines.push(
      'A significant deficiency is a deficiency, or a combination of deficiencies, ' +
      'in internal control that is less severe than a material weakness, yet important ' +
      'enough to merit attention by those charged with governance.'
    );
    lines.push('');
    lines.push(
      `We identified ${factors.significantDeficiencyCount} significant deficiency(ies) ` +
      `during our audit.`
    );
    lines.push('');
  }

  // ── FIAR Assessment Reference ──
  if (data.fiarAssessment) {
    lines.push(
      `FIAR Assessment: The most recent FIAR assessment dated ` +
      `${formatDate(data.fiarAssessment.assessmentDate)} concluded that ` +
      `${data.dodComponent} is "${data.fiarAssessment.conclusion.replace(/_/g, ' ')}" ` +
      `with a readiness score of ${data.fiarAssessment.auditReadinessScore}.`
    );

    if (data.fiarAssessment.correctiveActionPlans && data.fiarAssessment.correctiveActionPlans.length > 0) {
      lines.push('');
      lines.push(`  Corrective Action Plans: ${data.fiarAssessment.correctiveActionPlans.length} active CAP(s).`);
    }
    lines.push('');
  }

  // ── Standard closing ──
  lines.push(
    'This report is intended solely for the information and use of the management ' +
    'of ' + data.dodComponent + ', the DoD Inspector General, OMB, the U.S. ' +
    'Government Accountability Office, and the U.S. Congress and is not intended to ' +
    'be and should not be used by anyone other than these specified parties.'
  );
  lines.push('');

  lines.push(firmName);
  lines.push(today);

  return lines.join('\n');
}

function generateADAStatement(
  data: FederalOpinionData,
  confirmedADA: ADAViolation[],
  pendingADA: ADAViolation[],
): string {
  const lines: string[] = [];
  const sep = '-'.repeat(60);

  lines.push(sep);
  lines.push('ANTI-DEFICIENCY ACT (ADA) COMPLIANCE STATEMENT');
  lines.push(sep);
  lines.push('');
  lines.push(
    `Per 31 USC §1341-1342 and DoD FMR Volume 14, Chapter 3, ` +
    `the following is a summary of Anti-Deficiency Act compliance ` +
    `for ${data.dodComponent} for the fiscal year ended ${data.fiscalYearEnd}:`
  );
  lines.push('');

  if (confirmedADA.length === 0 && pendingADA.length === 0) {
    lines.push(
      'No Anti-Deficiency Act violations were identified or reported during the ' +
      'fiscal year. The entity has maintained compliance with the Anti-Deficiency Act ' +
      'as it relates to obligations and expenditures.'
    );
  } else {
    // Summary table
    lines.push(`  Confirmed Violations:     ${confirmedADA.length}`);
    lines.push(`  Pending Investigations:   ${pendingADA.length}`);

    if (confirmedADA.length > 0) {
      const totalConfirmed = confirmedADA.reduce((s, v) => s + v.amount, 0);
      lines.push(`  Total Confirmed Amount:   $${totalConfirmed.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    }

    lines.push('');

    // Detail for each confirmed violation
    if (confirmedADA.length > 0) {
      lines.push('  Confirmed ADA Violations:');
      lines.push('');
      for (let i = 0; i < confirmedADA.length; i++) {
        const v = confirmedADA[i];
        lines.push(`  Violation ${i + 1}:`);
        lines.push(`    Type:             ${v.violationType.replace(/_/g, ' ')}`);
        lines.push(`    Amount:           $${v.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
        lines.push(`    Statutory Basis:  ${v.statutoryBasis}`);
        lines.push(`    Description:      ${v.description}`);
        lines.push(`    Discovered:       ${v.discoveredDate}`);
        lines.push(`    Reported:         ${v.reportedDate ?? 'Not yet reported'}`);
        lines.push(`    Status:           ${v.investigationStatus.replace(/_/g, ' ')}`);
        if (v.responsibleOfficer) {
          lines.push(`    Responsible:      ${v.responsibleOfficer}`);
        }
        if (v.correctiveAction) {
          lines.push(`    Corrective Action: ${v.correctiveAction}`);
        }
        lines.push('');
      }
    }

    // Pending investigations
    if (pendingADA.length > 0) {
      lines.push('  Pending ADA Investigations:');
      lines.push('');
      for (let i = 0; i < pendingADA.length; i++) {
        const v = pendingADA[i];
        lines.push(`  Investigation ${i + 1}: ${v.violationType.replace(/_/g, ' ')} — $${v.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
        lines.push(`    ${v.description}`);
        lines.push(`    Status: ${v.investigationStatus.replace(/_/g, ' ')}`);
        lines.push('');
      }
    }

    lines.push(
      'Per 31 USC §1351, confirmed ADA violations must be reported to the ' +
      'President (through OMB) and Congress. Per 31 USC §1517, violations of ' +
      'apportionment or administrative subdivision must be reported to the ' +
      'President and Congress.'
    );
  }

  lines.push('');
  lines.push(sep);

  return lines.join('\n');
}
