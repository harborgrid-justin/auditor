import type { AuditRule, AuditFinding } from '@/types/findings';
import { createFinding } from '../../rule-runner';

export const icfrRules: AuditRule[] = [
  {
    id: 'PCAOB-IC-001',
    name: 'Control Deficiency Aggregation',
    framework: 'PCAOB',
    category: 'ICFR (AS 2201)',
    description: 'Evaluates whether individual control deficiencies aggregate to a material weakness',
    citation: 'AS 2201.62-70 - Evaluating identified deficiencies',
    defaultSeverity: 'high',
    enabled: true,
    check: (data) => {
      const findings: AuditFinding[] = [];

      const deficientControls = data.soxControls.filter(c =>
        c.status === 'deficient' || c.status === 'significant_deficiency'
      );

      if (deficientControls.length >= 2) {
        const affectedAssertions = new Set<string>();
        deficientControls.forEach(c => {
          const assertions = Array.isArray(c.assertion) ? c.assertion : (() => { try { return JSON.parse(c.assertion as unknown as string); } catch { return []; } })();
          assertions.forEach((a: string) => affectedAssertions.add(a));
        });

        const highRiskDeficiencies = deficientControls.filter(c => c.riskLevel === 'high');

        if (highRiskDeficiencies.length >= 2 || deficientControls.length >= 3) {
          findings.push(createFinding(
            data.engagementId,
            'PCAOB-IC-001',
            'PCAOB',
            'high',
            'Control Deficiencies May Aggregate to Material Weakness',
            `${deficientControls.length} control deficiencies identified (${highRiskDeficiencies.length} high-risk), affecting ${affectedAssertions.size} management assertions: ${Array.from(affectedAssertions).join(', ')}. Deficient controls: ${deficientControls.map(c => `${c.controlId} - ${c.title}`).join('; ')}. Per AS 2201, individually insignificant deficiencies may aggregate to a significant deficiency or material weakness.`,
            'AS 2201.69-70: The auditor should evaluate whether control deficiencies, individually or in combination, are material weaknesses. The severity depends on the magnitude of the potential misstatement and the likelihood of occurrence.',
            'Evaluate the combined effect of all deficiencies on financial statement assertions. Consider whether compensating controls mitigate the combined risk. Document the aggregation analysis including the magnitude and likelihood assessment.',
            null
          ));
        }
      }

      return findings;
    },
  },
];
