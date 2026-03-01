import type {
  UncertainTaxPosition,
  UTPMeasurementResult,
  MeasurementOutcome,
  UTPRollforward,
} from '@/types/tax-compliance';

/**
 * Evaluates whether an uncertain tax position meets the ASC 740-10-25-6
 * more-likely-than-not recognition threshold based on its technical merits rating.
 *
 * Returns true for ratings of 'probable' or 'more_likely_than_not' (i.e., >50%
 * likelihood of being sustained upon examination). Returns false for
 * 'reasonably_possible', 'remote', or null.
 */
export function evaluateRecognitionThreshold(position: {
  grossAmount: number;
  technicalMeritsRating: string | null;
}): boolean {
  if (position.technicalMeritsRating === null) {
    return false;
  }

  const rating = position.technicalMeritsRating.toLowerCase();

  if (rating === 'probable' || rating === 'more_likely_than_not') {
    return true;
  }

  // Ratings that do not meet the >50% threshold
  if (rating === 'reasonably_possible' || rating === 'remote') {
    return false;
  }

  return false;
}

/**
 * Measures the recognized tax benefit using the cumulative probability approach
 * per ASC 740-10-25-7.
 *
 * The method sorts all possible settlement outcomes by benefit amount in
 * descending order, then accumulates probabilities from the largest benefit
 * downward. The measurement amount is the largest benefit level at which the
 * cumulative probability exceeds 50%.
 *
 * If no outcomes are provided, a simplified approach is used: 50% of the
 * gross amount.
 *
 * @param grossAmount - The full (gross) tax benefit amount of the position.
 * @param outcomes - Array of possible settlement outcomes with amounts and
 *                   individual probabilities (probabilities should sum to 1.0).
 * @returns UTPMeasurementResult with measurement amount, cumulative probability,
 *          and largest benefit amount.
 */
export function measureBenefit(
  grossAmount: number,
  outcomes: MeasurementOutcome[]
): UTPMeasurementResult {
  // Simplified approach when no outcomes are provided
  if (outcomes.length === 0) {
    const recognized = grossAmount * 0.5;
    return {
      grossBenefit: grossAmount,
      recognizedBenefit: recognized,
      unrecognizedBenefit: grossAmount - recognized,
      largestAmountThreshold: recognized,
    };
  }

  // Sort outcomes by benefit amount descending (largest first)
  const sorted = [...outcomes].sort((a, b) => b.amount - a.amount);

  let cumulativeProbability = 0;
  let recognizedBenefit = 0;

  for (const outcome of sorted) {
    cumulativeProbability += outcome.probability;
    if (cumulativeProbability > 0.5) {
      recognizedBenefit = outcome.amount;
      break;
    }
  }

  return {
    grossBenefit: grossAmount,
    recognizedBenefit,
    unrecognizedBenefit: grossAmount - recognizedBenefit,
    largestAmountThreshold: sorted[0].amount,
  };
}

/**
 * Computes interest accrual on an uncertain tax position using the federal
 * underpayment rate (federal short-term rate + 3%).
 *
 * Uses simple interest: principal * rate * (days / 365).
 *
 * @param underpaymentAmount - The principal amount on which interest accrues.
 * @param federalRate - The applicable annual rate (e.g. federal short-term + 3%,
 *                      expressed as a decimal such as 0.07 for 7%).
 * @param startDate - The date from which interest begins accruing (ISO string).
 * @param endDate - The date through which interest is computed (ISO string).
 * @returns The computed interest amount, rounded to two decimal places.
 */
export function computeInterestAccrual(
  underpaymentAmount: number,
  federalRate: number,
  startDate: string,
  endDate: string
): number {
  if (underpaymentAmount <= 0 || federalRate <= 0) {
    return 0;
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (end <= start) {
    return 0;
  }

  const daysElapsed =
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

  // Simple interest: P * r * t
  const interest = underpaymentAmount * federalRate * (daysElapsed / 365);

  return Math.round(interest * 100) / 100;
}

/**
 * Computes penalty accrual on an uncertain tax position.
 *
 * Simple calculation: underpayment amount * penalty rate.
 *
 * @param underpaymentAmount - The principal amount subject to penalty.
 * @param penaltyRate - The applicable penalty rate as a decimal (e.g. 0.20 for 20%).
 * @returns The computed penalty amount, rounded to two decimal places.
 */
export function computePenaltyAccrual(
  underpaymentAmount: number,
  penaltyRate: number
): number {
  if (underpaymentAmount <= 0 || penaltyRate <= 0) {
    return 0;
  }

  const penalty = underpaymentAmount * penaltyRate;

  return Math.round(penalty * 100) / 100;
}

/**
 * Generates a rollforward schedule comparing beginning-of-period and
 * end-of-period uncertain tax positions, as required by ASC 740-10-50-15A.
 *
 * Calculates: beginning balance (from beginning positions), additions (positions
 * present in ending but not in beginning), reductions (positions present in
 * beginning but settled/lapsed in ending), settlements, and ending balance.
 *
 * @param beginningPositions - UTP positions at the start of the period.
 * @param endingPositions - UTP positions at the end of the period.
 * @returns UTPRollforward with aggregated balances and position count.
 */
export function generateRollforward(
  beginningPositions: UncertainTaxPosition[],
  endingPositions: UncertainTaxPosition[]
): UTPRollforward {
  // Beginning balance: sum of total reserves on beginning positions
  const beginningBalance = beginningPositions.reduce(
    (sum, p) => sum + p.totalReserve,
    0
  );

  // Build a set of beginning position IDs for comparison
  const beginningIds = new Set(beginningPositions.map((p) => p.id));
  const endingIds = new Set(endingPositions.map((p) => p.id));

  // Additions: positions in ending that were not in beginning (new positions)
  const newPositions = endingPositions.filter((p) => !beginningIds.has(p.id));
  const additions = newPositions.reduce((sum, p) => sum + p.totalReserve, 0);

  // Settlements: beginning positions that are marked settled or lapsed in ending,
  // or that no longer appear in ending
  const settledPositions = endingPositions.filter(
    (p) =>
      beginningIds.has(p.id) &&
      (p.status === 'settled' || p.status === 'lapsed')
  );
  const removedPositions = beginningPositions.filter(
    (p) => !endingIds.has(p.id)
  );

  const settlements =
    settledPositions.reduce((sum, p) => sum + p.totalReserve, 0) +
    removedPositions.reduce((sum, p) => sum + p.totalReserve, 0);

  // Reductions: net decreases in reserves for positions that existed in both
  // periods and remain active
  let reductions = 0;
  for (const beginPos of beginningPositions) {
    const endPos = endingPositions.find(
      (p) =>
        p.id === beginPos.id &&
        p.status !== 'settled' &&
        p.status !== 'lapsed'
    );
    if (endPos && endPos.totalReserve < beginPos.totalReserve) {
      reductions += beginPos.totalReserve - endPos.totalReserve;
    }
  }

  // Lapse of statute: positions that lapsed specifically
  const lapsedPositions = endingPositions.filter(
    (p) => beginningIds.has(p.id) && p.status === 'lapsed'
  );
  const lapseOfStatute = lapsedPositions.reduce((sum, p) => sum + p.totalReserve, 0);

  // Ending balance
  const endingBalance =
    beginningBalance + additions - reductions - settlements;

  // Interest and penalties on ending positions
  const interestAndPenalties = endingPositions
    .filter((p) => p.status !== 'settled' && p.status !== 'lapsed')
    .reduce((sum, p) => sum + p.interestAccrual + p.penaltyAccrual, 0);

  // Derive tax year from ending positions
  const taxYear = endingPositions.length > 0 ? endingPositions[0].taxYear : 0;

  return {
    taxYear,
    beginningBalance: Math.round(beginningBalance * 100) / 100,
    additions: Math.round(additions * 100) / 100,
    reductions: Math.round(reductions * 100) / 100,
    settlements: Math.round(settlements * 100) / 100,
    lapseOfStatute: Math.round(lapseOfStatute * 100) / 100,
    endingBalance: Math.round(endingBalance * 100) / 100,
    interestAndPenalties: Math.round(interestAndPenalties * 100) / 100,
  };
}
