import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const managementReviewRules: AuditRule[] = [
  {
    id: 'SOX-MR-001',
    name: 'Control Environment Assessment',
    framework: 'SOX',
    category: 'Management Review',
    description: 'Evaluates the overall control environment based on control testing results',
    citation: 'SOX 302/404 / COSO Framework - Control Environment',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const totalControls = data.soxControls.length;
      if (totalControls === 0) {
        findings.push(createFinding(
          data.engagementId,
          'SOX-MR-001',
          'SOX',
          'critical',
          'No SOX Controls Documented',
          'No internal controls over financial reporting have been documented for this engagement. SOX 302 and 404 require management to establish and maintain adequate internal controls.',
          'SOX 302(a)(4): Officers certify they are responsible for establishing and maintaining internal controls. SOX 404(a): Management shall assess the effectiveness of the internal control structure.',
          'Identify and document all key controls over financial reporting using a risk-based approach. Implement controls at the entity level, transaction level, and IT general controls. Perform initial design effectiveness assessment.',
          null
        ));
        return findings;
      }

      const effective = data.soxControls.filter(c => c.status === 'effective').length;
      const deficient = data.soxControls.filter(c => c.status === 'deficient' || c.status === 'significant_deficiency').length;
      const materialWeakness = data.soxControls.filter(c => c.status === 'material_weakness').length;
      const untested = data.soxControls.filter(c => c.status === 'not_tested').length;

      const effectiveRate = effective / totalControls;

      if (materialWeakness > 0) {
        findings.push(createFinding(
          data.engagementId,
          'SOX-MR-001a',
          'SOX',
          'critical',
          'Material Weakness in Internal Controls',
          `${materialWeakness} material weakness(es) identified in internal controls. A material weakness is a deficiency such that there is a reasonable possibility of a material misstatement not being prevented or detected on a timely basis. This requires disclosure in the annual report and adverse opinion on ICFR.`,
          'SOX 404(b): The auditor must attest to management\'s assessment of ICFR effectiveness. AS 2201.62: A material weakness exists when there is a reasonable possibility of a material misstatement.',
          'Develop a remediation plan for each material weakness. Consider interim compensating controls. Evaluate impact on financial statement audit strategy. Prepare for required disclosure in management\'s report on ICFR.',
          null
        ));
      }

      if (untested / totalControls > 0.3) {
        findings.push(createFinding(
          data.engagementId,
          'SOX-MR-001b',
          'SOX',
          'high',
          'Significant Portion of Controls Not Tested',
          `${untested} of ${totalControls} controls (${(untested / totalControls * 100).toFixed(0)}%) have not been tested. Management cannot assert on the effectiveness of ICFR without testing all key controls.`,
          'SOX 404(a): Management must assess the effectiveness of internal controls. AS 2201.45: The auditor should evaluate the completeness of management\'s testing.',
          'Complete testing of all key controls before the assertion date. Prioritize high-risk controls and controls over significant accounts. If testing cannot be completed, disclose the scope limitation.',
          null
        ));
      }

      return findings;
    },
  },
];
