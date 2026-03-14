import { describe, it, expect } from 'vitest';
import {
  INGESTION_SOURCES,
  validateIngestedParameter,
  getIngestionSchedule,
} from '../parameter-ingestion';

describe('Parameter Ingestion', () => {
  describe('INGESTION_SOURCES', () => {
    it('contains expected federal data sources', () => {
      expect(INGESTION_SOURCES.length).toBeGreaterThanOrEqual(4);

      const sourceNames = INGESTION_SOURCES.map(s => s.name);
      expect(sourceNames).toContain('Federal Register - NDAA');
      expect(sourceNames).toContain('Treasury - Interest Rates');
    });

    it('each source has required fields', () => {
      for (const source of INGESTION_SOURCES) {
        expect(source.name).toBeTruthy();
        expect(source.sourceType).toBeTruthy();
        expect(source.url).toBeTruthy();
        expect(source.parameterKeys).toBeDefined();
        expect(Array.isArray(source.parameterKeys)).toBe(true);
        expect(source.checkFrequency).toBeTruthy();
      }
    });
  });

  describe('validateIngestedParameter', () => {
    it('accepts valid numeric parameter', () => {
      const errors = validateIngestedParameter('DOD_MILPAY_RAISE_PCT', 4.5, 2026);
      expect(errors).toHaveLength(0);
    });

    it('rejects negative percentage values', () => {
      const errors = validateIngestedParameter('DOD_MILPAY_RAISE_PCT', -5, 2026);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('rejects invalid fiscal year', () => {
      const errors = validateIngestedParameter('DOD_MILPAY_RAISE_PCT', 4.5, 1900);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('getIngestionSchedule', () => {
    it('returns schedule for all configured sources', () => {
      const schedule = getIngestionSchedule();
      expect(schedule.length).toBe(INGESTION_SOURCES.length);
      for (const entry of schedule) {
        expect(entry.source).toBeTruthy();
        expect(entry.nextCheck).toBeTruthy();
      }
    });
  });
});
