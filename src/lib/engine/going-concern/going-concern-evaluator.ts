/**
 * Going Concern Assessment Module (ASC 205-40 / AU-C 570)
 *
 * Provides standalone going concern evaluation with:
 * - Quantitative indicators (financial ratio analysis)
 * - 12-month forward cash flow projection
 * - Management plan assessment
 * - Mitigating factor evaluation
 * - Opinion impact determination
 */

export type GoingConcernConclusion = 'no_substantial_doubt' | 'substantial_doubt_mitigated' | 'substantial_doubt_exists';

export type GoingConcernOpinionImpact = 'none' | 'emphasis_of_matter' | 'qualified' | 'adverse';

export interface QuantitativeIndicator {
  name: string;
  value: number;
  threshold: number;
  triggered: boolean;
  severity: 'high' | 'medium' | 'low';
  description: string;
}

export interface QualitativeIndicator {
  name: string;
  present: boolean;
  severity: 'high' | 'medium' | 'low';
  description: string;
}

export interface CashFlowProjection {
  month: number;
  label: string;
  operatingCashFlow: number;
  investingCashFlow: number;
  financingCashFlow: number;
  netCashFlow: number;
  endingCashBalance: number;
  belowZero: boolean;
}

export interface ManagementPlan {
  description: string;
  category: 'asset_liquidation' | 'debt_restructuring' | 'equity_infusion' | 'cost_reduction' | 'revenue_growth' | 'other';
  estimatedImpact: number;
  feasibilityAssessment: 'highly_feasible' | 'reasonably_feasible' | 'uncertain' | 'not_feasible';
  timeframe: string;
  evidenceObtained: string;
}

export interface GoingConcernAssessment {
  conclusion: GoingConcernConclusion;
  opinionImpact: GoingConcernOpinionImpact;
  quantitativeIndicators: QuantitativeIndicator[];
  qualitativeIndicators: QualitativeIndicator[];
  cashFlowProjection: CashFlowProjection[];
  managementPlans: ManagementPlan[];
  triggeredIndicatorCount: number;
  highSeverityCount: number;
  cashShortfallProjected: boolean;
  totalMitigationImpact: number;
  disclosureAdequate: boolean;
  rationale: string;
}

export interface GoingConcernInput {
  // Financial data
  currentRatio: number;
  quickRatio: number;
  workingCapital: number;
  debtToEquity: number;
  interestCoverage: number;
  totalDebt: number;
  totalEquity: number;
  cashBalance: number;
  operatingCashFlow: number;
  netIncome: number;
  totalRevenue: number;
  totalAssets: number;
  retainedEarnings: number;
  // Prior year comparisons
  priorYearRevenue?: number;
  priorYearNetIncome?: number;
  priorYearCashFlow?: number;
  // Qualitative factors
  loanDefaults?: boolean;
  legalProceedings?: boolean;
  lossOfKeyCustomer?: boolean;
  lossOfKeySupplier?: boolean;
  laborDifficulties?: boolean;
  regulatoryActions?: boolean;
  // Management plans
  managementPlans?: ManagementPlan[];
  // Disclosure status
  disclosureAdequate?: boolean;
}

/**
 * Perform comprehensive going concern assessment per ASC 205-40.
 * Evaluates conditions within 12 months of the financial statement date.
 */
export function assessGoingConcern(input: GoingConcernInput): GoingConcernAssessment {
  const quantitativeIndicators = evaluateQuantitativeIndicators(input);
  const qualitativeIndicators = evaluateQualitativeIndicators(input);
  const cashFlowProjection = projectCashFlows(input);
  const managementPlans = input.managementPlans || [];

  const triggeredIndicators = quantitativeIndicators.filter(i => i.triggered);
  const triggeredQualitative = qualitativeIndicators.filter(i => i.present);
  const triggeredIndicatorCount = triggeredIndicators.length + triggeredQualitative.length;
  const highSeverityCount = [...triggeredIndicators, ...triggeredQualitative].filter(i => i.severity === 'high').length;

  const cashShortfallProjected = cashFlowProjection.some(m => m.belowZero);

  const totalMitigationImpact = managementPlans
    .filter(p => p.feasibilityAssessment === 'highly_feasible' || p.feasibilityAssessment === 'reasonably_feasible')
    .reduce((sum, p) => sum + p.estimatedImpact, 0);

  const disclosureAdequate = input.disclosureAdequate ?? true;

  // Determine conclusion
  const { conclusion, opinionImpact, rationale } = determineConclusion(
    triggeredIndicatorCount,
    highSeverityCount,
    cashShortfallProjected,
    totalMitigationImpact,
    managementPlans,
    disclosureAdequate,
    input
  );

  return {
    conclusion,
    opinionImpact,
    quantitativeIndicators,
    qualitativeIndicators,
    cashFlowProjection,
    managementPlans,
    triggeredIndicatorCount,
    highSeverityCount,
    cashShortfallProjected,
    totalMitigationImpact,
    disclosureAdequate,
    rationale,
  };
}

function evaluateQuantitativeIndicators(input: GoingConcernInput): QuantitativeIndicator[] {
  const indicators: QuantitativeIndicator[] = [];

  // 1. Negative working capital
  indicators.push({
    name: 'Working Capital',
    value: input.workingCapital,
    threshold: 0,
    triggered: input.workingCapital < 0,
    severity: input.workingCapital < -input.totalAssets * 0.1 ? 'high' : 'medium',
    description: input.workingCapital < 0
      ? `Negative working capital of $${Math.round(input.workingCapital).toLocaleString()} indicates potential inability to meet short-term obligations.`
      : 'Working capital is positive.',
  });

  // 2. Current ratio below 1.0
  indicators.push({
    name: 'Current Ratio',
    value: input.currentRatio,
    threshold: 1.0,
    triggered: input.currentRatio < 1.0,
    severity: input.currentRatio < 0.5 ? 'high' : 'medium',
    description: input.currentRatio < 1.0
      ? `Current ratio of ${input.currentRatio.toFixed(2)} is below 1.0, indicating current liabilities exceed current assets.`
      : `Current ratio of ${input.currentRatio.toFixed(2)} is adequate.`,
  });

  // 3. Debt-to-equity ratio above 3.0
  indicators.push({
    name: 'Debt-to-Equity Ratio',
    value: input.debtToEquity,
    threshold: 3.0,
    triggered: input.debtToEquity > 3.0 || input.totalEquity <= 0,
    severity: input.totalEquity <= 0 ? 'high' : input.debtToEquity > 5.0 ? 'high' : 'medium',
    description: input.totalEquity <= 0
      ? 'Negative equity indicates the entity is technically insolvent.'
      : input.debtToEquity > 3.0
        ? `Debt-to-equity ratio of ${input.debtToEquity.toFixed(2)} indicates excessive leverage.`
        : `Debt-to-equity ratio of ${input.debtToEquity.toFixed(2)} is within acceptable range.`,
  });

  // 4. Negative operating cash flow
  indicators.push({
    name: 'Operating Cash Flow',
    value: input.operatingCashFlow,
    threshold: 0,
    triggered: input.operatingCashFlow < 0,
    severity: input.operatingCashFlow < -input.totalRevenue * 0.1 ? 'high' : 'medium',
    description: input.operatingCashFlow < 0
      ? `Negative operating cash flow of $${Math.round(input.operatingCashFlow).toLocaleString()} indicates operations are consuming cash.`
      : 'Operating cash flow is positive.',
  });

  // 5. Recurring operating losses
  const recurringLosses = input.netIncome < 0 && (input.priorYearNetIncome !== undefined && input.priorYearNetIncome < 0);
  indicators.push({
    name: 'Recurring Net Losses',
    value: input.netIncome,
    threshold: 0,
    triggered: recurringLosses,
    severity: recurringLosses ? 'high' : input.netIncome < 0 ? 'medium' : 'low',
    description: recurringLosses
      ? `Recurring net losses: current year $${Math.round(input.netIncome).toLocaleString()}, prior year $${Math.round(input.priorYearNetIncome!).toLocaleString()}. Pattern of sustained losses raises going concern doubts.`
      : input.netIncome < 0
        ? `Net loss of $${Math.round(input.netIncome).toLocaleString()} in current year.`
        : 'Entity is profitable.',
  });

  // 6. Interest coverage below 1.5
  indicators.push({
    name: 'Interest Coverage',
    value: input.interestCoverage,
    threshold: 1.5,
    triggered: input.interestCoverage < 1.5 && input.totalDebt > 0,
    severity: input.interestCoverage < 1.0 ? 'high' : 'medium',
    description: input.interestCoverage < 1.5 && input.totalDebt > 0
      ? `Interest coverage of ${input.interestCoverage.toFixed(2)}x is below 1.5x, indicating difficulty servicing debt.`
      : `Interest coverage of ${input.interestCoverage.toFixed(2)}x is adequate.`,
  });

  // 7. Accumulated deficit
  indicators.push({
    name: 'Retained Earnings',
    value: input.retainedEarnings,
    threshold: 0,
    triggered: input.retainedEarnings < 0,
    severity: Math.abs(input.retainedEarnings) > input.totalAssets * 0.5 ? 'high' : 'medium',
    description: input.retainedEarnings < 0
      ? `Accumulated deficit of $${Math.round(Math.abs(input.retainedEarnings)).toLocaleString()} indicates cumulative losses exceed cumulative earnings.`
      : 'Positive retained earnings.',
  });

  // 8. Revenue decline > 20%
  if (input.priorYearRevenue !== undefined && input.priorYearRevenue > 0) {
    const revenueDecline = (input.priorYearRevenue - input.totalRevenue) / input.priorYearRevenue;
    indicators.push({
      name: 'Revenue Trend',
      value: -revenueDecline,
      threshold: -0.20,
      triggered: revenueDecline > 0.20,
      severity: revenueDecline > 0.35 ? 'high' : 'medium',
      description: revenueDecline > 0.20
        ? `Revenue declined ${(revenueDecline * 100).toFixed(1)}% year-over-year, indicating significant deterioration in business operations.`
        : `Revenue change of ${(-revenueDecline * 100).toFixed(1)}% is within normal range.`,
    });
  }

  return indicators;
}

function evaluateQualitativeIndicators(input: GoingConcernInput): QualitativeIndicator[] {
  const indicators: QualitativeIndicator[] = [];

  if (input.loanDefaults !== undefined) {
    indicators.push({
      name: 'Loan Defaults / Covenant Violations',
      present: input.loanDefaults,
      severity: 'high',
      description: input.loanDefaults
        ? 'Entity has defaulted on loan agreements or violated debt covenants.'
        : 'No known loan defaults or covenant violations.',
    });
  }

  if (input.legalProceedings !== undefined) {
    indicators.push({
      name: 'Significant Legal Proceedings',
      present: input.legalProceedings,
      severity: 'high',
      description: input.legalProceedings
        ? 'Entity faces significant legal proceedings that could materially impact financial position.'
        : 'No significant legal proceedings identified.',
    });
  }

  if (input.lossOfKeyCustomer !== undefined) {
    indicators.push({
      name: 'Loss of Key Customer',
      present: input.lossOfKeyCustomer,
      severity: 'high',
      description: input.lossOfKeyCustomer
        ? 'Entity has lost or is at risk of losing a key customer representing a significant portion of revenue.'
        : 'No loss of key customer identified.',
    });
  }

  if (input.lossOfKeySupplier !== undefined) {
    indicators.push({
      name: 'Loss of Key Supplier',
      present: input.lossOfKeySupplier,
      severity: 'medium',
      description: input.lossOfKeySupplier
        ? 'Entity has lost or is at risk of losing a key supplier critical to operations.'
        : 'No loss of key supplier identified.',
    });
  }

  if (input.laborDifficulties !== undefined) {
    indicators.push({
      name: 'Labor Difficulties',
      present: input.laborDifficulties,
      severity: 'medium',
      description: input.laborDifficulties
        ? 'Entity is experiencing significant labor difficulties (strikes, key personnel departures).'
        : 'No significant labor difficulties.',
    });
  }

  if (input.regulatoryActions !== undefined) {
    indicators.push({
      name: 'Regulatory Actions',
      present: input.regulatoryActions,
      severity: 'high',
      description: input.regulatoryActions
        ? 'Entity faces regulatory actions that could restrict operations or impose significant penalties.'
        : 'No adverse regulatory actions identified.',
    });
  }

  return indicators;
}

function projectCashFlows(input: GoingConcernInput): CashFlowProjection[] {
  const projections: CashFlowProjection[] = [];
  const monthlyOperating = input.operatingCashFlow / 12;
  let cashBalance = input.cashBalance;

  // Simple 12-month projection using run rate with trend adjustment
  const trendFactor = input.priorYearCashFlow !== undefined && input.priorYearCashFlow !== 0
    ? input.operatingCashFlow / input.priorYearCashFlow
    : 1.0;

  // Cap trend factor to prevent extreme projections
  const cappedTrend = Math.max(0.5, Math.min(trendFactor, 1.5));

  for (let month = 1; month <= 12; month++) {
    // Apply gradual trend
    const trendAdjustment = 1 + (cappedTrend - 1) * (month / 12);
    const adjustedOperating = monthlyOperating * trendAdjustment;

    // Assume minimal investing/financing activity
    const investing = 0;
    const financing = -input.totalDebt / 60; // Approximate monthly debt service

    const netCashFlow = adjustedOperating + investing + financing;
    cashBalance += netCashFlow;

    projections.push({
      month,
      label: `Month ${month}`,
      operatingCashFlow: Math.round(adjustedOperating),
      investingCashFlow: Math.round(investing),
      financingCashFlow: Math.round(financing),
      netCashFlow: Math.round(netCashFlow),
      endingCashBalance: Math.round(cashBalance),
      belowZero: cashBalance < 0,
    });
  }

  return projections;
}

function determineConclusion(
  triggeredCount: number,
  highSeverityCount: number,
  cashShortfall: boolean,
  mitigationImpact: number,
  plans: ManagementPlan[],
  disclosureAdequate: boolean,
  input: GoingConcernInput
): { conclusion: GoingConcernConclusion; opinionImpact: GoingConcernOpinionImpact; rationale: string } {
  // No significant indicators
  if (triggeredCount === 0) {
    return {
      conclusion: 'no_substantial_doubt',
      opinionImpact: 'none',
      rationale: 'No conditions or events were identified that raise substantial doubt about the entity\'s ability to continue as a going concern within one year of the financial statement date.',
    };
  }

  // Minor indicators only
  if (highSeverityCount === 0 && triggeredCount <= 2 && !cashShortfall) {
    return {
      conclusion: 'no_substantial_doubt',
      opinionImpact: 'none',
      rationale: `${triggeredCount} minor indicator(s) noted but do not individually or collectively raise substantial doubt about going concern. Continued monitoring recommended.`,
    };
  }

  // Significant indicators — check if management plans mitigate
  const hasFeasiblePlans = plans.some(p =>
    p.feasibilityAssessment === 'highly_feasible' || p.feasibilityAssessment === 'reasonably_feasible'
  );

  if (hasFeasiblePlans && mitigationImpact > 0) {
    // Can mitigation address the shortfall?
    const cashNeed = cashShortfall ? Math.abs(Math.min(input.cashBalance + input.operatingCashFlow, 0)) : 0;
    const mitigatesShortfall = mitigationImpact >= cashNeed;

    if (mitigatesShortfall && highSeverityCount <= 2) {
      return {
        conclusion: 'substantial_doubt_mitigated',
        opinionImpact: disclosureAdequate ? 'emphasis_of_matter' : 'qualified',
        rationale: `Conditions raising substantial doubt were identified (${triggeredCount} indicators, ${highSeverityCount} high severity). However, management's plans are considered feasible and are expected to mitigate the conditions within the going concern evaluation period. ${disclosureAdequate ? 'Adequate disclosures are included.' : 'Disclosures are not adequate — qualified opinion required.'}`,
      };
    }
  }

  // Substantial doubt exists — not mitigated
  if (!disclosureAdequate) {
    return {
      conclusion: 'substantial_doubt_exists',
      opinionImpact: 'adverse',
      rationale: `Substantial doubt exists about the entity's ability to continue as a going concern. ${triggeredCount} going concern indicators identified (${highSeverityCount} high severity)${cashShortfall ? ', with projected cash shortfall within 12 months' : ''}. Management's plans are insufficient to mitigate these conditions, and required disclosures are not adequate. An adverse opinion is warranted.`,
    };
  }

  return {
    conclusion: 'substantial_doubt_exists',
    opinionImpact: 'emphasis_of_matter',
    rationale: `Substantial doubt exists about the entity's ability to continue as a going concern. ${triggeredCount} going concern indicators identified (${highSeverityCount} high severity)${cashShortfall ? ', with projected cash shortfall within 12 months' : ''}. ${hasFeasiblePlans ? 'Management plans are not sufficient to fully mitigate the conditions.' : 'No feasible management plans have been presented.'} Adequate disclosures are included in the financial statements. An emphasis of matter paragraph is required in the audit report.`,
  };
}
