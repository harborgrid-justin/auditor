export type ControlType = 'preventive' | 'detective';
export type ControlFrequency = 'continuous' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually';
export type ControlStatus = 'not_tested' | 'effective' | 'deficient' | 'significant_deficiency' | 'material_weakness';
export type TestResult = 'effective' | 'deficient' | 'material_weakness';
export type ControlCategory = 'entity_level' | 'transaction' | 'itgc' | 'disclosure' | 'journal_entry';

export interface SOXControl {
  id: string;
  engagementId: string;
  controlId: string;
  title: string;
  description: string;
  controlType: ControlType;
  category: ControlCategory;
  frequency: ControlFrequency;
  owner: string;
  status: ControlStatus;
  assertion: string[];
  riskLevel: 'high' | 'medium' | 'low';
  automatedManual: 'automated' | 'manual' | 'it_dependent';
}

export interface SOXTestResult {
  id: string;
  controlId: string;
  testDate: string;
  testedBy: string;
  result: TestResult;
  sampleSize: number;
  exceptionsFound: number;
  evidence: string;
  notes: string;
}

export interface SOXDeficiency {
  id: string;
  engagementId: string;
  controlId: string;
  classification: 'deficiency' | 'significant_deficiency' | 'material_weakness';
  description: string;
  impact: string;
  compensatingControls: string;
  remediationPlan: string;
  targetDate: string;
  status: 'open' | 'remediated' | 'accepted';
}

export interface SOXWalkthrough {
  id: string;
  controlId: string;
  performedBy: string;
  performedDate: string;
  processDescription: string;
  controlPointIdentified: boolean;
  controlDesignEffective: boolean;
  implementationVerified: boolean;
  notes: string;
}

export const MANAGEMENT_ASSERTIONS = [
  'Existence/Occurrence',
  'Completeness',
  'Valuation/Allocation',
  'Rights & Obligations',
  'Presentation & Disclosure',
  'Accuracy',
  'Cutoff',
  'Classification',
] as const;

export const DEFAULT_SOX_CONTROLS: Partial<SOXControl>[] = [
  {
    controlId: 'JE-01',
    title: 'Journal Entry Approval',
    description: 'All journal entries require supervisory approval before posting to the general ledger.',
    controlType: 'preventive',
    category: 'journal_entry',
    frequency: 'continuous',
    assertion: ['Accuracy', 'Existence/Occurrence'],
    riskLevel: 'high',
    automatedManual: 'manual',
  },
  {
    controlId: 'JE-02',
    title: 'Non-Standard Journal Entry Review',
    description: 'Non-standard, top-side, and post-closing journal entries are subject to additional review by management.',
    controlType: 'detective',
    category: 'journal_entry',
    frequency: 'monthly',
    assertion: ['Accuracy', 'Existence/Occurrence', 'Completeness'],
    riskLevel: 'high',
    automatedManual: 'manual',
  },
  {
    controlId: 'FC-01',
    title: 'Monthly Account Reconciliation',
    description: 'Significant balance sheet accounts are reconciled monthly with independent review.',
    controlType: 'detective',
    category: 'transaction',
    frequency: 'monthly',
    assertion: ['Existence/Occurrence', 'Completeness', 'Valuation/Allocation'],
    riskLevel: 'high',
    automatedManual: 'manual',
  },
  {
    controlId: 'FC-02',
    title: 'Financial Close Checklist',
    description: 'A standardized financial close checklist is completed each period to ensure all close activities are performed.',
    controlType: 'preventive',
    category: 'transaction',
    frequency: 'monthly',
    assertion: ['Completeness', 'Cutoff'],
    riskLevel: 'medium',
    automatedManual: 'manual',
  },
  {
    controlId: 'IT-01',
    title: 'User Access Review',
    description: 'Access to financial systems is reviewed quarterly to ensure appropriate segregation of duties.',
    controlType: 'detective',
    category: 'itgc',
    frequency: 'quarterly',
    assertion: ['Existence/Occurrence', 'Completeness'],
    riskLevel: 'high',
    automatedManual: 'manual',
  },
  {
    controlId: 'IT-02',
    title: 'Change Management',
    description: 'All changes to financial reporting systems are authorized, tested, and approved before implementation.',
    controlType: 'preventive',
    category: 'itgc',
    frequency: 'continuous',
    assertion: ['Accuracy', 'Completeness'],
    riskLevel: 'high',
    automatedManual: 'manual',
  },
  {
    controlId: 'MR-01',
    title: 'Management Review of Financial Results',
    description: 'Management reviews financial results against budget and prior period with investigation of significant variances.',
    controlType: 'detective',
    category: 'entity_level',
    frequency: 'monthly',
    assertion: ['Valuation/Allocation', 'Completeness', 'Accuracy'],
    riskLevel: 'medium',
    automatedManual: 'manual',
  },
  {
    controlId: 'SD-01',
    title: 'Segregation of Duties',
    description: 'Incompatible duties are segregated to prevent unauthorized transactions. No single individual can initiate, approve, and record a transaction.',
    controlType: 'preventive',
    category: 'entity_level',
    frequency: 'continuous',
    assertion: ['Existence/Occurrence', 'Accuracy'],
    riskLevel: 'high',
    automatedManual: 'manual',
  },
];
