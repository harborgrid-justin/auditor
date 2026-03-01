import { describe, it, expect } from 'vitest';
import { getParameter, getParameterRecord } from '../registry';
import { DOD_PARAMETERS, DOD_PARAMETER_DEFINITIONS } from '../dod-parameters';

// All unique DoD parameter codes from the definitions
const ALL_DOD_CODES = DOD_PARAMETER_DEFINITIONS.map(d => d.code);

describe('DoD Financial Management Parameters', () => {
  // ---------------------------------------------------------------------------
  // Verify every parameter has values for FY2024, FY2025, FY2026
  // ---------------------------------------------------------------------------

  describe('FY2024 values', () => {
    it.each(ALL_DOD_CODES)('returns a value for %s in FY2024', (code) => {
      const value = getParameter(code, 2024);
      expect(value).not.toBe(0);
    });
  });

  describe('FY2025 values', () => {
    it.each(ALL_DOD_CODES)('returns a value for %s in FY2025', (code) => {
      const value = getParameter(code, 2025);
      expect(value).not.toBe(0);
    });
  });

  describe('FY2026 values', () => {
    it.each(ALL_DOD_CODES)('returns a value for %s in FY2026', (code) => {
      const value = getParameter(code, 2026);
      expect(value).not.toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // All parameters are non-negative
  // ---------------------------------------------------------------------------

  describe('value reasonableness', () => {
    it('all DoD parameters have non-negative values', () => {
      for (const param of DOD_PARAMETERS) {
        expect(param.value, `${param.code} FY${param.taxYear} should be non-negative`).toBeGreaterThanOrEqual(0);
      }
    });

    it('percentage parameters are between 0 and 1 inclusive', () => {
      const percentageDefs = DOD_PARAMETER_DEFINITIONS.filter(d => d.valueType === 'percentage');
      for (const def of percentageDefs) {
        for (const year of [2024, 2025, 2026]) {
          const value = getParameter(def.code, year);
          expect(value, `${def.code} FY${year} should be <= 1`).toBeLessThanOrEqual(1);
          expect(value, `${def.code} FY${year} should be >= 0`).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('currency parameters are positive numbers', () => {
      const currencyDefs = DOD_PARAMETER_DEFINITIONS.filter(d => d.valueType === 'currency');
      for (const def of currencyDefs) {
        for (const year of [2024, 2025, 2026]) {
          const value = getParameter(def.code, year);
          expect(value, `${def.code} FY${year} should be > 0`).toBeGreaterThan(0);
        }
      }
    });

    it('integer parameters are whole numbers', () => {
      const intDefs = DOD_PARAMETER_DEFINITIONS.filter(d => d.valueType === 'integer');
      for (const def of intDefs) {
        for (const year of [2024, 2025, 2026]) {
          const value = getParameter(def.code, year);
          expect(Number.isInteger(value), `${def.code} FY${year} should be an integer (got ${value})`).toBe(true);
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Future year fallback
  // ---------------------------------------------------------------------------

  describe('future year fallback', () => {
    it('returns the closest prior year value for a future year with no explicit entry', () => {
      // FY2030 should fall back to the latest defined year (FY2026)
      const fy2026 = getParameter('DOD_MILPAY_RAISE_PCT', 2026);
      const fy2030 = getParameter('DOD_MILPAY_RAISE_PCT', 2030);
      expect(fy2030).toBe(fy2026);
    });

    it('returns 0 for a year before any defined values', () => {
      const value = getParameter('DOD_MILPAY_RAISE_PCT', 2000);
      expect(value).toBe(0);
    });

    it('fallback applies across all parameter codes', () => {
      for (const code of ALL_DOD_CODES) {
        const fy2026 = getParameter(code, 2026);
        const fy2028 = getParameter(code, 2028);
        expect(fy2028, `${code} FY2028 should fall back to FY2026 value`).toBe(fy2026);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Military Pay parameters
  // ---------------------------------------------------------------------------

  describe('Military Pay Raise Percentage', () => {
    it('returns 5.2% for FY2024', () => {
      expect(getParameter('DOD_MILPAY_RAISE_PCT', 2024)).toBe(0.052);
    });

    it('returns 4.5% for FY2025', () => {
      expect(getParameter('DOD_MILPAY_RAISE_PCT', 2025)).toBe(0.045);
    });

    it('returns 4.5% for FY2026', () => {
      expect(getParameter('DOD_MILPAY_RAISE_PCT', 2026)).toBe(0.045);
    });

    it('changes year over year (FY2024 vs FY2025)', () => {
      const fy2024 = getParameter('DOD_MILPAY_RAISE_PCT', 2024);
      const fy2025 = getParameter('DOD_MILPAY_RAISE_PCT', 2025);
      expect(fy2024).not.toBe(fy2025);
    });

    it('has NDAA legislation references', () => {
      const record2024 = getParameterRecord('DOD_MILPAY_RAISE_PCT', 2024);
      expect(record2024).not.toBeNull();
      expect(record2024!.legislationId).toBe('NDAA_FY2024');

      const record2025 = getParameterRecord('DOD_MILPAY_RAISE_PCT', 2025);
      expect(record2025).not.toBeNull();
      expect(record2025!.legislationId).toBe('NDAA_FY2025');

      const record2026 = getParameterRecord('DOD_MILPAY_RAISE_PCT', 2026);
      expect(record2026).not.toBeNull();
      expect(record2026!.legislationId).toBe('NDAA_FY2026');
    });
  });

  describe('BAS rates', () => {
    it('returns correct enlisted BAS rates', () => {
      expect(getParameter('DOD_BAS_ENLISTED', 2024)).toBe(452.56);
      expect(getParameter('DOD_BAS_ENLISTED', 2025)).toBe(460.25);
      expect(getParameter('DOD_BAS_ENLISTED', 2026)).toBe(470.00);
    });

    it('returns correct officer BAS rates', () => {
      expect(getParameter('DOD_BAS_OFFICER', 2024)).toBe(311.68);
      expect(getParameter('DOD_BAS_OFFICER', 2025)).toBe(318.00);
      expect(getParameter('DOD_BAS_OFFICER', 2026)).toBe(325.00);
    });

    it('enlisted BAS is always higher than officer BAS', () => {
      for (const year of [2024, 2025, 2026]) {
        const enlisted = getParameter('DOD_BAS_ENLISTED', year);
        const officer = getParameter('DOD_BAS_OFFICER', year);
        expect(enlisted, `Enlisted BAS should exceed officer BAS in FY${year}`).toBeGreaterThan(officer);
      }
    });

    it('BAS rates increase year over year', () => {
      expect(getParameter('DOD_BAS_ENLISTED', 2025)).toBeGreaterThan(getParameter('DOD_BAS_ENLISTED', 2024));
      expect(getParameter('DOD_BAS_ENLISTED', 2026)).toBeGreaterThan(getParameter('DOD_BAS_ENLISTED', 2025));
    });
  });

  describe('TSP parameters', () => {
    it('TSP match is 5% for all fiscal years', () => {
      expect(getParameter('DOD_TSP_MATCH_MAX_PCT', 2024)).toBe(0.05);
      expect(getParameter('DOD_TSP_MATCH_MAX_PCT', 2025)).toBe(0.05);
      expect(getParameter('DOD_TSP_MATCH_MAX_PCT', 2026)).toBe(0.05);
    });

    it('TSP elective deferral limits increase each year', () => {
      expect(getParameter('DOD_TSP_ELECTIVE_LIMIT', 2024)).toBe(23000);
      expect(getParameter('DOD_TSP_ELECTIVE_LIMIT', 2025)).toBe(23500);
      expect(getParameter('DOD_TSP_ELECTIVE_LIMIT', 2026)).toBe(24000);
    });
  });

  // ---------------------------------------------------------------------------
  // Civilian Pay parameters
  // ---------------------------------------------------------------------------

  describe('Civilian Pay parameters', () => {
    it('FERS employee rate is 0.8% for all years', () => {
      for (const year of [2024, 2025, 2026]) {
        expect(getParameter('DOD_FERS_EMPLOYEE_RATE', year)).toBe(0.008);
      }
    });

    it('FERS-Revised rate is 4.5% for all years', () => {
      for (const year of [2024, 2025, 2026]) {
        expect(getParameter('DOD_FERS_REVISED_RATE', year)).toBe(0.045);
      }
    });

    it('FEHB government contribution is 72% for all years', () => {
      for (const year of [2024, 2025, 2026]) {
        expect(getParameter('DOD_FEHB_GOV_CONTRIBUTION_PCT', year)).toBe(0.72);
      }
    });

    it('Premium pay cap increases year over year', () => {
      expect(getParameter('DOD_PREMIUM_PAY_CAP', 2024)).toBe(191900);
      expect(getParameter('DOD_PREMIUM_PAY_CAP', 2025)).toBe(196300);
      expect(getParameter('DOD_PREMIUM_PAY_CAP', 2026)).toBe(201000);
    });
  });

  // ---------------------------------------------------------------------------
  // Travel parameters
  // ---------------------------------------------------------------------------

  describe('Per Diem and Lodging rates', () => {
    it('CONUS per diem rates are reasonable daily amounts', () => {
      for (const year of [2024, 2025, 2026]) {
        const perDiem = getParameter('DOD_CONUS_PERDIEM_STD', year);
        expect(perDiem).toBeGreaterThan(100);
        expect(perDiem).toBeLessThan(500);
      }
    });

    it('CONUS lodging rates are reasonable nightly amounts', () => {
      for (const year of [2024, 2025, 2026]) {
        const lodging = getParameter('DOD_CONUS_LODGING_STD', year);
        expect(lodging).toBeGreaterThan(50);
        expect(lodging).toBeLessThan(300);
      }
    });

    it('M&IE rates are reasonable daily amounts', () => {
      for (const year of [2024, 2025, 2026]) {
        const mie = getParameter('DOD_CONUS_MIE_STD', year);
        expect(mie).toBeGreaterThan(30);
        expect(mie).toBeLessThan(150);
      }
    });

    it('per diem equals lodging plus M&IE', () => {
      for (const year of [2024, 2025, 2026]) {
        const perDiem = getParameter('DOD_CONUS_PERDIEM_STD', year);
        const lodging = getParameter('DOD_CONUS_LODGING_STD', year);
        const mie = getParameter('DOD_CONUS_MIE_STD', year);
        expect(perDiem).toBe(lodging + mie);
      }
    });

    it('returns specific FY2024 travel values', () => {
      expect(getParameter('DOD_CONUS_PERDIEM_STD', 2024)).toBe(166);
      expect(getParameter('DOD_CONUS_LODGING_STD', 2024)).toBe(107);
      expect(getParameter('DOD_CONUS_MIE_STD', 2024)).toBe(59);
    });

    it('returns specific FY2025 travel values', () => {
      expect(getParameter('DOD_CONUS_PERDIEM_STD', 2025)).toBe(172);
      expect(getParameter('DOD_CONUS_LODGING_STD', 2025)).toBe(110);
      expect(getParameter('DOD_CONUS_MIE_STD', 2025)).toBe(62);
    });

    it('returns specific FY2026 travel values', () => {
      expect(getParameter('DOD_CONUS_PERDIEM_STD', 2026)).toBe(178);
      expect(getParameter('DOD_CONUS_LODGING_STD', 2026)).toBe(114);
      expect(getParameter('DOD_CONUS_MIE_STD', 2026)).toBe(64);
    });
  });

  // ---------------------------------------------------------------------------
  // Contract parameters
  // ---------------------------------------------------------------------------

  describe('Progress Payment rates', () => {
    it('large business rate is 80% for all years', () => {
      for (const year of [2024, 2025, 2026]) {
        expect(getParameter('DOD_PROGRESS_PAY_LB_PCT', year)).toBe(0.80);
      }
    });

    it('small business rate is 90% for all years', () => {
      for (const year of [2024, 2025, 2026]) {
        expect(getParameter('DOD_PROGRESS_PAY_SB_PCT', year)).toBe(0.90);
      }
    });

    it('small business rate exceeds large business rate', () => {
      for (const year of [2024, 2025, 2026]) {
        const lb = getParameter('DOD_PROGRESS_PAY_LB_PCT', year);
        const sb = getParameter('DOD_PROGRESS_PAY_SB_PCT', year);
        expect(sb).toBeGreaterThan(lb);
      }
    });
  });

  describe('Acquisition thresholds', () => {
    it('micro-purchase threshold is $10,000 for all years', () => {
      for (const year of [2024, 2025, 2026]) {
        expect(getParameter('DOD_MICRO_PURCHASE_THRESHOLD', year)).toBe(10000);
      }
    });

    it('simplified acquisition threshold is $250,000 for all years', () => {
      for (const year of [2024, 2025, 2026]) {
        expect(getParameter('DOD_SIMPLIFIED_ACQ_THRESHOLD', year)).toBe(250000);
      }
    });

    it('SAT exceeds micro-purchase threshold', () => {
      for (const year of [2024, 2025, 2026]) {
        const micro = getParameter('DOD_MICRO_PURCHASE_THRESHOLD', year);
        const sat = getParameter('DOD_SIMPLIFIED_ACQ_THRESHOLD', year);
        expect(sat).toBeGreaterThan(micro);
      }
    });

    it('DCAA audit threshold is $2,000,000 for all years', () => {
      for (const year of [2024, 2025, 2026]) {
        expect(getParameter('DOD_DCAA_AUDIT_THRESHOLD', year)).toBe(2000000);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Prompt Pay parameters
  // ---------------------------------------------------------------------------

  describe('Prompt Payment parameters', () => {
    it('net payment days is 30 for all years', () => {
      for (const year of [2024, 2025, 2026]) {
        expect(getParameter('DOD_PROMPT_PAY_NET_DAYS', year)).toBe(30);
      }
    });

    it('interest rate increases over the years', () => {
      expect(getParameter('DOD_PROMPT_PAY_INTEREST_RATE', 2024)).toBe(0.0475);
      expect(getParameter('DOD_PROMPT_PAY_INTEREST_RATE', 2025)).toBe(0.05);
      expect(getParameter('DOD_PROMPT_PAY_INTEREST_RATE', 2026)).toBe(0.0525);
    });

    it('interest rate is a reasonable annual percentage', () => {
      for (const year of [2024, 2025, 2026]) {
        const rate = getParameter('DOD_PROMPT_PAY_INTEREST_RATE', year);
        expect(rate).toBeGreaterThan(0);
        expect(rate).toBeLessThan(0.20);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Budget Execution parameters
  // ---------------------------------------------------------------------------

  describe('Budget Execution parameters', () => {
    it('ULO review threshold is 180 days for all years', () => {
      for (const year of [2024, 2025, 2026]) {
        expect(getParameter('DOD_ULO_REVIEW_DAYS', year)).toBe(180);
      }
    });

    it('year-end spike multiplier is 2.0 for all years', () => {
      for (const year of [2024, 2025, 2026]) {
        expect(getParameter('DOD_YEAREND_SPIKE_MULTIPLIER', year)).toBe(2.0);
      }
    });

    it('low execution threshold is 25% for all years', () => {
      for (const year of [2024, 2025, 2026]) {
        expect(getParameter('DOD_LOW_EXECUTION_THRESHOLD', year)).toBe(0.25);
      }
    });

    it('high execution threshold is 98% for all years', () => {
      for (const year of [2024, 2025, 2026]) {
        expect(getParameter('DOD_HIGH_EXECUTION_THRESHOLD', year)).toBe(0.98);
      }
    });

    it('high threshold exceeds low threshold', () => {
      for (const year of [2024, 2025, 2026]) {
        const low = getParameter('DOD_LOW_EXECUTION_THRESHOLD', year);
        const high = getParameter('DOD_HIGH_EXECUTION_THRESHOLD', year);
        expect(high).toBeGreaterThan(low);
      }
    });

    it('stale obligation threshold is 365 days for all years', () => {
      for (const year of [2024, 2025, 2026]) {
        expect(getParameter('DOD_STALE_OBLIGATION_DAYS', year)).toBe(365);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // ADA Compliance parameters
  // ---------------------------------------------------------------------------

  describe('ADA Compliance parameters', () => {
    it('ADA report deadline is 30 days for all years', () => {
      for (const year of [2024, 2025, 2026]) {
        expect(getParameter('DOD_ADA_REPORT_DEADLINE_DAYS', year)).toBe(30);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Disbursing Threshold parameters
  // ---------------------------------------------------------------------------

  describe('Disbursing Threshold parameters', () => {
    it('expense/investment threshold is $250,000 for all years', () => {
      for (const year of [2024, 2025, 2026]) {
        expect(getParameter('DOD_EXPENSE_INVESTMENT_THRESHOLD', year)).toBe(250000);
      }
    });

    it('EFT compliance threshold is 95% for all years', () => {
      for (const year of [2024, 2025, 2026]) {
        expect(getParameter('DOD_EFT_COMPLIANCE_THRESHOLD', year)).toBe(0.95);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Parameter record metadata
  // ---------------------------------------------------------------------------

  describe('parameter record metadata', () => {
    it('DoD parameters have citation references to DoD FMR', () => {
      for (const def of DOD_PARAMETER_DEFINITIONS) {
        const record = getParameterRecord(def.code, 2024);
        expect(record, `${def.code} should have a FY2024 record`).not.toBeNull();
        expect(record!.citation).toContain('DoD FMR');
      }
    });

    it('DoD parameters include expected entity types', () => {
      const record = getParameterRecord('DOD_MILPAY_RAISE_PCT', 2024);
      expect(record).not.toBeNull();
      expect(record!.entityTypes).toContain('dod_component');
      expect(record!.entityTypes).toContain('defense_agency');
    });

    it('all parameter definitions have required fields', () => {
      for (const def of DOD_PARAMETER_DEFINITIONS) {
        expect(def.code).toBeTruthy();
        expect(def.displayName).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(def.category).toBeTruthy();
        expect(def.valueType).toBeTruthy();
      }
    });
  });
});
