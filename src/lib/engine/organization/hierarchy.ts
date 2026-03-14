/**
 * DoD Organization Hierarchy Engine
 *
 * Models the DoD organizational structure for multi-component financial
 * management and roll-up reporting. Supports the standard DoD hierarchy:
 *
 *   OSD → Military Department → Defense Agency → Field Activity
 *   Component → Sub-component → Installation → Activity
 *
 * References:
 *   - DoD FMR Vol 1, Ch 1: Financial Management Structure
 *   - DoD Directive 5100.01: Functions of the DoD and Its Major Components
 *   - 10 U.S.C. §111-144: Organization and General Military Powers
 */

import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComponentType =
  | 'osd'
  | 'military_department'
  | 'defense_agency'
  | 'field_activity'
  | 'combatant_command'
  | 'sub_component'
  | 'installation'
  | 'activity'
  | 'program_office';

export type OrganizationStatus = 'active' | 'inactive' | 'reorganizing';

export interface Organization {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  abbreviation: string;
  componentType: ComponentType;
  status: OrganizationStatus;
  dodComponentCode?: string;
  treasuryAgencyCode?: string;
  level: number;
  path: string; // Materialized path for efficient queries (e.g., "/osd/army/tradoc/")
  createdAt: string;
}

export interface OrganizationNode extends Organization {
  children: OrganizationNode[];
}

export interface HierarchyRollup {
  organizationId: string;
  organizationName: string;
  level: number;
  totalAuthority: number;
  totalObligated: number;
  totalDisbursed: number;
  unobligatedBalance: number;
  obligationRate: number;
  disbursementRate: number;
  childCount: number;
  children: HierarchyRollup[];
}

export interface ComponentSummary {
  organizationId: string;
  organizationName: string;
  componentType: ComponentType;
  appropriationCount: number;
  totalAuthority: number;
  totalObligated: number;
  totalDisbursed: number;
  adaViolationCount: number;
  openFindingsCount: number;
  complianceScore: number;
}

// ---------------------------------------------------------------------------
// Organization Hierarchy Manager
// ---------------------------------------------------------------------------

export class OrganizationHierarchyManager {
  /**
   * Build a tree structure from a flat list of organizations.
   */
  buildTree(organizations: Organization[]): OrganizationNode[] {
    const nodeMap = new Map<string, OrganizationNode>();
    const roots: OrganizationNode[] = [];

    for (const org of organizations) {
      nodeMap.set(org.id, { ...org, children: [] });
    }

    for (const org of organizations) {
      const node = nodeMap.get(org.id)!;
      if (org.parentId && nodeMap.has(org.parentId)) {
        nodeMap.get(org.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  /**
   * Get all descendants of an organization (for roll-up queries).
   */
  getDescendants(organizationId: string, organizations: Organization[]): Organization[] {
    const descendants: Organization[] = [];
    const queue = [organizationId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = organizations.filter(o => o.parentId === currentId);
      for (const child of children) {
        descendants.push(child);
        queue.push(child.id);
      }
    }

    return descendants;
  }

  /**
   * Get the ancestor chain from an organization up to the root.
   */
  getAncestors(organizationId: string, organizations: Organization[]): Organization[] {
    const ancestors: Organization[] = [];
    const orgMap = new Map(organizations.map(o => [o.id, o]));
    let current = orgMap.get(organizationId);

    while (current?.parentId) {
      const parent = orgMap.get(current.parentId);
      if (parent) {
        ancestors.push(parent);
        current = parent;
      } else {
        break;
      }
    }

    return ancestors;
  }

  /**
   * Compute the materialized path for an organization.
   */
  computePath(organizationId: string, organizations: Organization[]): string {
    const ancestors = this.getAncestors(organizationId, organizations);
    const orgMap = new Map(organizations.map(o => [o.id, o]));
    const current = orgMap.get(organizationId);
    if (!current) return '/';

    const codes = [...ancestors.reverse().map(a => a.code), current.code];
    return '/' + codes.join('/') + '/';
  }

  /**
   * Generate a roll-up report aggregating financial data up the hierarchy.
   */
  generateRollup(
    organizations: Organization[],
    financialData: Map<string, { authority: number; obligated: number; disbursed: number }>,
  ): HierarchyRollup[] {
    const tree = this.buildTree(organizations);

    const computeRollup = (node: OrganizationNode): HierarchyRollup => {
      const childRollups = node.children.map(c => computeRollup(c));

      const directData = financialData.get(node.id) || { authority: 0, obligated: 0, disbursed: 0 };

      const totalAuthority = directData.authority + childRollups.reduce((s, c) => s + c.totalAuthority, 0);
      const totalObligated = directData.obligated + childRollups.reduce((s, c) => s + c.totalObligated, 0);
      const totalDisbursed = directData.disbursed + childRollups.reduce((s, c) => s + c.totalDisbursed, 0);

      return {
        organizationId: node.id,
        organizationName: node.name,
        level: node.level,
        totalAuthority,
        totalObligated,
        totalDisbursed,
        unobligatedBalance: totalAuthority - totalObligated,
        obligationRate: totalAuthority > 0 ? Math.round((totalObligated / totalAuthority) * 10000) / 100 : 0,
        disbursementRate: totalObligated > 0 ? Math.round((totalDisbursed / totalObligated) * 10000) / 100 : 0,
        childCount: node.children.length,
        children: childRollups,
      };
    };

    return tree.map(root => computeRollup(root));
  }

  /**
   * Generate component-level summaries for dashboard display.
   */
  generateComponentSummaries(
    organizations: Organization[],
    financialData: Map<string, { authority: number; obligated: number; disbursed: number }>,
    adaViolations: Map<string, number>,
    openFindings: Map<string, number>,
  ): ComponentSummary[] {
    const topLevel = organizations.filter(o =>
      o.componentType === 'military_department' ||
      o.componentType === 'defense_agency' ||
      o.componentType === 'osd'
    );

    return topLevel.map(org => {
      const descendants = this.getDescendants(org.id, organizations);
      const allOrgIds = [org.id, ...descendants.map(d => d.id)];

      let totalAuthority = 0;
      let totalObligated = 0;
      let totalDisbursed = 0;
      let totalADAViolations = 0;
      let totalOpenFindings = 0;
      let appropriationCount = 0;

      for (const oid of allOrgIds) {
        const data = financialData.get(oid);
        if (data) {
          totalAuthority += data.authority;
          totalObligated += data.obligated;
          totalDisbursed += data.disbursed;
          appropriationCount++;
        }
        totalADAViolations += adaViolations.get(oid) || 0;
        totalOpenFindings += openFindings.get(oid) || 0;
      }

      // Simple compliance score: 100 - (violations * 10) - (findings * 2), floor at 0
      const complianceScore = Math.max(0, Math.min(100,
        100 - (totalADAViolations * 10) - (totalOpenFindings * 2)
      ));

      return {
        organizationId: org.id,
        organizationName: org.name,
        componentType: org.componentType,
        appropriationCount,
        totalAuthority,
        totalObligated,
        totalDisbursed,
        adaViolationCount: totalADAViolations,
        openFindingsCount: totalOpenFindings,
        complianceScore,
      };
    });
  }

  /**
   * Validate organization hierarchy integrity.
   */
  validateHierarchy(organizations: Organization[]): string[] {
    const errors: string[] = [];
    const ids = new Set(organizations.map(o => o.id));

    for (const org of organizations) {
      // Check parent exists
      if (org.parentId && !ids.has(org.parentId)) {
        errors.push(`Organization "${org.name}" (${org.id}) references non-existent parent ${org.parentId}`);
      }

      // Check level consistency
      if (org.parentId) {
        const parent = organizations.find(o => o.id === org.parentId);
        if (parent && org.level !== parent.level + 1) {
          errors.push(`Organization "${org.name}" level ${org.level} inconsistent with parent "${parent.name}" level ${parent.level}`);
        }
      } else if (org.level !== 0) {
        errors.push(`Root organization "${org.name}" should have level 0, has level ${org.level}`);
      }

      // Check for circular references
      const visited = new Set<string>();
      let current: Organization | undefined = org;
      while (current?.parentId) {
        if (visited.has(current.id)) {
          errors.push(`Circular reference detected involving organization "${org.name}" (${org.id})`);
          break;
        }
        visited.add(current.id);
        current = organizations.find(o => o.id === current!.parentId!);
      }
    }

    return errors;
  }

  /**
   * Create a new organization node.
   */
  createOrganization(params: {
    parentId: string | null;
    code: string;
    name: string;
    abbreviation: string;
    componentType: ComponentType;
    dodComponentCode?: string;
    treasuryAgencyCode?: string;
    organizations: Organization[];
  }): Organization {
    const parent = params.parentId
      ? params.organizations.find(o => o.id === params.parentId)
      : null;

    const level = parent ? parent.level + 1 : 0;
    const id = uuid();

    const org: Organization = {
      id,
      parentId: params.parentId,
      code: params.code,
      name: params.name,
      abbreviation: params.abbreviation,
      componentType: params.componentType,
      status: 'active',
      dodComponentCode: params.dodComponentCode,
      treasuryAgencyCode: params.treasuryAgencyCode,
      level,
      path: '',
      createdAt: new Date().toISOString(),
    };

    // Compute path after creation
    const allOrgs = [...params.organizations, org];
    org.path = this.computePath(id, allOrgs);

    return org;
  }
}
