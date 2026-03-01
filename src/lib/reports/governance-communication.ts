/**
 * Communication with Those Charged with Governance (AU-C 260)
 *
 * Required communications to the audit committee covering:
 * - Auditor responsibilities
 * - Planned scope and timing
 * - Significant findings
 * - Significant accounting policies
 * - Management judgments and estimates
 * - Uncorrected misstatements
 * - Disagreements with management
 */

export interface GovernanceCommunicationData {
  entityName: string;
  fiscalYearEnd: string;
  auditorFirmName: string;
  findings: Array<{
    severity: string;
    framework: string;
    title: string;
    description: string;
    amountImpact: number | null;
    status: string;
  }>;
  materialWeaknesses: Array<{
    controlId: string;
    title: string;
    category: string;
  }>;
  significantDeficiencies: Array<{
    controlId: string;
    title: string;
    category: string;
  }>;
  passedAdjustments: Array<{
    description: string;
    amount: number;
    effectOnIncome: number;
  }>;
  materialityThreshold: number;
  opinionType: string;
  goingConcernIssues: boolean;
  generatedAt: string;
}

/**
 * Generate required communications to those charged with governance.
 */
export function generateGovernanceCommunication(data: GovernanceCommunicationData): string {
  const today = new Date(data.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const significantFindings = data.findings.filter(f => f.severity === 'critical' || f.severity === 'high');

  let comm = `
${today}

To the Audit Committee
${data.entityName}

Re: Required Communications Under Auditing Standards — Fiscal Year Ended ${data.fiscalYearEnd}

Dear Members of the Audit Committee:

We have completed our audit of the financial statements of ${data.entityName} for the fiscal year ended ${data.fiscalYearEnd}. Professional standards require that we communicate certain matters to you related to the audit. This letter is provided to comply with AU-C Section 260, "The Auditor's Communication With Those Charged With Governance."

AUDITOR'S RESPONSIBILITY
${'─'.repeat(50)}

Our responsibility under auditing standards generally accepted in the United States of America has been to form and express an opinion about whether the financial statements present fairly, in all material respects, the financial position, results of operations, and cash flows in conformity with U.S. GAAP. Our audit does not relieve management or those charged with governance of their responsibilities.

QUALITATIVE ASPECTS OF ACCOUNTING PRACTICES
${'─'.repeat(50)}

Management is responsible for the selection and use of appropriate accounting policies. We noted no transactions entered into by the entity during the year for which there is a lack of authoritative guidance or consensus. All significant transactions have been recognized in the financial statements in the proper period.

SIGNIFICANT AUDIT FINDINGS
${'─'.repeat(50)}

`;

  if (significantFindings.length > 0) {
    comm += `The following significant findings were identified during our audit:\n\n`;
    significantFindings.forEach((f, i) => {
      const impact = f.amountImpact ? ` (Estimated Impact: $${Math.round(f.amountImpact).toLocaleString()})` : '';
      comm += `${i + 1}. [${f.severity.toUpperCase()}] ${f.title}${impact}\n`;
      comm += `   ${f.description}\n   Status: ${f.status}\n\n`;
    });
  } else {
    comm += `No significant audit findings were identified.\n\n`;
  }

  // Material weaknesses and significant deficiencies
  if (data.materialWeaknesses.length > 0 || data.significantDeficiencies.length > 0) {
    comm += `INTERNAL CONTROL MATTERS\n${'─'.repeat(50)}\n\n`;

    if (data.materialWeaknesses.length > 0) {
      comm += `Material Weaknesses:\n`;
      data.materialWeaknesses.forEach((mw, i) => {
        comm += `${i + 1}. ${mw.title} (${mw.controlId}) — Category: ${mw.category.replace(/_/g, ' ')}\n`;
      });
      comm += '\n';
    }

    if (data.significantDeficiencies.length > 0) {
      comm += `Significant Deficiencies:\n`;
      data.significantDeficiencies.forEach((sd, i) => {
        comm += `${i + 1}. ${sd.title} (${sd.controlId}) — Category: ${sd.category.replace(/_/g, ' ')}\n`;
      });
      comm += '\n';
    }
  }

  // Uncorrected misstatements
  comm += `UNCORRECTED MISSTATEMENTS\n${'─'.repeat(50)}\n\n`;

  if (data.passedAdjustments.length > 0) {
    comm += `Professional standards require that we accumulate all known and likely misstatements identified during the audit, other than those that are clearly trivial, and communicate them to the appropriate level of management. The following uncorrected misstatements were discussed with management, who have represented that they are immaterial to the financial statements:\n\n`;

    let totalImpact = 0;
    data.passedAdjustments.forEach((adj, i) => {
      comm += `${i + 1}. ${adj.description} — $${Math.round(adj.amount).toLocaleString()} (Income effect: $${Math.round(adj.effectOnIncome).toLocaleString()})\n`;
      totalImpact += adj.effectOnIncome;
    });
    comm += `\nAggregate impact on net income: $${Math.round(totalImpact).toLocaleString()}\n`;
    comm += `Materiality threshold: $${Math.round(data.materialityThreshold).toLocaleString()}\n\n`;
  } else {
    comm += `No uncorrected misstatements were identified during the audit.\n\n`;
  }

  // Going concern
  if (data.goingConcernIssues) {
    comm += `GOING CONCERN\n${'─'.repeat(50)}\n\n`;
    comm += `Conditions were identified that raise substantial doubt about the entity's ability to continue as a going concern. This matter has been addressed in the audit report and financial statement disclosures.\n\n`;
  }

  // Audit opinion
  comm += `AUDIT OPINION\n${'─'.repeat(50)}\n\n`;
  comm += `Based on our audit procedures and evaluation of audit evidence, we have issued a${data.opinionType === 'unqualified' ? 'n unqualified (clean)' : ' ' + data.opinionType} opinion on the financial statements.\n\n`;

  // Other matters
  comm += `MANAGEMENT REPRESENTATIONS\n${'─'.repeat(50)}\n\n`;
  comm += `We have requested certain representations from management that are included in the management representation letter dated ${today}.\n\n`;

  comm += `DISAGREEMENTS WITH MANAGEMENT\n${'─'.repeat(50)}\n\n`;
  comm += `We encountered no disagreements with management over the application of accounting principles, the basis for management's accounting estimates, the scope of the audit, or disclosures to be included in the financial statements.\n\n`;

  // Closing
  comm += `${'─'.repeat(50)}\n\n`;
  comm += `This communication is intended solely for the information and use of the Audit Committee, the Board of Directors, and management of ${data.entityName} and is not intended to be, and should not be, used by anyone other than these specified parties.\n\n`;
  comm += `We appreciate the cooperation and assistance provided during our audit.\n\n`;
  comm += `Respectfully submitted,\n\n`;
  comm += `_________________________\n`;
  comm += `${data.auditorFirmName}\n`;
  comm += `${today}\n`;

  return comm.trim();
}
