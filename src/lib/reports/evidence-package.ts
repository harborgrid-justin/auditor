/**
 * Audit Evidence Package Generator
 *
 * Generates structured audit evidence packages for GAO/IG review.
 * Packages include findings, corrective action plans, compliance scores,
 * workpapers, trial balance detail, reconciliation reports, and audit logs.
 *
 * References:
 *   - Government Auditing Standards (Yellow Book) §6.79-6.82
 *   - OMB Circular A-123: Management's Responsibility for Internal Control
 *   - DoD FMR Vol 1, Ch 1: FIAR Evidence Requirements
 *   - NARA General Records Schedule: Audit Record Retention
 */

import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvidencePackageStatus = 'generating' | 'completed' | 'failed' | 'expired';

export type EvidenceSectionType =
  | 'executive_summary'
  | 'findings_detail'
  | 'corrective_action_plans'
  | 'compliance_scores'
  | 'trial_balance'
  | 'journal_entries'
  | 'reconciliation_reports'
  | 'rule_execution_results'
  | 'audit_log_extracts'
  | 'workpapers'
  | 'supporting_documents';

export interface EvidencePackageConfig {
  engagementId: string;
  fiscalYear: number;
  sections: EvidenceSectionType[];
  includeWorkpapers: boolean;
  includeAuditLogs: boolean;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  classification: 'unclassified' | 'cui' | 'cui_specified' | 'fouo';
  generatedBy: string;
}

export interface EvidenceSection {
  sectionType: EvidenceSectionType;
  title: string;
  description: string;
  itemCount: number;
  data: any;
  generatedAt: string;
}

export interface EvidencePackage {
  id: string;
  engagementId: string;
  fiscalYear: number;
  status: EvidencePackageStatus;
  classification: string;
  tableOfContents: TableOfContentsEntry[];
  sections: EvidenceSection[];
  metadata: PackageMetadata;
  generatedAt: string;
  generatedBy: string;
  expiresAt: string;
}

export interface TableOfContentsEntry {
  sectionNumber: string;
  title: string;
  sectionType: EvidenceSectionType;
  itemCount: number;
  pageReference: string;
}

export interface PackageMetadata {
  packageVersion: string;
  generatorVersion: string;
  engagementName: string;
  entityName: string;
  auditPeriod: string;
  totalSections: number;
  totalItems: number;
  crossReferenceIndex: CrossReference[];
}

export interface CrossReference {
  findingId: string;
  findingTitle: string;
  relatedWorkpapers: string[];
  relatedJournalEntries: string[];
  relatedRuleResults: string[];
}

// ---------------------------------------------------------------------------
// Evidence Package Generator
// ---------------------------------------------------------------------------

export class EvidencePackageGenerator {
  /**
   * Generate a complete evidence package for an engagement.
   */
  async generatePackage(
    config: EvidencePackageConfig,
    engagementData: {
      engagementName: string;
      entityName: string;
      findings: any[];
      correctiveActionPlans: any[];
      trialBalance: any[];
      journalEntries: any[];
      ruleResults: any[];
      auditLogs: any[];
      workpapers: any[];
      reconciliationResults: any[];
      complianceScores: Record<string, number>;
    },
  ): Promise<EvidencePackage> {
    const packageId = uuid();
    const now = new Date();
    const sections: EvidenceSection[] = [];
    let sectionNumber = 1;

    for (const sectionType of config.sections) {
      const section = this.generateSection(
        sectionType,
        sectionNumber,
        engagementData,
        config,
      );
      if (section) {
        sections.push(section);
        sectionNumber++;
      }
    }

    const tableOfContents = sections.map((s, i) => ({
      sectionNumber: `${i + 1}`,
      title: s.title,
      sectionType: s.sectionType,
      itemCount: s.itemCount,
      pageReference: `Section ${i + 1}`,
    }));

    const crossReferenceIndex = this.buildCrossReferences(engagementData);

    const totalItems = sections.reduce((sum, s) => sum + s.itemCount, 0);

    // Evidence packages expire after 7 years per NARA GRS 1.1, Item 010
    const expiresAt = new Date(now);
    expiresAt.setFullYear(expiresAt.getFullYear() + 7);

    return {
      id: packageId,
      engagementId: config.engagementId,
      fiscalYear: config.fiscalYear,
      status: 'completed',
      classification: config.classification,
      tableOfContents,
      sections,
      metadata: {
        packageVersion: '1.0',
        generatorVersion: '2026.1',
        engagementName: engagementData.engagementName,
        entityName: engagementData.entityName,
        auditPeriod: `FY${config.fiscalYear}`,
        totalSections: sections.length,
        totalItems,
        crossReferenceIndex,
      },
      generatedAt: now.toISOString(),
      generatedBy: config.generatedBy,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private generateSection(
    sectionType: EvidenceSectionType,
    sectionNumber: number,
    data: any,
    config: EvidencePackageConfig,
  ): EvidenceSection | null {
    const now = new Date().toISOString();

    switch (sectionType) {
      case 'executive_summary':
        return {
          sectionType,
          title: 'Executive Summary',
          description: 'Overview of audit findings, compliance posture, and remediation status',
          itemCount: 1,
          data: {
            totalFindings: data.findings.length,
            criticalFindings: data.findings.filter((f: any) => f.severity === 'critical').length,
            highFindings: data.findings.filter((f: any) => f.severity === 'high').length,
            mediumFindings: data.findings.filter((f: any) => f.severity === 'medium').length,
            lowFindings: data.findings.filter((f: any) => f.severity === 'low').length,
            totalCAPs: data.correctiveActionPlans.length,
            activeCAPs: data.correctiveActionPlans.filter((c: any) => c.status === 'active').length,
            complianceScores: data.complianceScores,
            auditPeriod: `FY${config.fiscalYear}`,
          },
          generatedAt: now,
        };

      case 'findings_detail':
        return {
          sectionType,
          title: 'Detailed Findings',
          description: 'Complete listing of all audit findings with citations and remediation guidance',
          itemCount: data.findings.length,
          data: {
            findings: data.findings.map((f: any) => ({
              id: f.id,
              ruleId: f.ruleId,
              severity: f.severity,
              title: f.title,
              description: f.description,
              citation: f.citation,
              remediation: f.remediation,
              amountImpact: f.amountImpact,
              status: f.status,
            })),
          },
          generatedAt: now,
        };

      case 'corrective_action_plans':
        return {
          sectionType,
          title: 'Corrective Action Plans',
          description: 'CAP lifecycle status, milestones, and remediation progress',
          itemCount: data.correctiveActionPlans.length,
          data: { plans: data.correctiveActionPlans },
          generatedAt: now,
        };

      case 'compliance_scores':
        return {
          sectionType,
          title: 'Compliance Scoring',
          description: 'Enterprise-wide compliance posture scores by framework and category',
          itemCount: Object.keys(data.complianceScores).length,
          data: { scores: data.complianceScores },
          generatedAt: now,
        };

      case 'trial_balance':
        return {
          sectionType,
          title: 'Trial Balance Detail',
          description: 'Complete trial balance with USSGL account balances',
          itemCount: data.trialBalance.length,
          data: { entries: data.trialBalance },
          generatedAt: now,
        };

      case 'journal_entries':
        return {
          sectionType,
          title: 'Journal Entry Detail',
          description: 'All journal entries posted during the audit period',
          itemCount: data.journalEntries.length,
          data: { entries: data.journalEntries },
          generatedAt: now,
        };

      case 'reconciliation_reports':
        return {
          sectionType,
          title: 'Reconciliation Reports',
          description: 'FBWT, IGT, and three-way match reconciliation results',
          itemCount: data.reconciliationResults.length,
          data: { results: data.reconciliationResults },
          generatedAt: now,
        };

      case 'rule_execution_results':
        return {
          sectionType,
          title: 'Rule Execution Results',
          description: 'Complete results from all DoD FMR rule executions with citations',
          itemCount: data.ruleResults.length,
          data: { results: data.ruleResults },
          generatedAt: now,
        };

      case 'audit_log_extracts':
        if (!config.includeAuditLogs) return null;
        return {
          sectionType,
          title: 'Audit Log Extracts',
          description: 'System audit trail for the engagement period',
          itemCount: data.auditLogs.length,
          data: { logs: data.auditLogs },
          generatedAt: now,
        };

      case 'workpapers':
        if (!config.includeWorkpapers) return null;
        return {
          sectionType,
          title: 'Workpapers',
          description: 'Supporting workpapers organized by audit assertion',
          itemCount: data.workpapers.length,
          data: {
            workpapers: data.workpapers.map((w: any) => ({
              id: w.id,
              name: w.name,
              type: w.type,
              assertion: w.assertion,
              preparedBy: w.preparedBy,
              reviewedBy: w.reviewedBy,
            })),
          },
          generatedAt: now,
        };

      case 'supporting_documents':
        return {
          sectionType,
          title: 'Supporting Documents',
          description: 'Additional supporting documentation and attachments',
          itemCount: 0,
          data: { documents: [] },
          generatedAt: now,
        };

      default:
        return null;
    }
  }

  /**
   * Build cross-reference index linking findings to workpapers and JEs.
   */
  private buildCrossReferences(data: any): CrossReference[] {
    return data.findings.map((finding: any) => {
      const relatedWorkpapers = data.workpapers
        .filter((w: any) => w.findingId === finding.id || w.ruleId === finding.ruleId)
        .map((w: any) => w.id);

      const relatedJournalEntries = data.journalEntries
        .filter((je: any) => je.findingId === finding.id)
        .map((je: any) => je.id);

      const relatedRuleResults = data.ruleResults
        .filter((r: any) => r.ruleId === finding.ruleId)
        .map((r: any) => r.id);

      return {
        findingId: finding.id,
        findingTitle: finding.title,
        relatedWorkpapers,
        relatedJournalEntries,
        relatedRuleResults,
      };
    });
  }

  /**
   * Get the default section list for a complete evidence package.
   */
  static getDefaultSections(): EvidenceSectionType[] {
    return [
      'executive_summary',
      'findings_detail',
      'corrective_action_plans',
      'compliance_scores',
      'trial_balance',
      'journal_entries',
      'reconciliation_reports',
      'rule_execution_results',
      'audit_log_extracts',
      'workpapers',
      'supporting_documents',
    ];
  }
}
