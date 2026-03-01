import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const fraudRiskRules: AuditRule[] = [
  {
    id: 'PCAOB-FR-001',
    name: 'Revenue Fraud Risk Indicators',
    framework: 'PCAOB',
    category: 'Fraud Risk (AS 2401)',
    description: 'Identifies presumed fraud risk factors related to revenue recognition',
    citation: 'AS 2401.41 - Presumption of fraud risk in revenue recognition',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const riskFactors: string[] = [];

      const revenueAccounts = data.accounts.filter(a => a.accountType === 'revenue');
      const totalRevenue = revenueAccounts.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
      const arAccounts = data.accounts.filter(a => a.subType === 'accounts_receivable' && a.endingBalance > 0);
      const grossAR = arAccounts.reduce((sum, a) => sum + a.endingBalance, 0);

      // DSO analysis
      if (totalRevenue > 0 && grossAR > 0) {
        const dso = (grossAR / totalRevenue) * 365;
        if (dso > 75) {
          riskFactors.push(`Days Sales Outstanding of ${dso.toFixed(0)} days is elevated (>75 days)`);
        }
      }

      // Year-end revenue concentration
      const fyeDate = new Date(data.fiscalYearEnd);
      const yearEndJEs = data.journalEntries.filter(je => {
        const d = new Date(je.date);
        return (fyeDate.getTime() - d.getTime()) / (1000 * 60 * 60 * 24) <= 15 && (fyeDate.getTime() - d.getTime()) >= 0;
      });
      const yearEndRevEntries = yearEndJEs.filter(je =>
        je.lines.some(l => l.accountName?.toLowerCase().includes('revenue'))
      );
      if (yearEndRevEntries.length > 0) {
        riskFactors.push(`${yearEndRevEntries.length} revenue-related entries in last 15 days of fiscal year`);
      }

      // Manual revenue entries
      const manualRevEntries = data.journalEntries.filter(je =>
        je.source === 'manual' &&
        je.lines.some(l => l.accountName?.toLowerCase().includes('revenue') && l.credit > 0)
      );
      if (manualRevEntries.length > 0) {
        riskFactors.push(`${manualRevEntries.length} manual journal entries crediting revenue accounts`);
      }

      // Deferred revenue trends
      const deferredRev = data.accounts.filter(a => a.subType === 'deferred_revenue');
      const drBeginning = deferredRev.reduce((sum, a) => sum + Math.abs(a.beginningBalance), 0);
      const drEnding = deferredRev.reduce((sum, a) => sum + Math.abs(a.endingBalance), 0);
      if (drBeginning > 0 && drEnding < drBeginning * 0.7) {
        riskFactors.push(`Deferred revenue decreased ${((1 - drEnding / drBeginning) * 100).toFixed(0)}%`);
      }

      if (riskFactors.length >= 2) {
        findings.push(createFinding(
          data.engagementId,
          'PCAOB-FR-001',
          'PCAOB',
          'high',
          'Multiple Revenue Fraud Risk Indicators Present',
          `AS 2401 requires a presumption of fraud risk in revenue recognition. ${riskFactors.length} risk indicators identified:\n${riskFactors.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\nThese factors, taken together, suggest elevated fraud risk requiring expanded substantive procedures.`,
          'AS 2401.41: The auditor should ordinarily presume that there is a risk of material misstatement due to fraud relating to revenue recognition.',
          'Design and perform targeted substantive procedures including: vouching of material revenue transactions to contracts and shipping documents, confirmations with significant customers, revenue cutoff testing, analysis of credit memos post-period-end, and review of side agreements or special terms.',
          null,
          revenueAccounts.map(a => a.accountNumber)
        ));
      }

      return findings;
    },
  },
  {
    id: 'PCAOB-FR-002',
    name: 'Management Override Indicators',
    framework: 'PCAOB',
    category: 'Fraud Risk (AS 2401)',
    description: 'Tests for indicators of management override of internal controls',
    citation: 'AS 2401.57-67 - Management override of controls',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];
      const overrideIndicators: string[] = [];

      // Unapproved entries
      const unapproved = data.journalEntries.filter(je => !je.approvedBy);
      if (unapproved.length > 0) {
        overrideIndicators.push(`${unapproved.length} entries without approval`);
      }

      // Same preparer/approver
      const samePA = data.journalEntries.filter(je =>
        je.postedBy && je.approvedBy && je.postedBy.toLowerCase() === je.approvedBy.toLowerCase()
      );
      if (samePA.length > 0) {
        overrideIndicators.push(`${samePA.length} entries with same preparer and approver`);
      }

      // Post-close entries
      const fyeDate = new Date(data.fiscalYearEnd);
      const postClose = data.journalEntries.filter(je => new Date(je.date) > fyeDate);
      if (postClose.length > 0) {
        overrideIndicators.push(`${postClose.length} post-close adjustments`);
      }

      // Executive-posted entries
      const execEntries = data.journalEntries.filter(je =>
        ['cfo', 'ceo', 'controller', 'admin', 'cfo_admin'].some(p =>
          je.postedBy.toLowerCase().includes(p)
        )
      );
      if (execEntries.length > 0) {
        overrideIndicators.push(`${execEntries.length} entries posted by executive users`);
      }

      if (overrideIndicators.length >= 2) {
        findings.push(createFinding(
          data.engagementId,
          'PCAOB-FR-002',
          'PCAOB',
          'critical',
          'Elevated Risk of Management Override of Controls',
          `Multiple indicators of potential management override detected:\n${overrideIndicators.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\nAS 2401 requires specific procedures to address the risk of management override regardless of the assessment of other fraud risk factors.`,
          'AS 2401.57: The auditor should design procedures to address the risk of management override of controls. AS 2401.58-67 describe required procedures including testing journal entries, reviewing accounting estimates, and evaluating significant unusual transactions.',
          'Perform required AS 2401 procedures: (1) Test appropriateness of journal entries and other adjustments, (2) Review accounting estimates for bias, (3) Evaluate business rationale for significant unusual transactions. Consider expanding the scope of journal entry testing and performing additional fraud-focused analytical procedures.',
          null
        ));
      }

      return findings;
    },
  },
];
