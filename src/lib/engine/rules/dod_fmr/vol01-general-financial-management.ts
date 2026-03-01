import type { AuditRule, AuditFinding, EngagementData } from '@/types/findings';
import { createFinding } from '@/lib/engine/rule-runner';

export const generalFinancialManagementRules: AuditRule[] = [
  {
    id: 'DOD-FMR-V01-001',
    name: 'FIAR Compliance Assessment',
    framework: 'DOD_FMR',
    category: 'General Financial Management (Vol 1)',
    description: 'Evaluates FIAR assessment audit readiness scores and identifies material weaknesses that threaten audit opinions',
    citation: 'DoD FMR Vol 1, Ch 1; NDAA Section 1003 - Financial Improvement and Audit Remediation',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { fiarAssessments } = data.dodData;

      for (const assessment of fiarAssessments) {
        if (assessment.auditReadinessScore < 80) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V01-001',
            'DOD_FMR',
            assessment.auditReadinessScore < 50 ? 'critical' : 'high',
            'FIAR Audit Readiness Score Below Threshold',
            `FIAR assessment dated ${assessment.assessmentDate} has an audit readiness score of ${assessment.auditReadinessScore}, which is below the required threshold of 80. Assessed by ${assessment.assessedBy}. Conclusion: "${assessment.conclusion}". A score below 80 indicates the component is not adequately prepared for a full-scope financial statement audit and material misstatements are likely to exist across major line items.`,
            'DoD FMR Volume 1, Chapter 1: DoD components must achieve and sustain audit readiness per NDAA Section 1003. Components with scores below 80 are considered at risk for adverse or disclaimer audit opinions.',
            'Prioritize remediation of the weakest assessment areas. Develop a corrective action plan targeting USSGL compliance, fund balance reconciliation, and internal control documentation. Engage with the DoD OIG and independent auditors to align remediation efforts with audit expectations before the next assessment cycle.',
            null,
            []
          ));
        }

        const weaknesses = assessment.materialWeaknesses ?? [];
        if (weaknesses.length > 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V01-001',
            'DOD_FMR',
            'critical',
            'Material Weaknesses Identified in FIAR Assessment',
            `FIAR assessment dated ${assessment.assessmentDate} identified ${weaknesses.length} material weakness(es): ${weaknesses.join('; ')}. Material weaknesses represent deficiencies so severe that there is a reasonable possibility of a material misstatement in the financial statements not being prevented or detected on a timely basis.`,
            'DoD FMR Volume 1, Chapter 1; OMB Circular A-123, Appendix A: Material weaknesses must be reported in the Statement of Assurance and to Congress per 31 U.S.C. § 3512.',
            'Develop detailed corrective action plans for each material weakness with responsible parties, milestones, and target dates. Monitor remediation progress quarterly. Ensure compensating controls mitigate risk until weaknesses are fully remediated.',
            null,
            []
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V01-002',
    name: 'Financial Management System Requirements',
    framework: 'DOD_FMR',
    category: 'General Financial Management (Vol 1)',
    description: 'Verifies that USSGL accounts exist and are populated as required by FFMIA and DoD FMR',
    citation: 'DoD FMR Vol 1, Ch 2; FFMIA - Federal Financial Management Improvement Act of 1996',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts } = data.dodData;

      if (ussglAccounts.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V01-002',
          'DOD_FMR',
          'critical',
          'No USSGL Accounts Recorded',
          'No United States Standard General Ledger (USSGL) accounts were found for this engagement. All DoD components are required to maintain financial records using the USSGL chart of accounts as prescribed by the Treasury Financial Manual. The absence of USSGL accounts indicates the financial management system is not compliant with federal accounting standards and the FFMIA.',
          'DoD FMR Volume 1, Chapter 2; FFMIA (P.L. 104-208, Section 803): Federal agencies must implement and maintain financial management systems that comply substantially with federal financial management system requirements, applicable federal accounting standards, and the USSGL.',
          'Implement the USSGL chart of accounts in the financial management system. Map all existing accounts to the appropriate USSGL account numbers. Ensure both proprietary and budgetary accounts are established and maintained in a dual-track accounting system.',
          null,
          []
        ));
        return findings;
      }

      const proprietaryAccounts = ussglAccounts.filter(a => a.accountType === 'proprietary');
      const budgetaryAccounts = ussglAccounts.filter(a => a.accountType === 'budgetary');

      if (proprietaryAccounts.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V01-002',
          'DOD_FMR',
          'high',
          'No Proprietary USSGL Accounts Established',
          `Only ${budgetaryAccounts.length} budgetary account(s) exist with no proprietary accounts. Federal accounting requires a dual-track system with both proprietary (assets, liabilities, net position, revenue, expense) and budgetary accounts. The absence of proprietary accounts prevents preparation of the Balance Sheet, Statement of Net Cost, and Statement of Changes in Net Position.`,
          'DoD FMR Volume 1, Chapter 2; USSGL TFM Supplement: Both proprietary and budgetary accounts must be maintained.',
          'Establish the full proprietary chart of accounts per the USSGL. Map existing financial data to proprietary accounts and ensure all transactions generate dual-track entries.',
          null,
          []
        ));
      }

      if (budgetaryAccounts.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V01-002',
          'DOD_FMR',
          'high',
          'No Budgetary USSGL Accounts Established',
          `Only ${proprietaryAccounts.length} proprietary account(s) exist with no budgetary accounts. Budgetary accounts are required for tracking appropriations, apportionments, allotments, obligations, and outlays. Their absence prevents preparation of the Statement of Budgetary Resources and the SF 133.`,
          'DoD FMR Volume 1, Chapter 2; USSGL TFM Supplement: Budgetary accounts (USSGL 4000-series) must be maintained to track the status of budgetary resources.',
          'Establish the full budgetary chart of accounts per the USSGL. Ensure all obligation and expenditure transactions generate proper budgetary account entries.',
          null,
          []
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V01-003',
    name: 'Internal Control Assessment (A-123)',
    framework: 'DOD_FMR',
    category: 'General Financial Management (Vol 1)',
    description: 'Checks FIAR assessments for the internalControlsAssessed flag to ensure OMB A-123 compliance',
    citation: 'DoD FMR Vol 1, Ch 4; OMB Circular A-123 - Management Responsibility for Internal Control',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { fiarAssessments } = data.dodData;

      if (fiarAssessments.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V01-003',
          'DOD_FMR',
          'high',
          'No FIAR Assessments Available for Internal Control Review',
          'No FIAR assessments were found for this engagement. Without FIAR assessments, there is no basis to evaluate whether internal controls over financial reporting have been assessed per OMB Circular A-123. The annual Statement of Assurance cannot be supported without documented internal control assessments.',
          'DoD FMR Volume 1, Chapter 4; OMB Circular A-123: Management must establish, maintain, and assess internal controls annually. Results support the annual Statement of Assurance.',
          'Conduct FIAR assessments including internal control evaluations. Document control activities, test operating effectiveness, and report results in the Statement of Assurance.',
          null,
          []
        ));
        return findings;
      }

      const unassessed = fiarAssessments.filter(a => !a.internalControlsAssessed);

      if (unassessed.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V01-003',
          'DOD_FMR',
          'high',
          'Internal Controls Not Assessed in FIAR Review',
          `${unassessed.length} of ${fiarAssessments.length} FIAR assessment(s) did not include an evaluation of internal controls over financial reporting. Assessments without internal control evaluations dated: ${unassessed.map(a => a.assessmentDate).join(', ')}. Without internal control assessments, there is no basis to assert that financial data is reliable and complete per OMB Circular A-123.`,
          'DoD FMR Volume 1, Chapter 4: Commanders and directors must establish and maintain internal controls. OMB Circular A-123 requires management to assess internal controls annually and report results in the Statement of Assurance.',
          'Complete internal control assessments for all business processes material to financial reporting. Document control activities, test operating effectiveness, and remediate any identified deficiencies. Ensure the Statement of Assurance reflects the results of internal control testing.',
          null,
          []
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V01-004',
    name: 'Material Weakness Reporting',
    framework: 'DOD_FMR',
    category: 'General Financial Management (Vol 1)',
    description: 'Identifies FIAR assessments with unremediated material weaknesses that must be reported',
    citation: 'DoD FMR Vol 1, Ch 4; OMB Circular A-123; 31 U.S.C. § 3512 - Statement of Assurance',
    defaultSeverity: 'critical',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { fiarAssessments } = data.dodData;

      for (const assessment of fiarAssessments) {
        const weaknesses = assessment.materialWeaknesses ?? [];
        if (weaknesses.length > 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V01-004',
            'DOD_FMR',
            'critical',
            'Unremediated Material Weaknesses Require Reporting',
            `FIAR assessment dated ${assessment.assessmentDate} reports ${weaknesses.length} unremediated material weakness(es): ${weaknesses.join('; ')}. Material weaknesses must be reported in the annual Statement of Assurance to the Secretary of Defense and to Congress. Each weakness represents a reasonable possibility that a material misstatement of the financial statements will not be prevented or detected on a timely basis.`,
            'DoD FMR Volume 1, Chapter 4; OMB Circular A-123, Appendix A; 31 U.S.C. § 3512: Material weaknesses must be reported in the Statement of Assurance. Government Auditing Standards require disclosure of material weaknesses in internal control.',
            'Develop detailed corrective action plans for each material weakness with responsible parties, milestones, and target completion dates. Monitor remediation progress quarterly. Ensure compensating controls are in place until weaknesses are fully remediated. Report all material weaknesses in the annual Statement of Assurance.',
            null,
            []
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V01-005',
    name: 'Corrective Action Plan Timeliness',
    framework: 'DOD_FMR',
    category: 'General Financial Management (Vol 1)',
    description: 'Identifies corrective action plans with past target dates that are not completed',
    citation: 'DoD FMR Vol 1, Ch 4; OMB Circular A-123 - Corrective Action Plans',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { fiarAssessments } = data.dodData;
      const now = new Date();

      for (const assessment of fiarAssessments) {
        const caps = assessment.correctiveActionPlans ?? [];
        const overdueCaps = caps.filter(cap => {
          const targetDate = new Date(cap.targetDate);
          return targetDate < now && cap.status !== 'completed' && cap.status !== 'closed';
        });

        if (overdueCaps.length > 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V01-005',
            'DOD_FMR',
            'medium',
            'Overdue Corrective Action Plans Detected',
            `${overdueCaps.length} corrective action plan(s) from FIAR assessment dated ${assessment.assessmentDate} are past their target completion date and remain open: ${overdueCaps.map(c => `"${c.finding}" (target: ${c.targetDate}, current status: ${c.status})`).join('; ')}. Overdue CAPs indicate the component is not progressing toward audit readiness on schedule and may result in repeat audit findings and continued material weaknesses.`,
            'DoD FMR Volume 1, Chapter 4; OMB Circular A-123: Corrective action plans must be completed within established timeframes. Progress must be monitored and reported to senior leadership.',
            'Review each overdue CAP and determine the root cause of delay. Update target dates with realistic milestones. Escalate persistent delays to senior leadership. Consider whether interim compensating controls can mitigate risk while remediation is completed.',
            null,
            []
          ));
        }
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V01-006',
    name: 'SFIS Compliance',
    framework: 'DOD_FMR',
    category: 'General Financial Management (Vol 1)',
    description: 'Checks Standard Financial Information Structure elements for completeness including required departmentCode and mainAccountCode',
    citation: 'DoD FMR Vol 1, Ch 4; DoD SFIS Implementation Guide',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { sfisElements } = data.dodData;

      if (sfisElements.length === 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V01-006',
          'DOD_FMR',
          'medium',
          'No SFIS Elements Defined',
          'No Standard Financial Information Structure (SFIS) elements were found for this engagement. SFIS provides the common data architecture for DoD financial management and is required for all financial transactions. The absence of SFIS elements indicates the component may not be compliant with the DoD Business Enterprise Architecture.',
          'DoD FMR Volume 1, Chapter 4: All DoD components shall implement and use the Standard Financial Information Structure. DoD SFIS Implementation Guide.',
          'Implement SFIS coding in the financial management system. Ensure all required elements (department code, main account code, sub-account code, availability type) are populated for every financial transaction.',
          null,
          []
        ));
        return findings;
      }

      const missingDeptCode = sfisElements.filter(e => !e.departmentCode);
      const missingMainAcct = sfisElements.filter(e => !e.mainAccountCode);

      if (missingDeptCode.length > 0 || missingMainAcct.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V01-006',
          'DOD_FMR',
          'medium',
          'Incomplete SFIS Elements Detected',
          `SFIS element deficiencies found: ${missingDeptCode.length} element(s) missing department code and ${missingMainAcct.length} element(s) missing main account code out of ${sfisElements.length} total elements. Department code and main account code are mandatory SFIS fields required for proper financial classification, Treasury reporting, and GTAS submissions.`,
          'DoD FMR Volume 1, Chapter 4; DoD SFIS Implementation Guide: Department code and main account code are mandatory elements for all financial transactions.',
          'Review and correct SFIS element data for all transactions. Implement system edits to prevent posting of transactions with incomplete SFIS coding. Validate SFIS data against the Treasury Account Symbol structure.',
          null,
          sfisElements.filter(e => !e.departmentCode || !e.mainAccountCode).map(e => e.id)
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V01-007',
    name: 'USSGL Account Structure',
    framework: 'DOD_FMR',
    category: 'General Financial Management (Vol 1)',
    description: 'Validates that USSGL accounts have properly formatted account numbers per Treasury requirements',
    citation: 'DoD FMR Vol 1, Ch 7; Treasury Financial Manual Vol I, Part 2, Ch 4700 - USSGL',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { ussglAccounts } = data.dodData;

      if (ussglAccounts.length === 0) return findings;

      const invalidAccounts: string[] = [];
      for (const account of ussglAccounts) {
        const acctNum = account.accountNumber.trim();
        // USSGL account numbers should be 4 digits (1000-9999)
        if (!/^\d{4}$/.test(acctNum)) {
          invalidAccounts.push(`${acctNum} ("${account.accountTitle}")`);
          continue;
        }
        const numVal = parseInt(acctNum, 10);
        // Proprietary: 1000-3999, 5000-6999; Budgetary: 4000-4999
        if (numVal < 1000 || numVal > 6999) {
          invalidAccounts.push(`${acctNum} ("${account.accountTitle}") - outside valid USSGL range`);
        }
      }

      if (invalidAccounts.length > 0) {
        findings.push(createFinding(
          data.engagementId,
          'DOD-FMR-V01-007',
          'DOD_FMR',
          'medium',
          'Invalid USSGL Account Number Format',
          `${invalidAccounts.length} USSGL account(s) have improperly formatted account numbers: ${invalidAccounts.slice(0, 10).join('; ')}${invalidAccounts.length > 10 ? ` and ${invalidAccounts.length - 10} more` : ''}. USSGL account numbers must be 4-digit numeric codes within the standard ranges: 1000-3999 for proprietary accounts, 4000-4999 for budgetary accounts, and 5000-6999 for revenue and expense accounts.`,
          'DoD FMR Volume 1, Chapter 7; Treasury Financial Manual Vol I, Part 2, Chapter 4700: All accounts must conform to the USSGL chart of accounts with properly formatted 4-digit account numbers.',
          'Correct all invalid account numbers to conform to the USSGL standard. Map non-standard accounts to their proper USSGL equivalents. Implement system validation rules to reject account numbers that do not conform to the 4-digit USSGL format.',
          null,
          invalidAccounts.map(a => a.split(' ')[0])
        ));
      }

      return findings;
    },
  },
  {
    id: 'DOD-FMR-V01-008',
    name: 'Notice of Findings Tracking',
    framework: 'DOD_FMR',
    category: 'General Financial Management (Vol 1)',
    description: 'Checks FIAR assessments for unresolved Notices of Findings and Recommendations (NFRs)',
    citation: 'DoD FMR Vol 1, Ch 1; Government Auditing Standards (Yellow Book) - Findings and Recommendations',
    defaultSeverity: 'high',
    enabled: true,
    check: (data: EngagementData): AuditFinding[] => {
      if (!data.dodData) return [];
      const findings: AuditFinding[] = [];
      const { fiarAssessments } = data.dodData;

      for (const assessment of fiarAssessments) {
        const nofs = assessment.noticeOfFindings ?? [];
        if (nofs.length > 0) {
          findings.push(createFinding(
            data.engagementId,
            'DOD-FMR-V01-008',
            'DOD_FMR',
            'high',
            'Unresolved Notices of Findings Identified',
            `FIAR assessment dated ${assessment.assessmentDate} has ${nofs.length} unresolved Notice(s) of Findings and Recommendations (NFRs): ${nofs.slice(0, 5).join('; ')}${nofs.length > 5 ? ` and ${nofs.length - 5} more` : ''}. Unresolved NFRs from prior audits indicate the component has not addressed previously identified deficiencies, which increases the risk of repeat findings and potential escalation to material weaknesses.`,
            'DoD FMR Volume 1, Chapter 1; Government Auditing Standards: Audit findings must be tracked and remediated. Unresolved findings from prior periods must be reported and their status disclosed.',
            'Develop corrective action plans for each unresolved NFR. Assign responsible parties and target completion dates. Monitor remediation progress and provide status updates to the audit team. Prioritize NFRs that have the highest risk of escalating to material weaknesses or significant deficiencies.',
            null,
            []
          ));
        }
      }

      return findings;
    },
  },
];
