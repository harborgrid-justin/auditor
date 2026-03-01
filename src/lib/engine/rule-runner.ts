import type { AuditRule, AuditFinding, EngagementData, AnalysisResult, Framework } from '@/types/findings';
import { v4 as uuid } from 'uuid';

export function runRules(rules: AuditRule[], data: EngagementData): AnalysisResult {
  const startTime = Date.now();
  const allFindings: AuditFinding[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    try {
      const findings = rule.check(data);
      allFindings.push(...findings);
    } catch (error) {
      console.error(`Rule ${rule.id} failed:`, error);
    }
  }

  const executionTimeMs = Date.now() - startTime;

  return {
    framework: rules[0]?.framework || 'GAAP',
    totalRulesRun: rules.filter(r => r.enabled).length,
    totalFindings: allFindings.length,
    criticalCount: allFindings.filter(f => f.severity === 'critical').length,
    highCount: allFindings.filter(f => f.severity === 'high').length,
    mediumCount: allFindings.filter(f => f.severity === 'medium').length,
    lowCount: allFindings.filter(f => f.severity === 'low').length,
    infoCount: allFindings.filter(f => f.severity === 'info').length,
    findings: allFindings,
    executionTimeMs,
  };
}

export function createFinding(
  engagementId: string,
  ruleId: string,
  framework: Framework,
  severity: AuditFinding['severity'],
  title: string,
  description: string,
  citation: string,
  remediation: string,
  amountImpact: number | null = null,
  affectedAccounts: string[] = []
): AuditFinding {
  return {
    id: uuid(),
    engagementId,
    ruleId,
    framework,
    severity,
    title,
    description,
    citation,
    remediation,
    amountImpact,
    affectedAccounts,
    status: 'open',
    createdAt: new Date().toISOString(),
  };
}
