import { Test, TestingModule } from '@nestjs/testing';
import { MonitoringService } from './monitoring.service';
import { DATABASE_TOKEN } from '../../database/database.module';

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

describe('MonitoringService', () => {
  let service: MonitoringService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitoringService,
        { provide: DATABASE_TOKEN, useValue: mockDb },
      ],
    }).compile();

    service = module.get<MonitoringService>(MonitoringService);
  });

  describe('generateSnapshot', () => {
    it('should generate a monitoring snapshot', async () => {
      const result = await service.generateSnapshot({
        engagementId: 'eng-1',
        fiscalYear: 2025,
      } as any);

      expect(result.id).toBe('test-uuid');
      expect(result.engagementId).toBe('eng-1');
      expect(result.fiscalYear).toBe(2025);
      expect(result.metrics).toBeDefined();
      expect(result.metrics.fundExecution).toBeDefined();
      expect(result.metrics.adaExposure).toBeDefined();
      expect(result.metrics.obligationAging).toBeDefined();
      expect(result.authority).toBe('OMB Circular A-123, DoD FMR Volume 4');
    });
  });

  describe('configureAlert', () => {
    it('should configure an alert', async () => {
      const result = await service.configureAlert({
        engagementId: 'eng-1',
        metricType: 'ada_exposure',
        thresholdValue: 0,
        alertLevel: 'critical',
      } as any);

      expect(result.id).toBe('test-uuid');
      expect(result.metricType).toBe('ada_exposure');
      expect(result.status).toBe('active');
    });
  });

  describe('getAlerts', () => {
    it('should return alerts for an engagement', async () => {
      const result = await service.getAlerts({
        engagementId: 'eng-1',
      } as any);

      expect(result.alerts).toBeDefined();
      expect(result.alerts.length).toBeGreaterThan(0);
    });
  });

  describe('acknowledgeAlert', () => {
    it('should acknowledge an alert', async () => {
      const result = await service.acknowledgeAlert('alert-1');
      expect(result.id).toBe('alert-1');
      expect(result.status).toBe('acknowledged');
    });
  });

  describe('getMetricsHistory', () => {
    it('should return metrics history', async () => {
      const result = await service.getMetricsHistory('eng-1', 'obligation_rate', 3);

      expect(result.engagementId).toBe('eng-1');
      expect(result.metric).toBe('obligation_rate');
      expect(result.periods).toBe(3);
      expect(result.history).toHaveLength(3);
    });
  });
});
