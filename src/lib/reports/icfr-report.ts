/**
 * Report on Internal Control over Financial Reporting (ICFR)
 *
 * For integrated audits per PCAOB AS 2201, generates a separate
 * report on the effectiveness of internal control.
 */

export interface ICFRReportData {
  entityName: string;
  fiscalYearEnd: string;
  auditorFirmName: string;
  controls: Array<{
    controlId: string;
    title: string;
    category: string;
    status: string;
  }>;
  materialWeaknesses: Array<{
    controlId: string;
    title: string;
    category: string;
    description: string;
  }>;
  significantDeficiencies: Array<{
    controlId: string;
    title: string;
    category: string;
  }>;
  generatedAt: string;
}

/**
 * Generate ICFR report for integrated audits.
 */
export function generateICFRReport(data: ICFRReportData): string {
  const today = new Date(data.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const isAdverse = data.materialWeaknesses.length > 0;
  const firmName = data.auditorFirmName || '[Audit Firm Name]';

  let report = `
REPORT OF INDEPENDENT REGISTERED PUBLIC ACCOUNTING FIRM
ON INTERNAL CONTROL OVER FINANCIAL REPORTING
${'='.repeat(60)}

To the Board of Directors and Stockholders of ${data.entityName}

`;

  if (isAdverse) {
    // Adverse opinion on ICFR
    report += `Adverse Opinion on Internal Control Over Financial Reporting

We have audited ${data.entityName}'s internal control over financial reporting as of ${data.fiscalYearEnd}, based on criteria established in Internal Control — Integrated Framework (2013) issued by the Committee of Sponsoring Organizations of the Treadway Commission (COSO).

In our opinion, because of the effect of the material weakness(es) described below on the achievement of the objectives of the control criteria, ${data.entityName} has not maintained effective internal control over financial reporting as of ${data.fiscalYearEnd}, based on criteria established in Internal Control — Integrated Framework (2013) issued by COSO.

`;

    report += `Material Weakness(es)\n${'─'.repeat(50)}\n\n`;
    report += `A material weakness is a deficiency, or a combination of deficiencies, in internal control over financial reporting, such that there is a reasonable possibility that a material misstatement of the company's annual or interim financial statements will not be prevented or detected on a timely basis. The following material weakness(es) have been identified:\n\n`;

    data.materialWeaknesses.forEach((mw, i) => {
      report += `${i + 1}. ${mw.title} (${mw.controlId})\n`;
      report += `   Category: ${mw.category.replace(/_/g, ' ')}\n`;
      report += `   ${mw.description}\n\n`;
    });
  } else {
    // Clean opinion on ICFR
    report += `Opinion on Internal Control Over Financial Reporting

We have audited ${data.entityName}'s internal control over financial reporting as of ${data.fiscalYearEnd}, based on criteria established in Internal Control — Integrated Framework (2013) issued by the Committee of Sponsoring Organizations of the Treadway Commission (COSO).

In our opinion, ${data.entityName} maintained, in all material respects, effective internal control over financial reporting as of ${data.fiscalYearEnd}, based on criteria established in Internal Control — Integrated Framework (2013) issued by COSO.

`;
  }

  // Basis for opinion
  report += `Basis for Opinion

${data.entityName}'s management is responsible for maintaining effective internal control over financial reporting and for its assessment of the effectiveness of internal control over financial reporting. Our responsibility is to express an opinion on the company's internal control over financial reporting based on our audit.

We conducted our audit in accordance with the standards of the Public Company Accounting Oversight Board (United States). Those standards require that we plan and perform the audit to obtain reasonable assurance about whether effective internal control over financial reporting was maintained in all material respects.

Our audit of internal control over financial reporting included obtaining an understanding of internal control over financial reporting, assessing the risk that a material weakness exists, and testing and evaluating the design and operating effectiveness of internal control based on the assessed risk. Our audit also included performing such other procedures as we considered necessary in the circumstances.

`;

  // Control testing summary
  const tested = data.controls.filter(c => c.status !== 'not_tested');
  const effective = data.controls.filter(c => c.status === 'effective');

  report += `Control Testing Summary\n${'─'.repeat(50)}\n\n`;
  report += `Total Controls in Scope: ${data.controls.length}\n`;
  report += `Controls Tested: ${tested.length}\n`;
  report += `Controls Effective: ${effective.length}\n`;
  report += `Material Weaknesses: ${data.materialWeaknesses.length}\n`;
  report += `Significant Deficiencies: ${data.significantDeficiencies.length}\n\n`;

  // Definition of material weakness
  report += `Definition of Internal Control Over Financial Reporting

A company's internal control over financial reporting is a process designed to provide reasonable assurance regarding the reliability of financial reporting and the preparation of financial statements for external purposes in accordance with generally accepted accounting principles. Because of its inherent limitations, internal control over financial reporting may not prevent or detect misstatements. Also, projections of any evaluation of effectiveness to future periods are subject to the risk that controls may become inadequate because of changes in conditions, or that the degree of compliance with the policies or procedures may deteriorate.

`;

  report += `${firmName}\n${today}\n\n`;
  report += `[DRAFT — This report is generated based on automated analysis and requires professional review before issuance.]\n`;

  return report.trim();
}
