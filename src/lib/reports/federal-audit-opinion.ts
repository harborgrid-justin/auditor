/**
 * Federal Audit Opinion Generator
 *
 * Generates a comprehensive federal audit report that integrates all
 * DoD FMR-specific audit components including:
 *
 * - Opinion on Financial Statements (per Government Auditing Standards)
 * - Report on Internal Controls
 * - Report on Compliance (including ADA violations)
 * - FIAR Assessment Summary
 * - Management Letter with Findings and Recommendations
 *
 * References:
 *   - Government Auditing Standards (Yellow Book)
 *   - OMB Bulletin: Audit Requirements for Federal Financial Statements
 *   - DoD 7000.14-R (FMR), Volume 6A: Reporting Policy
 *   - 31 U.S.C. §3521: Audits by Comptroller General
 *   - Chief Financial Officers Act of 1990
 *   - Federal Financial Management Improvement Act (FFMIA)
 */

import type { AuditFinding } from '@/types/findings';
import type { ADAViolation, FIARAssessment, DualTrackReconciliation, SF133Data } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Public Interfaces
// ---------------------------------------------------------------------------

export interface FederalAuditOpinionInput {
  findings: AuditFinding[];
  adaViolations: ADAViolation[];
  fiarAssessment?: FIARAssessment;
  dualTrackReconciliation?: DualTrackReconciliation;
  sf133Data?: SF133Data;
  fiscalYear: number;
  componentName: string;
}

export type FederalOpinionType = 'unmodified' | 'qualified' | 'adverse' | 'disclaimer';

export interface FederalAuditReport {
  opinionOnFinancialStatements: {
    type: FederalOpinionType;
    text: string;
    basis: string[];
  };
  reportOnInternalControls: {
    materialWeaknesses: string[];
    significantDeficiencies: string[];
    text: string;
  };
  reportOnCompliance: {
    adaViolations: number;
    fmrViolations: number;
    text: string;
  };
  fiarAssessment: {
    score: number;
    conclusion: string;
    text: string;
  };
  managementLetter: {
    findings: string[];
    recommendations: string[];
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Determine the appropriate federal audit opinion type based on all
 * available audit evidence.
 *
 * Per Government Auditing Standards (Yellow Book) and OMB audit guidance:
 *
 * - Disclaimer: Issued when the auditor is unable to obtain sufficient
 *   appropriate audit evidence. In the federal context, this occurs when
 *   both FIAR assessment data and USSGL data are missing, making it
 *   impossible to form an opinion.
 *
 * - Adverse: Issued when financial statements are materially misstated
 *   and the effects are pervasive. Triggers include critical findings,
 *   confirmed ADA violations with material amounts, or FIAR score < 50.
 *
 * - Qualified: Issued when misstatements are material but not pervasive,
 *   or when there are minor compliance issues. Triggers include high
 *   findings without critical issues, minor ADA concerns, or FIAR
 *   score between 50-79.
 *
 * - Unmodified: Issued when financial statements are presented fairly in
 *   all material respects. Requires zero critical/high findings, zero
 *   ADA violations, FIAR score >= 80, and dual-track reconciliation.
 *
 * @param input - all audit evidence and assessment data
 * @returns FederalOpinionType
 */
export function determineFederalOpinionType(
  input: FederalAuditOpinionInput
): FederalOpinionType {
  const { findings, adaViolations, fiarAssessment, dualTrackReconciliation } = input;

  // --- Disclaimer: Insufficient audit evidence ---
  // If both FIAR assessment AND USSGL data are missing, the auditor
  // cannot obtain sufficient appropriate audit evidence to form an opinion.
  const hasFiarData = fiarAssessment !== undefined && fiarAssessment !== null;
  const hasUSSGLData = findings.some(f => f.framework === 'DOD_FMR');
  if (!hasFiarData && !hasUSSGLData) {
    return 'disclaimer';
  }

  // --- Adverse: Pervasive material misstatement ---
  const criticalFindings = findings.filter(f => f.severity === 'critical');
  const confirmedADAWithAmount = adaViolations.filter(
    v => v.investigationStatus === 'confirmed' && v.amount > 0
  );
  const fiarScore = fiarAssessment?.auditReadinessScore ?? 100;

  if (
    criticalFindings.length > 0 ||
    confirmedADAWithAmount.length > 0 ||
    fiarScore < 50
  ) {
    return 'adverse';
  }

  // --- Qualified: Material but not pervasive ---
  const highFindings = findings.filter(f => f.severity === 'high');
  const hasMinorADAIssues = adaViolations.some(
    v => v.investigationStatus !== 'confirmed' && v.investigationStatus !== 'resolved'
  );

  if (
    (highFindings.length > 0 && criticalFindings.length === 0) ||
    hasMinorADAIssues ||
    (fiarScore >= 50 && fiarScore < 80)
  ) {
    return 'qualified';
  }

  // --- Unmodified: Fair presentation ---
  const hasNoCriticalOrHigh = criticalFindings.length === 0 && highFindings.length === 0;
  const hasNoADAViolations = adaViolations.length === 0;
  const fiarSufficient = fiarScore >= 80;
  const isReconciled = dualTrackReconciliation?.isReconciled ?? true;

  if (hasNoCriticalOrHigh && hasNoADAViolations && fiarSufficient && isReconciled) {
    return 'unmodified';
  }

  // Default to qualified if conditions are ambiguous
  return 'qualified';
}

/**
 * Generate the complete Federal Audit Report with all five sections.
 *
 * The report follows the structure required by Government Auditing Standards
 * (Yellow Book) for federal financial statement audits, enhanced with
 * DoD-specific requirements from the FMR:
 *
 * 1. Opinion on Financial Statements
 * 2. Report on Internal Controls over Financial Reporting
 * 3. Report on Compliance with Laws and Regulations
 * 4. FIAR Assessment Summary
 * 5. Management Letter (Findings and Recommendations)
 *
 * @param input - all audit evidence and assessment data
 * @returns FederalAuditReport with all five sections
 */
export function generateFederalAuditReport(
  input: FederalAuditOpinionInput
): FederalAuditReport {
  const opinionType = determineFederalOpinionType(input);

  return {
    opinionOnFinancialStatements: generateOpinionSection(input, opinionType),
    reportOnInternalControls: generateInternalControlsSection(input),
    reportOnCompliance: generateComplianceSection(input),
    fiarAssessment: generateFIARSection(input),
    managementLetter: generateManagementLetter(input),
  };
}

// ---------------------------------------------------------------------------
// Section Generators
// ---------------------------------------------------------------------------

function generateOpinionSection(
  input: FederalAuditOpinionInput,
  opinionType: FederalOpinionType
): FederalAuditReport['opinionOnFinancialStatements'] {
  const { findings, adaViolations, fiarAssessment, componentName, fiscalYear } = input;
  const basis: string[] = [];

  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;
  const confirmedADA = adaViolations.filter(v => v.investigationStatus === 'confirmed');
  const fiarScore = fiarAssessment?.auditReadinessScore;

  if (criticalCount > 0) {
    basis.push(`${criticalCount} critical finding(s) identified during the audit`);
  }
  if (highCount > 0) {
    basis.push(`${highCount} high-severity finding(s) identified`);
  }
  if (confirmedADA.length > 0) {
    const adaTotal = confirmedADA.reduce((sum, v) => sum + v.amount, 0);
    basis.push(
      `${confirmedADA.length} confirmed Anti-Deficiency Act violation(s) totaling $${adaTotal.toLocaleString()}`
    );
  }
  if (fiarScore !== undefined && fiarScore < 80) {
    basis.push(`FIAR audit readiness score of ${fiarScore} is below the 80-point threshold`);
  }
  if (input.dualTrackReconciliation && !input.dualTrackReconciliation.isReconciled) {
    basis.push(
      `Budgetary-proprietary dual-track reconciliation has a difference of $${input.dualTrackReconciliation.difference.toLocaleString()}`
    );
  }

  let text: string;

  switch (opinionType) {
    case 'unmodified':
      text = generateUnmodifiedOpinionText(componentName, fiscalYear);
      break;
    case 'qualified':
      text = generateQualifiedOpinionText(componentName, fiscalYear, basis);
      break;
    case 'adverse':
      text = generateAdverseOpinionText(componentName, fiscalYear, basis);
      break;
    case 'disclaimer':
      text = generateDisclaimerText(componentName, fiscalYear);
      break;
  }

  return { type: opinionType, text, basis };
}

function generateInternalControlsSection(
  input: FederalAuditOpinionInput
): FederalAuditReport['reportOnInternalControls'] {
  const { findings, fiarAssessment } = input;

  // Material weaknesses from FIAR assessment and critical findings
  const materialWeaknesses: string[] = [];
  if (fiarAssessment?.materialWeaknesses) {
    materialWeaknesses.push(...fiarAssessment.materialWeaknesses);
  }

  const criticalFindings = findings.filter(f => f.severity === 'critical');
  for (const finding of criticalFindings) {
    materialWeaknesses.push(
      `${finding.ruleId}: ${finding.title} - ${finding.description.substring(0, 200)}`
    );
  }

  // Significant deficiencies from high-severity findings
  const significantDeficiencies: string[] = [];
  const highFindings = findings.filter(f => f.severity === 'high');
  for (const finding of highFindings) {
    significantDeficiencies.push(
      `${finding.ruleId}: ${finding.title} - ${finding.description.substring(0, 200)}`
    );
  }

  // FIAR notice of findings
  if (fiarAssessment?.noticeOfFindings) {
    for (const nof of fiarAssessment.noticeOfFindings) {
      significantDeficiencies.push(`FIAR Notice of Finding: ${nof}`);
    }
  }

  const mwCount = materialWeaknesses.length;
  const sdCount = significantDeficiencies.length;

  let text: string;
  if (mwCount === 0 && sdCount === 0) {
    text = [
      'REPORT ON INTERNAL CONTROL OVER FINANCIAL REPORTING',
      '',
      `In planning and performing our audit of the financial statements of ${input.componentName} ` +
      `as of and for the fiscal year ended September 30, ${input.fiscalYear}, in accordance with ` +
      'auditing standards generally accepted in the United States of America and the standards ' +
      'applicable to financial audits contained in Government Auditing Standards issued by the ' +
      'Comptroller General of the United States, we considered the internal control over financial ' +
      'reporting as a basis for designing audit procedures that are appropriate in the circumstances ' +
      'for the purpose of expressing our opinion on the financial statements, but not for the ' +
      'purpose of expressing an opinion on the effectiveness of internal control.',
      '',
      'In connection with our audit, no material weaknesses or significant deficiencies in ' +
      'internal control over financial reporting were identified.',
    ].join('\n');
  } else {
    text = [
      'REPORT ON INTERNAL CONTROL OVER FINANCIAL REPORTING',
      '',
      `In planning and performing our audit of the financial statements of ${input.componentName} ` +
      `as of and for the fiscal year ended September 30, ${input.fiscalYear}, in accordance with ` +
      'auditing standards generally accepted in the United States of America and Government Auditing ' +
      'Standards, we considered the internal control over financial reporting.',
      '',
      mwCount > 0
        ? `We identified ${mwCount} material weakness(es) in internal control over financial reporting. ` +
          'A material weakness is a deficiency, or combination of deficiencies, in internal control ' +
          'such that there is a reasonable possibility that a material misstatement of the financial ' +
          'statements will not be prevented, or detected and corrected, on a timely basis.'
        : '',
      '',
      sdCount > 0
        ? `We identified ${sdCount} significant deficiency(ies) in internal control. ` +
          'A significant deficiency is a deficiency, or combination of deficiencies, in internal ' +
          'control that is less severe than a material weakness, yet important enough to merit ' +
          'attention by those charged with governance.'
        : '',
    ].filter(line => line !== '').join('\n');
  }

  return {
    materialWeaknesses,
    significantDeficiencies,
    text,
  };
}

function generateComplianceSection(
  input: FederalAuditOpinionInput
): FederalAuditReport['reportOnCompliance'] {
  const { findings, adaViolations, componentName, fiscalYear } = input;

  const confirmedOrReportedADA = adaViolations.filter(
    v => v.investigationStatus === 'confirmed' || v.investigationStatus === 'reported_to_president'
  );
  const adaCount = confirmedOrReportedADA.length;

  const fmrFindings = findings.filter(f => f.framework === 'DOD_FMR');
  const fmrViolationCount = fmrFindings.filter(
    f => f.severity === 'critical' || f.severity === 'high'
  ).length;

  const totalADAAmount = confirmedOrReportedADA.reduce((sum, v) => sum + v.amount, 0);

  let text: string;
  if (adaCount === 0 && fmrViolationCount === 0) {
    text = [
      'REPORT ON COMPLIANCE WITH LAWS AND REGULATIONS',
      '',
      `As part of obtaining reasonable assurance about whether the financial statements of ` +
      `${componentName} are free from material misstatement, we performed tests of compliance ` +
      'with certain provisions of laws, regulations, contracts, and grant agreements, ' +
      'noncompliance with which could have a direct and material effect on the financial ' +
      'statements. These tests included compliance with:',
      '  - Anti-Deficiency Act (31 U.S.C. 1341, 1342, 1351, 1511-1519)',
      '  - DoD Financial Management Regulation (7000.14-R)',
      '  - Federal Financial Management Improvement Act (FFMIA)',
      '  - Prompt Payment Act (31 U.S.C. 3901-3907)',
      '',
      'The results of our tests disclosed no instances of noncompliance or other matters ' +
      'that are required to be reported under Government Auditing Standards.',
    ].join('\n');
  } else {
    const sections: string[] = [
      'REPORT ON COMPLIANCE WITH LAWS AND REGULATIONS',
      '',
      `As part of obtaining reasonable assurance about whether the financial statements of ` +
      `${componentName} are free from material misstatement, we performed tests of compliance ` +
      'with certain provisions of laws, regulations, contracts, and grant agreements.',
      '',
    ];

    if (adaCount > 0) {
      sections.push(
        `ANTI-DEFICIENCY ACT VIOLATIONS:`,
        `Our testing identified ${adaCount} confirmed Anti-Deficiency Act violation(s) ` +
        `totaling $${totalADAAmount.toLocaleString()} during fiscal year ${fiscalYear}. ` +
        'Per 31 U.S.C. 1351, these violations have been or must be reported to the ' +
        'President (through OMB) and Congress.',
        ''
      );

      for (const violation of confirmedOrReportedADA) {
        sections.push(
          `  - ${violation.violationType}: $${violation.amount.toLocaleString()} ` +
          `(${violation.investigationStatus}, discovered: ${violation.discoveredDate})`
        );
      }
      sections.push('');
    }

    if (fmrViolationCount > 0) {
      sections.push(
        `DOD FMR COMPLIANCE FINDINGS:`,
        `Our testing identified ${fmrViolationCount} material compliance finding(s) ` +
        'related to the DoD Financial Management Regulation (7000.14-R).',
        ''
      );
    }

    text = sections.join('\n');
  }

  return {
    adaViolations: adaCount,
    fmrViolations: fmrViolationCount,
    text,
  };
}

function generateFIARSection(
  input: FederalAuditOpinionInput
): FederalAuditReport['fiarAssessment'] {
  const { fiarAssessment, componentName, fiscalYear } = input;

  if (!fiarAssessment) {
    return {
      score: 0,
      conclusion: 'No FIAR assessment available',
      text: [
        'FINANCIAL IMPROVEMENT AND AUDIT REMEDIATION (FIAR) ASSESSMENT',
        '',
        `No FIAR assessment data was available for ${componentName} for fiscal year ${fiscalYear}. ` +
        'The absence of a FIAR assessment limits the ability to evaluate audit readiness and ' +
        'the effectiveness of financial improvement initiatives. Per DoD policy, all DoD ' +
        'components must maintain current FIAR assessments.',
      ].join('\n'),
    };
  }

  const score = fiarAssessment.auditReadinessScore;
  let conclusion: string;
  let readinessLevel: string;

  if (score >= 80) {
    conclusion = 'Audit Ready';
    readinessLevel = 'substantially meets audit readiness requirements';
  } else if (score >= 60) {
    conclusion = 'Substantially Ready with Remediation Needed';
    readinessLevel = 'has made progress toward audit readiness but requires additional remediation';
  } else if (score >= 40) {
    conclusion = 'Not Audit Ready - Significant Deficiencies';
    readinessLevel = 'has significant deficiencies that must be addressed before achieving audit readiness';
  } else {
    conclusion = 'Not Audit Ready - Critical Deficiencies';
    readinessLevel = 'has critical deficiencies that prevent the component from being considered audit ready';
  }

  const complianceItems: string[] = [];
  if (fiarAssessment.fundBalanceReconciled) {
    complianceItems.push('Fund Balance with Treasury: Reconciled');
  } else {
    complianceItems.push('Fund Balance with Treasury: NOT Reconciled');
  }
  if (fiarAssessment.ussglCompliant) {
    complianceItems.push('USSGL Compliance: Compliant');
  } else {
    complianceItems.push('USSGL Compliance: NOT Compliant');
  }
  if (fiarAssessment.sfisCompliant) {
    complianceItems.push('SFIS Compliance: Compliant');
  } else {
    complianceItems.push('SFIS Compliance: NOT Compliant');
  }
  if (fiarAssessment.internalControlsAssessed) {
    complianceItems.push('Internal Controls: Assessed');
  } else {
    complianceItems.push('Internal Controls: NOT Assessed');
  }

  const text = [
    'FINANCIAL IMPROVEMENT AND AUDIT REMEDIATION (FIAR) ASSESSMENT',
    '',
    `Component: ${componentName}`,
    `Fiscal Year: ${fiscalYear}`,
    `Assessment Date: ${fiarAssessment.assessmentDate}`,
    `Audit Readiness Score: ${score}/100`,
    `Conclusion: ${conclusion}`,
    '',
    `Based on the FIAR assessment conducted by ${fiarAssessment.assessedBy}, ` +
    `${componentName} ${readinessLevel}.`,
    '',
    'Compliance Status:',
    ...complianceItems.map(item => `  - ${item}`),
    '',
    fiarAssessment.materialWeaknesses && fiarAssessment.materialWeaknesses.length > 0
      ? `Material Weaknesses Identified (${fiarAssessment.materialWeaknesses.length}):\n` +
        fiarAssessment.materialWeaknesses.map(mw => `  - ${mw}`).join('\n')
      : 'No material weaknesses identified in the FIAR assessment.',
    '',
    fiarAssessment.correctiveActionPlans && fiarAssessment.correctiveActionPlans.length > 0
      ? `Corrective Action Plans (${fiarAssessment.correctiveActionPlans.length}):\n` +
        fiarAssessment.correctiveActionPlans
          .map(cap => `  - ${cap.finding}: ${cap.plan} (Target: ${cap.targetDate}, Status: ${cap.status})`)
          .join('\n')
      : 'No corrective action plans documented.',
  ].join('\n');

  return { score, conclusion, text };
}

function generateManagementLetter(
  input: FederalAuditOpinionInput
): FederalAuditReport['managementLetter'] {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { findings, adaViolations, fiarAssessment, componentName, fiscalYear } = input;

  const managementFindings: string[] = [];
  const recommendations: string[] = [];

  // Include all medium and above findings
  const significantFindings = findings.filter(
    f => f.severity === 'critical' || f.severity === 'high' || f.severity === 'medium'
  );

  for (const finding of significantFindings) {
    managementFindings.push(
      `[${finding.severity.toUpperCase()}] ${finding.ruleId} - ${finding.title}: ${finding.description.substring(0, 300)}`
    );

    if (finding.remediation) {
      recommendations.push(
        `${finding.ruleId}: ${finding.remediation.substring(0, 300)}`
      );
    }
  }

  // Include ADA violation-related findings
  for (const violation of adaViolations) {
    if (violation.investigationStatus !== 'resolved') {
      managementFindings.push(
        `[ADA] ${violation.violationType}: $${violation.amount.toLocaleString()} - ` +
        `${violation.description.substring(0, 200)} (Status: ${violation.investigationStatus})`
      );

      if (!violation.correctiveAction) {
        recommendations.push(
          `ADA-${violation.violationType}: Develop and implement corrective action plan for ` +
          `$${violation.amount.toLocaleString()} violation. Ensure compliance with 31 U.S.C. 1351 reporting.`
        );
      }
    }
  }

  // Include FIAR-related recommendations
  if (fiarAssessment) {
    if (!fiarAssessment.fundBalanceReconciled) {
      recommendations.push(
        'FIAR: Complete Fund Balance with Treasury reconciliation with Treasury records. ' +
        'This is a prerequisite for audit readiness.'
      );
    }
    if (!fiarAssessment.ussglCompliant) {
      recommendations.push(
        'FIAR: Achieve USSGL compliance by correcting chart of accounts, transaction posting, ' +
        'and trial balance preparation procedures.'
      );
    }
    if (!fiarAssessment.sfisCompliant) {
      recommendations.push(
        'FIAR: Achieve SFIS compliance by implementing the Standard Financial Information Structure ' +
        'across all financial management systems.'
      );
    }
    if (!fiarAssessment.internalControlsAssessed) {
      recommendations.push(
        'FIAR: Complete internal controls assessment per OMB Circular A-123. Document control ' +
        'activities and testing results for all material accounts and processes.'
      );
    }
  }

  // Dual-track reconciliation recommendation
  if (input.dualTrackReconciliation && !input.dualTrackReconciliation.isReconciled) {
    recommendations.push(
      `Reconciliation: Resolve the $${input.dualTrackReconciliation.difference.toLocaleString()} ` +
      'difference between budgetary and proprietary accounting tracks. Investigate and correct ' +
      'all reconciling items.'
    );
  }

  // SF-133 recommendation
  if (input.sf133Data) {
    const sectionBTotal =
      input.sf133Data.statusOfBudgetaryResources.newObligationsAndUpwardAdjustments +
      input.sf133Data.statusOfBudgetaryResources.unobligatedBalanceEndOfYear;
    const sfDiff = Math.abs(
      input.sf133Data.budgetaryResources.totalBudgetaryResources - sectionBTotal
    );
    if (sfDiff > 0.01) {
      recommendations.push(
        `SF-133: Resolve the $${sfDiff.toLocaleString()} imbalance between Section A ` +
        '(Total Budgetary Resources) and Section B (Status of Budgetary Resources) on the SF-133.'
      );
    }
  }

  return { findings: managementFindings, recommendations };
}

// ---------------------------------------------------------------------------
// Opinion Text Generators
// ---------------------------------------------------------------------------

function generateUnmodifiedOpinionText(
  componentName: string,
  fiscalYear: number
): string {
  return [
    'INDEPENDENT AUDITOR\'S REPORT ON THE FINANCIAL STATEMENTS',
    '',
    `To the Secretary of Defense and the Inspector General`,
    `Department of Defense - ${componentName}`,
    '',
    'Report on the Financial Statements',
    '',
    'Opinion',
    '',
    `In our opinion, the financial statements referred to above present fairly, ` +
    `in all material respects, the financial position of ${componentName} as of ` +
    `September 30, ${fiscalYear}, and its net cost of operations, changes in net ` +
    `position, and budgetary resources for the fiscal year then ended, in accordance ` +
    'with accounting principles generally accepted in the United States of America ' +
    'applicable to federal entities.',
    '',
    'Basis for Opinion',
    '',
    'We conducted our audit in accordance with auditing standards generally accepted ' +
    'in the United States of America; the standards applicable to financial audits ' +
    'contained in Government Auditing Standards, issued by the Comptroller General of ' +
    'the United States; and OMB Bulletin, Audit Requirements for Federal Financial ' +
    'Statements. Our responsibilities under those standards and the OMB bulletin are ' +
    'further described in the Auditor\'s Responsibilities section of our report.',
    '',
    '[DRAFT - This opinion requires professional review before issuance.]',
  ].join('\n');
}

function generateQualifiedOpinionText(
  componentName: string,
  fiscalYear: number,
  basis: string[]
): string {
  return [
    'INDEPENDENT AUDITOR\'S REPORT ON THE FINANCIAL STATEMENTS',
    '',
    `To the Secretary of Defense and the Inspector General`,
    `Department of Defense - ${componentName}`,
    '',
    'Report on the Financial Statements',
    '',
    'Qualified Opinion',
    '',
    `In our opinion, except for the effects of the matter(s) described in the Basis for ` +
    `Qualified Opinion section, the financial statements of ${componentName} present ` +
    `fairly, in all material respects, the financial position as of September 30, ${fiscalYear}, ` +
    'and its net cost of operations, changes in net position, and budgetary resources for ' +
    'the fiscal year then ended, in accordance with accounting principles generally accepted ' +
    'in the United States of America applicable to federal entities.',
    '',
    'Basis for Qualified Opinion',
    '',
    'The following matters caused us to qualify our opinion:',
    ...basis.map(b => `  - ${b}`),
    '',
    'These matters are material to the financial statements but are not pervasive.',
    '',
    '[DRAFT - This opinion requires professional review before issuance.]',
  ].join('\n');
}

function generateAdverseOpinionText(
  componentName: string,
  fiscalYear: number,
  basis: string[]
): string {
  return [
    'INDEPENDENT AUDITOR\'S REPORT ON THE FINANCIAL STATEMENTS',
    '',
    `To the Secretary of Defense and the Inspector General`,
    `Department of Defense - ${componentName}`,
    '',
    'Report on the Financial Statements',
    '',
    'Adverse Opinion',
    '',
    `In our opinion, because of the significance of the matter(s) described in the Basis for ` +
    `Adverse Opinion section, the financial statements of ${componentName} do not present ` +
    `fairly, in accordance with accounting principles generally accepted in the United States ` +
    `of America applicable to federal entities, the financial position as of September 30, ` +
    `${fiscalYear}, or its net cost of operations, changes in net position, or budgetary ` +
    'resources for the fiscal year then ended.',
    '',
    'Basis for Adverse Opinion',
    '',
    'The following matters are so significant and pervasive that the financial statements ' +
    'as a whole are materially misstated:',
    ...basis.map(b => `  - ${b}`),
    '',
    'These deficiencies, individually and in the aggregate, are material and pervasive ' +
    'to the financial statements.',
    '',
    '[DRAFT - This opinion requires professional review before issuance.]',
  ].join('\n');
}

function generateDisclaimerText(
  componentName: string,
  fiscalYear: number
): string {
  return [
    'INDEPENDENT AUDITOR\'S REPORT ON THE FINANCIAL STATEMENTS',
    '',
    `To the Secretary of Defense and the Inspector General`,
    `Department of Defense - ${componentName}`,
    '',
    'Report on the Financial Statements',
    '',
    'Disclaimer of Opinion',
    '',
    `We do not express an opinion on the financial statements of ${componentName} ` +
    `for the fiscal year ended September 30, ${fiscalYear}. Because of the significance ` +
    'of the matter(s) described in the Basis for Disclaimer of Opinion section, we have ' +
    'not been able to obtain sufficient appropriate audit evidence to provide a basis for ' +
    'an audit opinion on these financial statements.',
    '',
    'Basis for Disclaimer of Opinion',
    '',
    `${componentName} was unable to provide sufficient financial data to support an ` +
    'audit opinion. Specifically:',
    '  - No FIAR (Financial Improvement and Audit Remediation) assessment was available',
    '  - USSGL-based financial data was insufficient to perform substantive testing',
    '',
    'Without sufficient appropriate audit evidence, we are unable to form an opinion on ' +
    'whether the financial statements are presented fairly in accordance with applicable ' +
    'accounting standards.',
    '',
    '[DRAFT - This opinion requires professional review before issuance.]',
  ].join('\n');
}
