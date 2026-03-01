/**
 * PIIA (Payment Integrity Information Act) Automated Sampling & Estimation Engine
 *
 * Implements automated statistical sampling, improper payment rate estimation,
 * root cause analysis, corrective action plan tracking, and Do Not Pay
 * integration for PIIA compliance.
 *
 * The Payment Integrity Information Act (P.L. 116-117) requires federal
 * agencies to:
 *   1. Identify programs susceptible to significant improper payments
 *   2. Estimate improper payment rates through statistical sampling
 *   3. Report improper payment information annually
 *   4. Develop corrective action plans for non-compliant programs
 *   5. Cross-check payees against Treasury's Do Not Pay portal
 *
 * OMB defines "significant" improper payments as:
 *   - Both 1.5% of program outlays AND $10 million, OR
 *   - $100 million regardless of rate
 *
 * Root cause categories per OMB M-21-19:
 *   1. Insufficient documentation to determine payment accuracy
 *   2. Authentication / medical necessity / eligibility errors
 *   3. Processing errors (federal agency or pass-through entity)
 *   4. Verification errors
 *   5. Administrative / documentation errors
 *   6. Medical necessity errors
 *   7. Other reason
 *
 * References:
 *   - P.L. 116-117, Payment Integrity Information Act of 2019
 *   - OMB M-21-19, Appendix C to Circular A-123
 *   - OMB Circular A-123, Appendix C (Requirements for Payment Integrity)
 *   - OMB Circular A-136, Section II.4 (Improper Payment Reporting)
 *   - DoD FMR Vol. 5, Ch. 6 (Certifying Officers)
 *   - DoD FMR Vol. 10, Ch. 18 (Improper Payments)
 *   - 31 U.S.C. Section 3354 (Do Not Pay Initiative)
 */

import type {
  Disbursement,
  Obligation,
  ContractPayment,
  MilitaryPayRecord,
  CivilianPayRecord,
  DoDEngagementData,
} from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types — Payment Population
// ---------------------------------------------------------------------------

/** Union of all payment record types eligible for PIIA sampling. */
export type PaymentRecord =
  | Disbursement
  | ContractPayment
  | MilitaryPayRecord
  | CivilianPayRecord;

/** Discriminator for payment record origin. */
export type PaymentStreamType =
  | 'disbursement'
  | 'contract_payment'
  | 'military_pay'
  | 'civilian_pay';

/** A single payment tagged with its stream type and dollar amount. */
export interface TaggedPayment {
  record: PaymentRecord;
  streamType: PaymentStreamType;
  amount: number;
}

// ---------------------------------------------------------------------------
// Types — Statistical Sampling
// ---------------------------------------------------------------------------

/** Methodology used for sample selection. */
export type SamplingMethodology =
  | 'simple_random'
  | 'stratified_random'
  | 'monetary_unit';

/** Input configuration for a sampling engagement. */
export interface SamplingParameters {
  /** Total population of payments to sample from. */
  population: TaggedPayment[];
  /** Desired number of items in the sample. */
  sampleSize: number;
  /** Confidence level as a decimal (e.g. 0.95 for 95%). */
  confidenceLevel: number;
  /** Methodology (defaults to simple_random). */
  methodology?: SamplingMethodology;
}

/** Result of a statistical sampling operation. */
export interface SamplingResult {
  id: string;
  /** Selected sample items. */
  sample: TaggedPayment[];
  /** Population size at time of sampling. */
  populationSize: number;
  /** Actual sample size drawn. */
  sampleSize: number;
  /** Confidence level used. */
  confidenceLevel: number;
  /** Methodology applied. */
  methodology: SamplingMethodology;
  /** Random seed used (for reproducibility). */
  seed: number;
  /** ISO-8601 timestamp of sampling event. */
  sampledAt: string;
}

// ---------------------------------------------------------------------------
// Types — Improper Payment Estimation
// ---------------------------------------------------------------------------

/** Classification of an individual sample item after review. */
export type SampleItemDisposition =
  | 'proper'
  | 'improper_overpayment'
  | 'improper_underpayment'
  | 'improper_duplicate'
  | 'improper_ineligible'
  | 'improper_documentation'
  | 'improper_other';

/** A reviewed sample item with disposition. */
export interface ReviewedSampleItem {
  payment: TaggedPayment;
  disposition: SampleItemDisposition;
  /** Dollar amount of the improper portion (0 if proper). */
  improperAmount: number;
  /** Free-text explanation. */
  reviewNotes: string;
}

/** Statistical estimate of the improper payment rate. */
export interface ImproperPaymentEstimate {
  id: string;
  /** Point estimate of the improper payment rate (0-100). */
  pointEstimateRate: number;
  /** Lower bound of the confidence interval. */
  lowerBound: number;
  /** Upper bound of the confidence interval. */
  upperBound: number;
  /** Confidence level (e.g. 0.95). */
  confidenceLevel: number;
  /** Total dollar value of sampled payments. */
  sampleDollarTotal: number;
  /** Dollar value of improper payments in sample. */
  improperDollarTotal: number;
  /** Projected dollar value of improper payments in population. */
  projectedImproperAmount: number;
  /** Whether the program exceeds OMB significance thresholds. */
  isSignificant: boolean;
  /** Number of sample items reviewed. */
  sampleItemsReviewed: number;
  /** Number of improper items found. */
  improperItemsFound: number;
  /** ISO-8601 timestamp. */
  estimatedAt: string;
}

// ---------------------------------------------------------------------------
// Types — Root Cause Analysis
// ---------------------------------------------------------------------------

/**
 * Seven root cause categories per OMB M-21-19.
 */
export type RootCauseCategory =
  | 'insufficient_documentation'
  | 'authentication_eligibility'
  | 'processing_error'
  | 'verification_error'
  | 'administrative_error'
  | 'medical_necessity'
  | 'other';

/** Root cause breakdown for a set of improper payments. */
export interface RootCauseAnalysis {
  id: string;
  /** Category tallies. */
  categories: RootCauseCategoryResult[];
  /** Total improper payment amount analyzed. */
  totalImproperAmount: number;
  /** Total improper payment count analyzed. */
  totalImproperCount: number;
  /** The dominant root cause. */
  primaryRootCause: RootCauseCategory;
  /** ISO-8601 timestamp. */
  analyzedAt: string;
}

/** Summary for a single root cause category. */
export interface RootCauseCategoryResult {
  category: RootCauseCategory;
  count: number;
  amount: number;
  percentage: number;
}

// ---------------------------------------------------------------------------
// Types — Corrective Action Plan
// ---------------------------------------------------------------------------

export type CAPMilestoneStatus = 'not_started' | 'in_progress' | 'completed' | 'overdue';

export interface CAPMilestone {
  id: string;
  description: string;
  targetDate: string;
  completedDate?: string;
  status: CAPMilestoneStatus;
  responsibleParty: string;
}

export type CAPStatus = 'draft' | 'active' | 'in_progress' | 'completed' | 'overdue';

export interface CorrectiveActionPlanRecord {
  id: string;
  programName: string;
  fiscalYear: number;
  rootCauseCategory: RootCauseCategory;
  description: string;
  milestones: CAPMilestone[];
  status: CAPStatus;
  targetCompletionDate: string;
  actualCompletionDate?: string;
  percentComplete: number;
  responsibleOfficial: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Types — Do Not Pay
// ---------------------------------------------------------------------------

/** Databases checked in the Do Not Pay portal. */
export type DNPDatabase =
  | 'death_master_file'
  | 'sam_exclusions'
  | 'debtor_file'
  | 'incarceration_records'
  | 'ssa_records';

/** Result of a single database check. */
export interface DNPDatabaseResult {
  database: DNPDatabase;
  matched: boolean;
  matchDetails?: string;
  checkedAt: string;
}

/** Overall result from a Do Not Pay check. */
export interface DoNotPayCheckResult {
  id: string;
  payeeId: string;
  payeeName: string;
  payeeTIN?: string;
  overallResult: 'clear' | 'match_found' | 'review_required';
  databaseResults: DNPDatabaseResult[];
  /** Whether payment should be suspended. */
  suspendPayment: boolean;
  checkedAt: string;
}

// ---------------------------------------------------------------------------
// Types — PIIA Report
// ---------------------------------------------------------------------------

export interface PIIAProgramBreakdown {
  programName: string;
  outlays: number;
  improperPaymentAmount: number;
  improperPaymentRate: number;
  isSignificant: boolean;
  rootCauseAnalysis: RootCauseAnalysis | null;
  correctiveActionPlan: CorrectiveActionPlanRecord | null;
  priorYearRate: number | null;
  reductionTarget: number | null;
}

export interface PIIAReportData {
  id: string;
  fiscalYear: number;
  agencyName: string;
  reportDate: string;
  programs: PIIAProgramBreakdown[];
  agencyWideImproperPaymentAmount: number;
  agencyWideImproperPaymentRate: number;
  agencyWideOutlays: number;
  doNotPayUtilization: boolean;
  recaptureAuditsConducted: boolean;
  recoveredAmounts: number;
  piiaCompliant: boolean;
  complianceDeficiencies: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** OMB significance threshold: rate must be at or above 1.5%. */
const OMB_RATE_THRESHOLD = 1.5;

/** OMB significance threshold: dollar amount must be at or above $10M. */
const OMB_DOLLAR_THRESHOLD_LOW = 10_000_000;

/** OMB significance threshold: $100M regardless of rate. */
const OMB_DOLLAR_THRESHOLD_HIGH = 100_000_000;

/** Z-score lookup for common confidence levels. */
const Z_SCORES: Record<number, number> = {
  0.90: 1.645,
  0.95: 1.96,
  0.99: 2.576,
};

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Look up the z-score for a given confidence level.
 * Falls back to 1.96 (95%) if level not in table.
 */
function zScore(confidenceLevel: number): number {
  return Z_SCORES[confidenceLevel] ?? 1.96;
}

/**
 * Perform a Fisher-Yates (Knuth) shuffle on an array using a seeded
 * PRNG to ensure reproducibility.
 */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const shuffled = [...arr];
  let s = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    // Simple linear congruential generator
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const j = ((s >>> 0) % (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Map a SampleItemDisposition to a RootCauseCategory.
 */
function dispositionToRootCause(disposition: SampleItemDisposition): RootCauseCategory {
  switch (disposition) {
    case 'improper_documentation':
      return 'insufficient_documentation';
    case 'improper_ineligible':
      return 'authentication_eligibility';
    case 'improper_duplicate':
      return 'processing_error';
    case 'improper_overpayment':
      return 'verification_error';
    case 'improper_underpayment':
      return 'administrative_error';
    default:
      return 'other';
  }
}

// ---------------------------------------------------------------------------
// 1. Statistical Sampling
// ---------------------------------------------------------------------------

/**
 * Perform statistical sampling from a payment population.
 *
 * Uses simple random sampling per OMB Circular A-123 Appendix C
 * requirements. The sample is drawn using a seeded PRNG so that
 * results are reproducible for audit trail purposes.
 *
 * Per OMB A-123 Appendix C, agencies must sample at a level
 * sufficient to produce estimates with a 95% confidence interval
 * of +/- 3 percentage points.
 *
 * @param params - Sampling parameters (population, sample size, confidence)
 * @returns SamplingResult with selected items and metadata
 *
 * @see P.L. 116-117 Section 3(a)(2) — statistical sampling requirement
 * @see OMB Circular A-123, Appendix C, Section III — sampling methodology
 */
export function performStatisticalSampling(
  params: SamplingParameters,
): SamplingResult {
  const { population, sampleSize, confidenceLevel } = params;
  const methodology = params.methodology ?? 'simple_random';
  const effectiveSampleSize = Math.min(sampleSize, population.length);
  const seed = Date.now();

  const shuffled = seededShuffle(population, seed);
  const sample = shuffled.slice(0, effectiveSampleSize);

  return {
    id: uuid(),
    sample,
    populationSize: population.length,
    sampleSize: effectiveSampleSize,
    confidenceLevel,
    methodology,
    seed,
    sampledAt: new Date().toISOString(),
  };
}

/**
 * Build a TaggedPayment population from DoDEngagementData.
 *
 * Aggregates all payment streams (disbursements, contract payments,
 * military pay, civilian pay) into a unified TaggedPayment array
 * suitable for statistical sampling.
 *
 * @param data - The DoD engagement data
 * @returns Array of TaggedPayment records
 */
export function buildPaymentPopulation(data: DoDEngagementData): TaggedPayment[] {
  const population: TaggedPayment[] = [];

  for (const d of data.disbursements) {
    if (d.status !== 'cancelled' && d.status !== 'returned') {
      population.push({ record: d, streamType: 'disbursement', amount: d.amount });
    }
  }

  for (const cp of data.contractPayments) {
    population.push({ record: cp, streamType: 'contract_payment', amount: cp.approvedAmount });
  }

  for (const mp of data.militaryPayRecords) {
    population.push({ record: mp, streamType: 'military_pay', amount: mp.totalCompensation });
  }

  for (const cp of data.civilianPayRecords) {
    population.push({ record: cp, streamType: 'civilian_pay', amount: cp.totalCompensation });
  }

  return population;
}

// ---------------------------------------------------------------------------
// 2. Improper Payment Rate Estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the improper payment rate from reviewed sample results.
 *
 * Computes a point estimate and confidence interval for the improper
 * payment rate using attribute sampling methodology. Determines
 * whether the program exceeds OMB significance thresholds.
 *
 * OMB significance thresholds (P.L. 116-117 Section 2(4)):
 *   - Both 1.5% of program outlays AND $10 million, OR
 *   - $100 million regardless of rate
 *
 * @param sampleResults - Array of reviewed sample items with dispositions
 * @param populationDollarTotal - Total dollar value of the population
 * @param confidenceLevel - Confidence level (e.g. 0.95)
 * @returns ImproperPaymentEstimate with rate, interval, and significance
 *
 * @see P.L. 116-117 Section 2(4) — definition of "significant"
 * @see OMB M-21-19 Section IV — estimation methodology
 */
export function estimateImproperPaymentRate(
  sampleResults: ReviewedSampleItem[],
  populationDollarTotal: number,
  confidenceLevel: number = 0.95,
): ImproperPaymentEstimate {
  const n = sampleResults.length;
  const improperItems = sampleResults.filter(
    (item) => item.disposition !== 'proper',
  );
  const improperCount = improperItems.length;
  const sampleDollarTotal = sampleResults.reduce(
    (sum, item) => sum + item.payment.amount,
    0,
  );
  const improperDollarTotal = improperItems.reduce(
    (sum, item) => sum + item.improperAmount,
    0,
  );

  // Point estimate (dollar-weighted)
  const pointEstimateRate =
    sampleDollarTotal > 0
      ? (improperDollarTotal / sampleDollarTotal) * 100
      : 0;

  // Confidence interval using normal approximation for proportions
  const p = pointEstimateRate / 100;
  const z = zScore(confidenceLevel);
  const standardError = n > 0 ? Math.sqrt((p * (1 - p)) / n) : 0;
  const marginOfError = z * standardError * 100;

  const lowerBound = round2(Math.max(0, pointEstimateRate - marginOfError));
  const upperBound = round2(Math.min(100, pointEstimateRate + marginOfError));

  // Project to population
  const projectedImproperAmount = round2(
    populationDollarTotal * (pointEstimateRate / 100),
  );

  // OMB significance test
  const isSignificant =
    (pointEstimateRate >= OMB_RATE_THRESHOLD &&
      projectedImproperAmount >= OMB_DOLLAR_THRESHOLD_LOW) ||
    projectedImproperAmount >= OMB_DOLLAR_THRESHOLD_HIGH;

  return {
    id: uuid(),
    pointEstimateRate: round2(pointEstimateRate),
    lowerBound,
    upperBound,
    confidenceLevel,
    sampleDollarTotal: round2(sampleDollarTotal),
    improperDollarTotal: round2(improperDollarTotal),
    projectedImproperAmount,
    isSignificant,
    sampleItemsReviewed: n,
    improperItemsFound: improperCount,
    estimatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 3. Root Cause Analysis
// ---------------------------------------------------------------------------

/**
 * Categorize improper payments into OMB root cause categories.
 *
 * Per OMB M-21-19, agencies must categorize the root causes of
 * improper payments into seven standard categories. This function
 * tallies improper payments by category and identifies the primary
 * root cause for corrective action planning.
 *
 * OMB Root Cause Categories:
 *   1. Insufficient documentation
 *   2. Authentication / eligibility
 *   3. Processing errors
 *   4. Verification errors
 *   5. Administrative errors
 *   6. Medical necessity
 *   7. Other
 *
 * @param improperPayments - Reviewed items with improper dispositions
 * @returns RootCauseAnalysis with category breakdown
 *
 * @see OMB M-21-19 Section V — root cause analysis requirements
 * @see OMB Circular A-123, Appendix C, Section IV.D
 */
export function categorizeRootCauses(
  improperPayments: ReviewedSampleItem[],
): RootCauseAnalysis {
  const allCategories: RootCauseCategory[] = [
    'insufficient_documentation',
    'authentication_eligibility',
    'processing_error',
    'verification_error',
    'administrative_error',
    'medical_necessity',
    'other',
  ];

  const categoryMap = new Map<RootCauseCategory, { count: number; amount: number }>();
  for (const cat of allCategories) {
    categoryMap.set(cat, { count: 0, amount: 0 });
  }

  const totalImproperAmount = improperPayments.reduce(
    (sum, item) => sum + item.improperAmount,
    0,
  );

  for (const item of improperPayments) {
    const rootCause = dispositionToRootCause(item.disposition);
    const entry = categoryMap.get(rootCause)!;
    entry.count += 1;
    entry.amount += item.improperAmount;
  }

  const categories: RootCauseCategoryResult[] = allCategories.map((cat) => {
    const entry = categoryMap.get(cat)!;
    return {
      category: cat,
      count: entry.count,
      amount: round2(entry.amount),
      percentage:
        totalImproperAmount > 0
          ? round2((entry.amount / totalImproperAmount) * 100)
          : 0,
    };
  });

  // Determine primary root cause (highest dollar amount)
  const sorted = [...categories].sort((a, b) => b.amount - a.amount);
  const primaryRootCause =
    sorted.length > 0 && sorted[0].amount > 0
      ? sorted[0].category
      : 'other';

  return {
    id: uuid(),
    categories,
    totalImproperAmount: round2(totalImproperAmount),
    totalImproperCount: improperPayments.length,
    primaryRootCause,
    analyzedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 4. Corrective Action Plan Tracking
// ---------------------------------------------------------------------------

/**
 * Generate a corrective action plan (CAP) from root cause analysis results.
 *
 * Per PIIA Section 3(a)(3), agencies must publish corrective action plans
 * for programs that exceed OMB significance thresholds. The CAP includes
 * milestones with target dates, responsible parties, and measurable
 * reduction targets.
 *
 * @param rootCauses - Root cause analysis results
 * @param programName - Name of the program for the CAP
 * @param fiscalYear - Fiscal year of the assessment
 * @param responsibleOfficial - Name of the responsible official
 * @returns CorrectiveActionPlanRecord with milestones
 *
 * @see P.L. 116-117 Section 3(a)(3) — corrective action plan requirement
 * @see OMB Circular A-123, Appendix C, Section V
 */
export function generateCorrectiveActionPlan(
  rootCauses: RootCauseAnalysis,
  programName: string,
  fiscalYear: number,
  responsibleOfficial: string,
): CorrectiveActionPlanRecord {
  const milestones: CAPMilestone[] = [];
  const now = new Date();

  // Generate milestones based on the primary root cause
  const baseMilestones: Array<{ description: string; monthsOut: number }> = [
    {
      description: `Complete root cause deep-dive for ${rootCauses.primaryRootCause.replace(/_/g, ' ')}`,
      monthsOut: 2,
    },
    {
      description: 'Implement enhanced pre-payment controls',
      monthsOut: 4,
    },
    {
      description: 'Deploy automated detection and prevention tools',
      monthsOut: 6,
    },
    {
      description: 'Conduct staff training on updated procedures',
      monthsOut: 7,
    },
    {
      description: 'Perform interim sampling to measure improvement',
      monthsOut: 9,
    },
    {
      description: 'Complete full-year post-implementation assessment',
      monthsOut: 12,
    },
  ];

  // Add cause-specific milestones
  for (const cat of rootCauses.categories) {
    if (cat.count > 0 && cat.category !== rootCauses.primaryRootCause) {
      baseMilestones.push({
        description: `Address secondary root cause: ${cat.category.replace(/_/g, ' ')} (${cat.count} occurrences, $${cat.amount.toLocaleString()})`,
        monthsOut: 5,
      });
    }
  }

  for (const ms of baseMilestones) {
    const targetDate = new Date(now);
    targetDate.setMonth(targetDate.getMonth() + ms.monthsOut);

    milestones.push({
      id: uuid(),
      description: ms.description,
      targetDate: targetDate.toISOString().split('T')[0],
      status: 'not_started',
      responsibleParty: responsibleOfficial,
    });
  }

  const targetCompletionDate = new Date(now);
  targetCompletionDate.setMonth(targetCompletionDate.getMonth() + 12);

  return {
    id: uuid(),
    programName,
    fiscalYear,
    rootCauseCategory: rootCauses.primaryRootCause,
    description:
      `Corrective action plan for ${programName} — FY${fiscalYear}. ` +
      `Primary root cause: ${rootCauses.primaryRootCause.replace(/_/g, ' ')}. ` +
      `Total improper payments: $${rootCauses.totalImproperAmount.toLocaleString()} ` +
      `across ${rootCauses.totalImproperCount} transactions.`,
    milestones,
    status: 'draft',
    targetCompletionDate: targetCompletionDate.toISOString().split('T')[0],
    percentComplete: 0,
    responsibleOfficial,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Update the status of milestones in a corrective action plan.
 *
 * Recalculates percentComplete based on milestone completion and
 * updates the overall CAP status accordingly.
 *
 * @param plan - The corrective action plan to update
 * @param milestoneId - ID of the milestone to update
 * @param status - New milestone status
 * @param completedDate - Completion date (required for 'completed' status)
 * @returns Updated CorrectiveActionPlanRecord
 */
export function updateCAPMilestone(
  plan: CorrectiveActionPlanRecord,
  milestoneId: string,
  status: CAPMilestoneStatus,
  completedDate?: string,
): CorrectiveActionPlanRecord {
  const updatedMilestones = plan.milestones.map((ms) => {
    if (ms.id !== milestoneId) return ms;
    return {
      ...ms,
      status,
      completedDate: status === 'completed' ? (completedDate ?? new Date().toISOString().split('T')[0]) : ms.completedDate,
    };
  });

  const completedCount = updatedMilestones.filter(
    (ms) => ms.status === 'completed',
  ).length;
  const totalCount = updatedMilestones.length;
  const percentComplete = totalCount > 0 ? round2((completedCount / totalCount) * 100) : 0;

  let capStatus: CAPStatus = plan.status;
  if (percentComplete === 100) {
    capStatus = 'completed';
  } else if (percentComplete > 0) {
    capStatus = 'in_progress';
  }

  // Check for overdue milestones
  const today = new Date().toISOString().split('T')[0];
  const hasOverdue = updatedMilestones.some(
    (ms) => ms.status !== 'completed' && ms.targetDate < today,
  );
  if (hasOverdue && capStatus !== 'completed') {
    capStatus = 'overdue';
  }

  return {
    ...plan,
    milestones: updatedMilestones,
    percentComplete,
    status: capStatus,
    actualCompletionDate:
      capStatus === 'completed' ? (completedDate ?? new Date().toISOString().split('T')[0]) : undefined,
  };
}

// ---------------------------------------------------------------------------
// 5. Do Not Pay Interface
// ---------------------------------------------------------------------------

/** Payee information for a Do Not Pay check. */
export interface DNPPayeeInfo {
  payeeId: string;
  payeeName: string;
  payeeTIN?: string;
  payeeAddress?: string;
  payeeDOB?: string;
}

/**
 * Perform a Do Not Pay (DNP) eligibility check for a payee.
 *
 * Per 31 U.S.C. Section 3354, agencies must check the Do Not Pay
 * portal before making payments. The portal cross-references payees
 * against the Death Master File, SAM.gov exclusions, Treasury
 * debtor records, and other databases.
 *
 * This function returns a structured result indicating whether
 * any matches were found and whether the payment should be suspended
 * pending further review.
 *
 * @param payee - Payee information to check
 * @param databaseResults - Results from individual database checks
 * @returns DoNotPayCheckResult with overall disposition
 *
 * @see 31 U.S.C. Section 3354 — Do Not Pay Initiative
 * @see P.L. 116-117 Section 3(a)(4) — DNP utilization requirement
 * @see OMB M-21-19 Section VII — Do Not Pay guidance
 */
export function performDoNotPayCheck(
  payee: DNPPayeeInfo,
  databaseResults: DNPDatabaseResult[],
): DoNotPayCheckResult {
  const hasMatch = databaseResults.some((r) => r.matched);

  // Determine if payment must be suspended
  // Death Master File and SAM exclusion matches require suspension
  const criticalMatches = databaseResults.filter(
    (r) =>
      r.matched &&
      (r.database === 'death_master_file' || r.database === 'sam_exclusions'),
  );
  const suspendPayment = criticalMatches.length > 0;

  let overallResult: DoNotPayCheckResult['overallResult'];
  if (criticalMatches.length > 0) {
    overallResult = 'match_found';
  } else if (hasMatch) {
    overallResult = 'review_required';
  } else {
    overallResult = 'clear';
  }

  return {
    id: uuid(),
    payeeId: payee.payeeId,
    payeeName: payee.payeeName,
    payeeTIN: payee.payeeTIN,
    overallResult,
    databaseResults,
    suspendPayment,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Batch-process Do Not Pay checks for multiple payees.
 *
 * @param payees - Array of payee info objects
 * @param checkFn - Function that performs the actual DB lookups
 * @returns Array of DoNotPayCheckResult
 */
export function batchDoNotPayCheck(
  payees: DNPPayeeInfo[],
  checkFn: (payee: DNPPayeeInfo) => DNPDatabaseResult[],
): DoNotPayCheckResult[] {
  return payees.map((payee) => {
    const dbResults = checkFn(payee);
    return performDoNotPayCheck(payee, dbResults);
  });
}

// ---------------------------------------------------------------------------
// 6. PIIA Report Generation
// ---------------------------------------------------------------------------

/**
 * Generate annual PIIA report data for submission.
 *
 * Per P.L. 116-117 Section 3(b), agencies must publish annual
 * improper payment information for each program, including:
 *   - Estimated improper payment rate and amount
 *   - Root cause analysis
 *   - Corrective action plans for non-compliant programs
 *   - Reduction targets for future fiscal years
 *   - Do Not Pay portal utilization
 *   - Recapture audit results
 *
 * @param data - The DoD engagement data
 * @param fiscalYear - Reporting fiscal year
 * @param programs - Program-level estimation results
 * @param agencyName - Name of the reporting agency
 * @returns PIIAReportData for the annual report
 *
 * @see P.L. 116-117 Section 3(b) — annual reporting requirement
 * @see OMB Circular A-136 Section II.4 — report format
 * @see OMB M-21-19 Section VIII — reporting guidance
 */
export function generatePIIAReport(
  data: DoDEngagementData,
  fiscalYear: number,
  programs: PIIAProgramBreakdown[],
  agencyName: string = 'Department of Defense',
): PIIAReportData {
  const agencyWideOutlays = programs.reduce(
    (sum, p) => sum + p.outlays,
    0,
  );
  const agencyWideImproperPaymentAmount = programs.reduce(
    (sum, p) => sum + p.improperPaymentAmount,
    0,
  );
  const agencyWideImproperPaymentRate =
    agencyWideOutlays > 0
      ? round2((agencyWideImproperPaymentAmount / agencyWideOutlays) * 100)
      : 0;

  // Assess overall PIIA compliance
  const complianceDeficiencies: string[] = [];

  const significantPrograms = programs.filter((p) => p.isSignificant);
  if (significantPrograms.length > 0) {
    complianceDeficiencies.push(
      `${significantPrograms.length} program(s) exceed OMB significance thresholds`,
    );
  }

  const programsWithoutCAP = significantPrograms.filter(
    (p) => !p.correctiveActionPlan,
  );
  if (programsWithoutCAP.length > 0) {
    complianceDeficiencies.push(
      `${programsWithoutCAP.length} significant program(s) lack corrective action plans per PIIA Section 3(a)(3)`,
    );
  }

  const programsWithoutRCA = significantPrograms.filter(
    (p) => !p.rootCauseAnalysis,
  );
  if (programsWithoutRCA.length > 0) {
    complianceDeficiencies.push(
      `${programsWithoutRCA.length} significant program(s) lack root cause analysis per OMB M-21-19`,
    );
  }

  // Programs not meeting reduction targets
  const programsNotReducing = programs.filter(
    (p) =>
      p.priorYearRate !== null &&
      p.reductionTarget !== null &&
      p.improperPaymentRate > p.reductionTarget,
  );
  if (programsNotReducing.length > 0) {
    complianceDeficiencies.push(
      `${programsNotReducing.length} program(s) not meeting annual improper payment reduction targets`,
    );
  }

  const piiaCompliant = complianceDeficiencies.length === 0;

  return {
    id: uuid(),
    fiscalYear,
    agencyName,
    reportDate: new Date().toISOString().split('T')[0],
    programs,
    agencyWideImproperPaymentAmount: round2(agencyWideImproperPaymentAmount),
    agencyWideImproperPaymentRate,
    agencyWideOutlays: round2(agencyWideOutlays),
    doNotPayUtilization: true,
    recaptureAuditsConducted: true,
    recoveredAmounts: 0,
    piiaCompliant,
    complianceDeficiencies,
  };
}
