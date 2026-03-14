import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN } from '../../database/database.module';
import { GenerateEvidencePackageDto } from './evidence.dto';
import {
  EvidencePackageGenerator,
} from '@shared/lib/reports/evidence-package';
import type { EvidenceSectionType } from '@shared/lib/reports/evidence-package';

@Injectable()
export class EvidenceService {
  private readonly generator = new EvidencePackageGenerator();
  private readonly packages = new Map<string, any>();

  constructor(@Inject(DATABASE_TOKEN) private readonly db: any) {}

  async generatePackage(dto: GenerateEvidencePackageDto, userId: string) {
    const { engagements, findings, auditLogs } = await import('@shared/lib/db/pg-schema');
    const { eq } = await import('drizzle-orm');

    // Fetch engagement
    const engagementResults = await this.db
      .select()
      .from(engagements)
      .where(eq(engagements.id, dto.engagementId));

    if (engagementResults.length === 0) {
      throw new NotFoundException(`Engagement ${dto.engagementId} not found`);
    }

    const engagement = engagementResults[0];

    // Fetch findings for the engagement
    const engagementFindings = await this.db
      .select()
      .from(findings)
      .where(eq(findings.engagementId, dto.engagementId));

    // Fetch audit logs for the engagement
    const logs = await this.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.engagementId, dto.engagementId));

    const sections = (dto.sections || EvidencePackageGenerator.getDefaultSections()) as EvidenceSectionType[];

    const result = await this.generator.generatePackage(
      {
        engagementId: dto.engagementId,
        fiscalYear: dto.fiscalYear,
        sections,
        includeWorkpapers: dto.includeWorkpapers ?? true,
        includeAuditLogs: dto.includeAuditLogs ?? true,
        classification: (dto.classification as any) || 'unclassified',
        generatedBy: userId,
      },
      {
        engagementName: engagement.name,
        entityName: engagement.entityName,
        findings: engagementFindings,
        correctiveActionPlans: [],
        trialBalance: [],
        journalEntries: [],
        ruleResults: [],
        auditLogs: logs,
        workpapers: [],
        reconciliationResults: [],
        complianceScores: {},
      },
    );

    this.packages.set(result.id, result);

    return {
      packageId: result.id,
      status: result.status,
      totalSections: result.metadata.totalSections,
      totalItems: result.metadata.totalItems,
      classification: result.classification,
      generatedAt: result.generatedAt,
      expiresAt: result.expiresAt,
    };
  }

  async getPackage(packageId: string) {
    const pkg = this.packages.get(packageId);
    if (!pkg) {
      throw new NotFoundException(`Evidence package ${packageId} not found`);
    }
    return pkg;
  }

  async listPackages(engagementId: string) {
    const packages: any[] = [];
    for (const [, pkg] of this.packages) {
      if (pkg.engagementId === engagementId) {
        packages.push({
          id: pkg.id,
          fiscalYear: pkg.fiscalYear,
          status: pkg.status,
          classification: pkg.classification,
          totalSections: pkg.metadata.totalSections,
          totalItems: pkg.metadata.totalItems,
          generatedAt: pkg.generatedAt,
          expiresAt: pkg.expiresAt,
        });
      }
    }
    return { packages };
  }
}
