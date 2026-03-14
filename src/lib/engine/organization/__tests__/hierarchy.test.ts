import { describe, it, expect } from 'vitest';
import {
  OrganizationHierarchyManager,
  type Organization,
  type ComponentType,
} from '../hierarchy';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeOrganization(overrides?: Partial<Organization>): Organization {
  return {
    id: 'org-001',
    parentId: null,
    code: 'OSD',
    name: 'Office of the Secretary of Defense',
    abbreviation: 'OSD',
    componentType: 'osd' as ComponentType,
    status: 'active',
    level: 0,
    path: '/OSD/',
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

/**
 * Creates a standard DoD hierarchy for testing:
 *
 *   OSD (level 0)
 *   +-- Army (level 1)
 *   |   +-- TRADOC (level 2)
 *   |   |   +-- Fort Jackson (level 3)
 *   |   +-- FORSCOM (level 2)
 *   +-- Navy (level 1)
 *       +-- NAVSEA (level 2)
 */
function makeHierarchy(): Organization[] {
  return [
    makeOrganization({
      id: 'osd',
      parentId: null,
      code: 'OSD',
      name: 'Office of the Secretary of Defense',
      abbreviation: 'OSD',
      componentType: 'osd',
      level: 0,
      path: '/OSD/',
    }),
    makeOrganization({
      id: 'army',
      parentId: 'osd',
      code: 'ARMY',
      name: 'Department of the Army',
      abbreviation: 'DA',
      componentType: 'military_department',
      level: 1,
      path: '/OSD/ARMY/',
    }),
    makeOrganization({
      id: 'navy',
      parentId: 'osd',
      code: 'NAVY',
      name: 'Department of the Navy',
      abbreviation: 'DN',
      componentType: 'military_department',
      level: 1,
      path: '/OSD/NAVY/',
    }),
    makeOrganization({
      id: 'tradoc',
      parentId: 'army',
      code: 'TRADOC',
      name: 'Training and Doctrine Command',
      abbreviation: 'TRADOC',
      componentType: 'sub_component',
      level: 2,
      path: '/OSD/ARMY/TRADOC/',
    }),
    makeOrganization({
      id: 'forscom',
      parentId: 'army',
      code: 'FORSCOM',
      name: 'Forces Command',
      abbreviation: 'FORSCOM',
      componentType: 'sub_component',
      level: 2,
      path: '/OSD/ARMY/FORSCOM/',
    }),
    makeOrganization({
      id: 'navsea',
      parentId: 'navy',
      code: 'NAVSEA',
      name: 'Naval Sea Systems Command',
      abbreviation: 'NAVSEA',
      componentType: 'sub_component',
      level: 2,
      path: '/OSD/NAVY/NAVSEA/',
    }),
    makeOrganization({
      id: 'jackson',
      parentId: 'tradoc',
      code: 'JACKSON',
      name: 'Fort Jackson',
      abbreviation: 'FTJAX',
      componentType: 'installation',
      level: 3,
      path: '/OSD/ARMY/TRADOC/JACKSON/',
    }),
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OrganizationHierarchyManager', () => {
  const manager = new OrganizationHierarchyManager();

  // =========================================================================
  // buildTree
  // =========================================================================

  describe('buildTree', () => {
    it('creates correct parent-child structure', () => {
      const orgs = makeHierarchy();
      const tree = manager.buildTree(orgs);

      // Should have one root: OSD
      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe('osd');
      expect(tree[0].name).toBe('Office of the Secretary of Defense');

      // OSD should have two children: Army, Navy
      expect(tree[0].children).toHaveLength(2);
      const armyNode = tree[0].children.find(c => c.id === 'army');
      const navyNode = tree[0].children.find(c => c.id === 'navy');
      expect(armyNode).toBeDefined();
      expect(navyNode).toBeDefined();

      // Army should have two children: TRADOC, FORSCOM
      expect(armyNode!.children).toHaveLength(2);
      const tradocNode = armyNode!.children.find(c => c.id === 'tradoc');
      expect(tradocNode).toBeDefined();

      // TRADOC should have one child: Fort Jackson
      expect(tradocNode!.children).toHaveLength(1);
      expect(tradocNode!.children[0].id).toBe('jackson');
      expect(tradocNode!.children[0].children).toHaveLength(0);
    });

    it('handles single root organization', () => {
      const orgs = [makeOrganization()];
      const tree = manager.buildTree(orgs);

      expect(tree).toHaveLength(1);
      expect(tree[0].children).toHaveLength(0);
    });

    it('handles multiple roots', () => {
      const orgs = [
        makeOrganization({ id: 'root-1', parentId: null }),
        makeOrganization({ id: 'root-2', parentId: null }),
      ];
      const tree = manager.buildTree(orgs);

      expect(tree).toHaveLength(2);
    });

    it('handles empty organization list', () => {
      const tree = manager.buildTree([]);

      expect(tree).toHaveLength(0);
    });
  });

  // =========================================================================
  // getDescendants
  // =========================================================================

  describe('getDescendants', () => {
    it('returns all nested children', () => {
      const orgs = makeHierarchy();

      const descendants = manager.getDescendants('army', orgs);

      // Army's descendants: TRADOC, FORSCOM, Fort Jackson
      expect(descendants).toHaveLength(3);
      const ids = descendants.map(d => d.id);
      expect(ids).toContain('tradoc');
      expect(ids).toContain('forscom');
      expect(ids).toContain('jackson');
    });

    it('returns all organizations under root', () => {
      const orgs = makeHierarchy();

      const descendants = manager.getDescendants('osd', orgs);

      // All except OSD itself: army, navy, tradoc, forscom, navsea, jackson
      expect(descendants).toHaveLength(6);
    });

    it('returns empty array for leaf node', () => {
      const orgs = makeHierarchy();

      const descendants = manager.getDescendants('jackson', orgs);

      expect(descendants).toHaveLength(0);
    });

    it('returns empty for nonexistent organization', () => {
      const orgs = makeHierarchy();

      const descendants = manager.getDescendants('nonexistent', orgs);

      expect(descendants).toHaveLength(0);
    });
  });

  // =========================================================================
  // getAncestors
  // =========================================================================

  describe('getAncestors', () => {
    it('returns chain to root', () => {
      const orgs = makeHierarchy();

      const ancestors = manager.getAncestors('jackson', orgs);

      // Fort Jackson -> TRADOC -> Army -> OSD
      expect(ancestors).toHaveLength(3);
      expect(ancestors[0].id).toBe('tradoc');
      expect(ancestors[1].id).toBe('army');
      expect(ancestors[2].id).toBe('osd');
    });

    it('returns single parent for level-1 organization', () => {
      const orgs = makeHierarchy();

      const ancestors = manager.getAncestors('army', orgs);

      expect(ancestors).toHaveLength(1);
      expect(ancestors[0].id).toBe('osd');
    });

    it('returns empty for root organization', () => {
      const orgs = makeHierarchy();

      const ancestors = manager.getAncestors('osd', orgs);

      expect(ancestors).toHaveLength(0);
    });
  });

  // =========================================================================
  // generateRollup
  // =========================================================================

  describe('generateRollup', () => {
    it('aggregates financial data correctly up the hierarchy', () => {
      const orgs = makeHierarchy();
      const financialData = new Map<string, { authority: number; obligated: number; disbursed: number }>();

      // Only leaf/sub-component nodes have direct financial data
      financialData.set('tradoc', { authority: 500_000, obligated: 300_000, disbursed: 200_000 });
      financialData.set('forscom', { authority: 700_000, obligated: 500_000, disbursed: 400_000 });
      financialData.set('navsea', { authority: 1_000_000, obligated: 800_000, disbursed: 600_000 });
      financialData.set('jackson', { authority: 100_000, obligated: 50_000, disbursed: 30_000 });

      const rollups = manager.generateRollup(orgs, financialData);

      expect(rollups).toHaveLength(1); // one root
      const osdRollup = rollups[0];

      // OSD total = sum of all descendants
      expect(osdRollup.totalAuthority).toBe(2_300_000);
      expect(osdRollup.totalObligated).toBe(1_650_000);
      expect(osdRollup.totalDisbursed).toBe(1_230_000);
      expect(osdRollup.unobligatedBalance).toBe(650_000);
      expect(osdRollup.childCount).toBe(2);

      // Army rollup = TRADOC + FORSCOM + Jackson
      const armyRollup = osdRollup.children.find(c => c.organizationId === 'army');
      expect(armyRollup).toBeDefined();
      expect(armyRollup!.totalAuthority).toBe(1_300_000);
      expect(armyRollup!.totalObligated).toBe(850_000);
      expect(armyRollup!.totalDisbursed).toBe(630_000);
    });

    it('calculates obligation and disbursement rates', () => {
      const orgs = [
        makeOrganization({ id: 'root', parentId: null, level: 0 }),
      ];
      const financialData = new Map([
        ['root', { authority: 1_000_000, obligated: 750_000, disbursed: 500_000 }],
      ]);

      const rollups = manager.generateRollup(orgs, financialData);

      expect(rollups[0].obligationRate).toBe(75);
      expect(rollups[0].disbursementRate).toBeCloseTo(66.67, 1);
    });

    it('handles nodes with no financial data', () => {
      const orgs = makeHierarchy();
      const financialData = new Map<string, { authority: number; obligated: number; disbursed: number }>();
      // No financial data at all

      const rollups = manager.generateRollup(orgs, financialData);

      expect(rollups[0].totalAuthority).toBe(0);
      expect(rollups[0].totalObligated).toBe(0);
      expect(rollups[0].obligationRate).toBe(0);
    });
  });

  // =========================================================================
  // validateHierarchy
  // =========================================================================

  describe('validateHierarchy', () => {
    it('returns no errors for valid hierarchy', () => {
      const orgs = makeHierarchy();

      const errors = manager.validateHierarchy(orgs);

      expect(errors).toHaveLength(0);
    });

    it('detects missing parent reference', () => {
      const orgs = [
        makeOrganization({
          id: 'child',
          parentId: 'nonexistent-parent',
          level: 1,
        }),
      ];

      const errors = manager.validateHierarchy(orgs);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('non-existent parent'))).toBe(true);
    });

    it('detects level mismatches', () => {
      const orgs = [
        makeOrganization({
          id: 'root',
          parentId: null,
          level: 0,
        }),
        makeOrganization({
          id: 'child',
          parentId: 'root',
          level: 5, // should be 1
          name: 'Bad Level Child',
        }),
      ];

      const errors = manager.validateHierarchy(orgs);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('level') && e.includes('inconsistent'))).toBe(true);
    });

    it('detects root organization with non-zero level', () => {
      const orgs = [
        makeOrganization({
          id: 'root',
          parentId: null,
          level: 2, // should be 0
          name: 'Bad Root',
        }),
      ];

      const errors = manager.validateHierarchy(orgs);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('Root') && e.includes('level 0'))).toBe(true);
    });

    it('detects circular references', () => {
      const orgs = [
        makeOrganization({
          id: 'a',
          parentId: 'b',
          level: 1,
          name: 'Org A',
        }),
        makeOrganization({
          id: 'b',
          parentId: 'a',
          level: 1,
          name: 'Org B',
        }),
      ];

      const errors = manager.validateHierarchy(orgs);

      expect(errors.some(e => e.includes('Circular reference'))).toBe(true);
    });
  });

  // =========================================================================
  // createOrganization
  // =========================================================================

  describe('createOrganization', () => {
    it('sets correct level for root organization', () => {
      const orgs: Organization[] = [];

      const newOrg = manager.createOrganization({
        parentId: null,
        code: 'OSD',
        name: 'Office of the Secretary of Defense',
        abbreviation: 'OSD',
        componentType: 'osd',
        organizations: orgs,
      });

      expect(newOrg.level).toBe(0);
      expect(newOrg.parentId).toBeNull();
      expect(newOrg.id).toBeDefined();
      expect(newOrg.status).toBe('active');
      expect(newOrg.createdAt).toBeDefined();
    });

    it('sets correct level based on parent', () => {
      const orgs = makeHierarchy();

      const newOrg = manager.createOrganization({
        parentId: 'tradoc',
        code: 'BENNING',
        name: 'Fort Benning',
        abbreviation: 'FTBEN',
        componentType: 'installation',
        organizations: orgs,
      });

      // TRADOC is level 2, so child should be level 3
      expect(newOrg.level).toBe(3);
      expect(newOrg.parentId).toBe('tradoc');
    });

    it('computes materialized path', () => {
      const orgs = makeHierarchy();

      const newOrg = manager.createOrganization({
        parentId: 'army',
        code: 'AMC',
        name: 'Army Materiel Command',
        abbreviation: 'AMC',
        componentType: 'sub_component',
        organizations: orgs,
      });

      expect(newOrg.path).toContain('OSD');
      expect(newOrg.path).toContain('ARMY');
      expect(newOrg.path).toContain('AMC');
    });
  });

  // =========================================================================
  // generateComponentSummaries
  // =========================================================================

  describe('generateComponentSummaries', () => {
    it('generates summaries for top-level components', () => {
      const orgs = makeHierarchy();
      const financialData = new Map([
        ['army', { authority: 500_000, obligated: 300_000, disbursed: 200_000 }],
        ['tradoc', { authority: 200_000, obligated: 100_000, disbursed: 50_000 }],
        ['navy', { authority: 800_000, obligated: 600_000, disbursed: 400_000 }],
      ]);
      const adaViolations = new Map([['army', 2], ['tradoc', 1]]);
      const openFindings = new Map([['navy', 3]]);

      const summaries = manager.generateComponentSummaries(
        orgs,
        financialData,
        adaViolations,
        openFindings,
      );

      // Should include OSD, Army, and Navy (top-level components)
      expect(summaries.length).toBeGreaterThanOrEqual(2);

      const armySummary = summaries.find(s => s.organizationId === 'army');
      expect(armySummary).toBeDefined();
      // Army total = army + tradoc (descendant)
      expect(armySummary!.totalAuthority).toBe(700_000);
      expect(armySummary!.adaViolationCount).toBe(3); // 2 (army) + 1 (tradoc)

      const navySummary = summaries.find(s => s.organizationId === 'navy');
      expect(navySummary).toBeDefined();
      expect(navySummary!.openFindingsCount).toBe(3);
    });
  });
});
