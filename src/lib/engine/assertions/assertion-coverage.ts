/**
 * Financial Statement Assertion Coverage Mapping
 *
 * Maps audit procedures to the 5+3 financial statement assertions per AU-C 315/500:
 * - Existence/Occurrence
 * - Completeness
 * - Valuation/Allocation
 * - Rights & Obligations
 * - Presentation & Disclosure
 * - Accuracy (transaction-level)
 * - Cutoff (transaction-level)
 * - Classification (transaction-level)
 *
 * Ensures every material account has adequate coverage for all relevant assertions.
 */

export type Assertion =
  | 'existence'
  | 'completeness'
  | 'valuation'
  | 'rights_obligations'
  | 'presentation_disclosure'
  | 'accuracy'
  | 'cutoff'
  | 'classification';

export type ProcedureType =
  | 'substantive_detail'
  | 'substantive_analytical'
  | 'test_of_controls'
  | 'confirmation'
  | 'observation'
  | 'inspection'
  | 'recalculation'
  | 'inquiry';

export type CoverageStatus = 'planned' | 'in_progress' | 'completed' | 'not_applicable';

export interface AssertionCoverageEntry {
  accountName: string;
  accountType: string;
  assertion: Assertion;
  procedureType: ProcedureType;
  procedureDescription: string;
  evidenceReference?: string;
  coveredBy: string;
  status: CoverageStatus;
}

export interface CoverageGap {
  accountName: string;
  accountType: string;
  missingAssertions: Assertion[];
  riskLevel: 'high' | 'medium' | 'low';
  recommendation: string;
}

export interface CoverageMatrix {
  accounts: Array<{
    accountName: string;
    accountType: string;
    isMaterial: boolean;
    assertions: Record<Assertion, { covered: boolean; procedures: string[]; status: CoverageStatus }>;
  }>;
  gaps: CoverageGap[];
  overallCoverageRate: number;
  materialAccountCoverageRate: number;
  readyForOpinion: boolean;
  summary: string;
}

// Which assertions are most relevant for each account type
const REQUIRED_ASSERTIONS: Record<string, Assertion[]> = {
  asset: ['existence', 'completeness', 'valuation', 'rights_obligations', 'presentation_disclosure'],
  liability: ['completeness', 'existence', 'valuation', 'rights_obligations', 'presentation_disclosure'],
  equity: ['existence', 'completeness', 'valuation', 'rights_obligations', 'presentation_disclosure'],
  revenue: ['existence', 'completeness', 'accuracy', 'cutoff', 'classification'],
  expense: ['existence', 'completeness', 'accuracy', 'cutoff', 'classification'],
};

// Recommended procedures by assertion type
const RECOMMENDED_PROCEDURES: Record<Assertion, ProcedureType[]> = {
  existence: ['confirmation', 'inspection', 'observation'],
  completeness: ['substantive_analytical', 'substantive_detail', 'recalculation'],
  valuation: ['recalculation', 'substantive_detail', 'inquiry'],
  rights_obligations: ['inspection', 'confirmation', 'inquiry'],
  presentation_disclosure: ['inspection', 'inquiry'],
  accuracy: ['recalculation', 'substantive_detail'],
  cutoff: ['substantive_detail', 'inspection'],
  classification: ['inspection', 'inquiry'],
};

/**
 * Generate a coverage matrix showing which assertions are covered for each account.
 */
export function generateCoverageMatrix(
  accounts: Array<{ accountName: string; accountType: string; endingBalance: number }>,
  coverageEntries: AssertionCoverageEntry[],
  materialityThreshold: number
): CoverageMatrix {
  const matrixAccounts = accounts.map(account => {
    const isMaterial = Math.abs(account.endingBalance) >= materialityThreshold;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const requiredAssertions = REQUIRED_ASSERTIONS[account.accountType] || REQUIRED_ASSERTIONS['asset'];
    const accountEntries = coverageEntries.filter(e => e.accountName === account.accountName);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const assertions: Record<Assertion, { covered: boolean; procedures: string[]; status: CoverageStatus }> = {} as any;

    for (const assertion of getAllAssertions()) {
      const matching = accountEntries.filter(e => e.assertion === assertion);
      const completed = matching.filter(e => e.status === 'completed');
      assertions[assertion] = {
        covered: completed.length > 0 || matching.some(e => e.status === 'not_applicable'),
        procedures: matching.map(e => `${e.procedureType}: ${e.procedureDescription}`),
        status: completed.length > 0 ? 'completed'
          : matching.some(e => e.status === 'in_progress') ? 'in_progress'
          : matching.some(e => e.status === 'planned') ? 'planned'
          : matching.some(e => e.status === 'not_applicable') ? 'not_applicable'
          : 'planned',
      };
    }

    return {
      accountName: account.accountName,
      accountType: account.accountType,
      isMaterial,
      assertions,
    };
  });

  // Identify gaps — material accounts with uncovered required assertions
  const gaps: CoverageGap[] = [];

  for (const account of matrixAccounts) {
    if (!account.isMaterial) continue;

    const required = REQUIRED_ASSERTIONS[account.accountType] || REQUIRED_ASSERTIONS['asset'];
    const missing = required.filter(a => !account.assertions[a].covered);

    if (missing.length > 0) {
      const riskLevel = missing.length >= 3 ? 'high' : missing.length >= 2 ? 'medium' : 'low';
      const recommendations = missing.map(a => {
        const procs = RECOMMENDED_PROCEDURES[a];
        return `${a}: Consider ${procs.slice(0, 2).join(' or ')}`;
      });

      gaps.push({
        accountName: account.accountName,
        accountType: account.accountType,
        missingAssertions: missing,
        riskLevel,
        recommendation: recommendations.join('; '),
      });
    }
  }

  // Calculate coverage rates
  const materialAccounts = matrixAccounts.filter(a => a.isMaterial);
  let totalRequired = 0;
  let totalCovered = 0;
  let materialRequired = 0;
  let materialCovered = 0;

  for (const account of matrixAccounts) {
    const required = REQUIRED_ASSERTIONS[account.accountType] || REQUIRED_ASSERTIONS['asset'];
    for (const assertion of required) {
      totalRequired++;
      if (account.assertions[assertion].covered) totalCovered++;
    }
  }

  for (const account of materialAccounts) {
    const required = REQUIRED_ASSERTIONS[account.accountType] || REQUIRED_ASSERTIONS['asset'];
    for (const assertion of required) {
      materialRequired++;
      if (account.assertions[assertion].covered) materialCovered++;
    }
  }

  const overallCoverageRate = totalRequired > 0 ? totalCovered / totalRequired : 0;
  const materialAccountCoverageRate = materialRequired > 0 ? materialCovered / materialRequired : 0;
  const readyForOpinion = gaps.length === 0 && materialAccountCoverageRate === 1;

  const summary = readyForOpinion
    ? 'All material accounts have complete assertion coverage. Engagement is ready for opinion issuance from an assertion coverage perspective.'
    : `${gaps.length} material account(s) have assertion coverage gaps. ${materialRequired - materialCovered} assertion(s) still need testing before opinion can be issued.`;

  return {
    accounts: matrixAccounts,
    gaps,
    overallCoverageRate,
    materialAccountCoverageRate,
    readyForOpinion,
    summary,
  };
}

/**
 * Get default assertion coverage entries for a given account type.
 * Useful for initializing coverage plans.
 */
export function getDefaultCoverageEntries(
  accountName: string,
  accountType: string,
  auditorName: string
): AssertionCoverageEntry[] {
  const assertions = REQUIRED_ASSERTIONS[accountType] || REQUIRED_ASSERTIONS['asset'];
  const entries: AssertionCoverageEntry[] = [];

  for (const assertion of assertions) {
    const procedures = RECOMMENDED_PROCEDURES[assertion];
    const primaryProcedure = procedures[0];

    const descriptions: Record<string, Record<Assertion, string>> = {
      asset: {
        existence: 'Confirm existence through inspection or third-party confirmation',
        completeness: 'Perform search for unrecorded assets; test cutoff procedures',
        valuation: 'Test valuation methodology and recalculate carrying amounts',
        rights_obligations: 'Inspect title documents and ownership agreements',
        presentation_disclosure: 'Verify proper classification and required disclosures',
        accuracy: 'Recalculate amounts and trace to supporting documents',
        cutoff: 'Test transactions near period end for proper recording',
        classification: 'Verify proper account classification per GAAP',
      },
      liability: {
        existence: 'Confirm balances with creditors or inspect agreements',
        completeness: 'Search for unrecorded liabilities; review post-period disbursements',
        valuation: 'Recalculate liability balances and test assumptions',
        rights_obligations: 'Review debt agreements for terms and covenants',
        presentation_disclosure: 'Verify current/non-current classification and disclosures',
        accuracy: 'Recalculate amounts and trace to supporting documents',
        cutoff: 'Test transactions near period end for proper recording',
        classification: 'Verify proper account classification per GAAP',
      },
      equity: {
        existence: 'Inspect share registry and board authorization',
        completeness: 'Reconcile equity rollforward and verify all transactions recorded',
        valuation: 'Recalculate equity balances including comprehensive income',
        rights_obligations: 'Review shareholder agreements and restrictions',
        presentation_disclosure: 'Verify equity component disclosures per ASC 505',
        accuracy: 'Recalculate amounts and trace to supporting documents',
        cutoff: 'Test transactions near period end for proper recording',
        classification: 'Verify proper account classification per GAAP',
      },
      revenue: {
        existence: 'Vouch recorded revenue to supporting documents (ASC 606 criteria)',
        completeness: 'Perform analytical procedures and cutoff testing',
        accuracy: 'Recalculate revenue amounts and verify pricing',
        cutoff: 'Test revenue transactions at period end for proper cutoff',
        classification: 'Verify revenue classification by type and operating segment',
        valuation: 'Test revenue recognition methodology',
        rights_obligations: 'Verify revenue is earned and belongs to entity',
        presentation_disclosure: 'Verify proper presentation and required disclosures',
      },
      expense: {
        existence: 'Vouch recorded expenses to invoices and receiving reports',
        completeness: 'Search for unrecorded liabilities; analytical review',
        accuracy: 'Recalculate expense amounts and verify to source documents',
        cutoff: 'Test expense transactions at period end for proper cutoff',
        classification: 'Verify expense classification and account coding',
        valuation: 'Test expense accrual methodology',
        rights_obligations: 'Verify expenses relate to entity operations',
        presentation_disclosure: 'Verify proper presentation and required disclosures',
      },
    };

    const desc = descriptions[accountType]?.[assertion] || `Test ${assertion} assertion for ${accountName}`;

    entries.push({
      accountName,
      accountType,
      assertion,
      procedureType: primaryProcedure,
      procedureDescription: desc,
      coveredBy: auditorName,
      status: 'planned',
    });
  }

  return entries;
}

function getAllAssertions(): Assertion[] {
  return ['existence', 'completeness', 'valuation', 'rights_obligations', 'presentation_disclosure', 'accuracy', 'cutoff', 'classification'];
}
