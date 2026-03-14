import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DATABASE_TOKEN } from '../../database/database.module';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
  RollupReportDto,
} from './organizations.dto';
import {
  OrganizationHierarchyManager,
} from '@shared/lib/engine/organization/hierarchy';
import type { Organization } from '@shared/lib/engine/organization/hierarchy';

@Injectable()
export class OrganizationsService {
  private readonly hierarchyManager = new OrganizationHierarchyManager();

  constructor(@Inject(DATABASE_TOKEN) private readonly db: any) {}

  async create(dto: CreateOrganizationDto) {
    const { organizations } = await import('@shared/lib/db/pg-schema');
    const existing = await this.findAll();

    const org = this.hierarchyManager.createOrganization({
      parentId: dto.parentId || null,
      code: dto.code,
      name: dto.name,
      abbreviation: dto.abbreviation,
      componentType: dto.componentType as any,
      dodComponentCode: dto.dodComponentCode,
      treasuryAgencyCode: dto.treasuryAgencyCode,
      organizations: existing,
    });

    await this.db.insert(organizations).values({
      id: org.id,
      parentId: org.parentId,
      code: org.code,
      name: org.name,
      abbreviation: org.abbreviation,
      componentType: org.componentType,
      status: org.status,
      dodComponentCode: org.dodComponentCode || null,
      treasuryAgencyCode: org.treasuryAgencyCode || null,
      level: org.level,
      path: org.path,
      createdAt: org.createdAt,
    });

    return org;
  }

  async findAll(): Promise<Organization[]> {
    const { organizations } = await import('@shared/lib/db/pg-schema');
    return this.db.select().from(organizations);
  }

  async findOne(id: string) {
    const { organizations } = await import('@shared/lib/db/pg-schema');
    const { eq } = await import('drizzle-orm');
    const results = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id));
    if (results.length === 0) {
      throw new NotFoundException(`Organization ${id} not found`);
    }
    return results[0];
  }

  async update(dto: UpdateOrganizationDto) {
    const org = await this.findOne(dto.id);
    const { organizations } = await import('@shared/lib/db/pg-schema');
    const { eq } = await import('drizzle-orm');

    const updates: Record<string, any> = {};
    if (dto.name) updates.name = dto.name;
    if (dto.status) updates.status = dto.status;

    if (Object.keys(updates).length > 0) {
      await this.db
        .update(organizations)
        .set(updates)
        .where(eq(organizations.id, dto.id));
    }

    return this.findOne(dto.id);
  }

  async getTree() {
    const allOrgs = await this.findAll();
    return this.hierarchyManager.buildTree(allOrgs);
  }

  async getDescendants(organizationId: string) {
    const allOrgs = await this.findAll();
    return this.hierarchyManager.getDescendants(organizationId, allOrgs);
  }

  async getRollup(dto: RollupReportDto) {
    const allOrgs = await this.findAll();

    // Aggregate financial data per organization from appropriations
    const financialData = new Map<string, { authority: number; obligated: number; disbursed: number }>();

    // In production, this would query appropriations joined with organizations.
    // For now, return structure with available data.
    const rollup = this.hierarchyManager.generateRollup(allOrgs, financialData);

    return {
      organizationId: dto.organizationId,
      engagementId: dto.engagementId,
      fiscalYear: dto.fiscalYear,
      rollup,
      generatedAt: new Date().toISOString(),
    };
  }

  async getComponentSummaries(engagementId: string) {
    const allOrgs = await this.findAll();
    const financialData = new Map<string, { authority: number; obligated: number; disbursed: number }>();
    const adaViolations = new Map<string, number>();
    const openFindings = new Map<string, number>();

    return {
      engagementId,
      summaries: this.hierarchyManager.generateComponentSummaries(
        allOrgs,
        financialData,
        adaViolations,
        openFindings,
      ),
      generatedAt: new Date().toISOString(),
    };
  }

  async validateHierarchy() {
    const allOrgs = await this.findAll();
    const errors = this.hierarchyManager.validateHierarchy(allOrgs);
    return {
      valid: errors.length === 0,
      errors,
      organizationCount: allOrgs.length,
      validatedAt: new Date().toISOString(),
    };
  }
}
