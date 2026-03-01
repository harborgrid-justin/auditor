export type Framework = 'GAAP' | 'IRS' | 'SOX' | 'PCAOB' | 'DOD_FMR';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingStatus = 'open' | 'resolved' | 'accepted' | 'in_review' | 'reviewer_approved' | 'reviewer_rejected';

export interface AuditFinding {
  id: string;
  engagementId: string;
  ruleId: string;
  framework: Framework;
  severity: Severity;
  title: string;
  description: string;
  citation: string;
  remediation: string;
  amountImpact: number | null;
  affectedAccounts: string[];
  status: FindingStatus;
  createdAt: string;
}

export interface AuditRule {
  id: string;
  name: string;
  framework: Framework;
  category: string;
  description: string;
  citation: string;
  defaultSeverity: Severity;
  enabled: boolean;
  effectiveDate?: string;
  sunsetDate?: string;
  check: (data: EngagementData) => AuditFinding[];
}

export interface EngagementData {
  engagementId: string;
  accounts: import('./financial').Account[];
  trialBalance: import('./financial').TrialBalanceEntry[];
  journalEntries: import('./financial').JournalEntry[];
  financialStatements: import('./financial').FinancialStatement[];
  taxData: import('./financial').TaxData[];
  soxControls: import('./sox').SOXControl[];
  materialityThreshold: number;
  fiscalYearEnd: string;
  priorPeriodAccounts?: import('./financial').Account[];
  taxYear: number;
  entityType?: string;
  uncertainTaxPositions?: import('./tax-compliance').UncertainTaxPosition[];
  dodData?: import('./dod-fmr').DoDEngagementData;
}

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  framework: Framework;
  findings: AuditFinding[];
  executionTimeMs: number;
}

export interface AnalysisResult {
  framework: Framework;
  totalRulesRun: number;
  totalFindings: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  infoCount: number;
  findings: AuditFinding[];
  executionTimeMs: number;
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#2563eb',
  info: '#6b7280',
};

export const FRAMEWORK_LABELS: Record<Framework, string> = {
  GAAP: 'GAAP (ASC)',
  IRS: 'IRS / Tax Code',
  SOX: 'SOX 302/404',
  PCAOB: 'PCAOB Standards',
  DOD_FMR: 'DoD FMR (7000.14-R)',
};
