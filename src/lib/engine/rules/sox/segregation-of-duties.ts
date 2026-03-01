import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const segregationOfDutiesRules: AuditRule[] = [
  {
    id: 'SOX-SD-001',
    name: 'Same Preparer and Approver',
    framework: 'SOX',
    category: 'Segregation of Duties',
    description: 'Identifies journal entries where the same person prepared and approved the entry',
    citation: 'SOX Section 404 / COSO Framework - Segregation of Duties',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const violations = data.journalEntries.filter(je =>
        je.postedBy && je.approvedBy &&
        je.postedBy.toLowerCase() === je.approvedBy.toLowerCase()
      );

      if (violations.length > 0) {
        const totalAmount = violations.reduce((sum, je) =>
          sum + je.lines.reduce((s, l) => s + l.debit, 0), 0
        );

        findings.push(createFinding(
          data.engagementId,
          'SOX-SD-001',
          'SOX',
          'high',
          'Segregation of Duties Violation: Same Preparer and Approver',
          `${violations.length} journal entries were posted and approved by the same individual, totaling $${(totalAmount / 1000000).toFixed(1)}M in debits. Entries: ${violations.map(v => `${v.entryNumber} (${v.postedBy})`).join(', ')}. This violates fundamental internal control principles and increases the risk of unauthorized transactions.`,
          'SOX Section 404(a): Management is required to assess the effectiveness of internal controls over financial reporting. COSO Principle 10: The organization selects and develops control activities that contribute to the mitigation of risks, including segregation of duties.',
          'Implement mandatory independent approval for all journal entries. Restrict system access to prevent same user from both preparing and approving entries. Retroactively review all entries where the same person prepared and approved for propriety.',
          totalAmount,
          violations.map(v => v.entryNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'SOX-SD-002',
    name: 'Executive Override of Controls',
    framework: 'SOX',
    category: 'Segregation of Duties',
    description: 'Identifies journal entries posted directly by executives bypassing normal controls',
    citation: 'SOX Section 302 / AS 2401 - Management Override',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const execPatterns = ['cfo', 'ceo', 'controller', 'vp_finance', 'cfo_admin', 'admin', 'director'];
      const execEntries = data.journalEntries.filter(je =>
        execPatterns.some(p => je.postedBy.toLowerCase().includes(p)) &&
        !je.approvedBy
      );

      if (execEntries.length > 0) {
        const totalAmount = execEntries.reduce((sum, je) =>
          sum + je.lines.reduce((s, l) => s + l.debit, 0), 0
        );

        findings.push(createFinding(
          data.engagementId,
          'SOX-SD-002',
          'SOX',
          'critical',
          'Potential Management Override: Executive JEs Without Approval',
          `${execEntries.length} journal entries were posted by executive-level users without independent approval, totaling $${(totalAmount / 1000000).toFixed(1)}M. Entries: ${execEntries.map(e => `${e.entryNumber} by ${e.postedBy} on ${e.date}: "${e.description}"`).join('; ')}. Management override of internal controls is the leading cause of financial statement fraud (ACFE studies).`,
          'SOX Section 302(a)(5)(B): Officers certify that they have disclosed any significant deficiencies and material weaknesses in internal controls. AS 2401.66-67: The auditor should design procedures to test for management override.',
          'All executive journal entries must be subject to independent review by a party outside the reporting chain. Implement compensating controls such as board audit committee review of all manual entries by senior management. Document and investigate each identified entry.',
          totalAmount,
          execEntries.map(e => e.entryNumber)
        ));
      }

      return findings;
    },
  },
];
