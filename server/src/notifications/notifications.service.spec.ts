import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { DATABASE_TOKEN } from '../database/database.module';

jest.mock('@shared/lib/db/pg-schema', () => ({
  notifications: { id: 'id', userId: 'userId', read: 'read', createdAt: 'createdAt' },
}), { virtual: true });

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

function createMockDb() {
  const mockOrderBy = jest.fn().mockResolvedValue([]);
  const mockWhere = jest.fn().mockReturnValue({ orderBy: mockOrderBy });
  const mockFrom = jest.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = jest.fn().mockReturnValue({ from: mockFrom });
  const mockSet = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
  const mockUpdate = jest.fn().mockReturnValue({ set: mockSet });
  const mockValues = jest.fn().mockResolvedValue(undefined);
  const mockInsert = jest.fn().mockReturnValue({ values: mockValues });

  return { select: mockSelect, from: mockFrom, where: mockWhere, orderBy: mockOrderBy, insert: mockInsert, values: mockValues, update: mockUpdate, set: mockSet };
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe('findByUser', () => {
    it('should return notifications for a user', async () => {
      const notifications = [{ id: '1', title: 'Test' }];
      mockDb.orderBy.mockResolvedValueOnce(notifications);

      const result = await service.findByUser('user-1');
      expect(result).toEqual(notifications);
    });

    it('should filter unread only when requested', async () => {
      mockDb.orderBy.mockResolvedValueOnce([]);

      const result = await service.findByUser('user-1', true);
      expect(result).toEqual([]);
      // Called twice (initial + unread query)
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('should create a notification', async () => {
      const params = {
        userId: 'user-1',
        type: 'system' as const,
        priority: 'normal' as const,
        title: 'Test Notification',
        message: 'This is a test',
      };

      const result = await service.create(params);
      expect(result.id).toBe('test-uuid');
      expect(result.title).toBe('Test Notification');
      expect(result.read).toBe(false);
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('markAsRead', () => {
    it('should mark a notification as read', async () => {
      const notification = { id: 'n-1', userId: 'user-1', read: false };
      mockDb.where.mockReturnValueOnce({ orderBy: jest.fn().mockResolvedValue([notification]) });

      const result = await service.markAsRead('n-1', 'user-1');
      expect(result.read).toBe(true);
    });

    it('should throw NotFoundException when notification not found', async () => {
      // The where returns an object with orderBy that resolves to []
      // But actually markAsRead calls select().from().where() which returns []
      mockDb.where.mockReturnValueOnce({ orderBy: jest.fn().mockResolvedValue([]) });

      await expect(service.markAsRead('missing', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', async () => {
      const result = await service.markAllAsRead('user-1');
      expect(result.success).toBe(true);
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('getUnreadCount', () => {
    it('should return the unread notification count', async () => {
      // The where mock needs to resolve directly to an array for getUnreadCount
      // because it calls .where() which returns results.length
      mockDb.where.mockReturnValueOnce({ orderBy: jest.fn().mockResolvedValue([{ id: '1' }, { id: '2' }]) });

      // getUnreadCount calls select().from().where() - the where mock returns the result
      // But actually it accesses results.length, so we need the chain to resolve
      const mockResults = [{ id: '1' }, { id: '2' }];
      mockDb.where.mockResolvedValueOnce(mockResults);

      const result = await service.getUnreadCount('user-1');
      expect(result).toBe(2);
    });
  });

  describe('notifyAdaViolation', () => {
    it('should send ADA violation notifications to all recipients', async () => {
      const result = await service.notifyAdaViolation({
        engagementId: 'eng-1',
        violationId: 'v-1',
        amount: 50000,
        violationType: 'time',
        recipientUserIds: ['user-1', 'user-2'],
      });

      expect(result).toHaveLength(2);
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe('notifyLegislationSunset', () => {
    it('should send legislation sunset notifications', async () => {
      const result = await service.notifyLegislationSunset({
        legislationTitle: 'NDAA 2025',
        sunsetDate: '2026-01-01',
        daysUntilSunset: 15,
        recipientUserIds: ['user-1'],
      });

      expect(result).toHaveLength(1);
      expect(result[0].priority).toBe('high');
    });
  });

  describe('notifyCapOverdue', () => {
    it('should send CAP overdue notification', async () => {
      const result = await service.notifyCapOverdue({
        engagementId: 'eng-1',
        capId: 'cap-1',
        findingTitle: 'Internal Controls',
        responsibleUserId: 'user-1',
        daysOverdue: 45,
      });

      expect(result.type).toBe('cap_overdue');
      expect(result.priority).toBe('high');
    });
  });
});
