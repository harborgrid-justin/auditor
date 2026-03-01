import { describe, it, expect } from 'vitest';
import {
  performFFMIAAssessment,
  generateFFMIAOpinionSection,
} from '@/lib/engine/federal-accounting/ffmia-compliance';
import type { DoDEngagementData } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a minimal empty DoDEngagementData object. */
function emptyEngagementData(overrides: Partial<DoDEngagementData> = {}): DoDEngagementData {
  return {
    appropriations: [],
    obligations: [],
    ussglAccounts: [],
    ussglTransactions: [],
    disbursements: [],
    collections: [],
    militaryPayRecords: [],
    civilianPayRecords: [],
    travelOrders: [],
    travelVouchers: [],
    travelCardTransactions: [],
    contractPayments: [],
    contracts: [],
    interagencyAgreements: [],
    intragovernmentalTransactions: [],
    workingCapitalFunds: [],
    specialAccounts: [],
    nafAccounts: [],
    adaViolations: [],
    fiarAssessments: [],
    fundControls: [],
    budgetObjectCodes: [],
    sfisElements: [],
    fiscalYear: 2025,
    dodComponent: 'TEST-COMPONENT',
    ...overrides,
  };
}

/** Build a fully-compliant DoDEngagementData. */
function fullyCompliantData(): DoDEngagementData {
  const now = new Date().toISOString();
  const recentDate = new Date().toISOString().split('T')[0];

  return emptyEngagementData({
    ussglAccounts: [
      // Proprietary: assets (1xxx)
      {
        id: 'acct-1',
        engagementId: 'eng-1',
        accountNumber: '1010',
        accountTitle: 'Fund Balance with Treasury',
        normalBalance: 'debit',
        accountType: 'proprietary',
        category: 'asset',
        beginBalance: 500000,
        endBalance: 600000,
        fiscalYear: 2025,
      },
      // Proprietary: liabilities (2xxx)
      {
        id: 'acct-2',
        engagementId: 'eng-1',
        accountNumber: '2110',
        accountTitle: 'Accounts Payable',
        normalBalance: 'credit',
        accountType: 'proprietary',
        category: 'liability',
        beginBalance: 200000,
        endBalance: 500000,
        fiscalYear: 2025,
      },
      // Proprietary: net position (3xxx)
      {
        id: 'acct-3',
        engagementId: 'eng-1',
        accountNumber: '3100',
        accountTitle: 'Unexpended Appropriations',
        normalBalance: 'credit',
        accountType: 'proprietary',
        category: 'net_position',
        beginBalance: 100000,
        endBalance: 400000,
        fiscalYear: 2025,
      },
      // Budgetary: resources (4xxx)
      {
        id: 'acct-4',
        engagementId: 'eng-1',
        accountNumber: '4510',
        accountTitle: 'Allotments - Realized Resources',
        normalBalance: 'debit',
        accountType: 'budgetary',
        category: 'budgetary_resource',
        beginBalance: 800000,
        endBalance: 900000,
        fiscalYear: 2025,
      },
      // Budgetary: status of resources (4xxx credit)
      {
        id: 'acct-5',
        engagementId: 'eng-1',
        accountNumber: '4610',
        accountTitle: 'Allotments - Expended Authority',
        normalBalance: 'credit',
        accountType: 'budgetary',
        category: 'budgetary_resource',
        beginBalance: 800000,
        endBalance: 900000,
        fiscalYear: 2025,
      },
      // Proprietary: revenue (5xxx)
      {
        id: 'acct-6',
        engagementId: 'eng-1',
        accountNumber: '5100',
        accountTitle: 'Revenue from Goods Sold',
        normalBalance: 'credit',
        accountType: 'proprietary',
        category: 'revenue',
        beginBalance: 0,
        endBalance: 100000,
        fiscalYear: 2025,
      },
      // Proprietary: expense (6xxx)
      {
        id: 'acct-7',
        engagementId: 'eng-1',
        accountNumber: '6100',
        accountTitle: 'Operating Expenses',
        normalBalance: 'debit',
        accountType: 'proprietary',
        category: 'expense',
        beginBalance: 0,
        endBalance: 100000,
        fiscalYear: 2025,
      },
      // PP&E account (1700-1799)
      {
        id: 'acct-8',
        engagementId: 'eng-1',
        accountNumber: '1750',
        accountTitle: 'Equipment',
        normalBalance: 'debit',
        accountType: 'proprietary',
        category: 'asset',
        beginBalance: 300000,
        endBalance: 300000,
        fiscalYear: 2025,
      },
    ],
    ussglTransactions: [
      {
        id: 'txn-1',
        engagementId: 'eng-1',
        transactionCode: 'A101',
        debitAccountId: 'acct-1',
        creditAccountId: 'acct-2',
        amount: 50000,
        postingDate: recentDate,
        documentNumber: 'DOC-001',
        description: 'Payment to vendor',
        fiscalYear: 2025,
        proprietaryOrBudgetary: 'both',
      },
      {
        id: 'txn-2',
        engagementId: 'eng-1',
        transactionCode: 'A102',
        debitAccountId: 'acct-4',
        creditAccountId: 'acct-5',
        amount: 50000,
        postingDate: recentDate,
        documentNumber: 'DOC-002',
        description: 'Allotment expenditure',
        fiscalYear: 2025,
        proprietaryOrBudgetary: 'budgetary',
      },
    ],
    fundControls: [
      {
        id: 'fc-1',
        appropriationId: 'app-1',
        controlLevel: 'apportionment',
        amount: 1000000,
        obligatedAgainst: 500000,
        expendedAgainst: 200000,
        availableBalance: 300000,
        controlledBy: 'OMB',
        effectiveDate: '2024-10-01',
      },
      {
        id: 'fc-2',
        appropriationId: 'app-1',
        controlLevel: 'allotment',
        amount: 800000,
        obligatedAgainst: 400000,
        expendedAgainst: 150000,
        availableBalance: 250000,
        controlledBy: 'CFO',
        effectiveDate: '2024-10-01',
      },
    ],
    appropriations: [
      {
        id: 'app-1',
        engagementId: 'eng-1',
        treasuryAccountSymbol: '097-0100',
        appropriationType: 'one_year',
        appropriationTitle: 'O&M, Army',
        budgetCategory: 'om',
        fiscalYearStart: '2024-10-01',
        fiscalYearEnd: '2025-09-30',
        totalAuthority: 1000000,
        apportioned: 900000,
        allotted: 800000,
        committed: 500000,
        obligated: 400000,
        disbursed: 200000,
        unobligatedBalance: 400000,
        status: 'current',
        createdAt: now,
      },
      {
        id: 'app-2',
        engagementId: 'eng-1',
        treasuryAccountSymbol: '097-0200',
        appropriationType: 'one_year',
        appropriationTitle: 'O&M, Army (Prior Year)',
        budgetCategory: 'om',
        fiscalYearStart: '2023-10-01',
        fiscalYearEnd: '2024-09-30',
        totalAuthority: 500000,
        apportioned: 500000,
        allotted: 500000,
        committed: 0,
        obligated: 0,
        disbursed: 0,
        unobligatedBalance: 0,
        status: 'expired',
        createdAt: now,
      },
    ],
    collections: [
      {
        id: 'col-1',
        engagementId: 'eng-1',
        appropriationId: 'app-1',
        collectionType: 'reimbursement',
        sourceEntity: 'NAVAIR',
        amount: 20000,
        collectionDate: recentDate,
        status: 'completed',
        createdAt: now,
      },
    ],
    workingCapitalFunds: [
      {
        id: 'wcf-1',
        engagementId: 'eng-1',
        fundName: 'Army WCF',
        fundType: 'supply',
        capitalizedAssets: 150000,
        accumulatedDepreciation: 30000,
        revenueFromOperations: 100000,
        costOfOperations: 90000,
        netOperatingResult: 10000,
        cashBalance: 50000,
        fiscalYear: 2025,
      },
    ],
  });
}

// ===========================================================================
// performFFMIAAssessment
// ===========================================================================

describe('performFFMIAAssessment', () => {
  it('returns compliant for fully compliant system', () => {
    const data = fullyCompliantData();
    const result = performFFMIAAssessment('eng-1', data, 'Auditor A');

    expect(result.engagementId).toBe('eng-1');
    expect(result.assessedBy).toBe('Auditor A');
    expect(result.fiscalYear).toBe(2025);
    expect(result.id).toBeTruthy();
    expect(result.assessmentDate).toBeTruthy();

    expect(result.financialSystemCompliance).toBe('compliant');
    expect(result.accountingStandardsCompliance).toBe('compliant');
    expect(result.ussglCompliance).toBe('compliant');
    expect(result.overallCompliance).toBe('compliant');

    expect(result.materialNonConformances).toHaveLength(0);
    expect(result.correctiveActions).toHaveLength(0);
  });

  it('returns non_compliant when no USSGL accounts are present', () => {
    const data = emptyEngagementData({
      ussglTransactions: [
        {
          id: 'txn-1',
          engagementId: 'eng-1',
          transactionCode: 'A101',
          debitAccountId: 'acct-1',
          creditAccountId: 'acct-2',
          amount: 50000,
          postingDate: new Date().toISOString().split('T')[0],
          documentNumber: 'DOC-001',
          description: 'Test',
          fiscalYear: 2025,
          proprietaryOrBudgetary: 'both',
        },
      ],
    });
    const result = performFFMIAAssessment('eng-1', data, 'Auditor B');

    // No USSGL accounts = failures in all three prongs
    expect(result.financialSystemCompliance).toBe('non_compliant');
    expect(result.accountingStandardsCompliance).toBe('non_compliant');
    expect(result.overallCompliance).toBe('non_compliant');
    expect(result.materialNonConformances.length).toBeGreaterThan(0);
    expect(result.correctiveActions.length).toBeGreaterThan(0);
  });

  it('returns non_compliant when missing dual-track accounts', () => {
    const data = emptyEngagementData({
      // Only proprietary accounts, no budgetary
      ussglAccounts: [
        {
          id: 'acct-1',
          engagementId: 'eng-1',
          accountNumber: '1010',
          accountTitle: 'Fund Balance with Treasury',
          normalBalance: 'debit',
          accountType: 'proprietary',
          category: 'asset',
          beginBalance: 100000,
          endBalance: 100000,
          fiscalYear: 2025,
        },
        {
          id: 'acct-2',
          engagementId: 'eng-1',
          accountNumber: '2110',
          accountTitle: 'Accounts Payable',
          normalBalance: 'credit',
          accountType: 'proprietary',
          category: 'liability',
          beginBalance: 100000,
          endBalance: 100000,
          fiscalYear: 2025,
        },
      ],
      ussglTransactions: [
        {
          id: 'txn-1',
          engagementId: 'eng-1',
          transactionCode: 'A101',
          debitAccountId: 'acct-1',
          creditAccountId: 'acct-2',
          amount: 10000,
          postingDate: new Date().toISOString().split('T')[0],
          documentNumber: 'DOC-001',
          description: 'Test transaction',
          fiscalYear: 2025,
          proprietaryOrBudgetary: 'proprietary',
        },
      ],
    });

    const result = performFFMIAAssessment('eng-1', data, 'Auditor C');

    // Missing budgetary accounts -> financial system dual-track fails
    const dualTrackFinding = result.financialSystemFindings.find(
      (f) => f.requirement === 'Dual-Track Accounting Support'
    );
    expect(dualTrackFinding).toBeDefined();
    expect(dualTrackFinding!.compliant).toBe(false);
    expect(dualTrackFinding!.findings.length).toBeGreaterThan(0);
    expect(dualTrackFinding!.findings[0]).toContain('0 budgetary accounts');
  });

  it('returns non_compliant for invalid USSGL account numbers', () => {
    const data = emptyEngagementData({
      ussglAccounts: [
        {
          id: 'acct-bad-1',
          engagementId: 'eng-1',
          accountNumber: '9999',
          accountTitle: 'Invalid Account',
          normalBalance: 'debit',
          accountType: 'proprietary',
          category: 'asset',
          beginBalance: 0,
          endBalance: 50000,
          fiscalYear: 2025,
        },
        {
          id: 'acct-bad-2',
          engagementId: 'eng-1',
          accountNumber: '0001',
          accountTitle: 'Another Invalid Account',
          normalBalance: 'credit',
          accountType: 'budgetary',
          category: 'budgetary_resource',
          beginBalance: 0,
          endBalance: 50000,
          fiscalYear: 2025,
        },
      ],
      ussglTransactions: [
        {
          id: 'txn-1',
          engagementId: 'eng-1',
          transactionCode: 'A101',
          debitAccountId: 'acct-bad-1',
          creditAccountId: 'acct-bad-2',
          amount: 10000,
          postingDate: new Date().toISOString().split('T')[0],
          documentNumber: 'DOC-001',
          description: 'Transaction with invalid accounts',
          fiscalYear: 2025,
          proprietaryOrBudgetary: 'both',
        },
      ],
    });

    const result = performFFMIAAssessment('eng-1', data, 'Auditor D');

    const invalidAccountFinding = result.ussglFindings.find(
      (f) => f.requirement === 'Valid USSGL Account Numbers'
    );
    expect(invalidAccountFinding).toBeDefined();
    expect(invalidAccountFinding!.compliant).toBe(false);
    expect(invalidAccountFinding!.findings.length).toBe(2);
    expect(invalidAccountFinding!.findings[0]).toContain('9999');
    expect(invalidAccountFinding!.findings[1]).toContain('0001');
  });

  it('returns substantially_compliant when >75% of requirements pass in a prong', () => {
    // Start from fully compliant data and introduce one failing requirement per prong
    const data = fullyCompliantData();

    // Remove expense accounts to fail SFFAS 4 (1 out of 6 accounting standards fails -> ~83% pass)
    data.ussglAccounts = data.ussglAccounts.filter((a) => a.category !== 'expense');

    const result = performFFMIAAssessment('eng-1', data, 'Auditor E');

    // Accounting standards: 5 out of 6 pass = 83% -> substantially_compliant
    expect(result.accountingStandardsCompliance).toBe('substantially_compliant');
    expect(result.overallCompliance).toBe('substantially_compliant');
    expect(result.materialNonConformances.length).toBeGreaterThan(0);
  });

  it('handles empty/minimal data gracefully', () => {
    const data = emptyEngagementData();
    const result = performFFMIAAssessment('eng-empty', data, 'Auditor F');

    expect(result.engagementId).toBe('eng-empty');
    expect(result.overallCompliance).toBe('non_compliant');
    expect(result.financialSystemFindings.length).toBeGreaterThan(0);
    expect(result.accountingStandardsFindings.length).toBeGreaterThan(0);
    expect(result.ussglFindings.length).toBeGreaterThan(0);
  });

  it('overall compliance is the worst of the three prongs', () => {
    // Create data that passes prong 1 and 3 but fails prong 2
    const data = fullyCompliantData();

    // Remove all liability, revenue, expense, budgetary_resource accounts to break prong 2 hard
    data.ussglAccounts = data.ussglAccounts.filter(
      (a) =>
        a.category !== 'liability' &&
        a.category !== 'revenue' &&
        a.category !== 'expense' &&
        a.category !== 'budgetary_resource'
    );

    const result = performFFMIAAssessment('eng-1', data, 'Auditor G');

    // Prong 2 should be non_compliant, driving overall to non_compliant
    expect(result.accountingStandardsCompliance).toBe('non_compliant');
    expect(result.overallCompliance).toBe('non_compliant');
  });

  it('generates corrective actions with target dates for non-compliant items', () => {
    const data = emptyEngagementData();
    const result = performFFMIAAssessment('eng-1', data, 'Auditor H');

    expect(result.correctiveActions.length).toBeGreaterThan(0);
    for (const action of result.correctiveActions) {
      expect(action.finding).toBeTruthy();
      expect(action.action).toBeTruthy();
      expect(action.targetDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(action.responsible).toBe('Chief Financial Officer');
    }
  });

  it('detects account classification mismatches', () => {
    const data = emptyEngagementData({
      ussglAccounts: [
        {
          id: 'acct-mis-1',
          engagementId: 'eng-1',
          accountNumber: '1010', // 1xxx = proprietary
          accountTitle: 'Misclassified Account',
          normalBalance: 'debit',
          accountType: 'budgetary', // wrong: should be proprietary
          category: 'asset',
          beginBalance: 0,
          endBalance: 100000,
          fiscalYear: 2025,
        },
        {
          id: 'acct-ok-1',
          engagementId: 'eng-1',
          accountNumber: '4510', // 4xxx = budgetary
          accountTitle: 'Budgetary Account',
          normalBalance: 'debit',
          accountType: 'budgetary',
          category: 'budgetary_resource',
          beginBalance: 0,
          endBalance: 100000,
          fiscalYear: 2025,
        },
      ],
      ussglTransactions: [
        {
          id: 'txn-1',
          engagementId: 'eng-1',
          transactionCode: 'A101',
          debitAccountId: 'acct-mis-1',
          creditAccountId: 'acct-ok-1',
          amount: 10000,
          postingDate: new Date().toISOString().split('T')[0],
          documentNumber: 'DOC-001',
          description: 'Test',
          fiscalYear: 2025,
          proprietaryOrBudgetary: 'both',
        },
      ],
    });

    const result = performFFMIAAssessment('eng-1', data, 'Auditor I');

    const classificationFinding = result.ussglFindings.find(
      (f) => f.requirement === 'Account Classification Consistency'
    );
    expect(classificationFinding).toBeDefined();
    expect(classificationFinding!.compliant).toBe(false);
    expect(classificationFinding!.findings[0]).toContain('1010');
    expect(classificationFinding!.findings[0]).toContain('proprietary');
  });
});

// ===========================================================================
// generateFFMIAOpinionSection
// ===========================================================================

describe('generateFFMIAOpinionSection', () => {
  it('generates compliant opinion text', () => {
    const data = fullyCompliantData();
    const assessment = performFFMIAAssessment('eng-1', data, 'Auditor A');
    const opinion = generateFFMIAOpinionSection(assessment);

    expect(opinion).toContain('FEDERAL FINANCIAL MANAGEMENT IMPROVEMENT ACT');
    expect(opinion).toContain('substantially comply');
    expect(opinion).toContain('COMPLIANT');
    expect(opinion).not.toContain('NON-COMPLIANT');
    expect(opinion).not.toContain('Material Non-Conformances');
  });

  it('generates non-compliant opinion text with findings and corrective actions', () => {
    const data = emptyEngagementData();
    const assessment = performFFMIAAssessment('eng-1', data, 'Auditor A');
    const opinion = generateFFMIAOpinionSection(assessment);

    expect(opinion).toContain('do NOT substantially comply');
    expect(opinion).toContain('NON-COMPLIANT');
    expect(opinion).toContain('Material Non-Conformances');
    expect(opinion).toContain('Required Corrective Actions');
  });

  it('generates substantially compliant opinion text with exceptions', () => {
    const data = fullyCompliantData();
    // Remove expense accounts to create one failing requirement
    data.ussglAccounts = data.ussglAccounts.filter((a) => a.category !== 'expense');

    const assessment = performFFMIAAssessment('eng-1', data, 'Auditor A');
    const opinion = generateFFMIAOpinionSection(assessment);

    expect(opinion).toContain('with certain exceptions noted below');
    expect(opinion).toContain('SUBSTANTIALLY COMPLIANT (with exceptions)');
  });

  it('includes all three prong results in the output', () => {
    const data = fullyCompliantData();
    const assessment = performFFMIAAssessment('eng-1', data, 'Auditor A');
    const opinion = generateFFMIAOpinionSection(assessment);

    expect(opinion).toContain('1. Federal Financial Management Systems Requirements');
    expect(opinion).toContain('2. Federal Accounting Standards (FASAB/SFFAS)');
    expect(opinion).toContain('3. USSGL at Transaction Level');
  });

  it('numbers material non-conformances correctly', () => {
    const data = emptyEngagementData();
    const assessment = performFFMIAAssessment('eng-1', data, 'Auditor A');
    const opinion = generateFFMIAOpinionSection(assessment);

    // Verify numbered non-conformance lines exist
    expect(opinion).toMatch(/\s+1\.\s+/);
  });
});
