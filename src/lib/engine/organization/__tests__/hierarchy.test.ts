import { describe, it, expect } from 'vitest';
import { OrganizationHierarchyManager } from '../hierarchy';
import type { Organization } from '../hierarchy';

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-1',
    parentId: null,
    code: 'OSD',
    name: 'Office of the Secretary of Defense',
    abbreviation: 'OSD',
    componentType: 'osd',
    status: 'active',
    level: 0,
    path: '/OSD/',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('OrganizationHierarchyManager', () => {
  const mgr = new OrganizationHierarchyManager();

  const orgs: Organization[] = [
    makeOrg({ id: 'osd', code: 'OSD', name: 'OSD', level: 0, parentId: null }),
    makeOrg({ id: 'army', code: 'ARMY', name: 'Department of the Army', componentType: 'military_department', level: 1, parentId: 'osd' }),
    makeOrg({ id: 'tradoc', code: 'TRADOC', name: 'TRADOC', componentType: 'sub_component', level: 2, parentId: 'army' }),
    makeOrg({ id: 'navy', code: 'NAVY', name: 'Department of the Navy', componentType: 'military_department', level: 1, parentId: 'osd' }),
  ];

  describe('buildTree', () => {
    it('creates correct parent-child structure', () => {
      const tree = mgr.buildTree(orgs);
      expect(tree).toHaveLength(1); // one root
      expect(tree[0].id).toBe('osd');
      expect(tree[0].children).toHaveLength(2); // army, navy
      const army = tree[0].children.find(c => c.id === 'army');
      expect(army?.children).toHaveLength(1); // tradoc
    });
  });

  describe('getDescendants', () => {
    it('returns all nested children', () => {
      const desc = mgr.getDescendants('osd', orgs);
      expect(desc).toHaveLength(3);
    });

    it('returns direct children only for leaf-adjacent node', () => {
      const desc = mgr.getDescendants('army', orgs);
      expect(desc).toHaveLength(1);
      expect(desc[0].id).toBe('tradoc');
    });

    it('returns empty array for leaf node', () => {
      const desc = mgr.getDescendants('tradoc', orgs);
      expect(desc).toHaveLength(0);
    });
  });

  describe('getAncestors', () => {
    it('returns chain to root', () => {
      const ancestors = mgr.getAncestors('tradoc', orgs);
      expect(ancestors).toHaveLength(2);
      expect(ancestors[0].id).toBe('army');
      expect(ancestors[1].id).toBe('osd');
    });

    it('returns empty for root', () => {
      expect(mgr.getAncestors('osd', orgs)).toHaveLength(0);
    });
  });

  describe('generateRollup', () => {
    it('aggregates financial data up the hierarchy', () => {
      const financialData = new Map([
        ['tradoc', { authority: 1000000, obligated: 800000, disbursed: 600000 }],
        ['navy', { authority: 2000000, obligated: 1500000, disbursed: 1000000 }],
      ]);

      const rollup = mgr.generateRollup(orgs, financialData);
      expect(rollup).toHaveLength(1);

      const root = rollup[0];
      expect(root.totalAuthority).toBe(3000000);
      expect(root.totalObligated).toBe(2300000);
      expect(root.totalDisbursed).toBe(1600000);
    });
  });

  describe('validateHierarchy', () => {
    it('returns no errors for valid hierarchy', () => {
      expect(mgr.validateHierarchy(orgs)).toHaveLength(0);
    });

    it('detects non-existent parent', () => {
      const badOrgs = [
        ...orgs,
        makeOrg({ id: 'orphan', parentId: 'nonexistent', level: 1 }),
      ];
      const errors = mgr.validateHierarchy(badOrgs);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('non-existent parent');
    });

    it('detects level inconsistency', () => {
      const badOrgs = [
        ...orgs,
        makeOrg({ id: 'badlevel', parentId: 'osd', level: 5 }),
      ];
      const errors = mgr.validateHierarchy(badOrgs);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('level');
    });
  });

  describe('createOrganization', () => {
    it('sets correct level for child', () => {
      const newOrg = mgr.createOrganization({
        parentId: 'army',
        code: 'FORSCOM',
        name: 'Forces Command',
        abbreviation: 'FORSCOM',
        componentType: 'sub_component',
        organizations: orgs,
      });
      expect(newOrg.level).toBe(2);
      expect(newOrg.componentType).toBe('sub_component');
    });

    it('sets level 0 for root', () => {
      const newOrg = mgr.createOrganization({
        parentId: null,
        code: 'TEST',
        name: 'Test Root',
        abbreviation: 'TEST',
        componentType: 'osd',
        organizations: [],
      });
      expect(newOrg.level).toBe(0);
    });
  });
});
