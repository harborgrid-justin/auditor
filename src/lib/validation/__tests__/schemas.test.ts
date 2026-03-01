import { describe, it, expect } from 'vitest';
import {
  AnalyzeRequestSchema,
  EngagementCreateSchema,
  validateRequest,
} from '@/lib/validation/schemas';

describe('AnalyzeRequestSchema', () => {
  it('passes for a valid analyze request', () => {
    const result = AnalyzeRequestSchema.safeParse({
      engagementId: 'eng-123',
      frameworks: ['GAAP', 'SOX'],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.engagementId).toBe('eng-123');
      expect(result.data.frameworks).toEqual(['GAAP', 'SOX']);
    }
  });

  it('passes without optional frameworks field', () => {
    const result = AnalyzeRequestSchema.safeParse({
      engagementId: 'eng-456',
    });

    expect(result.success).toBe(true);
  });

  it('fails when engagementId is missing', () => {
    const result = AnalyzeRequestSchema.safeParse({
      frameworks: ['GAAP'],
    });

    expect(result.success).toBe(false);
  });

  it('fails when engagementId is an empty string', () => {
    const result = AnalyzeRequestSchema.safeParse({
      engagementId: '',
    });

    expect(result.success).toBe(false);
  });
});

describe('EngagementCreateSchema', () => {
  it('passes for a valid engagement create request', () => {
    const result = EngagementCreateSchema.safeParse({
      name: 'FY2025 Audit',
      entityName: 'Acme Corp',
      fiscalYearEnd: '2025-12-31',
      materialityThreshold: 50000,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('FY2025 Audit');
      expect(result.data.entityName).toBe('Acme Corp');
      expect(result.data.fiscalYearEnd).toBe('2025-12-31');
      expect(result.data.materialityThreshold).toBe(50000);
    }
  });

  it('passes with only required fields', () => {
    const result = EngagementCreateSchema.safeParse({
      name: 'Annual Audit',
      entityName: 'Widget Inc',
      fiscalYearEnd: '2025-06-30',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.materialityThreshold).toBe(0); // default
    }
  });

  it('fails when name is missing', () => {
    const result = EngagementCreateSchema.safeParse({
      entityName: 'Acme Corp',
      fiscalYearEnd: '2025-12-31',
    });

    expect(result.success).toBe(false);
  });

  it('fails when name is an empty string', () => {
    const result = EngagementCreateSchema.safeParse({
      name: '',
      entityName: 'Acme Corp',
      fiscalYearEnd: '2025-12-31',
    });

    expect(result.success).toBe(false);
  });

  it('fails when entityName is missing', () => {
    const result = EngagementCreateSchema.safeParse({
      name: 'Audit',
      fiscalYearEnd: '2025-12-31',
    });

    expect(result.success).toBe(false);
  });
});

describe('validateRequest', () => {
  it('returns data on success', () => {
    const result = validateRequest(AnalyzeRequestSchema, {
      engagementId: 'eng-789',
    });

    expect(result.data).toBeDefined();
    expect(result.error).toBeUndefined();
    expect(result.data!.engagementId).toBe('eng-789');
  });

  it('returns error on failure', () => {
    const result = validateRequest(AnalyzeRequestSchema, {
      // missing engagementId
    });

    expect(result.data).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(result.error!.message).toBe('Validation failed');
    expect(result.error!.issues.length).toBeGreaterThan(0);
  });

  it('returns error with issues array for invalid data', () => {
    const result = validateRequest(EngagementCreateSchema, {
      name: '',
      entityName: '',
      fiscalYearEnd: '',
    });

    expect(result.error).toBeDefined();
    expect(Array.isArray(result.error!.issues)).toBe(true);
    expect(result.error!.issues.length).toBeGreaterThanOrEqual(1);
  });
});
