/**
 * FFMIA (Federal Financial Management Improvement Act) Compliance Assessment
 *
 * Evaluates compliance with the three requirements of FFMIA (P.L. 104-208):
 *
 *   1. Federal Financial Management Systems Requirements (FFMSR)
 *      - Systems must comply with OMB Circular A-127, Financial Management Systems
 *      - Systems must support the USSGL at the transaction level
 *      - Systems must provide reliable, timely financial information
 *
 *   2. Federal Accounting Standards (FASAB/SFFAS)
 *      - Transactions must be recorded per FASAB standards
 *      - SFFAS 1-56+ must be correctly applied
 *      - Proper recognition, measurement, and disclosure
 *
 *   3. USSGL at Transaction Level
 *      - Every transaction must post to valid USSGL accounts
 *      - Dual-track (proprietary + budgetary) posting required
 *      - Crosswalk tables must reconcile
 *
 * FFMIA is mandatory for CFO Act agencies (all DoD components). Non-compliance
 * results in a separate reporting requirement in the audit opinion per
 * OMB Bulletin 24-01 and OMB Circular A-136.
 *
 * References:
 *   - P.L. 104-208, FFMIA (1996)
 *   - OMB Circular A-127 (Financial Management Systems)
 *   - OMB Circular A-136, Section II.4 (FFMIA Reporting)
 *   - DoD FMR Vol. 1, Ch. 1 (General Financial Management Information)
 *   - DoD FMR Vol. 4, Ch. 2 (USSGL)
 *   - FASAB Handbook (SFFAS 1-56+)
 */

import type {
  USSGLAccount,
  USSGLTransaction,
  DualTrackReconciliation,
  Appropriation,
  DoDEngagementData,
  FIARAssessment,
} from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FFMIAComplianceLevel = 'compliant' | 'substantially_compliant' | 'non_compliant';

export interface FFMIASystemRequirement {
  id: string;
  requirement: string;
  category: 'financial_system' | 'accounting_standards' | 'ussgl_transaction';
  description: string;
  compliant: boolean;
  findings: string[];
  references: string[];
}

export interface FFMIAAssessment {
  id: string;
  engagementId: string;
  assessmentDate: string;
  fiscalYear: number;

  // Three prong results
  financialSystemCompliance: FFMIAComplianceLevel;
  financialSystemFindings: FFMIASystemRequirement[];

  accountingStandardsCompliance: FFMIAComplianceLevel;
  accountingStandardsFindings: FFMIASystemRequirement[];

  ussglCompliance: FFMIAComplianceLevel;
  ussglFindings: FFMIASystemRequirement[];

  // Overall
  overallCompliance: FFMIAComplianceLevel;
  materialNonConformances: string[];
  correctiveActions: Array<{
    finding: string;
    action: string;
    targetDate: string;
    responsible: string;
  }>;

  assessedBy: string;
}

// ---------------------------------------------------------------------------
// USSGL Account Validation
// ---------------------------------------------------------------------------

/** Valid USSGL account number ranges per Treasury Financial Manual */
const VALID_USSGL_RANGES = [
  { min: 1000, max: 1999, category: 'asset', basis: 'proprietary' },
  { min: 2000, max: 2999, category: 'liability', basis: 'proprietary' },
  { min: 3000, max: 3999, category: 'net_position', basis: 'proprietary' },
  { min: 4000, max: 4999, category: 'budgetary_resource', basis: 'budgetary' },
  { min: 5000, max: 5999, category: 'revenue_expense', basis: 'proprietary' },
  { min: 6000, max: 6999, category: 'revenue_expense', basis: 'proprietary' },
  { min: 7000, max: 7999, category: 'gain_loss', basis: 'proprietary' },
];

function isValidUSSGLAccount(accountNumber: string): boolean {
  const num = parseInt(accountNumber, 10);
  if (isNaN(num)) return false;
  return VALID_USSGL_RANGES.some((r) => num >= r.min && num <= r.max);
}

function getExpectedBasis(accountNumber: string): string | null {
  const num = parseInt(accountNumber, 10);
  if (isNaN(num)) return null;
  const range = VALID_USSGL_RANGES.find((r) => num >= r.min && num <= r.max);
  return range?.basis ?? null;
}

// ---------------------------------------------------------------------------
// Financial System Requirements Assessment (Prong 1)
// ---------------------------------------------------------------------------

function assessFinancialSystems(data: DoDEngagementData): FFMIASystemRequirement[] {
  const requirements: FFMIASystemRequirement[] = [];

  // FS-1: System supports USSGL at transaction level
  const hasUSSGLAccounts = data.ussglAccounts.length > 0;
  const hasUSSGLTransactions = data.ussglTransactions.length > 0;
  requirements.push({
    id: uuid(),
    requirement: 'USSGL Transaction-Level Support',
    category: 'financial_system',
    description: 'Financial system must post all transactions to USSGL accounts at the transaction level (OMB A-127)',
    compliant: hasUSSGLAccounts && hasUSSGLTransactions,
    findings: !hasUSSGLAccounts
      ? ['No USSGL accounts configured in financial system']
      : !hasUSSGLTransactions
        ? ['No USSGL transactions recorded — system may not post at transaction level']
        : [],
    references: ['OMB Circular A-127', 'DoD FMR Vol. 4, Ch. 2'],
  });

  // FS-2: Dual-track accounting support
  const proprietaryAccounts = data.ussglAccounts.filter((a) => a.accountType === 'proprietary');
  const budgetaryAccounts = data.ussglAccounts.filter((a) => a.accountType === 'budgetary');
  const hasDualTrack = proprietaryAccounts.length > 0 && budgetaryAccounts.length > 0;
  requirements.push({
    id: uuid(),
    requirement: 'Dual-Track Accounting Support',
    category: 'financial_system',
    description: 'System must maintain both proprietary and budgetary accounts per USSGL requirements',
    compliant: hasDualTrack,
    findings: !hasDualTrack
      ? [
          `System has ${proprietaryAccounts.length} proprietary and ${budgetaryAccounts.length} budgetary accounts. Both tracks are required.`,
        ]
      : [],
    references: ['DoD FMR Vol. 4, Ch. 2', 'Treasury Financial Manual 2-4700'],
  });

  // FS-3: Fund control hierarchy
  const hasFundControls = data.fundControls.length > 0;
  const controlLevels = new Set(data.fundControls.map((fc) => fc.controlLevel));
  const hasApportionment = controlLevels.has('apportionment');
  const hasAllotment = controlLevels.has('allotment');
  requirements.push({
    id: uuid(),
    requirement: 'Fund Control Hierarchy',
    category: 'financial_system',
    description: 'System must enforce apportionment → allotment → sub-allotment fund control hierarchy',
    compliant: hasFundControls && hasApportionment && hasAllotment,
    findings: !hasFundControls
      ? ['No fund control records — system does not enforce fund control hierarchy']
      : !hasApportionment
        ? ['Missing apportionment level in fund control hierarchy']
        : !hasAllotment
          ? ['Missing allotment level in fund control hierarchy']
          : [],
    references: ['DoD FMR Vol. 3, Ch. 8', '31 U.S.C. §1517'],
  });

  // FS-4: Appropriation lifecycle tracking
  const hasAppropriations = data.appropriations.length > 0;
  const statuses = new Set(data.appropriations.map((a) => a.status));
  requirements.push({
    id: uuid(),
    requirement: 'Appropriation Lifecycle Management',
    category: 'financial_system',
    description: 'System must track appropriation lifecycle (current → expired → cancelled)',
    compliant: hasAppropriations,
    findings: !hasAppropriations
      ? ['No appropriations configured in system']
      : statuses.size === 1
        ? [`All appropriations in single status "${[...statuses][0]}" — lifecycle tracking may not be active`]
        : [],
    references: ['DoD FMR Vol. 3, Ch. 2', '31 U.S.C. §1552-1555'],
  });

  // FS-5: Timely recording
  const recentTransactions = data.ussglTransactions.filter((t) => {
    const daysSincePosting = (Date.now() - new Date(t.postingDate).getTime()) / (1000 * 60 * 60 * 24);
    return daysSincePosting <= 30;
  });
  const hasRecentActivity = recentTransactions.length > 0 || data.ussglTransactions.length === 0;
  requirements.push({
    id: uuid(),
    requirement: 'Timely Transaction Recording',
    category: 'financial_system',
    description: 'System must record transactions in a timely manner per OMB A-123',
    compliant: hasRecentActivity,
    findings: !hasRecentActivity
      ? ['No transactions recorded in the last 30 days — timeliness of recording may be deficient']
      : [],
    references: ['OMB Circular A-123', 'DoD FMR Vol. 4, Ch. 3'],
  });

  return requirements;
}

// ---------------------------------------------------------------------------
// Federal Accounting Standards Assessment (Prong 2)
// ---------------------------------------------------------------------------

function assessAccountingStandards(data: DoDEngagementData): FFMIASystemRequirement[] {
  const requirements: FFMIASystemRequirement[] = [];

  // AS-1: SFFAS 1 — Accounting for Selected Assets and Liabilities
  const hasAssets = data.ussglAccounts.some(
    (a) => a.category === 'asset' && a.endBalance !== 0
  );
  const hasLiabilities = data.ussglAccounts.some(
    (a) => a.category === 'liability' && a.endBalance !== 0
  );
  requirements.push({
    id: uuid(),
    requirement: 'SFFAS 1 — Assets and Liabilities',
    category: 'accounting_standards',
    description: 'Selected assets and liabilities must be recognized per SFFAS 1',
    compliant: hasAssets && hasLiabilities,
    findings: !hasAssets
      ? ['No asset accounts with balances — SFFAS 1 recognition requirements may not be met']
      : !hasLiabilities
        ? ['No liability accounts with balances — SFFAS 1 recognition requirements may not be met']
        : [],
    references: ['SFFAS 1', 'DoD FMR Vol. 4, Ch. 6'],
  });

  // AS-2: SFFAS 5 — Accounting for Liabilities
  const liabilityAccounts = data.ussglAccounts.filter((a) => a.category === 'liability');
  requirements.push({
    id: uuid(),
    requirement: 'SFFAS 5 — Liabilities Recognition',
    category: 'accounting_standards',
    description: 'Liabilities must be recognized when incurred per SFFAS 5',
    compliant: liabilityAccounts.length > 0,
    findings: liabilityAccounts.length === 0
      ? ['No liability accounts found — SFFAS 5 compliance cannot be verified']
      : [],
    references: ['SFFAS 5', 'DoD FMR Vol. 4, Ch. 9'],
  });

  // AS-3: SFFAS 7 — Revenue Recognition
  const revenueAccounts = data.ussglAccounts.filter((a) => a.category === 'revenue');
  const hasRevenue = revenueAccounts.length > 0 || data.collections.length > 0;
  requirements.push({
    id: uuid(),
    requirement: 'SFFAS 7 — Revenue Recognition',
    category: 'accounting_standards',
    description: 'Exchange and non-exchange revenue must be recognized per SFFAS 7',
    compliant: hasRevenue,
    findings: !hasRevenue
      ? ['No revenue accounts or collections found — SFFAS 7 compliance cannot be assessed']
      : [],
    references: ['SFFAS 7', 'DoD FMR Vol. 4, Ch. 10'],
  });

  // AS-4: SFFAS 4 — Managerial Cost Accounting
  const expenseAccounts = data.ussglAccounts.filter((a) => a.category === 'expense');
  requirements.push({
    id: uuid(),
    requirement: 'SFFAS 4 — Managerial Cost Accounting',
    category: 'accounting_standards',
    description: 'Full cost of outputs must be accumulated and reported per SFFAS 4',
    compliant: expenseAccounts.length > 0,
    findings: expenseAccounts.length === 0
      ? ['No expense accounts found — SFFAS 4 cost accounting requirements may not be met']
      : [],
    references: ['SFFAS 4', 'DoD FMR Vol. 4, Ch. 21'],
  });

  // AS-5: SFFAS 6 — Property, Plant, and Equipment
  // Check for capitalized assets via working capital funds or asset accounts in 1700-1799 range
  const ppeAccounts = data.ussglAccounts.filter((a) => {
    const num = parseInt(a.accountNumber, 10);
    return num >= 1700 && num <= 1799;
  });
  const hasWCF = data.workingCapitalFunds.some((w) => w.capitalizedAssets > 0);
  requirements.push({
    id: uuid(),
    requirement: 'SFFAS 6 — Property, Plant, and Equipment',
    category: 'accounting_standards',
    description: 'PP&E must be recognized, measured, and disclosed per SFFAS 6',
    compliant: ppeAccounts.length > 0 || hasWCF,
    findings: ppeAccounts.length === 0 && !hasWCF
      ? ['No PP&E accounts (USSGL 1700-1799) or capitalized WCF assets found']
      : [],
    references: ['SFFAS 6', 'DoD FMR Vol. 4, Ch. 7'],
  });

  // AS-6: Budgetary accounting per SFFAS 1/SFFAS 7
  const budgetaryResources = data.ussglAccounts.filter((a) => a.category === 'budgetary_resource');
  requirements.push({
    id: uuid(),
    requirement: 'SFFAS — Budgetary Accounting',
    category: 'accounting_standards',
    description: 'Budgetary resources must be recorded per FASAB standards',
    compliant: budgetaryResources.length > 0,
    findings: budgetaryResources.length === 0
      ? ['No budgetary resource accounts found — budgetary accounting may be deficient']
      : [],
    references: ['SFFAS 7', 'DoD FMR Vol. 4, Ch. 11'],
  });

  return requirements;
}

// ---------------------------------------------------------------------------
// USSGL Transaction-Level Assessment (Prong 3)
// ---------------------------------------------------------------------------

function assessUSSGLCompliance(data: DoDEngagementData): FFMIASystemRequirement[] {
  const requirements: FFMIASystemRequirement[] = [];

  // UG-1: All accounts have valid USSGL numbers
  const invalidAccounts = data.ussglAccounts.filter((a) => !isValidUSSGLAccount(a.accountNumber));
  requirements.push({
    id: uuid(),
    requirement: 'Valid USSGL Account Numbers',
    category: 'ussgl_transaction',
    description: 'All accounts must use valid USSGL account numbers per Treasury Financial Manual',
    compliant: invalidAccounts.length === 0,
    findings: invalidAccounts.map(
      (a) => `Account ${a.accountNumber} (${a.accountTitle}) is not a valid USSGL account number`
    ),
    references: ['Treasury Financial Manual 2-4700', 'DoD FMR Vol. 4, Ch. 2'],
  });

  // UG-2: Account classification consistency
  const misclassified = data.ussglAccounts.filter((a) => {
    const expected = getExpectedBasis(a.accountNumber);
    return expected !== null && expected !== a.accountType;
  });
  requirements.push({
    id: uuid(),
    requirement: 'Account Classification Consistency',
    category: 'ussgl_transaction',
    description: 'Account basis (proprietary/budgetary) must match USSGL classification',
    compliant: misclassified.length === 0,
    findings: misclassified.map(
      (a) =>
        `Account ${a.accountNumber} classified as ${a.accountType} but USSGL range indicates ${getExpectedBasis(a.accountNumber)}`
    ),
    references: ['Treasury Financial Manual 2-4700', 'DoD FMR Vol. 4, Ch. 2'],
  });

  // UG-3: Dual posting of transactions
  const dualPosted = data.ussglTransactions.filter((t) => t.proprietaryOrBudgetary === 'both');
  const singleTrack = data.ussglTransactions.filter(
    (t) => t.proprietaryOrBudgetary === 'proprietary' || t.proprietaryOrBudgetary === 'budgetary'
  );
  const hasDualPosting = dualPosted.length > 0 || (singleTrack.length > 0 && data.ussglTransactions.length > 0);
  requirements.push({
    id: uuid(),
    requirement: 'Dual-Track Transaction Posting',
    category: 'ussgl_transaction',
    description: 'Transactions affecting both tracks must be posted to both proprietary and budgetary accounts',
    compliant: hasDualPosting || data.ussglTransactions.length === 0,
    findings: !hasDualPosting && data.ussglTransactions.length > 0
      ? ['No dual-track posted transactions found — system may not enforce dual posting requirement']
      : [],
    references: ['DoD FMR Vol. 4, Ch. 2, para 020201', 'USSGL Crosswalk Tables'],
  });

  // UG-4: Trial balance check — debits must equal credits
  const proprietaryAccounts = data.ussglAccounts.filter((a) => a.accountType === 'proprietary');
  const budgetaryAccounts = data.ussglAccounts.filter((a) => a.accountType === 'budgetary');

  const propDebits = proprietaryAccounts
    .filter((a) => a.normalBalance === 'debit')
    .reduce((sum, a) => sum + a.endBalance, 0);
  const propCredits = proprietaryAccounts
    .filter((a) => a.normalBalance === 'credit')
    .reduce((sum, a) => sum + a.endBalance, 0);
  const propBalanced = Math.abs(propDebits - propCredits) < 0.01;

  const budDebits = budgetaryAccounts
    .filter((a) => a.normalBalance === 'debit')
    .reduce((sum, a) => sum + a.endBalance, 0);
  const budCredits = budgetaryAccounts
    .filter((a) => a.normalBalance === 'credit')
    .reduce((sum, a) => sum + a.endBalance, 0);
  const budBalanced = Math.abs(budDebits - budCredits) < 0.01;

  const trialBalanced = (propBalanced && budBalanced) || data.ussglAccounts.length === 0;
  const tbFindings: string[] = [];
  if (!propBalanced && proprietaryAccounts.length > 0) {
    tbFindings.push(
      `Proprietary trial balance out of balance: debits $${propDebits.toFixed(2)} vs credits $${propCredits.toFixed(2)} (difference: $${Math.abs(propDebits - propCredits).toFixed(2)})`
    );
  }
  if (!budBalanced && budgetaryAccounts.length > 0) {
    tbFindings.push(
      `Budgetary trial balance out of balance: debits $${budDebits.toFixed(2)} vs credits $${budCredits.toFixed(2)} (difference: $${Math.abs(budDebits - budCredits).toFixed(2)})`
    );
  }
  requirements.push({
    id: uuid(),
    requirement: 'Trial Balance Integrity',
    category: 'ussgl_transaction',
    description: 'Both proprietary and budgetary trial balances must balance (debits = credits)',
    compliant: trialBalanced,
    findings: tbFindings,
    references: ['DoD FMR Vol. 4, Ch. 2', 'DoD FMR Vol. 6, Ch. 2'],
  });

  // UG-5: Normal balance integrity
  const abnormalBalances = data.ussglAccounts.filter((a) => {
    if (a.endBalance === 0) return false;
    if (a.normalBalance === 'debit' && a.endBalance < 0) return true;
    if (a.normalBalance === 'credit' && a.endBalance < 0) return true;
    return false;
  });
  requirements.push({
    id: uuid(),
    requirement: 'Normal Balance Compliance',
    category: 'ussgl_transaction',
    description: 'Account balances should be consistent with their normal balance designation',
    compliant: abnormalBalances.length === 0,
    findings: abnormalBalances.map(
      (a) =>
        `Account ${a.accountNumber} (${a.accountTitle}) has abnormal balance: ${a.endBalance} (normal: ${a.normalBalance})`
    ),
    references: ['USSGL Account Attributes', 'DoD FMR Vol. 4, Ch. 2'],
  });

  return requirements;
}

// ---------------------------------------------------------------------------
// Determine Compliance Level
// ---------------------------------------------------------------------------

function determineComplianceLevel(requirements: FFMIASystemRequirement[]): FFMIAComplianceLevel {
  if (requirements.length === 0) return 'non_compliant';
  const compliantCount = requirements.filter((r) => r.compliant).length;
  const ratio = compliantCount / requirements.length;
  if (ratio >= 1.0) return 'compliant';
  if (ratio >= 0.75) return 'substantially_compliant';
  return 'non_compliant';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Perform a comprehensive FFMIA compliance assessment.
 *
 * Evaluates all three prongs of FFMIA:
 * 1. Federal Financial Management Systems Requirements
 * 2. Federal Accounting Standards (FASAB/SFFAS)
 * 3. USSGL at Transaction Level
 *
 * Returns a detailed assessment suitable for inclusion in the federal audit opinion.
 */
export function performFFMIAAssessment(
  engagementId: string,
  data: DoDEngagementData,
  assessedBy: string
): FFMIAAssessment {
  const fsRequirements = assessFinancialSystems(data);
  const asRequirements = assessAccountingStandards(data);
  const ugRequirements = assessUSSGLCompliance(data);

  const fsCompliance = determineComplianceLevel(fsRequirements);
  const asCompliance = determineComplianceLevel(asRequirements);
  const ugCompliance = determineComplianceLevel(ugRequirements);

  // Overall is the worst of the three
  const levels: FFMIAComplianceLevel[] = [fsCompliance, asCompliance, ugCompliance];
  let overallCompliance: FFMIAComplianceLevel = 'compliant';
  if (levels.includes('non_compliant')) {
    overallCompliance = 'non_compliant';
  } else if (levels.includes('substantially_compliant')) {
    overallCompliance = 'substantially_compliant';
  }

  // Collect material non-conformances
  const allRequirements = [...fsRequirements, ...asRequirements, ...ugRequirements];
  const materialNonConformances = allRequirements
    .filter((r) => !r.compliant)
    .map((r) => `${r.requirement}: ${r.findings.join('; ')}`);

  // Generate corrective actions for non-compliant requirements
  const correctiveActions = allRequirements
    .filter((r) => !r.compliant)
    .map((r) => ({
      finding: r.requirement,
      action: `Address ${r.category.replace(/_/g, ' ')} deficiency: ${r.description}`,
      targetDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      responsible: 'Chief Financial Officer',
    }));

  return {
    id: uuid(),
    engagementId,
    assessmentDate: new Date().toISOString(),
    fiscalYear: data.fiscalYear,
    financialSystemCompliance: fsCompliance,
    financialSystemFindings: fsRequirements,
    accountingStandardsCompliance: asCompliance,
    accountingStandardsFindings: asRequirements,
    ussglCompliance: ugCompliance,
    ussglFindings: ugRequirements,
    overallCompliance,
    materialNonConformances,
    correctiveActions,
    assessedBy,
  };
}

/**
 * Generate the FFMIA section for the federal audit opinion.
 *
 * Per OMB Circular A-136, Section II.4, the auditor must report
 * whether the agency's financial management systems substantially
 * comply with FFMIA requirements.
 */
export function generateFFMIAOpinionSection(assessment: FFMIAAssessment): string {
  const lines: string[] = [];

  lines.push('FEDERAL FINANCIAL MANAGEMENT IMPROVEMENT ACT (FFMIA) COMPLIANCE');
  lines.push('================================================================');
  lines.push('');

  if (assessment.overallCompliance === 'compliant') {
    lines.push(
      'In our opinion, the agency\'s financial management systems substantially comply with ' +
        'the three requirements of the Federal Financial Management Improvement Act of 1996:'
    );
  } else if (assessment.overallCompliance === 'substantially_compliant') {
    lines.push(
      'The agency\'s financial management systems substantially comply with FFMIA requirements, ' +
        'with certain exceptions noted below that require remediation:'
    );
  } else {
    lines.push(
      'The agency\'s financial management systems do NOT substantially comply with the ' +
        'Federal Financial Management Improvement Act of 1996. The following instances of ' +
        'non-compliance were identified:'
    );
  }

  lines.push('');
  lines.push(`1. Federal Financial Management Systems Requirements: ${formatLevel(assessment.financialSystemCompliance)}`);
  lines.push(`2. Federal Accounting Standards (FASAB/SFFAS):        ${formatLevel(assessment.accountingStandardsCompliance)}`);
  lines.push(`3. USSGL at Transaction Level:                        ${formatLevel(assessment.ussglCompliance)}`);

  if (assessment.materialNonConformances.length > 0) {
    lines.push('');
    lines.push('Material Non-Conformances:');
    assessment.materialNonConformances.forEach((nc, i) => {
      lines.push(`  ${i + 1}. ${nc}`);
    });
  }

  if (assessment.correctiveActions.length > 0) {
    lines.push('');
    lines.push('Required Corrective Actions:');
    assessment.correctiveActions.forEach((ca, i) => {
      lines.push(`  ${i + 1}. ${ca.action} (Target: ${ca.targetDate})`);
    });
  }

  return lines.join('\n');
}

function formatLevel(level: FFMIAComplianceLevel): string {
  switch (level) {
    case 'compliant':
      return 'COMPLIANT';
    case 'substantially_compliant':
      return 'SUBSTANTIALLY COMPLIANT (with exceptions)';
    case 'non_compliant':
      return 'NON-COMPLIANT';
  }
}
