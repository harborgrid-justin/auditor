/**
 * Management Letter Generator
 *
 * Generates a formal management letter communicating audit findings
 * to the Board of Directors / Audit Committee.
 */

export interface ManagementLetterData {
  entityName: string;
  engagementName: string;
  fiscalYearEnd: string;
  findings: Array<{
    severity: string;
    framework: string;
    title: string;
    description: string;
    remediation: string;
    amountImpact: number | null;
    status: string;
  }>;
  controls: Array<{
    controlId: string;
    title: string;
    status: string;
    category: string;
  }>;
  materialityThreshold: number;
  generatedAt: string;
}

export function generateManagementLetter(data: ManagementLetterData): string {
  const materialWeaknesses = data.controls.filter(
    (c) => c.status === 'material_weakness'
  );
  const significantDeficiencies = data.controls.filter(
    (c) => c.status === 'significant_deficiency'
  );
  const criticalFindings = data.findings.filter(
    (f) => f.severity === 'critical' || f.severity === 'high'
  );

  const today = new Date(data.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let letter = `
${today}

To the Board of Directors and Audit Committee
${data.entityName}

Re: Communication of Internal Control Matters — ${data.engagementName}
    Fiscal Year Ended ${data.fiscalYearEnd}

Dear Members of the Board and Audit Committee:

In planning and performing our audit of the financial statements of ${data.entityName} for the fiscal year ended ${data.fiscalYearEnd}, in accordance with auditing standards generally accepted in the United States of America, we considered the entity's internal control over financial reporting as a basis for designing audit procedures that are appropriate in the circumstances for the purpose of expressing our opinion on the financial statements, but not for the purpose of expressing an opinion on the effectiveness of the entity's internal control.

During our audit, we identified certain matters involving internal control and other operational matters that are presented for your consideration. This letter does not affect our report dated ${today} on the financial statements of ${data.entityName}.
`;

  // Material Weaknesses
  if (materialWeaknesses.length > 0) {
    letter += `
MATERIAL WEAKNESSES
${'─'.repeat(50)}

A material weakness is a deficiency, or a combination of deficiencies, in internal control such that there is a reasonable possibility that a material misstatement of the entity's financial statements will not be prevented, or detected and corrected, on a timely basis. We identified the following material weaknesses:

`;
    materialWeaknesses.forEach((mw, i) => {
      letter += `${i + 1}. ${mw.title} (${mw.controlId})
   Category: ${mw.category.replace(/_/g, ' ')}

`;
    });
  }

  // Significant Deficiencies
  if (significantDeficiencies.length > 0) {
    letter += `
SIGNIFICANT DEFICIENCIES
${'─'.repeat(50)}

A significant deficiency is a deficiency, or a combination of deficiencies, in internal control that is less severe than a material weakness, yet important enough to merit attention by those charged with governance. We identified the following significant deficiencies:

`;
    significantDeficiencies.forEach((sd, i) => {
      letter += `${i + 1}. ${sd.title} (${sd.controlId})
   Category: ${sd.category.replace(/_/g, ' ')}

`;
    });
  }

  // Key Findings and Recommendations
  if (criticalFindings.length > 0) {
    letter += `
KEY FINDINGS AND RECOMMENDATIONS
${'─'.repeat(50)}

The following findings require management's immediate attention:

`;
    criticalFindings.forEach((f, i) => {
      const impact = f.amountImpact
        ? ` (Estimated Impact: $${f.amountImpact.toLocaleString()})`
        : '';
      letter += `${i + 1}. ${f.title}${impact}
   Framework: ${f.framework}
   Severity: ${f.severity.toUpperCase()}

   Finding: ${f.description}

   Recommendation: ${f.remediation}

`;
    });
  }

  // Remediation Timeline
  if (criticalFindings.length > 0 || materialWeaknesses.length > 0) {
    letter += `
RECOMMENDED REMEDIATION TIMELINE
${'─'.repeat(50)}

Priority   | Item Count | Recommended Timeline
-----------|------------|---------------------
Critical   | ${data.findings.filter((f) => f.severity === 'critical').length.toString().padEnd(10)} | Immediate (30 days)
High       | ${data.findings.filter((f) => f.severity === 'high').length.toString().padEnd(10)} | 60 days
Medium     | ${data.findings.filter((f) => f.severity === 'medium').length.toString().padEnd(10)} | 90 days
Low        | ${data.findings.filter((f) => f.severity === 'low').length.toString().padEnd(10)} | Next audit cycle

`;
  }

  // Closing
  letter += `
CLOSING
${'─'.repeat(50)}

This communication is intended solely for the information and use of management, the Board of Directors, the Audit Committee, and others within the organization, and is not intended to be, and should not be, used by anyone other than these specified parties.

We appreciate the cooperation extended to us during the course of our engagement. We would be pleased to discuss these comments and recommendations with you at your convenience.

Respectfully submitted,

_________________________
Audit Team
${today}
`;

  return letter.trim();
}
