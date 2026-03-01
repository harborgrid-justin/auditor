/**
 * Audit Opinion Draft Generator
 *
 * Generates a draft audit opinion based on findings severity
 * and internal control assessment results.
 */

export type OpinionType = 'unqualified' | 'qualified' | 'adverse' | 'disclaimer';

export interface AuditOpinionData {
  entityName: string;
  fiscalYearEnd: string;
  findings: Array<{
    severity: string;
    framework: string;
    amountImpact: number | null;
    status: string;
  }>;
  controls: Array<{
    status: string;
  }>;
  materialityThreshold: number;
  generatedAt: string;
}

export interface OpinionResult {
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
  };
}

/**
 * Determine the appropriate audit opinion type based on findings and controls.
 */
export function determineOpinion(data: AuditOpinionData): OpinionResult {
  const materialWeaknessCount = data.controls.filter(
    (c) => c.status === 'material_weakness'
  ).length;

  const significantDeficiencyCount = data.controls.filter(
    (c) => c.status === 'significant_deficiency'
  ).length;

  const criticalFindings = data.findings.filter(
    (f) => f.severity === 'critical'
  );

  const unresolvedCriticalFindings = criticalFindings.filter(
    (f) => f.status === 'open' || f.status === 'in_review'
  ).length;

  const totalMaterialImpact = data.findings
    .filter(
      (f) =>
        (f.severity === 'critical' || f.severity === 'high') &&
        f.amountImpact &&
        f.amountImpact > data.materialityThreshold
    )
    .reduce((sum, f) => sum + (f.amountImpact || 0), 0);

  const exceedsMateriality = totalMaterialImpact > data.materialityThreshold;

  const factors = {
    materialWeaknessCount,
    significantDeficiencyCount,
    criticalFindingCount: criticalFindings.length,
    totalMaterialImpact,
    exceedsMateriality,
    unresolvedCriticalFindings,
  };

  let opinionType: OpinionType;
  let rationale: string;

  // Decision logic
  if (
    materialWeaknessCount >= 3 ||
    (exceedsMateriality && unresolvedCriticalFindings >= 3)
  ) {
    // Multiple pervasive material weaknesses or many unresolved critical findings
    opinionType = 'adverse';
    rationale =
      'Multiple material weaknesses and/or pervasive material misstatements indicate that financial statements may be materially misstated in multiple areas.';
  } else if (
    materialWeaknessCount >= 1 ||
    (exceedsMateriality && unresolvedCriticalFindings >= 1)
  ) {
    // Specific material issues but not pervasive
    opinionType = 'qualified';
    rationale =
      'Material misstatement(s) or material weakness(es) identified, but the effects are not pervasive to the financial statements as a whole.';
  } else if (unresolvedCriticalFindings === 0 && materialWeaknessCount === 0) {
    opinionType = 'unqualified';
    rationale =
      'No material misstatements identified and internal controls are operating effectively. Financial statements present fairly, in all material respects.';
  } else {
    opinionType = 'qualified';
    rationale =
      'Certain findings require attention but do not rise to the level of an adverse opinion.';
  }

  const opinionLabels: Record<OpinionType, string> = {
    unqualified: 'Unqualified (Clean) Opinion',
    qualified: 'Qualified Opinion',
    adverse: 'Adverse Opinion',
    disclaimer: 'Disclaimer of Opinion',
  };

  const draftText = generateOpinionText(opinionType, data, factors);

  return {
    opinionType,
    opinionLabel: opinionLabels[opinionType],
    rationale,
    draftText,
    factors,
  };
}

function generateOpinionText(
  type: OpinionType,
  data: AuditOpinionData,
  factors: OpinionResult['factors']
): string {
  const today = new Date(data.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const header = `
INDEPENDENT AUDITOR'S REPORT
${'='.repeat(60)}

To the Board of Directors and Stockholders of ${data.entityName}

Report on the Financial Statements

We have audited the accompanying financial statements of ${data.entityName}, which comprise the balance sheet as of ${data.fiscalYearEnd}, and the related statements of income, comprehensive income, stockholders' equity, and cash flows for the year then ended, and the related notes to the financial statements.

Management's Responsibility for the Financial Statements

Management is responsible for the preparation and fair presentation of these financial statements in accordance with accounting principles generally accepted in the United States of America; this includes the design, implementation, and maintenance of internal control relevant to the preparation and fair presentation of financial statements that are free from material misstatement, whether due to fraud or error.

Auditor's Responsibility

Our responsibility is to express an opinion on these financial statements based on our audit. We conducted our audit in accordance with auditing standards generally accepted in the United States of America and the standards of the Public Company Accounting Oversight Board (United States). Those standards require that we plan and perform the audit to obtain reasonable assurance about whether the financial statements are free from material misstatement.
`;

  let opinion = '';

  switch (type) {
    case 'unqualified':
      opinion = `
Opinion

In our opinion, the financial statements referred to above present fairly, in all material respects, the financial position of ${data.entityName} as of ${data.fiscalYearEnd}, and the results of its operations and its cash flows for the year then ended in accordance with accounting principles generally accepted in the United States of America.
`;
      break;

    case 'qualified':
      opinion = `
Basis for Qualified Opinion

As discussed in the findings report, ${factors.criticalFindingCount > 0 ? `${factors.criticalFindingCount} critical finding(s) were identified` : 'certain matters were identified'} during our audit${factors.materialWeaknessCount > 0 ? `, including ${factors.materialWeaknessCount} material weakness(es) in internal control` : ''}. ${factors.exceedsMateriality ? `The aggregate estimated impact of $${factors.totalMaterialImpact.toLocaleString()} exceeds the materiality threshold of $${data.materialityThreshold.toLocaleString()}.` : ''}

Qualified Opinion

In our opinion, except for the effects of the matter(s) described in the Basis for Qualified Opinion paragraph, the financial statements referred to above present fairly, in all material respects, the financial position of ${data.entityName} as of ${data.fiscalYearEnd}, and the results of its operations and its cash flows for the year then ended in accordance with accounting principles generally accepted in the United States of America.
`;
      break;

    case 'adverse':
      opinion = `
Basis for Adverse Opinion

As discussed in the findings report, our audit identified ${factors.criticalFindingCount} critical finding(s) and ${factors.materialWeaknessCount} material weakness(es) in internal control over financial reporting. The aggregate estimated impact of $${factors.totalMaterialImpact.toLocaleString()} significantly exceeds the materiality threshold of $${data.materialityThreshold.toLocaleString()}. These misstatements are material and pervasive to the financial statements.

Adverse Opinion

In our opinion, because of the significance of the matter(s) described in the Basis for Adverse Opinion paragraph, the financial statements referred to above do not present fairly, in accordance with accounting principles generally accepted in the United States of America, the financial position of ${data.entityName} as of ${data.fiscalYearEnd}, or the results of its operations or its cash flows for the year then ended.
`;
      break;

    case 'disclaimer':
      opinion = `
Basis for Disclaimer of Opinion

We were unable to obtain sufficient appropriate audit evidence to provide a basis for an audit opinion due to scope limitations.

Disclaimer of Opinion

Because of the significance of the matter described in the Basis for Disclaimer of Opinion paragraph, we have not been able to obtain sufficient appropriate audit evidence to provide a basis for an audit opinion. Accordingly, we do not express an opinion on these financial statements.
`;
      break;
  }

  return `${header}${opinion}
${today}

[DRAFT — This opinion is generated based on automated analysis and requires professional review before issuance.]
`.trim();
}
