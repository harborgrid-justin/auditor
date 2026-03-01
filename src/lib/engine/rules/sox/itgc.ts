import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const itgcRules: AuditRule[] = [
  {
    id: 'SOX-IT-001',
    name: 'IT General Controls - Untested Controls',
    framework: 'SOX',
    category: 'IT General Controls',
    description: 'Identifies ITGC controls that have not been tested',
    citation: 'SOX 404 / AS 2201 - ITGC requirements',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const itgcControls = data.soxControls.filter(c => c.category === 'itgc');
      const untested = itgcControls.filter(c => c.status === 'not_tested');

      if (untested.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'SOX-IT-001',
          'SOX',
          'high',
          'IT General Controls Not Tested',
          `${untested.length} of ${itgcControls.length} IT General Controls have not been tested: ${untested.map(u => `${u.controlId} - ${u.title}`).join('; ')}. Untested ITGCs may represent a scope limitation and could impact reliance on application controls.`,
          'AS 2201.39: The auditor should test the design and operating effectiveness of IT general controls. SOX 404 requires management testing of all significant controls.',
          'Complete testing of all ITGC controls. If controls cannot be tested, identify compensating controls. Assess the impact of untested ITGCs on the overall control environment and the ability to rely on automated controls.',
          null
        ));
      }

      return findings;
    },
  },
  {
    id: 'SOX-IT-002',
    name: 'Access Control Review Status',
    framework: 'SOX',
    category: 'IT General Controls',
    description: 'Checks for access review controls and their testing status',
    citation: 'SOX 404 / COSO - Access Controls',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const accessControls = data.soxControls.filter(c =>
        c.controlId.includes('IT-01') || c.title.toLowerCase().includes('access')
      );

      if (accessControls.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'SOX-IT-002',
          'SOX',
          'high',
          'No User Access Review Controls Documented',
          'No controls related to user access reviews were identified in the SOX control matrix. User access reviews are a fundamental ITGC required to ensure segregation of duties and prevent unauthorized access to financial systems.',
          'COSO Principle 11: The organization selects and develops general control activities over technology to support the achievement of objectives. This includes logical access controls.',
          'Implement periodic (at least quarterly) user access reviews for all financially significant applications. Document the review process, evidence, and remediation of any exceptions.',
          null
        ));
      }

      return findings;
    },
  },
];
