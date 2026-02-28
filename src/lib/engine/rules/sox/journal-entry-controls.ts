import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const journalEntryControlRules: AuditRule[] = [
  {
    id: 'SOX-JE-001',
    name: 'Unapproved Journal Entries',
    framework: 'SOX',
    category: 'Journal Entry Controls',
    description: 'Identifies journal entries that were posted without required approval',
    citation: 'SOX 404 / COSO - Authorization Controls',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const unapproved = data.journalEntries.filter(je => !je.approvedBy);

      if (unapproved.length > 0) {
        const totalAmount = unapproved.reduce((sum, je) =>
          sum + je.lines.reduce((s, l) => s + l.debit, 0), 0
        );
        const pct = (unapproved.length / data.journalEntries.length * 100).toFixed(1);

        findings.push(createFinding(
          data.engagementId,
          'SOX-JE-001',
          'SOX',
          'high',
          'Journal Entries Posted Without Approval',
          `${unapproved.length} of ${data.journalEntries.length} journal entries (${pct}%) were posted without documented approval, totaling $${(totalAmount / 1000000).toFixed(1)}M. Entries: ${unapproved.map(u => `${u.entryNumber} (${u.date})`).join(', ')}.`,
          'COSO Principle 10: Control activities include authorization and approval procedures. SOX 404 requires effective internal controls over financial reporting.',
          'Implement mandatory approval workflow for all journal entries before posting. Obtain retrospective approval for all unapproved entries. Consider whether this represents a control deficiency or material weakness.',
          totalAmount,
          unapproved.map(u => u.entryNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'SOX-JE-002',
    name: 'Post-Close Journal Entries',
    framework: 'SOX',
    category: 'Journal Entry Controls',
    description: 'Identifies journal entries recorded after the fiscal year-end close date',
    citation: 'SOX 404 / AS 2401.67 - Post-close adjustments',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const fyeDate = new Date(data.fiscalYearEnd);
      const postClose = data.journalEntries.filter(je => {
        const jeDate = new Date(je.date);
        return jeDate > fyeDate;
      });

      if (postClose.length > 0) {
        const totalAmount = postClose.reduce((sum, je) =>
          sum + je.lines.reduce((s, l) => s + l.debit, 0), 0
        );

        findings.push(createFinding(
          data.engagementId,
          'SOX-JE-002',
          'SOX',
          'high',
          'Post-Close Journal Entries Detected',
          `${postClose.length} journal entries were recorded after the fiscal year-end (${data.fiscalYearEnd}), totaling $${(totalAmount / 1000000).toFixed(1)}M. Post-close entries: ${postClose.map(p => `${p.entryNumber} dated ${p.date}: "${p.description}"`).join('; ')}. Post-close entries require heightened scrutiny as they may indicate earnings management.`,
          'AS 2401.67: The auditor should design procedures to test journal entries and other adjustments made at the end of a reporting period. SOX 404 requires controls over the financial close process.',
          'Obtain management authorization for all post-close entries. Verify business purpose and supporting documentation. Assess whether entries are correcting legitimate errors or represent inappropriate adjustments.',
          totalAmount,
          postClose.map(p => p.entryNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'SOX-JE-003',
    name: 'Round-Number Journal Entries',
    framework: 'SOX',
    category: 'Journal Entry Controls',
    description: 'Flags journal entries with suspiciously round amounts which may indicate estimation or fabrication',
    citation: 'AS 2401 - Consideration of Fraud',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const roundEntries = data.journalEntries.filter(je => {
        const amounts = je.lines.map(l => Math.max(l.debit, l.credit));
        return amounts.some(a => a >= 100000 && a % 100000 === 0);
      });

      if (roundEntries.length > 0) {
        const totalAmount = roundEntries.reduce((sum, je) =>
          sum + je.lines.reduce((s, l) => s + Math.max(l.debit, l.credit), 0), 0
        );

        findings.push(createFinding(
          data.engagementId,
          'SOX-JE-003',
          'SOX',
          'medium',
          'Round-Number Journal Entries Detected',
          `${roundEntries.length} journal entries contain suspiciously round amounts (multiples of $100,000), totaling $${(totalAmount / 1000000).toFixed(1)}M. Round amounts may indicate management estimates, accrual adjustments, or potentially fabricated entries. Entries: ${roundEntries.map(r => `${r.entryNumber}: "${r.description}"`).join('; ')}.`,
          'AS 2401.61: Due to the risk of management override, the auditor should test the appropriateness of journal entries. Round-dollar entries are a common fraud indicator.',
          'Obtain supporting documentation for all round-number entries exceeding materiality. Verify the business rationale and supporting calculations. Determine if amounts are based on actual transactions or estimates.',
          totalAmount,
          roundEntries.map(r => r.entryNumber)
        ));
      }

      return findings;
    },
  },
];
