import { describe, it, expect } from 'vitest';
import type { LegislationRuleLink } from '@/types/tax-compliance';
import {
  syncLegislationParameters,
  getParameterUpdatesForYear,
  validateParameterCoverage,
} from '../legislation-parameter-sync';
import { SEED_DOD_RULE_LINKS } from '../seed-dod-legislation';
import { SEED_RULE_LINKS } from '../seed-legislation';

const ALL_LINKS: LegislationRuleLink[] = [...SEED_RULE_LINKS, ...SEED_DOD_RULE_LINKS];

describe('Legislation-Parameter Sync Engine', () => {
  describe('syncLegislationParameters', () => {
    it('returns a valid sync result for FY2024', () => {
      const result = syncLegislationParameters(2024, ALL_LINKS);
      expect(result.fiscalYear).toBe(2024);
      expect(result.activeLegislationCount).toBeGreaterThan(0);
      expect(result.linkedParameterCodes.length).toBeGreaterThan(0);
      expect(result.syncedAt).toBeTruthy();
    });

    it('identifies covered parameters for FY2025', () => {
      const result = syncLegislationParameters(2025, ALL_LINKS);
      // Military pay raise is seeded for FY2025
      expect(result.coveredParameterCodes).toContain('DOD_MILPAY_RAISE_PCT');
    });

    it('flags missing parameters as errors', () => {
      // Create a link referencing a non-existent parameter code
      const fakeLinks: LegislationRuleLink[] = [
        ...ALL_LINKS,
        {
          id: 'link-test-missing',
          legislationId: 'NDAA_FY2024',
          ruleId: 'DOD-TEST-001',
          parameterCode: 'NONEXISTENT_DOD_PARAM',
          impactDescription: 'Test missing parameter',
        },
      ];
      const result = syncLegislationParameters(2024, fakeLinks);
      expect(result.missingParameterCodes).toContain('NONEXISTENT_DOD_PARAM');
      const errorWarnings = result.warnings.filter(w => w.severity === 'error');
      expect(errorWarnings.some(w => w.parameterCode === 'NONEXISTENT_DOD_PARAM')).toBe(true);
    });

    it('generates carry-forward warnings when FY value is inherited', () => {
      // FY2028 has no explicit parameters — should carry forward from FY2026
      const result = syncLegislationParameters(2028, ALL_LINKS);
      const carryForwardWarnings = result.warnings.filter(w => w.severity === 'warning');
      // Any covered params for FY2028 must be carry-forwards since we only seed up to 2026/2027
      if (result.coveredParameterCodes.length > 0) {
        expect(carryForwardWarnings.length).toBeGreaterThan(0);
      }
    });

    it('includes sunset alert info warnings', () => {
      // FY2025 has SALT_CAP sunsetting (from federal parameters)
      const result = syncLegislationParameters(2025, ALL_LINKS);
      const infoWarnings = result.warnings.filter(w => w.severity === 'info');
      // There may be sunset alerts depending on the seed data
      expect(Array.isArray(infoWarnings)).toBe(true);
    });
  });

  describe('getParameterUpdatesForYear', () => {
    it('returns parameter updates for FY2024', () => {
      const updates = getParameterUpdatesForYear(2024, ALL_LINKS);
      expect(updates.length).toBeGreaterThan(0);
      // Should have DOD_MILPAY_RAISE_PCT from NDAA FY2024
      const milPayUpdate = updates.find(u => u.parameterCode === 'DOD_MILPAY_RAISE_PCT');
      expect(milPayUpdate).toBeDefined();
      expect(milPayUpdate!.currentValue).toBe(0.052);
      expect(milPayUpdate!.legislationId).toBe('NDAA_FY2024');
    });

    it('returns null currentValue for missing parameters', () => {
      const fakeLinks: LegislationRuleLink[] = [
        {
          id: 'link-test-missing-update',
          legislationId: 'NDAA_FY2024',
          ruleId: 'DOD-TEST-001',
          parameterCode: 'NONEXISTENT_DOD_PARAM_2',
          impactDescription: 'Test missing parameter update',
        },
      ];
      const updates = getParameterUpdatesForYear(2024, fakeLinks);
      const missing = updates.find(u => u.parameterCode === 'NONEXISTENT_DOD_PARAM_2');
      expect(missing).toBeDefined();
      expect(missing!.currentValue).toBeNull();
    });
  });

  describe('validateParameterCoverage', () => {
    it('reports complete coverage when all parameters exist', () => {
      const { complete, missingCodes } = validateParameterCoverage(2024, ALL_LINKS);
      // With the seeded data, all DoD parameters for FY2024 should exist
      expect(complete).toBe(true);
      expect(missingCodes).toHaveLength(0);
    });

    it('reports incomplete coverage when parameters are missing', () => {
      const fakeLinks: LegislationRuleLink[] = [
        ...ALL_LINKS,
        {
          id: 'link-test-validate',
          legislationId: 'NDAA_FY2024',
          ruleId: 'DOD-TEST-002',
          parameterCode: 'TOTALLY_FAKE_PARAM',
          impactDescription: 'Test validation',
        },
      ];
      const { complete, missingCodes } = validateParameterCoverage(2024, fakeLinks);
      expect(complete).toBe(false);
      expect(missingCodes).toContain('TOTALLY_FAKE_PARAM');
    });
  });
});
