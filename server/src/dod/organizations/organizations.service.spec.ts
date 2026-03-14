import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { DATABASE_TOKEN } from '../../database/database.module';

jest.mock('@shared/lib/db/pg-schema', () => ({
  organizations: { id: 'id' },
}), { virtual: true });

jest.mock('drizzle-orm', () => ({
  eq: jest.fn().mockReturnValue('eq-condition'),
}), { virtual: true });

const mockOrg = {
  id: 'org-1',
  parentId: null,
  code: 'ARMY',
  name: 'US Army',
  abbreviation: 'USA',
  componentType: 'military_department',
  status: 'active',
  dodComponentCode: '021',
  treasuryAgencyCode: '021',
  level: 0,
  path: '/org-1',
  createdAt: '2025-01-01T00:00:00Z',
};

jest.mock('@shared/lib/engine/organization/hierarchy', () => ({
  OrganizationHierarchyManager: jest.fn().mockImplementation(() => ({
    createOrganization: jest.fn().mockReturnValue(mockOrg),
    buildTree: jest.fn().mockReturnValue([]),
    getDescendants: jest.fn().mockReturnValue([]),
    generateRollup: jest.fn().mockReturnValue({}),
    generateComponentSummaries: jest.fn().mockReturnValue([]),
    validateHierarchy: jest.fn().mockReturnValue([]),
  })),
}), { virtual: true });

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

function createMockDb() {
  const mockWhere = jest.fn().mockResolvedValue([]);
  const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = jest.fn().mockReturnValue({ from: mockFrom });
  const mockSet = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
  const mockUpdate = jest.fn().mockReturnValue({ set: mockSet });
  const mockValues = jest.fn().mockResolvedValue(undefined);
  const mockInsert = jest.fn().mockReturnValue({ values: mockValues });

  return { select: mockSelect, from: mockFrom, where: mockWhere, insert: mockInsert, values: mockValues, update: mockUpdate, set: mockSet };
}

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  describe('findAll', () => {
    it('should return all organizations', async () => {
      const orgs = [mockOrg];
      // findAll calls select().from(organizations) without .where()
      mockDb.from.mockResolvedValueOnce(orgs);

      const result = await service.findAll();
      expect(result).toEqual(orgs);
    });
  });

  describe('findOne', () => {
    it('should return an organization by id', async () => {
      mockDb.where.mockResolvedValueOnce([mockOrg]);

      const result = await service.findOne('org-1');
      expect(result).toEqual(mockOrg);
    });

    it('should throw NotFoundException when organization not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create an organization', async () => {
      // findAll for existing orgs
      mockDb.from.mockResolvedValueOnce([]);

      const dto = {
        code: 'ARMY',
        name: 'US Army',
        abbreviation: 'USA',
        componentType: 'military_department',
        dodComponentCode: '021',
        treasuryAgencyCode: '021',
      };

      const result = await service.create(dto as any);
      expect(result).toEqual(mockOrg);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update an organization', async () => {
      const updated = { ...mockOrg, name: 'Updated Army' };
      mockDb.where
        .mockResolvedValueOnce([mockOrg])   // findOne (verify exists)
        .mockResolvedValueOnce(undefined)    // update
        .mockResolvedValueOnce([updated]);   // findOne (return)

      const result = await service.update({ id: 'org-1', name: 'Updated Army' } as any);
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException for non-existent org', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(
        service.update({ id: 'missing', name: 'Test' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTree', () => {
    it('should return organization tree', async () => {
      mockDb.from.mockResolvedValueOnce([mockOrg]);

      const result = await service.getTree();
      expect(result).toEqual([]);
    });
  });

  describe('validateHierarchy', () => {
    it('should validate the hierarchy', async () => {
      mockDb.from.mockResolvedValueOnce([mockOrg]);

      const result = await service.validateHierarchy();
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });
});
