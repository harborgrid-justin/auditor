import type { AuditFinding, Severity } from '@/types/findings';
import type { SOXControl } from '@/types/sox';

export interface RiskScoreBreakdown {
  overallScore: number;
  gaapScore: number;
  irsScore: number;
  soxScore: number;
  pcaobScore: number;
  financialStatementRisk: number;
  controlEnvironmentRisk: number;
  fraudRisk: number;
  factors: RiskFactor[];
}

export interface RiskFactor {
  name: string;
  category: string;
  weight: number;
  score: number;
  description: string;
}

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
  info: 1,
};

export function calculateRiskScore(
  findings: AuditFinding[],
  controls: SOXControl[],
  materialityThreshold: number
): RiskScoreBreakdown {
  const factors: RiskFactor[] = [];

  // GAAP findings risk
  const gaapFindings = findings.filter(f => f.framework === 'GAAP');
  const gaapScore = calculateFrameworkScore(gaapFindings, materialityThreshold);
  factors.push({
    name: 'GAAP Compliance',
    category: 'gaap',
    weight: 0.30,
    score: gaapScore,
    description: `${gaapFindings.length} findings identified across ${new Set(gaapFindings.map(f => f.ruleId)).size} rule categories`,
  });

  // IRS findings risk
  const irsFindings = findings.filter(f => f.framework === 'IRS');
  const irsScore = calculateFrameworkScore(irsFindings, materialityThreshold);
  factors.push({
    name: 'Tax Compliance',
    category: 'irs',
    weight: 0.20,
    score: irsScore,
    description: `${irsFindings.length} tax-related findings`,
  });

  // SOX control environment
  const soxScore = calculateSOXScore(controls, findings.filter(f => f.framework === 'SOX'));
  factors.push({
    name: 'Internal Controls (SOX)',
    category: 'sox',
    weight: 0.30,
    score: soxScore,
    description: `${controls.filter(c => c.status === 'material_weakness').length} material weaknesses, ${controls.filter(c => c.status === 'deficient' || c.status === 'significant_deficiency').length} deficiencies`,
  });

  // PCAOB audit risk
  const pcaobFindings = findings.filter(f => f.framework === 'PCAOB');
  const pcaobScore = calculateFrameworkScore(pcaobFindings, materialityThreshold);
  factors.push({
    name: 'Audit Standards (PCAOB)',
    category: 'pcaob',
    weight: 0.20,
    score: pcaobScore,
    description: `${pcaobFindings.length} audit standard findings`,
  });

  // Financial statement risk factors
  const materialFindings = findings.filter(f =>
    f.amountImpact !== null && Math.abs(f.amountImpact) >= materialityThreshold
  );
  const fsRisk = materialFindings.length > 0
    ? Math.min(100, materialFindings.length * 20)
    : Math.min(100, findings.filter(f => f.severity === 'critical' || f.severity === 'high').length * 10);

  // Control environment risk
  const controlRisk = controls.length === 0
    ? 80
    : Math.min(100, (controls.filter(c => c.status !== 'effective').length / Math.max(controls.length, 1)) * 100);

  // Fraud risk indicators
  const fraudIndicators = findings.filter(f =>
    f.ruleId.includes('fraud') || f.ruleId.includes('unusual') ||
    f.ruleId.includes('override') || f.ruleId.includes('benford')
  );
  const fraudRisk = Math.min(100, fraudIndicators.length * 15);

  const overallScore = Math.round(
    factors.reduce((sum, f) => sum + f.score * f.weight, 0)
  );

  return {
    overallScore: Math.min(100, overallScore),
    gaapScore,
    irsScore,
    soxScore,
    pcaobScore,
    financialStatementRisk: fsRisk,
    controlEnvironmentRisk: controlRisk,
    fraudRisk,
    factors,
  };
}

function calculateFrameworkScore(findings: AuditFinding[], materialityThreshold: number): number {
  if (findings.length === 0) return 5; // Small baseline risk

  let score = 0;
  for (const finding of findings) {
    score += SEVERITY_WEIGHTS[finding.severity];
    if (finding.amountImpact && Math.abs(finding.amountImpact) >= materialityThreshold) {
      score += 10; // Extra weight for material amounts
    }
  }

  return Math.min(100, score);
}

function calculateSOXScore(controls: SOXControl[], soxFindings: AuditFinding[]): number {
  if (controls.length === 0) return 75; // High risk when no controls documented

  let score = 0;
  const materialWeaknesses = controls.filter(c => c.status === 'material_weakness').length;
  const significantDeficiencies = controls.filter(c => c.status === 'significant_deficiency').length;
  const deficiencies = controls.filter(c => c.status === 'deficient').length;
  const notTested = controls.filter(c => c.status === 'not_tested').length;

  score += materialWeaknesses * 30;
  score += significantDeficiencies * 15;
  score += deficiencies * 8;
  score += notTested * 5;

  // SOX-specific findings
  for (const finding of soxFindings) {
    score += SEVERITY_WEIGHTS[finding.severity];
  }

  return Math.min(100, score);
}

export function getRiskLevel(score: number): 'low' | 'moderate' | 'elevated' | 'high' | 'critical' {
  if (score <= 15) return 'low';
  if (score <= 35) return 'moderate';
  if (score <= 55) return 'elevated';
  if (score <= 75) return 'high';
  return 'critical';
}

export function getRiskColor(score: number): string {
  if (score <= 15) return '#22c55e';
  if (score <= 35) return '#3b82f6';
  if (score <= 55) return '#eab308';
  if (score <= 75) return '#f97316';
  return '#ef4444';
}
