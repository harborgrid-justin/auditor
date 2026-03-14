import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN, AppDatabase } from '../../database/database.module';
import { PaginationQueryDto, buildPaginatedResponse } from '../../common/dto/pagination.dto';
import {
  CreateCAPDto,
  UpdateCAPStatusDto,
  CompleteMilestoneDto,
  GetFIARStatusDto,
} from './remediation.dto';

@Injectable()
export class RemediationService {
  constructor(@Inject(DATABASE_TOKEN) private readonly db: AppDatabase) {}

  private caps: Map<string, any> = new Map();

  async createCAP(dto: CreateCAPDto) {
    const id = uuid();
    const now = new Date().toISOString();

    const milestones = dto.milestones.map((m) => ({
      id: uuid(),
      title: m.title,
      targetDate: m.targetDate,
      status: 'pending',
      completedDate: null,
      evidenceDescription: null,
    }));

    const cap = {
      id,
      engagementId: dto.engagementId,
      findingId: dto.findingId,
      title: dto.title,
      classification: dto.classification,
      responsibleOfficial: dto.responsibleOfficial,
      targetCompletionDate: dto.targetCompletionDate,
      description: dto.description || null,
      status: 'draft',
      milestones,
      statusHistory: [
        {
          status: 'draft',
          comment: 'CAP created',
          timestamp: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    this.caps.set(id, cap);

    return cap;
  }

  async findByEngagement(engagementId: string, pagination?: PaginationQueryDto) {
    const allResults: any[] = [];
    this.caps.forEach((cap) => {
      if (cap.engagementId === engagementId) {
        allResults.push(cap);
      }
    });

    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const total = allResults.length;
    const items = allResults.slice((page - 1) * limit, page * limit);

    return buildPaginatedResponse(items, total, page, limit);
  }

  async findOne(id: string) {
    const cap = this.caps.get(id);
    if (!cap) {
      throw new NotFoundException(`Corrective Action Plan ${id} not found`);
    }
    return cap;
  }

  async updateStatus(dto: UpdateCAPStatusDto) {
    const cap = await this.findOne(dto.capId);
    const now = new Date().toISOString();

    cap.status = dto.status;
    cap.updatedAt = now;
    cap.statusHistory.push({
      status: dto.status,
      comment: dto.comment || null,
      timestamp: now,
    });

    this.caps.set(dto.capId, cap);

    return cap;
  }

  async completeMilestone(dto: CompleteMilestoneDto) {
    const cap = await this.findOne(dto.capId);
    const now = new Date().toISOString();

    const milestone = cap.milestones.find((m: any) => m.id === dto.milestoneId);
    if (!milestone) {
      throw new NotFoundException(
        `Milestone ${dto.milestoneId} not found in CAP ${dto.capId}`,
      );
    }

    milestone.status = 'completed';
    milestone.completedDate = dto.completedDate;
    milestone.evidenceDescription = dto.evidenceDescription;

    cap.updatedAt = now;

    // Check if all milestones are completed
    const allCompleted = cap.milestones.every(
      (m: any) => m.status === 'completed',
    );
    if (allCompleted) {
      cap.status = 'completed';
      cap.statusHistory.push({
        status: 'completed',
        comment: 'All milestones completed',
        timestamp: now,
      });
    }

    this.caps.set(dto.capId, cap);

    return cap;
  }

  async getFIARStatus(dto: GetFIARStatusDto) {
    const capsResult = await this.findByEngagement(dto.engagementId, { page: 1, limit: 100 });
    const caps = capsResult.data;

    const totalCAPs = capsResult.meta.total;
    const completedCAPs = caps.filter((c: any) => c.status === 'completed' || c.status === 'validated').length;
    const activeCAPs = caps.filter((c: any) => !['completed', 'validated', 'draft'].includes(c.status)).length;
    const overdueCAPs = caps.filter((c: any) => c.status === 'overdue').length;

    const totalMilestones = caps.reduce(
      (sum: number, c: any) => sum + c.milestones.length,
      0,
    );
    const completedMilestones = caps.reduce(
      (sum: number, c: any) =>
        sum + c.milestones.filter((m: any) => m.status === 'completed').length,
      0,
    );

    const remediationProgress =
      totalMilestones > 0
        ? Math.round((completedMilestones / totalMilestones) * 10000) / 100
        : 0;

    // Audit readiness score based on CAP completion and classification severity
    const materialWeaknessCount = caps.filter(
      (c: any) => c.classification === 'material_weakness' && c.status !== 'validated',
    ).length;
    const significantDeficiencyCount = caps.filter(
      (c: any) => c.classification === 'significant_deficiency' && c.status !== 'validated',
    ).length;

    const auditReadinessScore = Math.max(
      0,
      Math.round(
        (100 - materialWeaknessCount * 20 - significantDeficiencyCount * 10 - overdueCAPs * 5) * 100,
      ) / 100,
    );

    return {
      engagementId: dto.engagementId,
      fiscalYear: dto.fiscalYear,
      auditReadinessScore,
      remediationProgress,
      summary: {
        totalCAPs,
        completedCAPs,
        activeCAPs,
        overdueCAPs,
        totalMilestones,
        completedMilestones,
      },
      openMaterialWeaknesses: materialWeaknessCount,
      openSignificantDeficiencies: significantDeficiencyCount,
      generatedAt: new Date().toISOString(),
      authority: 'NDAA Section 1003, DoD FIAR Guidance',
    };
  }

  async getRemediationDashboard(engagementId: string) {
    const capsResult = await this.findByEngagement(engagementId, { page: 1, limit: 100 });
    const caps = capsResult.data;

    const total = capsResult.meta.total;
    const active = caps.filter(
      (c: any) => ['active', 'on_track', 'at_risk'].includes(c.status),
    ).length;
    const overdue = caps.filter((c: any) => c.status === 'overdue').length;
    const completed = caps.filter(
      (c: any) => c.status === 'completed' || c.status === 'validated',
    ).length;

    const byClassification = {
      material_weakness: caps.filter((c: any) => c.classification === 'material_weakness').length,
      significant_deficiency: caps.filter((c: any) => c.classification === 'significant_deficiency').length,
      noncompliance: caps.filter((c: any) => c.classification === 'noncompliance').length,
      control_deficiency: caps.filter((c: any) => c.classification === 'control_deficiency').length,
    };

    return {
      engagementId,
      total,
      active,
      overdue,
      completed,
      byClassification,
      generatedAt: new Date().toISOString(),
    };
  }
}
