import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';
import { calculateMateriality } from '@/lib/utils/materiality';

export const materialityRules: AuditRule[] = [
  {
    id: 'PCAOB-MAT-001',
    name: 'Materiality Threshold Assessment',
    framework: 'PCAOB',
    category: 'Materiality (AS 2105)',
    description: 'Validates the planning materiality and evaluates its reasonableness',
    citation: 'AS 2105 - Consideration of Materiality in Planning and Performing an Audit',
    defaultSeverity: 'medium',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const isStatements = data.financialStatements.filter(fs => fs.statementType === 'IS');
      const bsStatements = data.financialStatements.filter(fs => fs.statementType === 'BS');

      if (isStatements.length === 0 && bsStatements.length === 0) return findings;

      const isData = isStatements.length > 0
        ? JSON.parse(typeof isStatements[0].data === 'string' ? isStatements[0].data : JSON.stringify(isStatements[0].data))
        : {};
      const bsData = bsStatements.length > 0
        ? JSON.parse(typeof bsStatements[0].data === 'string' ? bsStatements[0].data : JSON.stringify(bsStatements[0].data))
        : {};

      const calculated = calculateMateriality({
        totalRevenue: isData.totalRevenue,
        totalAssets: bsData.totalAssets,
        netIncome: isData.netIncome || isData.incomeBeforeTax,
        totalEquity: bsData.totalEquity,
      });

      if (data.materialityThreshold > 0 && calculated.overallMateriality > 0) {
        const ratio = data.materialityThreshold / calculated.overallMateriality;

        if (ratio > 1.5) {
          findings.push(createFinding(
            data.engagementId,
            'PCAOB-MAT-001',
            'PCAOB',
            'medium',
            'Planning Materiality May Be Set Too High',
            `Current materiality threshold ($${(data.materialityThreshold / 1000).toFixed(0)}K) is ${(ratio).toFixed(1)}x the calculated benchmark ($${(calculated.overallMateriality / 1000).toFixed(0)}K based on ${calculated.method}). A materiality set too high increases the risk of failing to detect material misstatements.`,
            'AS 2105.05: The auditor should determine materiality for the financial statements as a whole. AS 2105.09: The auditor should determine one or more amounts that are less than materiality for particular classes of transactions.',
            `Consider lowering materiality closer to the calculated benchmark. Calculated benchmarks: Overall materiality: $${(calculated.overallMateriality / 1000).toFixed(0)}K, Performance materiality: $${(calculated.performanceMateriality / 1000).toFixed(0)}K, Trivial threshold: $${(calculated.trivialThreshold / 1000).toFixed(0)}K.`,
            null
          ));
        } else if (ratio < 0.5) {
          findings.push(createFinding(
            data.engagementId,
            'PCAOB-MAT-001a',
            'PCAOB',
            'info',
            'Planning Materiality Is Conservative',
            `Current materiality threshold ($${(data.materialityThreshold / 1000).toFixed(0)}K) is ${(ratio).toFixed(1)}x the calculated benchmark ($${(calculated.overallMateriality / 1000).toFixed(0)}K). While conservative materiality reduces risk, it may lead to over-auditing and increased costs.`,
            'AS 2105.05: The auditor should determine materiality for the financial statements as a whole.',
            'Document the rationale for the conservative materiality level. Consider qualitative factors such as regulatory environment, debt covenants, or prior-period adjustments that may justify a lower threshold.',
            null
          ));
        }
      }

      if (data.materialityThreshold === 0) {
        findings.push(createFinding(
          data.engagementId,
          'PCAOB-MAT-001b',
          'PCAOB',
          'high',
          'Planning Materiality Not Established',
          `No materiality threshold has been set for this engagement. Based on available financial data, the recommended materiality is: Overall: $${(calculated.overallMateriality / 1000).toFixed(0)}K (${calculated.method}), Performance: $${(calculated.performanceMateriality / 1000).toFixed(0)}K, Trivial: $${(calculated.trivialThreshold / 1000).toFixed(0)}K.`,
          'AS 2105.04: The auditor must establish a materiality level for the financial statements as a whole when planning the audit.',
          'Set planning materiality using the recommended benchmark and document the basis. Consider both quantitative and qualitative factors.',
          null
        ));
      }

      return findings;
    },
  },
];
