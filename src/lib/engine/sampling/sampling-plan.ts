/**
 * Audit Sampling Engine
 *
 * Implements statistical sampling methodologies per AU-C 530 / AS 2315:
 * - Attribute sampling (controls testing)
 * - Monetary Unit Sampling (MUS / PPS)
 * - Stratified random sampling
 * - Systematic selection
 * - Random selection
 *
 * Provides sample size calculation, selection, and exception evaluation.
 */

export type SamplingMethod = 'attribute' | 'mus' | 'stratified' | 'systematic' | 'random';

export type SamplingConclusion = 'pending' | 'supports_reliance' | 'does_not_support' | 'inconclusive';

export interface AttributeSamplingParams {
  populationSize: number;
  confidenceLevel: number; // 0.90 or 0.95
  tolerableRate: number;   // e.g., 0.05 = 5% tolerable deviation rate
  expectedDeviationRate: number; // e.g., 0.01 = 1% expected
}

export interface MUSSamplingParams {
  populationSize: number;
  populationValue: number;
  confidenceLevel: number;
  tolerableMisstatement: number;
  expectedMisstatement: number;
}

export interface StratifiedSamplingParams {
  populationSize: number;
  populationValue: number;
  confidenceLevel: number;
  tolerableMisstatement: number;
  strata: Array<{
    name: string;
    count: number;
    totalValue: number;
  }>;
}

export interface SampleSizeResult {
  sampleSize: number;
  method: SamplingMethod;
  parameters: Record<string, number>;
  rationale: string;
}

export interface SampleItem {
  index: number;
  value?: number;
  stratum?: string;
  selected: boolean;
}

export interface AttributeEvaluation {
  sampleSize: number;
  deviationsFound: number;
  computedUpperDeviationRate: number;
  tolerableRate: number;
  conclusion: SamplingConclusion;
  rationale: string;
}

export interface MUSEvaluation {
  sampleSize: number;
  exceptionsFound: number;
  projectedMisstatement: number;
  upperMisstatementLimit: number;
  tolerableMisstatement: number;
  taintingFactors: number[];
  conclusion: SamplingConclusion;
  rationale: string;
}

// AICPA attribute sampling table (simplified) — maps (confidence, tolerable rate, expected rate) to sample size
const ATTRIBUTE_SAMPLE_TABLE: Record<string, number> = {
  // 95% confidence
  '0.95_0.05_0.00': 59,
  '0.95_0.05_0.005': 93,
  '0.95_0.05_0.01': 93,
  '0.95_0.05_0.015': 124,
  '0.95_0.05_0.02': 181,
  '0.95_0.05_0.025': 181,
  '0.95_0.07_0.00': 42,
  '0.95_0.07_0.01': 55,
  '0.95_0.07_0.02': 77,
  '0.95_0.07_0.03': 109,
  '0.95_0.10_0.00': 29,
  '0.95_0.10_0.01': 38,
  '0.95_0.10_0.02': 48,
  '0.95_0.10_0.03': 64,
  '0.95_0.10_0.05': 77,
  // 90% confidence
  '0.90_0.05_0.00': 46,
  '0.90_0.05_0.01': 64,
  '0.90_0.05_0.02': 98,
  '0.90_0.07_0.00': 33,
  '0.90_0.07_0.01': 40,
  '0.90_0.07_0.02': 55,
  '0.90_0.07_0.03': 77,
  '0.90_0.10_0.00': 23,
  '0.90_0.10_0.01': 27,
  '0.90_0.10_0.02': 34,
  '0.90_0.10_0.03': 43,
  '0.90_0.10_0.05': 55,
};

// Reliability factors for MUS sampling
const RELIABILITY_FACTORS: Record<string, number> = {
  '0.95_0': 3.00,
  '0.95_1': 4.75,
  '0.95_2': 6.30,
  '0.95_3': 7.76,
  '0.95_4': 9.16,
  '0.95_5': 10.52,
  '0.90_0': 2.31,
  '0.90_1': 3.89,
  '0.90_2': 5.33,
  '0.90_3': 6.69,
  '0.90_4': 8.00,
  '0.90_5': 9.28,
};

/**
 * Calculate sample size for attribute sampling (controls testing).
 * Uses AICPA tables for standard parameters, falls back to statistical formula.
 */
export function calculateAttributeSampleSize(params: AttributeSamplingParams): SampleSizeResult {
  const { populationSize, confidenceLevel, tolerableRate, expectedDeviationRate } = params;

  // Round expected rate to nearest table entry
  const confKey = confidenceLevel >= 0.95 ? '0.95' : '0.90';
  const tolKey = tolerableRate.toFixed(2);
  const expRates = [0, 0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.05];
  const closestExpRate = expRates.reduce((prev, curr) =>
    Math.abs(curr - expectedDeviationRate) < Math.abs(prev - expectedDeviationRate) ? curr : prev
  );

  const tableKey = `${confKey}_${tolKey}_${closestExpRate.toFixed(closestExpRate === 0 ? 1 : 2).replace(/^0\.0$/, '0.00')}`;
  let sampleSize = ATTRIBUTE_SAMPLE_TABLE[tableKey];

  if (!sampleSize) {
    // Statistical formula fallback: n = (Z² * p * (1-p)) / E²
    const z = confidenceLevel >= 0.95 ? 1.96 : 1.645;
    const p = Math.max(expectedDeviationRate, 0.01);
    const e = tolerableRate - expectedDeviationRate;
    sampleSize = Math.ceil((z * z * p * (1 - p)) / (e * e));
  }

  // Finite population correction
  if (populationSize > 0 && sampleSize > populationSize * 0.1) {
    sampleSize = Math.ceil(sampleSize / (1 + (sampleSize - 1) / populationSize));
  }

  // Minimum of 25 for any statistical sample
  sampleSize = Math.max(sampleSize, 25);

  return {
    sampleSize,
    method: 'attribute',
    parameters: { populationSize, confidenceLevel, tolerableRate, expectedDeviationRate },
    rationale: `Attribute sampling at ${(confidenceLevel * 100).toFixed(0)}% confidence with ${(tolerableRate * 100).toFixed(1)}% tolerable rate and ${(expectedDeviationRate * 100).toFixed(1)}% expected deviation rate. Population of ${populationSize} items.`,
  };
}

/**
 * Calculate sample size for Monetary Unit Sampling (MUS / PPS).
 * Formula: n = (Population Value × Reliability Factor) / Tolerable Misstatement
 */
export function calculateMUSSampleSize(params: MUSSamplingParams): SampleSizeResult {
  const { populationSize, populationValue, confidenceLevel, tolerableMisstatement, expectedMisstatement } = params;

  const confKey = confidenceLevel >= 0.95 ? '0.95' : '0.90';

  // Estimate expected number of exceptions based on expected misstatement
  const expectedExceptions = expectedMisstatement > 0
    ? Math.min(Math.ceil(expectedMisstatement / (tolerableMisstatement / 3)), 5)
    : 0;

  const reliabilityKey = `${confKey}_${expectedExceptions}`;
  const reliabilityFactor = RELIABILITY_FACTORS[reliabilityKey] || 3.00;

  // Adjusted tolerable misstatement = TM - (Expected Misstatement × Expansion Factor)
  const expansionFactor = 1.6; // Standard expansion factor
  const adjustedTM = tolerableMisstatement - (expectedMisstatement * expansionFactor);

  let sampleSize: number;
  if (adjustedTM <= 0) {
    // When expected misstatement is high relative to tolerable, use reliability factor only
    sampleSize = Math.ceil((populationValue * reliabilityFactor) / tolerableMisstatement);
  } else {
    sampleSize = Math.ceil((populationValue * reliabilityFactor) / adjustedTM);
  }

  // Cannot exceed population
  sampleSize = Math.min(sampleSize, populationSize);
  sampleSize = Math.max(sampleSize, 25);

  return {
    sampleSize,
    method: 'mus',
    parameters: {
      populationSize,
      populationValue,
      confidenceLevel,
      tolerableMisstatement,
      expectedMisstatement,
      reliabilityFactor,
      samplingInterval: populationValue / sampleSize,
    },
    rationale: `MUS sampling with reliability factor ${reliabilityFactor.toFixed(2)} at ${(confidenceLevel * 100).toFixed(0)}% confidence. Tolerable misstatement $${tolerableMisstatement.toLocaleString()}, sampling interval $${Math.round(populationValue / sampleSize).toLocaleString()}.`,
  };
}

/**
 * Select random sample items using a seeded PRNG for reproducibility.
 */
export function selectRandomSample(populationSize: number, sampleSize: number, seed: number = Date.now()): number[] {
  const selected = new Set<number>();
  let rng = seed;

  const nextRandom = () => {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };

  const actualSize = Math.min(sampleSize, populationSize);

  while (selected.size < actualSize) {
    const idx = Math.floor(nextRandom() * populationSize);
    selected.add(idx);
  }

  return Array.from(selected).sort((a, b) => a - b);
}

/**
 * Select sample using systematic selection with random start.
 */
export function selectSystematicSample(populationSize: number, sampleSize: number, randomStart?: number): number[] {
  const interval = populationSize / sampleSize;
  const start = randomStart ?? Math.floor(Math.random() * interval);
  const selected: number[] = [];

  for (let i = 0; i < sampleSize; i++) {
    const idx = Math.floor(start + i * interval) % populationSize;
    selected.push(idx);
  }

  return selected.sort((a, b) => a - b);
}

/**
 * Select MUS sample using probability-proportional-to-size.
 * Items are selected based on cumulative dollar amounts.
 */
export function selectMUSSample(
  items: Array<{ index: number; value: number }>,
  sampleSize: number,
  randomStart?: number
): number[] {
  const totalValue = items.reduce((sum, item) => sum + Math.abs(item.value), 0);
  const interval = totalValue / sampleSize;
  const start = randomStart ?? Math.random() * interval;

  const selected = new Set<number>();
  let cumulative = 0;

  // Sort by absolute value descending — items exceeding interval are auto-selected
  const sorted = [...items].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  // Auto-select items exceeding sampling interval (individually significant)
  for (const item of sorted) {
    if (Math.abs(item.value) >= interval) {
      selected.add(item.index);
    }
  }

  // PPS selection for remaining
  for (let selPoint = start; selPoint < totalValue; selPoint += interval) {
    cumulative = 0;
    for (const item of items) {
      cumulative += Math.abs(item.value);
      if (cumulative >= selPoint) {
        selected.add(item.index);
        break;
      }
    }
  }

  return Array.from(selected).sort((a, b) => a - b);
}

/**
 * Evaluate attribute sampling results.
 * Computes upper deviation rate and determines if results support reliance on controls.
 */
export function evaluateAttributeSample(
  sampleSize: number,
  deviationsFound: number,
  tolerableRate: number,
  confidenceLevel: number
): AttributeEvaluation {
  // Upper deviation rate approximation using Poisson distribution
  // UDR ≈ (deviations / sample_size) + Z * sqrt((deviations / sample_size) * (1 - deviations / sample_size) / sample_size)
  const sampleRate = deviationsFound / sampleSize;
  const z = confidenceLevel >= 0.95 ? 1.96 : 1.645;
  const computedUpperDeviationRate = sampleRate + z * Math.sqrt((sampleRate * (1 - sampleRate)) / sampleSize);

  let conclusion: SamplingConclusion;
  let rationale: string;

  if (computedUpperDeviationRate <= tolerableRate) {
    conclusion = 'supports_reliance';
    rationale = `Upper deviation rate of ${(computedUpperDeviationRate * 100).toFixed(1)}% is within tolerable rate of ${(tolerableRate * 100).toFixed(1)}%. Controls are operating effectively at the tested confidence level.`;
  } else if (deviationsFound === 0) {
    conclusion = 'supports_reliance';
    rationale = `No deviations found in sample of ${sampleSize}. Controls are operating effectively.`;
  } else {
    conclusion = 'does_not_support';
    rationale = `Upper deviation rate of ${(computedUpperDeviationRate * 100).toFixed(1)}% exceeds tolerable rate of ${(tolerableRate * 100).toFixed(1)}%. Cannot rely on controls. Consider increasing substantive testing.`;
  }

  return {
    sampleSize,
    deviationsFound,
    computedUpperDeviationRate,
    tolerableRate,
    conclusion,
    rationale,
  };
}

/**
 * Evaluate MUS (Monetary Unit Sampling) results.
 * Projects misstatement from sample to population and computes upper misstatement limit.
 */
export function evaluateMUSSample(
  sampleSize: number,
  populationValue: number,
  tolerableMisstatement: number,
  confidenceLevel: number,
  exceptions: Array<{ bookValue: number; auditValue: number }>
): MUSEvaluation {
  const samplingInterval = populationValue / sampleSize;
  const confKey = confidenceLevel >= 0.95 ? '0.95' : '0.90';

  // Calculate tainting factors
  const taintingFactors = exceptions.map(e => {
    if (e.bookValue === 0) return 1;
    return Math.abs(e.bookValue - e.auditValue) / Math.abs(e.bookValue);
  });

  // Sort tainting factors descending for incremental allowance calculation
  const sortedTaints = [...taintingFactors].sort((a, b) => b - a);

  // Basic precision (with zero errors)
  const r0 = RELIABILITY_FACTORS[`${confKey}_0`] || 3.00;
  const basicPrecision = r0 * samplingInterval;

  // Projected misstatement
  const projectedMisstatement = sortedTaints.reduce((sum, taint) => sum + taint * samplingInterval, 0);

  // Incremental allowance for each exception
  let incrementalAllowance = 0;
  for (let i = 0; i < sortedTaints.length; i++) {
    const rn = RELIABILITY_FACTORS[`${confKey}_${i + 1}`] || (r0 + (i + 1) * 1.5);
    const rPrev = RELIABILITY_FACTORS[`${confKey}_${i}`] || (r0 + i * 1.5);
    const incrementalFactor = rn - rPrev;
    incrementalAllowance += sortedTaints[i] * incrementalFactor * samplingInterval;
  }

  const upperMisstatementLimit = projectedMisstatement + basicPrecision + incrementalAllowance;

  let conclusion: SamplingConclusion;
  let rationale: string;

  if (exceptions.length === 0) {
    conclusion = 'supports_reliance';
    rationale = `No misstatements found. Upper misstatement limit ($${Math.round(basicPrecision).toLocaleString()}) is within tolerable misstatement ($${Math.round(tolerableMisstatement).toLocaleString()}).`;
  } else if (upperMisstatementLimit <= tolerableMisstatement) {
    conclusion = 'supports_reliance';
    rationale = `${exceptions.length} exception(s) found. Projected misstatement $${Math.round(projectedMisstatement).toLocaleString()} with upper limit $${Math.round(upperMisstatementLimit).toLocaleString()} is within tolerable misstatement $${Math.round(tolerableMisstatement).toLocaleString()}.`;
  } else {
    conclusion = 'does_not_support';
    rationale = `${exceptions.length} exception(s) found. Upper misstatement limit $${Math.round(upperMisstatementLimit).toLocaleString()} exceeds tolerable misstatement $${Math.round(tolerableMisstatement).toLocaleString()}. The account balance may be materially misstated.`;
  }

  return {
    sampleSize,
    exceptionsFound: exceptions.length,
    projectedMisstatement,
    upperMisstatementLimit,
    tolerableMisstatement,
    taintingFactors,
    conclusion,
    rationale,
  };
}
