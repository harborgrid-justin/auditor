/**
 * Unliquidated Obligation (ULO) Review Automation Engine
 *
 * Generates ULO review packages, tracks certification responses, and
 * produces quarterly review reports. Aged ULOs are a major audit issue
 * for DoD — this engine drives the review-certify-deobligate process.
 *
 * References:
 *   - DoD FMR Vol 3, Ch 8: Obligation and Expenditure Policy
 *   - OMB Circular A-11, Section 130: ULO Reviews
 *   - 31 U.S.C. §1554: Expired Appropriation Adjustments
 */

import type { EngagementData } from '@/types/findings';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { Obligation, Appropriation } from '@/types/dod-fmr';
import { getParameter } from '@/lib/engine/tax-parameters/registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ULOReviewPackage {
  fiscalYear: number;
  generatedDate: string;
  appropriationId: string;
  treasuryAccountSymbol: string;
  obligations: ULOReviewItem[];
  totalULOAmount: number;
  totalObligationsReviewed: number;
  ageBracketSummary: Record<string, { count: number; amount: number }>;
}

export interface ULOReviewItem {
  obligationId: string;
  obligationNumber: string;
  vendorOrPayee: string;
  originalAmount: number;
  unliquidatedBalance: number;
  obligatedDate: string;
  ageInDays: number;
  ageBracket: '0-90' | '91-180' | '181-365' | '366-730' | 'over_730';
  recommendedAction: 'valid' | 'deobligate' | 'adjust' | 'review_needed';
  reviewStatus: 'pending' | 'certified_valid' | 'certified_deobligate' | 'certified_adjust';
  programManager?: string;
  lastReviewDate?: string;
}

export interface ULOReviewResult {
  fiscalYear: number;
  totalULOs: number;
  totalULOAmount: number;
  reviewPackages: ULOReviewPackage[];
  deobligationTarget: number;
  potentialDeobligations: number;
  findings: ULOFinding[];
  quarterlyReport: ULOQuarterlyReport;
}

export interface ULOFinding {
  findingType: 'stale_ulo' | 'no_review' | 'expired_appropriation' | 'excessive_aging' | 'review_overdue';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  obligationId: string;
  amount: number;
}

export interface ULOQuarterlyReport {
  fiscalYear: number;
  quarter: number;
  totalULOs: number;
  totalAmount: number;
  reviewedCount: number;
  validCount: number;
  deobligatedCount: number;
  deobligatedAmount: number;
  adjustedCount: number;
  pendingCount: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysBetween(d1: string, d2: Date): number {
  const start = new Date(d1);
  return Math.floor((d2.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function getAgeBracket(days: number): ULOReviewItem['ageBracket'] {
  if (days <= 90) return '0-90';
  if (days <= 180) return '91-180';
  if (days <= 365) return '181-365';
  if (days <= 730) return '366-730';
  return 'over_730';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate ULO review packages and analysis from engagement data.
 */
export function generateULOReview(data: EngagementData): ULOReviewResult {
  const dodData = data.dodData;
  if (!dodData) {
    return emptyResult(data.taxYear);
  }

  const obligations = dodData.obligations ?? [];
  const appropriations = dodData.appropriations ?? [];
  const now = new Date();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const reviewDaysThreshold = getParameter('DOD_ULO_REVIEW_DAYS', data.taxYear, undefined, 180);
  const staleDaysThreshold = getParameter('DOD_STALE_OBLIGATION_DAYS', data.taxYear, undefined, 365);

  // Filter to unliquidated obligations
  const ulos = obligations.filter(
    o => o.status === 'open' || o.status === 'partially_liquidated'
  ).filter(o => o.unliquidatedBalance > 0);

  const findings: ULOFinding[] = [];
  const packageMap = new Map<string, ULOReviewPackage>();

  // Build appropriation lookup
  const appnMap = new Map(appropriations.map(a => [a.id, a]));

  for (const ulo of ulos) {
    const age = daysBetween(ulo.obligatedDate, now);
    const bracket = getAgeBracket(age);
    const appn = appnMap.get(ulo.appropriationId);

    // Determine recommended action
    let recommendedAction: ULOReviewItem['recommendedAction'] = 'review_needed';
    if (age > staleDaysThreshold * 2) {
      recommendedAction = 'deobligate';
    } else if (age > staleDaysThreshold) {
      recommendedAction = 'review_needed';
    } else if (age <= 90) {
      recommendedAction = 'valid';
    }

    const item: ULOReviewItem = {
      obligationId: ulo.id,
      obligationNumber: ulo.obligationNumber,
      vendorOrPayee: ulo.vendorOrPayee ?? 'Unknown',
      originalAmount: ulo.amount,
      unliquidatedBalance: ulo.unliquidatedBalance,
      obligatedDate: ulo.obligatedDate,
      ageInDays: age,
      ageBracket: bracket,
      recommendedAction,
      reviewStatus: 'pending',
    };

    // Group by appropriation
    if (!packageMap.has(ulo.appropriationId)) {
      packageMap.set(ulo.appropriationId, {
        fiscalYear: data.taxYear,
        generatedDate: now.toISOString(),
        appropriationId: ulo.appropriationId,
        treasuryAccountSymbol: appn?.treasuryAccountSymbol ?? 'Unknown',
        obligations: [],
        totalULOAmount: 0,
        totalObligationsReviewed: 0,
        ageBracketSummary: {},
      });
    }

    const pkg = packageMap.get(ulo.appropriationId)!;
    pkg.obligations.push(item);
    pkg.totalULOAmount += ulo.unliquidatedBalance;

    // Findings for aged obligations
    if (age > staleDaysThreshold) {
      findings.push({
        findingType: 'stale_ulo',
        severity: age > staleDaysThreshold * 2 ? 'high' : 'medium',
        description: `Obligation ${ulo.obligationNumber} is ${age} days old with ` +
          `$${ulo.unliquidatedBalance.toLocaleString()} unliquidated balance. ` +
          `Exceeds stale threshold of ${staleDaysThreshold} days.`,
        obligationId: ulo.id,
        amount: ulo.unliquidatedBalance,
      });
    }

    // Check for expired appropriation ULOs
    if (appn?.status === 'expired') {
      findings.push({
        findingType: 'expired_appropriation',
        severity: 'high',
        description: `Obligation ${ulo.obligationNumber} ($${ulo.unliquidatedBalance.toLocaleString()}) ` +
          `is against expired appropriation ${appn.treasuryAccountSymbol}. ` +
          `Review for deobligation per 31 U.S.C. §1554.`,
        obligationId: ulo.id,
        amount: ulo.unliquidatedBalance,
      });
    }

    // Check for excessive aging (>2 years)
    if (age > 730) {
      findings.push({
        findingType: 'excessive_aging',
        severity: 'critical',
        description: `Obligation ${ulo.obligationNumber} is over 2 years old (${age} days). ` +
          `$${ulo.unliquidatedBalance.toLocaleString()} should be reviewed for immediate deobligation.`,
        obligationId: ulo.id,
        amount: ulo.unliquidatedBalance,
      });
    }
  }

  // Finalize packages with bracket summaries
  const reviewPackages = Array.from(packageMap.values());
  for (const pkg of reviewPackages) {
    const brackets: Record<string, { count: number; amount: number }> = {};
    for (const item of pkg.obligations) {
      if (!brackets[item.ageBracket]) brackets[item.ageBracket] = { count: 0, amount: 0 };
      brackets[item.ageBracket].count++;
      brackets[item.ageBracket].amount += item.unliquidatedBalance;
    }
    pkg.ageBracketSummary = brackets;
  }

  const totalAmount = ulos.reduce((s, u) => s + u.unliquidatedBalance, 0);
  const potentialDeobs = ulos
    .filter(u => daysBetween(u.obligatedDate, now) > staleDaysThreshold)
    .reduce((s, u) => s + u.unliquidatedBalance, 0);

  // Current quarter determination (federal FY starts Oct 1)
  const month = now.getMonth() + 1;
  let quarter: number;
  if (month >= 10) quarter = 1;
  else if (month >= 1 && month <= 3) quarter = 2;
  else if (month >= 4 && month <= 6) quarter = 3;
  else quarter = 4;

  return {
    fiscalYear: data.taxYear,
    totalULOs: ulos.length,
    totalULOAmount: Math.round(totalAmount * 100) / 100,
    reviewPackages,
    deobligationTarget: Math.round(totalAmount * 0.1 * 100) / 100, // 10% reduction target
    potentialDeobligations: Math.round(potentialDeobs * 100) / 100,
    findings,
    quarterlyReport: {
      fiscalYear: data.taxYear,
      quarter,
      totalULOs: ulos.length,
      totalAmount: Math.round(totalAmount * 100) / 100,
      reviewedCount: 0,
      validCount: 0,
      deobligatedCount: 0,
      deobligatedAmount: 0,
      adjustedCount: 0,
      pendingCount: ulos.length,
    },
  };
}

function emptyResult(fy: number): ULOReviewResult {
  return {
    fiscalYear: fy,
    totalULOs: 0,
    totalULOAmount: 0,
    reviewPackages: [],
    deobligationTarget: 0,
    potentialDeobligations: 0,
    findings: [],
    quarterlyReport: {
      fiscalYear: fy,
      quarter: 1,
      totalULOs: 0,
      totalAmount: 0,
      reviewedCount: 0,
      validCount: 0,
      deobligatedCount: 0,
      deobligatedAmount: 0,
      adjustedCount: 0,
      pendingCount: 0,
    },
  };
}
