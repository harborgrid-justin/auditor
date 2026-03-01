/**
 * Federal Audit Opinion Generator
 *
 * Generates federal audit opinions compliant with FASAB/SFFAS standards and
 * Government Auditing Standards (GAGAS / Yellow Book). Federal audit reports
 * include three mandated components per OMB Bulletin on Audit Requirements:
 *
 *   1. Opinion on Financial Statements (FASAB/SFFAS-based)
 *   2. Report on Internal Control over Financial Reporting
 *   3. Report on Compliance with Laws and Regulations
 *      (including Anti-Deficiency Act compliance)
 *
 * Additionally, this module assesses DoD-specific elements:
 *   - FIAR (Financial Improvement and Audit Remediation) readiness
 *   - Dual-track reconciliation (budgetary vs. proprietary)
 *   - SF-133 consistency
 *
 * References:
 *   - OMB Bulletin on Audit Requirements for Federal Financial Statements
 *   - OMB Circular A-136: Financial Reporting Requirements
 *   - Government Auditing Standards (Yellow Book / GAGAS)
 *   - FASAB SFFAS 1-7: Federal Accounting Standards
 *   - 31 USC §1341-1342: Anti-Deficiency Act
 *   - 31 USC §1351: Reporting Requirements for ADA Violations
 *   - DoD 7000.14-R, Volume 6A: Reporting Policy
 *   - Chief Financial Officers Act of 1990 (31 USC §3515)
 *   - Federal Financial Management Improvement Act (FFMIA)
 */

import type { AuditFinding } from '@/types/findings';
import type { ADAViolation, FIARAssessment, DualTrackReconciliation, SF133Data } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Interfaces
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
// Internal helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Determine the federal opinion type based on the audit inputs.
 *
 * Decision criteria:
 *   - Unmodified: 0 critical findings, 0 confirmed ADA violations,
 *     FIAR score >= 80, dual-track reconciled
 *   - Qualified: some high findings but no critical, or minor ADA issues
 *     (detected but not confirmed)
 *   - Adverse: critical findings OR confirmed ADA violations
 *   - Disclaimer: insufficient data (no FIAR assessment, no USSGL data)
 *
 * @param input - the FederalAuditOpinionInput
 * @returns The determined FederalOpinionType
 */
export function determineFederalOpinionType(
  input: FederalAuditOpinionInput,
): FederalOpinionType {
  const { findings, adaViolations, fiarAssessment, dualTrackReconciliation } = input;

  // --- Disclaimer: insufficient data ---
  if (!fiarAssessment && findings.length === 0 && adaViolations.length === 0) {
    return 'disclaimer';
  }

  // Count findings by severity
  const criticalFindings = findings.filter(f => f.severity === 'critical');
  const highFindings = findings.filter(f => f.severity === 'high');

  // Confirmed ADA violations
  const confirmedADA = adaViolations.filter(
    v => v.investigationStatus === 'confirmed' ||
         v.investigationStatus === 'reported_to_president',
  );

  // --- Adverse: critical findings or confirmed ADA violations ---
  if (criticalFindings.length > 0) {
    return 'adverse';
  }
  if (confirmedADA.length > 0) {
    return 'adverse';
  }

  // --- Qualified: high findings, unconfirmed ADA, or weak FIAR/dual-track ---
  if (highFindings.length > 0) {
    return 'qualified';
  }

  // Minor ADA issues (detected but not confirmed)
  const detectedADA = adaViolations.filter(
    v => v.investigationStatus === 'detected' ||
         v.investigationStatus === 'under_investigation',
  );
  if (detectedADA.length > 0) {
    return 'qualified';
  }

  // FIAR score below threshold
  if (fiarAssessment && fiarAssessment.auditReadinessScore < 80) {
    return 'qualified';
  }

  // Dual-track not reconciled
  if (dualTrackReconciliation && !dualTrackReconciliation.isReconciled) {
    return 'qualified';
  }

  // --- Unmodified: everything passes ---
  return 'unmodified';
}

/**
 * Generate a comprehensive Federal Audit Report.
 *
 * Produces the three mandated report components plus FIAR assessment and
 * management letter. The opinion type is determined using the same criteria
 * as determineFederalOpinionType().
 *
 * @param input - the FederalAuditOpinionInput
 * @returns FederalAuditReport with all components
 */
export function generateFederalAuditReport(
  input: FederalAuditOpinionInput,
): FederalAuditReport {
  const {
    findings,
    adaViolations,
    fiarAssessment,
    dualTrackReconciliation,
    sf133Data,
    fiscalYear,
    componentName,
  } = input;

  const opinionType = determineFederalOpinionType(input);

  // ========================================================================
  // 1. Opinion on Financial Statements
  // ========================================================================

  const basis: string[] = [];
  const criticalFindings = findings.filter(f => f.severity === 'critical');
  const highFindings = findings.filter(f => f.severity === 'high');
  const confirmedADA = adaViolations.filter(
    v => v.investigationStatus === 'confirmed' ||
         v.investigationStatus === 'reported_to_president',
  );

  if (criticalFindings.length > 0) {
    basis.push(
      `${criticalFindings.length} critical finding(s) identified that are ` +
      `material and pervasive to the financial statements.`,
    );
  }
  if (highFindings.length > 0) {
    basis.push(
      `${highFindings.length} high-severity finding(s) identified that may ` +
      `result in material misstatement.`,
    );
  }
  if (confirmedADA.length > 0) {
    const adaAmount = confirmedADA.reduce((sum, v) => sum + v.amount, 0);
    basis.push(
      `${confirmedADA.length} confirmed Anti-Deficiency Act violation(s) ` +
      `totaling $${adaAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}. ` +
      `Per 31 USC §1341-1342.`,
    );
  }
  if (fiarAssessment && fiarAssessment.auditReadinessScore < 80) {
    basis.push(
      `FIAR audit readiness score (${fiarAssessment.auditReadinessScore}) is below ` +
      `the 80-point threshold for audit readiness.`,
    );
  }
  if (dualTrackReconciliation && !dualTrackReconciliation.isReconciled) {
    basis.push(
      `Dual-track reconciliation between budgetary and proprietary accounts ` +
      `has not been achieved. Difference: $${dualTrackReconciliation.difference.toFixed(2)}.`,
    );
  }
  if (!fiarAssessment && findings.length === 0 && adaViolations.length === 0) {
    basis.push(
      `Insufficient data to form an opinion. No FIAR assessment, financial ` +
      `findings, or ADA violation data was provided.`,
    );
  }
  if (opinionType === 'unmodified' && basis.length === 0) {
    basis.push(
      `No critical or high findings. No confirmed ADA violations. ` +
      `FIAR assessment meets readiness criteria. Dual-track reconciled.`,
    );
  }

  let opinionText: string;
  switch (opinionType) {
    case 'unmodified':
      opinionText =
        `INDEPENDENT AUDITOR'S REPORT\n\n` +
        `To the Secretary of Defense and the Inspector General\n\n` +
        `Report on the Financial Statements\n\n` +
        `We have audited the accompanying financial statements of ${componentName} ` +
        `for the fiscal year ended September 30, ${fiscalYear}, which comprise the ` +
        `balance sheet, the related statements of net cost, changes in net position, ` +
        `and budgetary resources, and the related notes to the financial statements.\n\n` +
        `In our opinion, the financial statements referred to above present fairly, ` +
        `in all material respects, the financial position of ${componentName} as of ` +
        `September 30, ${fiscalYear}, and its net cost of operations, changes in net ` +
        `position, and budgetary resources for the year then ended, in accordance ` +
        `with U.S. generally accepted accounting principles for federal entities ` +
        `issued by the Federal Accounting Standards Advisory Board (FASAB).`;
      break;

    case 'qualified':
      opinionText =
        `INDEPENDENT AUDITOR'S REPORT\n\n` +
        `To the Secretary of Defense and the Inspector General\n\n` +
        `Report on the Financial Statements\n\n` +
        `We have audited the accompanying financial statements of ${componentName} ` +
        `for the fiscal year ended September 30, ${fiscalYear}.\n\n` +
        `Basis for Qualified Opinion\n\n` +
        basis.map((b, i) => `${i + 1}. ${b}`).join('\n') + '\n\n' +
        `Qualified Opinion\n\n` +
        `In our opinion, except for the effects of the matter(s) described in the ` +
        `Basis for Qualified Opinion section, the financial statements present ` +
        `fairly, in all material respects, the financial position of ${componentName} ` +
        `as of September 30, ${fiscalYear}, in accordance with FASAB standards.`;
      break;

    case 'adverse':
      opinionText =
        `INDEPENDENT AUDITOR'S REPORT\n\n` +
        `To the Secretary of Defense and the Inspector General\n\n` +
        `Report on the Financial Statements\n\n` +
        `We have audited the accompanying financial statements of ${componentName} ` +
        `for the fiscal year ended September 30, ${fiscalYear}.\n\n` +
        `Basis for Adverse Opinion\n\n` +
        basis.map((b, i) => `${i + 1}. ${b}`).join('\n') + '\n\n' +
        `Adverse Opinion\n\n` +
        `In our opinion, because of the significance of the matter(s) described ` +
        `in the Basis for Adverse Opinion section, the financial statements do not ` +
        `present fairly the financial position of ${componentName} as of ` +
        `September 30, ${fiscalYear}, or its net cost of operations, changes in ` +
        `net position, or budgetary resources for the year then ended, in ` +
        `accordance with FASAB standards.`;
      break;

    case 'disclaimer':
      opinionText =
        `INDEPENDENT AUDITOR'S REPORT\n\n` +
        `To the Secretary of Defense and the Inspector General\n\n` +
        `Report on the Financial Statements\n\n` +
        `We were engaged to audit the accompanying financial statements of ` +
        `${componentName} for the fiscal year ended September 30, ${fiscalYear}.\n\n` +
        `Basis for Disclaimer of Opinion\n\n` +
        basis.map((b, i) => `${i + 1}. ${b}`).join('\n') + '\n\n' +
        `Disclaimer of Opinion\n\n` +
        `Because of the significance of the matter(s) described in the Basis for ` +
        `Disclaimer of Opinion section, we have not been able to obtain sufficient ` +
        `appropriate audit evidence to provide a basis for an audit opinion. ` +
        `Accordingly, we do not express an opinion on the financial statements of ` +
        `${componentName}.`;
      break;
  }

  // ========================================================================
  // 2. Report on Internal Controls
  // ========================================================================

  const materialWeaknesses: string[] = [];
  const significantDeficiencies: string[] = [];

  for (const f of criticalFindings) {
    materialWeaknesses.push(
      `${f.title}: ${f.description} (Impact: ${f.amountImpact !== null ? '$' + f.amountImpact.toLocaleString() : 'indeterminate'}). ` +
      `Citation: ${f.citation}.`,
    );
  }

  for (const f of highFindings) {
    if (f.status === 'open' || f.status === 'in_review') {
      significantDeficiencies.push(
        `${f.title}: ${f.description} (Impact: ${f.amountImpact !== null ? '$' + f.amountImpact.toLocaleString() : 'indeterminate'}). ` +
        `Citation: ${f.citation}.`,
      );
    }
  }

  if (fiarAssessment?.materialWeaknesses) {
    for (const mw of fiarAssessment.materialWeaknesses) {
      if (!materialWeaknesses.some(m => m.includes(mw))) {
        materialWeaknesses.push(`FIAR-identified: ${mw}`);
      }
    }
  }

  let internalControlsText: string;
  if (materialWeaknesses.length === 0 && significantDeficiencies.length === 0) {
    internalControlsText =
      `Report on Internal Control over Financial Reporting\n\n` +
      `In connection with our audit of the financial statements of ${componentName}, ` +
      `we considered the entity's internal control over financial reporting. Our ` +
      `consideration was for the limited purpose of expressing our opinion on the ` +
      `financial statements and not for the purpose of expressing an opinion on ` +
      `internal control effectiveness.\n\n` +
      `We did not identify any deficiencies in internal control that we consider to ` +
      `be material weaknesses. However, material weaknesses may exist that have not ` +
      `been identified.`;
  } else {
    internalControlsText =
      `Report on Internal Control over Financial Reporting\n\n` +
      `In connection with our audit of the financial statements of ${componentName}, ` +
      `we considered the entity's internal control over financial reporting.\n\n`;

    if (materialWeaknesses.length > 0) {
      internalControlsText +=
        `Material Weakness(es):\n` +
        `A material weakness is a deficiency, or combination of deficiencies, in ` +
        `internal control, such that there is a reasonable possibility that a material ` +
        `misstatement will not be prevented or detected and corrected on a timely basis.\n\n` +
        materialWeaknesses.map((mw, i) => `  ${i + 1}. ${mw}`).join('\n') + '\n\n';
    }

    if (significantDeficiencies.length > 0) {
      internalControlsText +=
        `Significant Deficiency(ies):\n` +
        `A significant deficiency is a deficiency, or combination of deficiencies, ` +
        `that is less severe than a material weakness yet important enough to merit ` +
        `attention by those charged with governance.\n\n` +
        significantDeficiencies.map((sd, i) => `  ${i + 1}. ${sd}`).join('\n');
    }
  }

  // ========================================================================
  // 3. Report on Compliance
  // ========================================================================

  const confirmedADACount = confirmedADA.length;
  const allADACount = adaViolations.length;
  const fmrFindings = findings.filter(f => f.framework === 'DOD_FMR');
  const fmrViolations = fmrFindings.length;

  let complianceText =
    `Report on Compliance with Laws and Regulations\n\n` +
    `In connection with our audit, we performed tests of ${componentName}'s ` +
    `compliance with certain provisions of laws, regulations, and contracts, ` +
    `noncompliance with which could have a direct and material effect on the ` +
    `determination of financial statement amounts.\n\n`;

  complianceText +=
    `Anti-Deficiency Act Compliance (31 USC §1341-1342):\n`;

  if (confirmedADACount > 0) {
    const adaAmount = confirmedADA.reduce((sum, v) => sum + v.amount, 0);
    complianceText +=
      `  ${confirmedADACount} confirmed ADA violation(s) totaling ` +
      `$${adaAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ` +
      `were identified. These violations have been reported per 31 USC §1351. ` +
      `This constitutes noncompliance with laws and regulations.\n\n`;
  } else if (allADACount > 0) {
    complianceText +=
      `  ${allADACount} potential ADA violation(s) were detected and are under ` +
      `investigation. No violations have been confirmed at this time.\n\n`;
  } else {
    complianceText +=
      `  No ADA violations were identified during the audit period.\n\n`;
  }

  if (fmrViolations > 0) {
    complianceText +=
      `DoD FMR Compliance:\n` +
      `  ${fmrViolations} DoD Financial Management Regulation finding(s) ` +
      `were identified.\n`;
  }

  // ========================================================================
  // 4. FIAR Assessment
  // ========================================================================

  let fiarScore = 0;
  let fiarConclusion = 'Not assessed';
  let fiarText = '';

  if (fiarAssessment) {
    fiarScore = fiarAssessment.auditReadinessScore;
    fiarConclusion = fiarAssessment.conclusion === 'audit_ready'
      ? 'Audit Ready'
      : fiarAssessment.conclusion === 'substantially_ready'
        ? 'Substantially Ready'
        : fiarAssessment.conclusion === 'not_ready'
          ? 'Not Ready'
          : 'Modified';

    fiarText =
      `FIAR Assessment Summary\n\n` +
      `Assessment Date: ${formatDate(fiarAssessment.assessmentDate)}\n` +
      `Audit Readiness Score: ${fiarScore}/100\n` +
      `Conclusion: ${fiarConclusion}\n` +
      `Assessed By: ${fiarAssessment.assessedBy}\n\n` +
      `Key Indicators:\n` +
      `  Fund Balance Reconciled: ${fiarAssessment.fundBalanceReconciled ? 'Yes' : 'No'}\n` +
      `  USSGL Compliant: ${fiarAssessment.ussglCompliant ? 'Yes' : 'No'}\n` +
      `  SFIS Compliant: ${fiarAssessment.sfisCompliant ? 'Yes' : 'No'}\n` +
      `  Internal Controls Assessed: ${fiarAssessment.internalControlsAssessed ? 'Yes' : 'No'}\n`;

    if (fiarAssessment.materialWeaknesses && fiarAssessment.materialWeaknesses.length > 0) {
      fiarText +=
        `\nFIAR-Identified Material Weaknesses:\n` +
        fiarAssessment.materialWeaknesses.map((mw, i) => `  ${i + 1}. ${mw}`).join('\n') + '\n';
    }

    if (fiarAssessment.correctiveActionPlans && fiarAssessment.correctiveActionPlans.length > 0) {
      fiarText +=
        `\nCorrective Action Plans:\n` +
        fiarAssessment.correctiveActionPlans.map(
          (cap, i) => `  ${i + 1}. Finding: ${cap.finding}\n` +
                       `     Plan: ${cap.plan}\n` +
                       `     Target: ${cap.targetDate} | Status: ${cap.status}`,
        ).join('\n') + '\n';
    }
  } else {
    fiarText =
      `FIAR Assessment Summary\n\n` +
      `No FIAR assessment was provided for ${componentName} for FY${fiscalYear}. ` +
      `A FIAR assessment is required for DoD components per DoD Instruction 5010.40.`;
  }

  if (sf133Data) {
    const sectionATotal = sf133Data.budgetaryResources.totalBudgetaryResources;
    const sectionBTotal =
      sf133Data.statusOfBudgetaryResources.newObligationsAndUpwardAdjustments +
      sf133Data.statusOfBudgetaryResources.unobligatedBalanceEndOfYear;
    const sf133Diff = Math.abs(sectionATotal - sectionBTotal);
    if (sf133Diff > 0.01) {
      fiarText +=
        `\nSF-133 Consistency:\n` +
        `  SF-133 Section A/B imbalance of $${sf133Diff.toFixed(2)} detected. ` +
        `This may impact the Statement of Budgetary Resources.\n`;
    }
  }

  // ========================================================================
  // 5. Management Letter
  // ========================================================================

  const managementFindings: string[] = [];
  const recommendations: string[] = [];

  const mediumFindings = findings.filter(
    f => f.severity === 'medium' && (f.status === 'open' || f.status === 'in_review'),
  );
  const lowFindings = findings.filter(
    f => f.severity === 'low' && (f.status === 'open' || f.status === 'in_review'),
  );

  for (const f of mediumFindings) {
    managementFindings.push(`[Medium] ${f.title}: ${f.description}`);
    if (f.remediation) {
      recommendations.push(`${f.title}: ${f.remediation}`);
    }
  }

  for (const f of lowFindings) {
    managementFindings.push(`[Low] ${f.title}: ${f.description}`);
    if (f.remediation) {
      recommendations.push(`${f.title}: ${f.remediation}`);
    }
  }

  if (adaViolations.length > 0) {
    recommendations.push(
      `Implement automated pre-validation of all obligations against fund ` +
      `availability at all control levels (per DoD FMR Vol 14, Ch 2).`,
    );
    recommendations.push(
      `Provide mandatory refresher training for all fund certifying officers ` +
      `on ADA requirements.`,
    );
  }

  if (fiarAssessment && fiarAssessment.auditReadinessScore < 80) {
    recommendations.push(
      `Prioritize corrective actions to improve FIAR audit readiness score ` +
      `above 80-point threshold.`,
    );
  }

  if (dualTrackReconciliation && !dualTrackReconciliation.isReconciled) {
    recommendations.push(
      `Resolve dual-track reconciliation differences ($${dualTrackReconciliation.difference.toFixed(2)}) ` +
      `between budgetary and proprietary accounts.`,
    );
  }

  return {
    opinionOnFinancialStatements: {
      type: opinionType,
      text: opinionText,
      basis,
    },
    reportOnInternalControls: {
      materialWeaknesses,
      significantDeficiencies,
      text: internalControlsText,
    },
    reportOnCompliance: {
      adaViolations: confirmedADACount,
      fmrViolations,
      text: complianceText,
    },
    fiarAssessment: {
      score: fiarScore,
      conclusion: fiarConclusion,
      text: fiarText,
    },
    managementLetter: {
      findings: managementFindings,
      recommendations,
    },
  };
}
