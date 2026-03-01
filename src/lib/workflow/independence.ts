/**
 * Independence Tracking Module (AU-C 200 / PCAOB Rule 3520)
 *
 * Tracks auditor independence requirements:
 * - Engagement-level independence confirmations
 * - Team member declarations
 * - Non-audit services log
 * - Independence threat assessment
 * - Safeguards documentation
 */

export type ConfirmationType = 'engagement_level' | 'annual' | 'specific_matter';

export type IndependenceThreat =
  | 'self_interest'
  | 'self_review'
  | 'advocacy'
  | 'familiarity'
  | 'intimidation';

export interface IndependenceConfirmation {
  id: string;
  engagementId: string;
  userId: string;
  userName: string;
  confirmationType: ConfirmationType;
  confirmed: boolean;
  threatsIdentified?: string;
  safeguardsApplied?: string;
  nonAuditServices?: string;
  feeArrangement?: string;
  confirmedAt?: string;
}

export interface IndependenceEvaluation {
  confirmations: IndependenceConfirmation[];
  totalMembers: number;
  confirmedMembers: number;
  pendingMembers: number;
  threatsIdentified: boolean;
  safeguardsDocumented: boolean;
  allConfirmed: boolean;
  rationale: string;
}

/**
 * Evaluate independence confirmations for an engagement.
 */
export function evaluateIndependence(
  confirmations: IndependenceConfirmation[],
  totalTeamMembers: number
): IndependenceEvaluation {
  const confirmed = confirmations.filter(c => c.confirmed);
  const pending = totalTeamMembers - confirmed.length;
  const threatsIdentified = confirmations.some(c => c.threatsIdentified && c.threatsIdentified.length > 0);
  const safeguardsDocumented = confirmations
    .filter(c => c.threatsIdentified && c.threatsIdentified.length > 0)
    .every(c => c.safeguardsApplied && c.safeguardsApplied.length > 0);

  const allConfirmed = confirmed.length >= totalTeamMembers && totalTeamMembers > 0;

  let rationale: string;
  if (allConfirmed && (!threatsIdentified || safeguardsDocumented)) {
    rationale = `All ${totalTeamMembers} engagement team members have confirmed independence. ${threatsIdentified ? 'Identified threats have been mitigated with appropriate safeguards.' : 'No independence threats identified.'}`;
  } else if (!allConfirmed) {
    rationale = `${pending} of ${totalTeamMembers} team member(s) have not yet confirmed independence. Independence confirmation must be obtained from all team members before the engagement can proceed.`;
  } else {
    rationale = `Independence threats identified but safeguards have not been adequately documented. Document safeguards for all identified threats before proceeding.`;
  }

  return {
    confirmations,
    totalMembers: totalTeamMembers,
    confirmedMembers: confirmed.length,
    pendingMembers: Math.max(pending, 0),
    threatsIdentified,
    safeguardsDocumented,
    allConfirmed,
    rationale,
  };
}

/**
 * Assess common independence threats.
 */
export function assessIndependenceThreats(params: {
  feesPaid: number;
  totalRevenue: number;
  nonAuditServicesFee: number;
  auditFee: number;
  yearsOnEngagement: number;
  familyRelationships: boolean;
  financialInterests: boolean;
}): Array<{
  threat: IndependenceThreat;
  severity: 'high' | 'medium' | 'low';
  description: string;
  safeguardRequired: boolean;
}> {
  const threats: Array<{
    threat: IndependenceThreat;
    severity: 'high' | 'medium' | 'low';
    description: string;
    safeguardRequired: boolean;
  }> = [];

  // Fee dependence (> 15% of firm revenue from one client)
  if (params.totalRevenue > 0 && params.feesPaid / params.totalRevenue > 0.15) {
    threats.push({
      threat: 'self_interest',
      severity: 'high',
      description: `Client fees represent ${((params.feesPaid / params.totalRevenue) * 100).toFixed(1)}% of firm revenue, exceeding the 15% threshold for fee dependence.`,
      safeguardRequired: true,
    });
  }

  // Non-audit services exceed audit fee
  if (params.nonAuditServicesFee > params.auditFee) {
    threats.push({
      threat: 'self_review',
      severity: 'medium',
      description: `Non-audit service fees ($${params.nonAuditServicesFee.toLocaleString()}) exceed audit fees ($${params.auditFee.toLocaleString()}). Review for self-review threat.`,
      safeguardRequired: true,
    });
  }

  // Long association (> 7 years for partner rotation)
  if (params.yearsOnEngagement > 7) {
    threats.push({
      threat: 'familiarity',
      severity: 'high',
      description: `Engagement partner has served for ${params.yearsOnEngagement} years, exceeding the 7-year rotation requirement.`,
      safeguardRequired: true,
    });
  } else if (params.yearsOnEngagement > 5) {
    threats.push({
      threat: 'familiarity',
      severity: 'medium',
      description: `Engagement partner has served for ${params.yearsOnEngagement} years. Plan for rotation within ${7 - params.yearsOnEngagement} year(s).`,
      safeguardRequired: false,
    });
  }

  // Family relationships
  if (params.familyRelationships) {
    threats.push({
      threat: 'familiarity',
      severity: 'high',
      description: 'Close family relationships exist between engagement team members and client personnel.',
      safeguardRequired: true,
    });
  }

  // Financial interests
  if (params.financialInterests) {
    threats.push({
      threat: 'self_interest',
      severity: 'high',
      description: 'Direct or material indirect financial interests exist in the audit client.',
      safeguardRequired: true,
    });
  }

  return threats;
}
