export interface BenfordResult {
  digit: number;
  expected: number;
  observed: number;
  count: number;
  totalCount: number;
  deviation: number;
}

export interface BenfordAnalysis {
  results: BenfordResult[];
  chiSquare: number;
  pValue: number;
  conclusion: 'pass' | 'warning' | 'fail';
  totalNumbers: number;
  description: string;
}

// Expected first-digit frequencies per Benford's Law
const BENFORD_EXPECTED = [
  0,        // digit 0 (not used for first digit)
  0.30103,  // digit 1
  0.17609,  // digit 2
  0.12494,  // digit 3
  0.09691,  // digit 4
  0.07918,  // digit 5
  0.06695,  // digit 6
  0.05799,  // digit 7
  0.05115,  // digit 8
  0.04576,  // digit 9
];

export function performBenfordAnalysis(amounts: number[]): BenfordAnalysis {
  // Filter to positive numbers with magnitude >= 10
  const validAmounts = amounts
    .map(a => Math.abs(a))
    .filter(a => a >= 10);

  if (validAmounts.length < 50) {
    return {
      results: [],
      chiSquare: 0,
      pValue: 1,
      conclusion: 'pass',
      totalNumbers: validAmounts.length,
      description: 'Insufficient data for Benford\'s Law analysis (minimum 50 values required)',
    };
  }

  // Count first digits
  const digitCounts = new Array(10).fill(0);
  for (const amount of validAmounts) {
    const firstDigit = parseInt(amount.toString()[0]);
    if (firstDigit >= 1 && firstDigit <= 9) {
      digitCounts[firstDigit]++;
    }
  }

  const totalCount = validAmounts.length;
  const results: BenfordResult[] = [];
  let chiSquare = 0;

  for (let d = 1; d <= 9; d++) {
    const observed = digitCounts[d] / totalCount;
    const expected = BENFORD_EXPECTED[d];
    const deviation = observed - expected;

    results.push({
      digit: d,
      expected,
      observed,
      count: digitCounts[d],
      totalCount,
      deviation,
    });

    // Chi-square contribution
    const expectedCount = expected * totalCount;
    chiSquare += Math.pow(digitCounts[d] - expectedCount, 2) / expectedCount;
  }

  // Approximate p-value for chi-square with 8 degrees of freedom
  const pValue = chiSquarePValue(chiSquare, 8);

  let conclusion: 'pass' | 'warning' | 'fail';
  let description: string;

  if (pValue < 0.01) {
    conclusion = 'fail';
    description = `Significant deviation from Benford's Law detected (chi-square = ${chiSquare.toFixed(2)}, p-value = ${pValue.toFixed(4)}). This may indicate data manipulation, rounding, or non-natural data generation. Further investigation is warranted.`;
  } else if (pValue < 0.05) {
    conclusion = 'warning';
    description = `Moderate deviation from Benford's Law (chi-square = ${chiSquare.toFixed(2)}, p-value = ${pValue.toFixed(4)}). Some digits deviate from expected frequencies. Additional testing recommended.`;
  } else {
    conclusion = 'pass';
    description = `Data conforms to Benford's Law (chi-square = ${chiSquare.toFixed(2)}, p-value = ${pValue.toFixed(4)}). No significant evidence of data manipulation detected.`;
  }

  return {
    results,
    chiSquare,
    pValue,
    conclusion,
    totalNumbers: totalCount,
    description,
  };
}

// Approximate chi-square p-value using Wilson-Hilferty approximation
function chiSquarePValue(chiSquare: number, df: number): number {
  if (chiSquare <= 0) return 1;
  const z = Math.pow(chiSquare / df, 1 / 3) - (1 - 2 / (9 * df));
  const denom = Math.sqrt(2 / (9 * df));
  const zScore = z / denom;

  // Standard normal CDF approximation
  return 1 - normalCDF(zScore);
}

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

export function performSecondDigitAnalysis(amounts: number[]): BenfordAnalysis {
  const validAmounts = amounts
    .map(a => Math.abs(a))
    .filter(a => a >= 100);

  if (validAmounts.length < 50) {
    return {
      results: [],
      chiSquare: 0,
      pValue: 1,
      conclusion: 'pass',
      totalNumbers: validAmounts.length,
      description: 'Insufficient data for second-digit analysis',
    };
  }

  // Expected second-digit frequencies (approximately uniform with slight bias)
  const secondDigitExpected = [0.1197, 0.1139, 0.1088, 0.1043, 0.1003, 0.0967, 0.0934, 0.0904, 0.0876, 0.0850];

  const digitCounts = new Array(10).fill(0);
  for (const amount of validAmounts) {
    const str = Math.floor(amount).toString();
    if (str.length >= 2) {
      const secondDigit = parseInt(str[1]);
      digitCounts[secondDigit]++;
    }
  }

  const totalCount = validAmounts.length;
  const results: BenfordResult[] = [];
  let chiSquare = 0;

  for (let d = 0; d <= 9; d++) {
    const observed = digitCounts[d] / totalCount;
    const expected = secondDigitExpected[d];
    const deviation = observed - expected;

    results.push({
      digit: d,
      expected,
      observed,
      count: digitCounts[d],
      totalCount,
      deviation,
    });

    const expectedCount = expected * totalCount;
    if (expectedCount > 0) {
      chiSquare += Math.pow(digitCounts[d] - expectedCount, 2) / expectedCount;
    }
  }

  const pValue = chiSquarePValue(chiSquare, 9);

  return {
    results,
    chiSquare,
    pValue,
    conclusion: pValue < 0.01 ? 'fail' : pValue < 0.05 ? 'warning' : 'pass',
    totalNumbers: totalCount,
    description: pValue < 0.05
      ? `Second-digit analysis shows deviation (chi-square = ${chiSquare.toFixed(2)}, p = ${pValue.toFixed(4)})`
      : `Second-digit distribution conforms to expectations (chi-square = ${chiSquare.toFixed(2)})`,
  };
}
