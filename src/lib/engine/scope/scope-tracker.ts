/**
 * Scope Limitation Tracker (AU-C 705)
 *
 * Tracks audit scope limitations and evaluates their impact on the opinion.
 * A scope limitation occurs when the auditor is unable to obtain sufficient
 * appropriate audit evidence.
 */

export type ScopeImposedBy = 'client' | 'circumstance';

export interface ScopeLimitation {
  id: string;
  engagementId: string;
  description: string;
  accountsAffected: string;
  estimatedImpact: number | null;
  pervasive: boolean;
  imposedBy: ScopeImposedBy;
  resolved: boolean;
  resolutionNotes?: string;
  identifiedBy: string;
  identifiedAt: string;
}

export type ScopeOpinionImpact = 'none' | 'qualified' | 'disclaimer';

export interface ScopeEvaluation {
  limitations: ScopeLimitation[];
  unresolvedCount: number;
  clientImposedCount: number;
  circumstantialCount: number;
  pervasiveCount: number;
  totalEstimatedImpact: number;
  opinionImpact: ScopeOpinionImpact;
  rationale: string;
}

/**
 * Evaluate scope limitations and determine their impact on the audit opinion.
 *
 * Per AU-C 705:
 * - Material but not pervasive → Qualified opinion
 * - Material AND pervasive → Disclaimer of opinion
 * - No unresolved limitations → No impact
 */
export function evaluateScopeLimitations(
  limitations: ScopeLimitation[],
  materialityThreshold: number
): ScopeEvaluation {
  const unresolved = limitations.filter(l => !l.resolved);
  const clientImposed = unresolved.filter(l => l.imposedBy === 'client');
  const circumstantial = unresolved.filter(l => l.imposedBy === 'circumstance');
  const pervasive = unresolved.filter(l => l.pervasive);

  const totalEstimatedImpact = unresolved.reduce(
    (sum, l) => sum + (l.estimatedImpact ?? 0),
    0
  );

  let opinionImpact: ScopeOpinionImpact;
  let rationale: string;

  if (unresolved.length === 0) {
    opinionImpact = 'none';
    rationale = 'No unresolved scope limitations. The audit was performed without restriction.';
  } else if (pervasive.length > 0 || (totalEstimatedImpact > materialityThreshold * 3 && unresolved.length >= 3)) {
    // Pervasive limitations or very large aggregate impact
    opinionImpact = 'disclaimer';
    rationale = `${unresolved.length} unresolved scope limitation(s) identified, ${pervasive.length} of which are pervasive to the financial statements. The possible effects are both material and pervasive. A disclaimer of opinion is required because insufficient appropriate audit evidence has been obtained to form an opinion.`;
  } else if (totalEstimatedImpact > materialityThreshold || clientImposed.length > 0) {
    // Material but not pervasive
    opinionImpact = 'qualified';
    rationale = `${unresolved.length} unresolved scope limitation(s) identified with estimated impact of $${Math.round(totalEstimatedImpact).toLocaleString()}${clientImposed.length > 0 ? ` (${clientImposed.length} client-imposed)` : ''}. The possible effects are material but not pervasive. A qualified opinion is required.`;
  } else {
    opinionImpact = 'none';
    rationale = `${unresolved.length} scope limitation(s) identified but estimated impact of $${Math.round(totalEstimatedImpact).toLocaleString()} is below materiality threshold of $${Math.round(materialityThreshold).toLocaleString()}. No modification to the opinion is required.`;
  }

  return {
    limitations: unresolved,
    unresolvedCount: unresolved.length,
    clientImposedCount: clientImposed.length,
    circumstantialCount: circumstantial.length,
    pervasiveCount: pervasive.length,
    totalEstimatedImpact,
    opinionImpact,
    rationale,
  };
}
