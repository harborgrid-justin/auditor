/**
 * Continuous Monitoring Dashboard Engine
 *
 * Provides real-time financial health metrics for DoD engagements including
 * fund burn rate, ADA exposure, obligation aging, and reconciliation status.
 *
 * References:
 *   - DoD FMR Vol 3 Ch 8: Budgetary Resources — Monitoring & Execution
 *   - DoD FMR Vol 4 Ch 2: FBWT Reconciliation
 *   - OMB Circular A-123: Internal Control Monitoring
 *   - 31 U.S.C. §1341: Anti-Deficiency Act monitoring
 */

import type { EngagementData } from '@/types/findings';
import type {
  Appropriation,
  Obligation,
  ADAViolation,
  Disbursement,
} from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonitoringSnapshot {
  engagementId: string;
  fiscalYear: number;
  generatedAt: string;
  metrics: {
    fundExecution: FundExecutionMetrics;
    adaExposure: ADAExposureMetrics;
    obligationAging: ObligationAgingMetrics;
    reconciliationHealth: ReconciliationHealthMetrics;
    paymentIntegrity: PaymentIntegrityMetrics;
  };
  alerts: MonitoringAlert[];
}

export interface FundExecutionMetrics {
  totalAuthority: number;
  totalObligated: number;
  totalDisbursed: number;
  unobligatedBalance: number;
  obligationRate: number;
  disbursementRate: number;
  burnRatePerDay: number;
  projectedExhaustionDate: string | null;
  daysOfFundingRemaining: number | null;
  quarterlyBurnRates: { quarter: number; rate: number }[];
}

export interface ADAExposureMetrics {
  activeViolationCount: number;
  totalViolationAmount: number;
  unresolvedViolationCount: number;
  highestRiskAppropriations: {
    appropriationId: string;
    title: string;
    percentObligated: number;
    headroom: number;
  }[];
}

export interface ObligationAgingMetrics {
  totalUnliquidatedObligations: number;
  agingBuckets: {
    bucket: string;
    count: number;
    amount: number;
  }[];
  stalledObligations: {
    obligationId: string;
    amount: number;
    ageDays: number;
    description: string;
  }[];
}

export interface ReconciliationHealthMetrics {
  fbwtReconciled: boolean;
  lastReconciliationDate: string | null;
  unreconciledAmount: number;
  gtasSubmissionStatus: 'current' | 'overdue' | 'unknown';
  trialBalanceBalanced: boolean;
}

export interface PaymentIntegrityMetrics {
  totalPayments: number;
  improperPaymentEstimate: number;
  improperPaymentRate: number;
  overpaymentsRecovered: number;
  recoveryRate: number;
}

export interface MonitoringAlert {
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  description: string;
  metric?: string;
  threshold?: number;
  currentValue?: number;
}

// ---------------------------------------------------------------------------
// Core Functions
// ---------------------------------------------------------------------------

/**
 * Calculate fund burn rate based on obligation and disbursement history.
 */
export function calculateBurnRate(
  appropriations: Appropriation[],
  disbursements: Disbursement[],
  fiscalYear: number,
): { burnRatePerDay: number; quarterlyRates: { quarter: number; rate: number }[] } {
  const fyStart = new Date(`${fiscalYear - 1}-10-01`);
  const now = new Date();
  const daysSinceFyStart = Math.max(
    1,
    Math.floor((now.getTime() - fyStart.getTime()) / (1000 * 60 * 60 * 24)),
  );

  const totalDisbursed = disbursements.reduce((sum, d) => sum + d.amount, 0);
  const burnRatePerDay = totalDisbursed / daysSinceFyStart;

  // Calculate quarterly rates
  const quarterlyRates: { quarter: number; rate: number }[] = [];
  for (let q = 1; q <= 4; q++) {
    const qStart = new Date(fyStart);
    qStart.setMonth(qStart.getMonth() + (q - 1) * 3);
    const qEnd = new Date(qStart);
    qEnd.setMonth(qEnd.getMonth() + 3);

    const qDisbursements = disbursements.filter(d => {
      const date = new Date(d.disbursementDate);
      return date >= qStart && date < qEnd;
    });

    const qDays = Math.min(
      90,
      Math.max(1, Math.floor((Math.min(now.getTime(), qEnd.getTime()) - qStart.getTime()) / (1000 * 60 * 60 * 24))),
    );

    if (now >= qStart) {
      quarterlyRates.push({
        quarter: q,
        rate: qDisbursements.reduce((s, d) => s + d.amount, 0) / qDays,
      });
    }
  }

  return { burnRatePerDay, quarterlyRates };
}

/**
 * Project when funds will be exhausted based on current burn rate.
 */
export function projectFundExhaustion(
  unobligatedBalance: number,
  burnRatePerDay: number,
): { exhaustionDate: string | null; daysRemaining: number | null } {
  if (burnRatePerDay <= 0 || unobligatedBalance <= 0) {
    return { exhaustionDate: null, daysRemaining: null };
  }

  const daysRemaining = Math.floor(unobligatedBalance / burnRatePerDay);
  const exhaustionDate = new Date();
  exhaustionDate.setDate(exhaustionDate.getDate() + daysRemaining);

  return {
    exhaustionDate: exhaustionDate.toISOString().split('T')[0],
    daysRemaining,
  };
}

/**
 * Assess ADA violation exposure across appropriations.
 */
export function getADAExposure(
  appropriations: Appropriation[],
  adaViolations: ADAViolation[],
): ADAExposureMetrics {
  const activeViolations = adaViolations.filter(
    v => v.investigationStatus === 'under_investigation' || v.investigationStatus === 'confirmed',
  );

  const highestRisk = appropriations
    .map(a => ({
      appropriationId: a.id,
      title: a.appropriationTitle,
      percentObligated: a.totalAuthority > 0 ? (a.obligated / a.totalAuthority) * 100 : 0,
      headroom: a.apportioned - a.obligated,
    }))
    .filter(a => a.percentObligated > 80)
    .sort((a, b) => b.percentObligated - a.percentObligated)
    .slice(0, 5);

  return {
    activeViolationCount: activeViolations.length,
    totalViolationAmount: activeViolations.reduce((s, v) => s + v.amount, 0),
    unresolvedViolationCount: activeViolations.filter(
      v => v.investigationStatus === 'under_investigation',
    ).length,
    highestRiskAppropriations: highestRisk,
  };
}

/**
 * Analyze obligation aging (unliquidated obligations).
 */
export function getObligationAgingAlerts(
  obligations: Obligation[],
): ObligationAgingMetrics {
  const now = new Date();
  const ulos = obligations.filter(
    o => o.status === 'open' || o.status === 'partially_liquidated',
  );

  const buckets = [
    { label: '0–30 days', min: 0, max: 30 },
    { label: '31–90 days', min: 31, max: 90 },
    { label: '91–180 days', min: 91, max: 180 },
    { label: '181–365 days', min: 181, max: 365 },
    { label: '> 365 days', min: 366, max: Infinity },
  ];

  const agingBuckets = buckets.map(b => {
    const matching = ulos.filter(o => {
      const age = Math.floor(
        (now.getTime() - new Date(o.obligatedDate).getTime()) / (1000 * 60 * 60 * 24),
      );
      return age >= b.min && age <= b.max;
    });
    return {
      bucket: b.label,
      count: matching.length,
      amount: matching.reduce((s, o) => s + o.unliquidatedBalance, 0),
    };
  });

  // Flag stalled obligations (> 180 days with no disbursement activity)
  const stalledObligations = ulos
    .filter(o => {
      const age = Math.floor(
        (now.getTime() - new Date(o.obligatedDate).getTime()) / (1000 * 60 * 60 * 24),
      );
      return age > 180 && o.liquidatedAmount === 0;
    })
    .map(o => ({
      obligationId: o.id,
      amount: o.amount,
      ageDays: Math.floor(
        (now.getTime() - new Date(o.obligatedDate).getTime()) / (1000 * 60 * 60 * 24),
      ),
      description: o.vendorOrPayee || 'No description',
    }))
    .slice(0, 20);

  return {
    totalUnliquidatedObligations: ulos.reduce((s, o) => s + o.unliquidatedBalance, 0),
    agingBuckets,
    stalledObligations,
  };
}

/**
 * Generate a full monitoring snapshot for an engagement.
 */
export function generateMonitoringSnapshot(data: EngagementData): MonitoringSnapshot {
  const dodData = data.dodData;
  const fy = data.taxYear;
  const alerts: MonitoringAlert[] = [];

  const appropriations = dodData?.appropriations ?? [];
  const obligations = dodData?.obligations ?? [];
  const disbursements = dodData?.disbursements ?? [];
  const adaViolations = dodData?.adaViolations ?? [];

  // --- Fund Execution ---
  const totalAuthority = appropriations.reduce((s, a) => s + a.totalAuthority, 0);
  const totalObligated = appropriations.reduce((s, a) => s + a.obligated, 0);
  const totalDisbursed = appropriations.reduce((s, a) => s + a.disbursed, 0);
  const unobligatedBalance = totalAuthority - totalObligated;

  const { burnRatePerDay, quarterlyRates } = calculateBurnRate(
    appropriations,
    disbursements,
    fy,
  );
  const { exhaustionDate, daysRemaining } = projectFundExhaustion(
    unobligatedBalance,
    burnRatePerDay,
  );

  const fundExecution: FundExecutionMetrics = {
    totalAuthority,
    totalObligated,
    totalDisbursed,
    unobligatedBalance,
    obligationRate: totalAuthority > 0 ? (totalObligated / totalAuthority) * 100 : 0,
    disbursementRate: totalObligated > 0 ? (totalDisbursed / totalObligated) * 100 : 0,
    burnRatePerDay,
    projectedExhaustionDate: exhaustionDate,
    daysOfFundingRemaining: daysRemaining,
    quarterlyBurnRates: quarterlyRates,
  };

  // Alert: funds projected to exhaust within 60 days
  if (daysRemaining !== null && daysRemaining < 60) {
    alerts.push({
      severity: daysRemaining < 30 ? 'critical' : 'warning',
      category: 'Fund Execution',
      title: 'Fund Exhaustion Warning',
      description: `Funds projected to exhaust in ${daysRemaining} days (${exhaustionDate})`,
      metric: 'daysOfFundingRemaining',
      threshold: 60,
      currentValue: daysRemaining,
    });
  }

  // Alert: obligation rate > 95%
  if (fundExecution.obligationRate > 95) {
    alerts.push({
      severity: fundExecution.obligationRate > 99 ? 'critical' : 'warning',
      category: 'Fund Execution',
      title: 'High Obligation Rate',
      description: `${fundExecution.obligationRate.toFixed(1)}% of total authority is obligated`,
      metric: 'obligationRate',
      threshold: 95,
      currentValue: fundExecution.obligationRate,
    });
  }

  // --- ADA Exposure ---
  const adaExposure = getADAExposure(appropriations, adaViolations);

  if (adaExposure.unresolvedViolationCount > 0) {
    alerts.push({
      severity: 'critical',
      category: 'ADA Compliance',
      title: 'Unresolved ADA Violations',
      description: `${adaExposure.unresolvedViolationCount} ADA violation(s) under investigation. Total amount: $${adaExposure.totalViolationAmount.toLocaleString()}`,
      metric: 'unresolvedViolationCount',
      currentValue: adaExposure.unresolvedViolationCount,
    });
  }

  // --- Obligation Aging ---
  const obligationAging = getObligationAgingAlerts(obligations);

  if (obligationAging.stalledObligations.length > 0) {
    alerts.push({
      severity: 'warning',
      category: 'Obligation Management',
      title: 'Stalled Unliquidated Obligations',
      description: `${obligationAging.stalledObligations.length} obligation(s) older than 180 days with no disbursement activity`,
      metric: 'stalledObligations',
      currentValue: obligationAging.stalledObligations.length,
    });
  }

  // --- Reconciliation Health ---
  const reconciliationHealth: ReconciliationHealthMetrics = {
    fbwtReconciled: true, // Populated from FBWT engine in production
    lastReconciliationDate: null,
    unreconciledAmount: 0,
    gtasSubmissionStatus: 'unknown',
    trialBalanceBalanced: true,
  };

  // --- Payment Integrity ---
  const paymentIntegrity: PaymentIntegrityMetrics = {
    totalPayments: disbursements.length,
    improperPaymentEstimate: 0,
    improperPaymentRate: 0,
    overpaymentsRecovered: 0,
    recoveryRate: 0,
  };

  return {
    engagementId: data.engagementId ?? '',
    fiscalYear: fy,
    generatedAt: new Date().toISOString(),
    metrics: {
      fundExecution,
      adaExposure,
      obligationAging,
      reconciliationHealth,
      paymentIntegrity,
    },
    alerts,
  };
}
