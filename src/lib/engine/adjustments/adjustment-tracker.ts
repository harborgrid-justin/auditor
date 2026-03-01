/**
 * Summary of Unadjusted Differences (SUD) Tracker
 *
 * Tracks proposed, recorded, and passed audit adjustments per AU-C 450.
 * Aggregates uncorrected misstatements and evaluates their impact
 * on the audit opinion.
 */

export type AdjustmentType = 'proposed' | 'recorded' | 'passed';
export type MisstatementCategory = 'factual' | 'judgmental' | 'projected';

export interface AuditAdjustment {
  id: string;
  engagementId: string;
  adjustmentNumber: string;
  type: AdjustmentType;
  category: MisstatementCategory;
  description: string;
  debitAccountName: string;
  creditAccountName: string;
  amount: number;
  findingId?: string;
  effectOnIncome: number;
  effectOnAssets: number;
  effectOnLiabilities: number;
  effectOnEquity: number;
  status: string;
}

export interface SUDSummary {
  totalProposed: number;
  totalRecorded: number;
  totalPassed: number;
  passedAdjustments: AuditAdjustment[];
  aggregatePassedEffect: {
    income: number;
    assets: number;
    liabilities: number;
    equity: number;
  };
  byCategory: {
    factual: { count: number; totalAmount: number };
    judgmental: { count: number; totalAmount: number };
    projected: { count: number; totalAmount: number };
  };
  exceedsMateriality: boolean;
  exceedsPerformanceMateriality: boolean;
  materialityThreshold: number;
  performanceMateriality: number;
  aggregateImpactOnIncome: number;
  conclusion: SUDConclusion;
  rationale: string;
}

export type SUDConclusion = 'acceptable' | 'requires_attention' | 'material';

/**
 * Aggregate all passed (waived) adjustments and evaluate against materiality.
 */
export function evaluateSUD(
  adjustments: AuditAdjustment[],
  materialityThreshold: number,
  performanceMateriality?: number
): SUDSummary {
  const perfMat = performanceMateriality ?? materialityThreshold * 0.75;

  const proposed = adjustments.filter(a => a.type === 'proposed');
  const recorded = adjustments.filter(a => a.type === 'recorded');
  const passed = adjustments.filter(a => a.type === 'passed');

  // Aggregate passed adjustment effects
  const aggregatePassedEffect = {
    income: passed.reduce((sum, a) => sum + a.effectOnIncome, 0),
    assets: passed.reduce((sum, a) => sum + a.effectOnAssets, 0),
    liabilities: passed.reduce((sum, a) => sum + a.effectOnLiabilities, 0),
    equity: passed.reduce((sum, a) => sum + a.effectOnEquity, 0),
  };

  // Categorize by misstatement type
  const factual = passed.filter(a => a.category === 'factual');
  const judgmental = passed.filter(a => a.category === 'judgmental');
  const projected = passed.filter(a => a.category === 'projected');

  const aggregateImpactOnIncome = Math.abs(aggregatePassedEffect.income);
  const aggregateImpactOnAssets = Math.abs(aggregatePassedEffect.assets);
  const aggregateImpactOnEquity = Math.abs(aggregatePassedEffect.equity);

  // Check against materiality — the maximum absolute effect across financial statement elements
  const maxEffect = Math.max(aggregateImpactOnIncome, aggregateImpactOnAssets, aggregateImpactOnEquity);

  const exceedsMateriality = maxEffect >= materialityThreshold;
  const exceedsPerformanceMateriality = maxEffect >= perfMat;

  let conclusion: SUDConclusion;
  let rationale: string;

  if (exceedsMateriality) {
    conclusion = 'material';
    rationale = `Aggregate uncorrected misstatements of $${Math.round(maxEffect).toLocaleString()} exceed overall materiality of $${Math.round(materialityThreshold).toLocaleString()}. Financial statements may be materially misstated. Management should record these adjustments or the opinion must be modified.`;
  } else if (exceedsPerformanceMateriality) {
    conclusion = 'requires_attention';
    rationale = `Aggregate uncorrected misstatements of $${Math.round(maxEffect).toLocaleString()} exceed performance materiality of $${Math.round(perfMat).toLocaleString()} but are below overall materiality. Additional procedures may be needed to conclude that the remaining misstatement is not material.`;
  } else {
    conclusion = 'acceptable';
    rationale = `Aggregate uncorrected misstatements of $${Math.round(maxEffect).toLocaleString()} are below performance materiality of $${Math.round(perfMat).toLocaleString()}. Uncorrected misstatements are not material to the financial statements.`;
  }

  return {
    totalProposed: proposed.length,
    totalRecorded: recorded.length,
    totalPassed: passed.length,
    passedAdjustments: passed,
    aggregatePassedEffect,
    byCategory: {
      factual: { count: factual.length, totalAmount: factual.reduce((s, a) => s + a.amount, 0) },
      judgmental: { count: judgmental.length, totalAmount: judgmental.reduce((s, a) => s + a.amount, 0) },
      projected: { count: projected.length, totalAmount: projected.reduce((s, a) => s + a.amount, 0) },
    },
    exceedsMateriality,
    exceedsPerformanceMateriality,
    materialityThreshold,
    performanceMateriality: perfMat,
    aggregateImpactOnIncome,
    conclusion,
    rationale,
  };
}

/**
 * Evaluate rollover effect of prior-year passed adjustments.
 * Under the rollover method, only the current-year effect is considered.
 * Under the iron curtain method, the cumulative effect matters.
 */
export function evaluateRolloverEffect(
  currentYearPassed: AuditAdjustment[],
  priorYearPassed: AuditAdjustment[],
  materialityThreshold: number
): {
  rolloverMethod: { impact: number; exceedsMateriality: boolean };
  ironCurtainMethod: { impact: number; exceedsMateriality: boolean };
  recommendation: string;
} {
  const currentImpact = Math.abs(
    currentYearPassed.reduce((sum, a) => sum + a.effectOnIncome, 0)
  );

  const cumulativeImpact = Math.abs(
    [...currentYearPassed, ...priorYearPassed].reduce((sum, a) => sum + a.effectOnIncome, 0)
  );

  const rolloverExceeds = currentImpact >= materialityThreshold;
  const ironCurtainExceeds = cumulativeImpact >= materialityThreshold;

  let recommendation: string;
  if (rolloverExceeds && ironCurtainExceeds) {
    recommendation = 'Misstatements are material under both methods. Adjustments must be recorded.';
  } else if (ironCurtainExceeds) {
    recommendation = 'Cumulative effect is material under the iron curtain method. Consider the need to record accumulated prior-year misstatements reversing through income.';
  } else if (rolloverExceeds) {
    recommendation = 'Current-year effect is material under the rollover method. Evaluate whether the current year effect alone warrants adjustment.';
  } else {
    recommendation = 'Misstatements are not material under either evaluation method.';
  }

  return {
    rolloverMethod: { impact: currentImpact, exceedsMateriality: rolloverExceeds },
    ironCurtainMethod: { impact: cumulativeImpact, exceedsMateriality: ironCurtainExceeds },
    recommendation,
  };
}

/**
 * Generate SUD schedule (Summary of Unadjusted Differences) formatted output.
 */
export function generateSUDSchedule(
  adjustments: AuditAdjustment[],
  materialityThreshold: number,
  entityName: string,
  fiscalYearEnd: string
): string {
  const passed = adjustments.filter(a => a.type === 'passed');

  let schedule = `
SUMMARY OF UNADJUSTED DIFFERENCES
${'='.repeat(60)}

Entity: ${entityName}
Fiscal Year Ended: ${fiscalYearEnd}
Overall Materiality: $${Math.round(materialityThreshold).toLocaleString()}
Performance Materiality (75%): $${Math.round(materialityThreshold * 0.75).toLocaleString()}

`;

  if (passed.length === 0) {
    schedule += 'No uncorrected misstatements to report.\n';
    return schedule.trim();
  }

  schedule += `${'#'.padEnd(4)} ${'Description'.padEnd(35)} ${'Debit Account'.padEnd(20)} ${'Credit Account'.padEnd(20)} ${'Amount'.padStart(15)} ${'Income Effect'.padStart(15)}\n`;
  schedule += `${'-'.repeat(4)} ${'-'.repeat(35)} ${'-'.repeat(20)} ${'-'.repeat(20)} ${'-'.repeat(15)} ${'-'.repeat(15)}\n`;

  let totalAmount = 0;
  let totalIncomeEffect = 0;

  passed.forEach((adj, i) => {
    const num = (i + 1).toString().padEnd(4);
    const desc = adj.description.substring(0, 35).padEnd(35);
    const dr = adj.debitAccountName.substring(0, 20).padEnd(20);
    const cr = adj.creditAccountName.substring(0, 20).padEnd(20);
    const amt = `$${Math.round(adj.amount).toLocaleString()}`.padStart(15);
    const inc = `$${Math.round(adj.effectOnIncome).toLocaleString()}`.padStart(15);
    schedule += `${num} ${desc} ${dr} ${cr} ${amt} ${inc}\n`;
    totalAmount += adj.amount;
    totalIncomeEffect += adj.effectOnIncome;
  });

  schedule += `${'-'.repeat(4)} ${'-'.repeat(35)} ${'-'.repeat(20)} ${'-'.repeat(20)} ${'-'.repeat(15)} ${'-'.repeat(15)}\n`;
  schedule += `${''.padEnd(4)} ${'TOTAL'.padEnd(35)} ${''.padEnd(20)} ${''.padEnd(20)} ${'$' + Math.round(totalAmount).toLocaleString()}`.padStart(15);
  schedule += ` ${'$' + Math.round(totalIncomeEffect).toLocaleString()}`.padStart(15);
  schedule += '\n\n';

  const absEffect = Math.abs(totalIncomeEffect);
  const pctOfMateriality = ((absEffect / materialityThreshold) * 100).toFixed(1);
  schedule += `Aggregate effect as % of materiality: ${pctOfMateriality}%\n`;
  schedule += `Conclusion: ${absEffect >= materialityThreshold ? 'MATERIAL — adjustments should be recorded or opinion modified' : 'Not material to the financial statements'}\n`;

  return schedule.trim();
}
