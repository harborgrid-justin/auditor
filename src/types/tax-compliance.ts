// ============================================================
// Enterprise Tax Compliance Type Definitions
// ============================================================

// --- Tax Parameter Registry ---

export type ParameterValueType = 'currency' | 'percentage' | 'integer' | 'boolean';

export interface TaxParameter {
  code: string;
  taxYear: number;
  value: number;
  valueType: ParameterValueType;
  entityTypes: string[];       // ['c_corp', 's_corp', ...] or ['all']
  citation: string;
  legislationId?: string;
  effectiveDate?: string;
  sunsetDate?: string;
  notes?: string;
}

export interface TaxParameterDefinition {
  code: string;
  displayName: string;
  description: string;
  ircSection?: string;
  category: string;
  valueType: ParameterValueType;
  inflationAdjusted: boolean;
}

// --- Legislation Tracker ---

export type LegislationStatus = 'active' | 'partially_sunset' | 'fully_sunset' | 'superseded';

export interface Legislation {
  id: string;
  name: string;
  shortName: string;
  publicLaw?: string;
  enactedDate: string;
  effectiveDate: string;
  sunsetDate?: string;
  status: LegislationStatus;
  affectedSections: string[];
  summary: string;
}

export interface LegislationRuleLink {
  id: string;
  legislationId: string;
  ruleId: string;
  parameterCode?: string;
  impactDescription: string;
}

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type AlertType = 'sunset_approaching' | 'new_law_effective' | 'parameter_changed' | 'rule_affected';

export interface LegislativeAlert {
  legislationName: string;
  shortName: string;
  provisionDescription: string;
  ircSection?: string;
  alertType: AlertType;
  severity: AlertSeverity;
  message: string;
  affectedRuleIds: string[];
  affectedParameterCodes: string[];
  sunsetDate?: string;
  taxYear: number;
}

export interface LegislativeComplianceResult {
  taxYear: number;
  activeLegislation: Legislation[];
  alerts: LegislativeAlert[];
  sunsetProvisions: { legislation: Legislation; sunsetDate: string; daysRemaining: number }[];
}

// --- Uncertain Tax Positions (ASC 740-10 / FIN 48) ---

export type UTPStatus = 'identified' | 'analyzed' | 'reserved' | 'settled' | 'lapsed';

export type TechnicalMeritsRating = 'strong' | 'probable' | 'more_likely_than_not' | 'less_likely' | 'unlikely';

export interface MeasurementOutcome {
  amount: number;
  probability: number;  // 0-1
}

export interface UncertainTaxPosition {
  id: string;
  engagementId: string;
  positionDescription: string;
  ircSection: string;
  taxYear: number;
  grossAmount: number;
  recognitionThresholdMet: boolean;
  technicalMeritsRating?: TechnicalMeritsRating;
  measurementAmount?: number;
  interestAccrual: number;
  penaltyAccrual: number;
  totalReserve: number;
  status: UTPStatus;
  expirationDate?: string;
  supportingDocumentation?: string;
}

export interface UTPRollforward {
  taxYear: number;
  beginningBalance: number;
  additions: number;
  reductions: number;
  settlements: number;
  lapseOfStatute: number;
  endingBalance: number;
  effectOnETR?: number;
  interestAndPenalties: number;
}

export interface UTPMeasurementResult {
  grossBenefit: number;
  recognizedBenefit: number;
  unrecognizedBenefit: number;
  largestAmountThreshold: number;
}

// --- Penalty & Interest Engine ---

export type PenaltyType =
  | 'failure_to_file'
  | 'failure_to_pay'
  | 'accuracy_related'
  | 'substantial_understatement'
  | 'negligence'
  | 'transfer_pricing'
  | 'estimated_tax';

export interface PenaltyAssessment {
  type: PenaltyType;
  ircSection: string;
  baseAmount: number;
  penaltyRate: number;
  penaltyAmount: number;
  interestAmount: number;
  totalExposure: number;
  mitigatingFactors: string[];
  defenseAvailable: boolean;
  defenseDescription?: string;
}

export interface InterestComputation {
  principalAmount: number;
  startDate: string;
  endDate: string;
  applicableRate: number;
  dailyCompounding: boolean;
  totalInterest: number;
}

export interface PenaltyExposureSummary {
  engagementId: string;
  taxYear: number;
  assessments: PenaltyAssessment[];
  totalPenaltyExposure: number;
  totalInterestExposure: number;
  grandTotal: number;
}
