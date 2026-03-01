import { describe, it, expect } from 'vitest';
import { getParameter, getParameterOrThrow, getParameterRecord, isParameterSunset, getAllParametersForYear } from '../registry';
import { getTaxYear, isSunsetForYear, daysUntilSunset } from '../utils';

describe('Tax Parameter Registry', () => {
  describe('getParameter', () => {
    it('returns correct §179 limit for 2024', () => {
      const limit = getParameter('SEC_179_LIMIT', 2024);
      expect(limit).toBe(1220000);
    });

    it('returns correct §179 limit for 2023', () => {
      const limit = getParameter('SEC_179_LIMIT', 2023);
      expect(limit).toBe(1160000);
    });

    it('returns correct §179 limit for 2025', () => {
      const limit = getParameter('SEC_179_LIMIT', 2025);
      expect(limit).toBe(1250000);
    });

    it('returns fallback for unknown parameter', () => {
      const value = getParameter('NONEXISTENT_PARAM', 2024, undefined, 42);
      expect(value).toBe(42);
    });

    it('returns 0 as default fallback', () => {
      const value = getParameter('NONEXISTENT_PARAM', 2024);
      expect(value).toBe(0);
    });

    it('returns correct bonus depreciation phase-down rates', () => {
      expect(getParameter('BONUS_DEPR_RATE', 2022)).toBe(1.00);
      expect(getParameter('BONUS_DEPR_RATE', 2023)).toBe(0.80);
      expect(getParameter('BONUS_DEPR_RATE', 2024)).toBe(0.60);
      expect(getParameter('BONUS_DEPR_RATE', 2025)).toBe(0.40);
      expect(getParameter('BONUS_DEPR_RATE', 2026)).toBe(0.20);
      expect(getParameter('BONUS_DEPR_RATE', 2027)).toBe(0.00);
    });

    it('returns correct federal corporate rate', () => {
      expect(getParameter('FEDERAL_CORP_RATE', 2024)).toBe(0.21);
      expect(getParameter('FEDERAL_CORP_RATE', 2025)).toBe(0.21);
    });

    it('returns correct §163(j) ATI percentage', () => {
      expect(getParameter('SEC_163J_ATI_PCT', 2024)).toBe(0.30);
    });

    it('returns correct SALT cap before sunset', () => {
      expect(getParameter('SALT_CAP', 2024)).toBe(10000);
      expect(getParameter('SALT_CAP', 2025)).toBe(10000);
    });

    it('returns Infinity for SALT cap after sunset', () => {
      expect(getParameter('SALT_CAP', 2026)).toBe(Infinity);
    });

    it('returns correct meals deduction rate', () => {
      expect(getParameter('MEALS_DEDUCTION_PCT', 2021)).toBe(1.00);
      expect(getParameter('MEALS_DEDUCTION_PCT', 2022)).toBe(1.00);
      expect(getParameter('MEALS_DEDUCTION_PCT', 2023)).toBe(0.50);
    });

    it('returns correct NOL limitation percentage', () => {
      expect(getParameter('NOL_DEDUCTION_LIMIT_PCT', 2024)).toBe(0.80);
    });

    it('returns correct QBI deduction percentage with sunset', () => {
      expect(getParameter('QBI_DEDUCTION_PCT', 2025)).toBe(0.20);
      expect(getParameter('QBI_DEDUCTION_PCT', 2026)).toBe(0);
    });

    it('returns correct CAMT threshold', () => {
      expect(getParameter('CAMT_THRESHOLD', 2024)).toBe(1000000000);
      expect(getParameter('CAMT_RATE', 2024)).toBe(0.15);
    });

    it('returns correct excess business loss limits', () => {
      expect(getParameter('EXCESS_BUSINESS_LOSS_SINGLE', 2023)).toBe(289000);
      expect(getParameter('EXCESS_BUSINESS_LOSS_MFJ', 2023)).toBe(578000);
    });

    it('returns correct accuracy penalty rates', () => {
      expect(getParameter('ACCURACY_PENALTY_RATE', 2024)).toBe(0.20);
      expect(getParameter('ACCURACY_PENALTY_GROSS_RATE', 2024)).toBe(0.40);
    });
  });

  describe('getParameterOrThrow', () => {
    it('returns value for existing parameter', () => {
      expect(getParameterOrThrow('FEDERAL_CORP_RATE', 2024)).toBe(0.21);
    });

    it('throws for nonexistent parameter', () => {
      expect(() => getParameterOrThrow('NONEXISTENT', 2024)).toThrow();
    });
  });

  describe('getParameterRecord', () => {
    it('returns full record with citation', () => {
      const record = getParameterRecord('SEC_179_LIMIT', 2024);
      expect(record).not.toBeNull();
      expect(record!.citation).toContain('179');
      expect(record!.value).toBe(1220000);
    });

    it('returns record with sunset date for SALT cap', () => {
      const record = getParameterRecord('SALT_CAP', 2024);
      expect(record).not.toBeNull();
      expect(record!.sunsetDate).toBe('2025-12-31');
    });
  });

  describe('isParameterSunset', () => {
    it('returns false for SALT cap in 2024', () => {
      expect(isParameterSunset('SALT_CAP', 2024)).toBe(false);
    });

    it('returns true for SALT cap in 2026', () => {
      expect(isParameterSunset('SALT_CAP', 2026)).toBe(true);
    });
  });

  describe('getAllParametersForYear', () => {
    it('returns multiple parameters for 2024', () => {
      const params = getAllParametersForYear(2024);
      expect(params.length).toBeGreaterThan(10);
    });
  });
});

describe('Tax Parameter Utilities', () => {
  describe('getTaxYear', () => {
    it('extracts year from ISO date', () => {
      expect(getTaxYear('2024-12-31')).toBe(2024);
      expect(getTaxYear('2025-06-30')).toBe(2025);
    });

    it('handles non-standard formats', () => {
      expect(getTaxYear('2024')).toBe(2024);
    });
  });

  describe('isSunsetForYear', () => {
    it('returns false for null sunset date', () => {
      expect(isSunsetForYear(null, 2024)).toBe(false);
    });

    it('returns false when sunset is after year end', () => {
      expect(isSunsetForYear('2025-12-31', 2024)).toBe(false);
    });

    it('returns true when sunset is before year end', () => {
      expect(isSunsetForYear('2025-12-31', 2026)).toBe(true);
    });
  });

  describe('daysUntilSunset', () => {
    it('calculates days until sunset', () => {
      const days = daysUntilSunset('2025-12-31', '2025-01-01');
      expect(days).toBe(364);
    });

    it('returns negative for past sunset dates', () => {
      const days = daysUntilSunset('2020-12-31', '2024-01-01');
      expect(days).toBeLessThan(0);
    });
  });
});
