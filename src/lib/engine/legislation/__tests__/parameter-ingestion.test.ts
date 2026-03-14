import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateIngestedParameter,
  getIngestionSchedule,
  INGESTION_SOURCES,
  clearCheckHistory,
  ParameterSourceType,
} from '../parameter-ingestion';

// ---------------------------------------------------------------------------
// Mock the tax-parameters registry
// ---------------------------------------------------------------------------

vi.mock('@/lib/engine/tax-parameters/registry', () => ({
  getParameterRecord: (key: string, _fy: number) => {
    // Return known values for specific test parameters
    const records: Record<string, { value: number; taxYear: number }> = {
      DOD_MILPAY_RAISE_PCT: { value: 0.045, taxYear: 2025 },
      DOD_CIVPAY_RAISE_PCT: { value: 0.02, taxYear: 2025 },
      DOD_SIMPLIFIED_ACQ_THRESHOLD: { value: 250000, taxYear: 2025 },
      DOD_MICRO_PURCHASE_THRESHOLD: { value: 10000, taxYear: 2025 },
      DOD_PER_DIEM_CONUS_MAX: { value: 178, taxYear: 2025 },
      DOD_PER_DIEM_OCONUS_MAX: { value: 350, taxYear: 2025 },
      DOD_TSP_ELECTIVE_LIMIT: { value: 23500, taxYear: 2025 },
      DOD_TSP_CATCHUP_LIMIT: { value: 7500, taxYear: 2025 },
      DOD_PROMPT_PAY_INTEREST_RATE: { value: 0.05, taxYear: 2025 },
      DOD_EFT_COMPLIANCE_THRESHOLD: { value: 0.97, taxYear: 2025 },
    };
    return records[key] ?? null;
  },
  getParameter: (_key: string, _fy: number, _ctx: unknown, fallback: number) => {
    return fallback ?? 0;
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Parameter Ingestion', () => {
  beforeEach(() => {
    clearCheckHistory();
  });

  // =========================================================================
  // validateIngestedParameter — valid params
  // =========================================================================

  describe('validateIngestedParameter — accepts valid params', () => {
    it('accepts valid military pay raise percentage', () => {
      const errors = validateIngestedParameter('DOD_MILPAY_RAISE_PCT', 0.05, 2025);

      expect(errors).toHaveLength(0);
    });

    it('accepts valid simplified acquisition threshold', () => {
      const errors = validateIngestedParameter('DOD_SIMPLIFIED_ACQ_THRESHOLD', 300000, 2025);

      expect(errors).toHaveLength(0);
    });

    it('accepts valid TSP elective limit', () => {
      const errors = validateIngestedParameter('DOD_TSP_ELECTIVE_LIMIT', 24000, 2025);

      expect(errors).toHaveLength(0);
    });

    it('accepts valid prompt pay interest rate', () => {
      const errors = validateIngestedParameter('DOD_PROMPT_PAY_INTEREST_RATE', 0.06, 2025);

      expect(errors).toHaveLength(0);
    });

    it('accepts value at minimum boundary', () => {
      // DOD_PER_DIEM_CONUS_MAX min is 100
      const errors = validateIngestedParameter('DOD_PER_DIEM_CONUS_MAX', 100, 2025);

      expect(errors).toHaveLength(0);
    });

    it('accepts value at maximum boundary', () => {
      // DOD_PER_DIEM_CONUS_MAX max is 500
      const errors = validateIngestedParameter('DOD_PER_DIEM_CONUS_MAX', 500, 2025);

      expect(errors).toHaveLength(0);
    });
  });

  // =========================================================================
  // validateIngestedParameter — rejects invalid params
  // =========================================================================

  describe('validateIngestedParameter — rejects invalid params', () => {
    it('rejects value below minimum', () => {
      // DOD_SIMPLIFIED_ACQ_THRESHOLD min is 100000
      const errors = validateIngestedParameter('DOD_SIMPLIFIED_ACQ_THRESHOLD', 50000, 2025);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('below minimum'))).toBe(true);
    });

    it('rejects value above maximum', () => {
      // DOD_PER_DIEM_CONUS_MAX max is 500
      const errors = validateIngestedParameter('DOD_PER_DIEM_CONUS_MAX', 600, 2025);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('above maximum'))).toBe(true);
    });

    it('rejects percentage value outside 0-1 range', () => {
      // DOD_MILPAY_RAISE_PCT is a percentage, value must be 0-1
      const errors = validateIngestedParameter('DOD_MILPAY_RAISE_PCT', 5.0, 2025);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('percentage') || e.includes('above maximum'))).toBe(true);
    });

    it('rejects unknown parameter key with manual review warning', () => {
      const errors = validateIngestedParameter('UNKNOWN_PARAM', 100, 2025);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('No validation schema') && e.includes('Manual review'))).toBe(true);
    });

    it('rejects excessively large change from current value', () => {
      // DOD_PER_DIEM_CONUS_MAX maxChangePercent is 30%
      // Current value is 178, so 300 is a 68.5% increase
      const errors = validateIngestedParameter('DOD_PER_DIEM_CONUS_MAX', 300, 2025);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('exceeds') && e.includes('maximum allowed change'))).toBe(true);
    });
  });

  // =========================================================================
  // getIngestionSchedule
  // =========================================================================

  describe('getIngestionSchedule', () => {
    it('returns configured sources with schedule entries', () => {
      const schedule = getIngestionSchedule();

      expect(schedule.length).toBe(INGESTION_SOURCES.length);
      expect(schedule.length).toBeGreaterThan(0);

      for (const entry of schedule) {
        expect(entry.source).toBeDefined();
        expect(entry.source.name).toBeDefined();
        expect(entry.source.url).toBeDefined();
        expect(entry.source.parameterKeys.length).toBeGreaterThan(0);
        expect(entry.nextCheck).toBeDefined();
      }
    });

    it('returns null lastChecked for sources not yet checked', () => {
      const schedule = getIngestionSchedule();

      for (const entry of schedule) {
        expect(entry.lastChecked).toBeNull();
      }
    });

    it('returns valid ISO date strings for nextCheck', () => {
      const schedule = getIngestionSchedule();

      for (const entry of schedule) {
        const date = new Date(entry.nextCheck);
        expect(date.getTime()).not.toBeNaN();
      }
    });
  });

  // =========================================================================
  // INGESTION_SOURCES
  // =========================================================================

  describe('INGESTION_SOURCES', () => {
    it('contains Federal Register source', () => {
      const fedRegSource = INGESTION_SOURCES.find(
        s => s.sourceType === ParameterSourceType.FEDERAL_REGISTER,
      );

      expect(fedRegSource).toBeDefined();
      expect(fedRegSource!.name).toContain('Federal Register');
      expect(fedRegSource!.parameterKeys).toContain('DOD_MILPAY_RAISE_PCT');
    });

    it('contains Treasury source for prompt pay rates', () => {
      const treasurySource = INGESTION_SOURCES.find(
        s => s.sourceType === ParameterSourceType.TREASURY,
      );

      expect(treasurySource).toBeDefined();
      expect(treasurySource!.parameterKeys).toContain('DOD_PROMPT_PAY_INTEREST_RATE');
    });

    it('contains GSA source for per diem rates', () => {
      const gsaSource = INGESTION_SOURCES.find(
        s => s.sourceType === ParameterSourceType.GSA,
      );

      expect(gsaSource).toBeDefined();
      expect(gsaSource!.parameterKeys).toContain('DOD_PER_DIEM_CONUS_MAX');
      expect(gsaSource!.parameterKeys).toContain('DOD_PER_DIEM_OCONUS_MAX');
    });

    it('contains OPM source for pay tables', () => {
      const opmSource = INGESTION_SOURCES.find(
        s => s.sourceType === ParameterSourceType.OPM,
      );

      expect(opmSource).toBeDefined();
      expect(opmSource!.parameterKeys).toContain('DOD_CIVPAY_RAISE_PCT');
    });

    it('contains IRS source for TSP limits', () => {
      const irsSource = INGESTION_SOURCES.find(
        s => s.sourceType === ParameterSourceType.IRS,
      );

      expect(irsSource).toBeDefined();
      expect(irsSource!.parameterKeys).toContain('DOD_TSP_ELECTIVE_LIMIT');
      expect(irsSource!.parameterKeys).toContain('DOD_TSP_CATCHUP_LIMIT');
    });

    it('has valid check frequencies for all sources', () => {
      const validFrequencies = ['daily', 'weekly', 'monthly', 'quarterly', 'semi-annually', 'annually'];

      for (const source of INGESTION_SOURCES) {
        expect(validFrequencies).toContain(source.checkFrequency);
      }
    });

    it('has valid URLs for all sources', () => {
      for (const source of INGESTION_SOURCES) {
        expect(source.url).toMatch(/^https?:\/\//);
      }
    });
  });
});
