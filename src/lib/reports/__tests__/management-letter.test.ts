import { describe, it, expect } from 'vitest';
import { generateManagementLetter } from '@/lib/reports/management-letter';
import type { ManagementLetterData } from '@/lib/reports/management-letter';

function makeBaseData(overrides: Partial<ManagementLetterData> = {}): ManagementLetterData {
  return {
    entityName: 'Acme Corporation',
    engagementName: 'FY2025 Annual Audit',
    fiscalYearEnd: '2025-12-31',
    findings: [],
    controls: [],
    materialityThreshold: 100000,
    generatedAt: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

describe('generateManagementLetter', () => {
  it('includes entity name in output', () => {
    const data = makeBaseData({ entityName: 'Widget Industries Inc.' });

    const letter = generateManagementLetter(data);

    expect(letter).toContain('Widget Industries Inc.');
  });

  it('includes material weakness section when controls have material weaknesses', () => {
    const data = makeBaseData({
      controls: [
        {
          controlId: 'CTRL-001',
          title: 'Revenue Recognition Controls',
          status: 'material_weakness',
          category: 'financial_reporting',
        },
        {
          controlId: 'CTRL-002',
          title: 'Inventory Valuation',
          status: 'material_weakness',
          category: 'asset_management',
        },
      ],
    });

    const letter = generateManagementLetter(data);

    expect(letter).toContain('MATERIAL WEAKNESSES');
    expect(letter).toContain('Revenue Recognition Controls');
    expect(letter).toContain('CTRL-001');
    expect(letter).toContain('Inventory Valuation');
    expect(letter).toContain('CTRL-002');
  });

  it('includes recommendations for critical findings', () => {
    const data = makeBaseData({
      findings: [
        {
          severity: 'critical',
          framework: 'GAAP',
          title: 'Unrecorded Liabilities',
          description: 'Several significant liabilities were not recorded.',
          remediation: 'Implement monthly liability reconciliation procedures.',
          amountImpact: 500000,
          status: 'open',
        },
        {
          severity: 'high',
          framework: 'SOX',
          title: 'Access Control Deficiency',
          description: 'Excessive access rights granted to non-authorized personnel.',
          remediation: 'Conduct quarterly access reviews and enforce least-privilege.',
          amountImpact: null,
          status: 'open',
        },
      ],
    });

    const letter = generateManagementLetter(data);

    expect(letter).toContain('KEY FINDINGS AND RECOMMENDATIONS');
    expect(letter).toContain('Unrecorded Liabilities');
    expect(letter).toContain('Implement monthly liability reconciliation procedures.');
    expect(letter).toContain('Access Control Deficiency');
    expect(letter).toContain('Conduct quarterly access reviews and enforce least-privilege.');
    expect(letter).toContain('CRITICAL');
    expect(letter).toContain('HIGH');
  });

  it('does not include material weakness section when there are none', () => {
    const data = makeBaseData({
      controls: [
        {
          controlId: 'CTRL-001',
          title: 'Revenue Controls',
          status: 'effective',
          category: 'financial_reporting',
        },
      ],
    });

    const letter = generateManagementLetter(data);

    expect(letter).not.toContain('MATERIAL WEAKNESSES');
  });

  it('includes significant deficiency section when present', () => {
    const data = makeBaseData({
      controls: [
        {
          controlId: 'CTRL-003',
          title: 'Expense Approval Process',
          status: 'significant_deficiency',
          category: 'operational',
        },
      ],
    });

    const letter = generateManagementLetter(data);

    expect(letter).toContain('SIGNIFICANT DEFICIENCIES');
    expect(letter).toContain('Expense Approval Process');
    expect(letter).toContain('CTRL-003');
  });
});
