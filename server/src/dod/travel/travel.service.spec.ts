import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TravelService } from './travel.service';
import { DATABASE_TOKEN } from '../../database/database.module';

jest.mock('@shared/lib/db/pg-schema', () => ({
  travelOrders: { id: 'id', engagementId: 'engagementId' },
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

describe('TravelService', () => {
  let service: TravelService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TravelService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<TravelService>(TravelService);
  });

  describe('findByEngagement', () => {
    it('should return travel orders for an engagement', async () => {
      const orders = [{ id: '1', engagementId: 'eng-1', purpose: 'TDY' }];
      mockDb.where.mockResolvedValueOnce(orders);

      const result = await service.findByEngagement('eng-1');
      expect(result).toEqual(orders);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('should return empty array when no orders exist', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      const result = await service.findByEngagement('eng-none');
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a travel order by id', async () => {
      const order = { id: 'order-1', purpose: 'Conference' };
      mockDb.where.mockResolvedValueOnce([order]);

      const result = await service.findOne('order-1');
      expect(result).toEqual(order);
    });

    it('should throw NotFoundException when order not found', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a travel order and return it', async () => {
      const dto = {
        engagementId: 'eng-1',
        travelerId: 'trav-1',
        orderType: 'TDY',
        purpose: 'Training',
        originLocation: 'DC',
        destinationLocation: 'CA',
        departDate: '2026-04-01',
        returnDate: '2026-04-05',
        authorizedAmount: 5000,
        perDiemRate: 150,
        lodgingRate: 200,
        authorizingOfficial: 'official-1',
      };

      const created = { id: 'test-uuid', ...dto, status: 'authorized' };
      mockDb.where.mockResolvedValueOnce([created]);

      const result = await service.create(dto as any);
      expect(result).toEqual(created);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a travel order', async () => {
      const existing = { id: 'order-1', status: 'authorized', actualAmount: 0 };
      const updated = { id: 'order-1', status: 'completed', actualAmount: 4500 };

      mockDb.where
        .mockResolvedValueOnce([existing])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([updated]);

      const result = await service.update('order-1', { actualAmount: 4500, status: 'completed' } as any);
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when updating non-existent order', async () => {
      mockDb.where.mockResolvedValueOnce([]);
      await expect(service.update('missing', { status: 'completed' } as any)).rejects.toThrow(NotFoundException);
    });
  });
});
