/**
 * Federal Financial Statements Generator
 *
 * Generates the four principal federal financial statements required by
 * OMB Circular A-136 and FASAB/SFFAS standards:
 *
 *   1. Balance Sheet (Statement of Financial Position)
 *   2. Statement of Net Cost
 *   3. Statement of Changes in Net Position
 *   4. Statement of Budgetary Resources (SBR)
 *
 * These statements are prepared on the accrual basis of accounting per
 * FASAB standards and differ significantly from GAAP-basis commercial
 * financial statements.
 *
 * References:
 *   - OMB Circular A-136: Financial Reporting Requirements
 *   - SFFAS 1: Accounting for Selected Assets and Liabilities
 *   - SFFAS 4: Managerial Cost Accounting Standards
 *   - SFFAS 5: Accounting for Liabilities
 *   - SFFAS 7: Accounting for Revenue and Other Financing Sources
 *   - DoD 7000.14-R, Volume 6B: Form and Content of Financial Statements
 */

import type { USSGLAccount, Appropriation, Obligation } from '@/types/dod-fmr';

// ---------------------------------------------------------------------------
// Disbursement interface (mirrors @/types/dod-fmr Disbursement)
// ---------------------------------------------------------------------------

interface Disbursement {
  id: string;
  engagementId: string;
  obligationId: string;
  amount: number;
  disbursementDate: string;
  status: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Return Type Interfaces
// ---------------------------------------------------------------------------

/**
 * Federal Balance Sheet per OMB A-136 and SFFAS 1.
 */
export interface FederalBalanceSheet {
  fiscalYear: number;
  generatedDate: string;
  assets: {
    intragovernmental: {
      fundBalanceWithTreasury: number;
      investments: number;
      accountsReceivable: number;
      otherAssets: number;
      totalIntragovernmental: number;
    };
    withThePublic: {
      cashAndMonetaryAssets: number;
      accountsReceivableNet: number;
      inventoryAndRelatedProperty: number;
      generalPPENet: number;
      otherAssets: number;
      totalWithThePublic: number;
    };
    totalAssets: number;
  };
  liabilities: {
    intragovernmental: {
      accountsPayable: number;
      debt: number;
      otherLiabilities: number;
      totalIntragovernmental: number;
    };
    withThePublic: {
      accountsPayable: number;
      militaryRetirementBenefits: number;
      environmentalLiabilities: number;
      otherLiabilities: number;
      totalWithThePublic: number;
    };
    totalLiabilities: number;
  };
  netPosition: {
    unexpendedAppropriations: number;
    cumulativeResultsOfOperations: number;
    totalNetPosition: number;
  };
}

/**
 * Statement of Net Cost per OMB A-136 and SFFAS 4.
 */
export interface StatementOfNetCost {
  fiscalYear: number;
  generatedDate: string;
  grossCost: {
    militaryPersonnel: number;
    operationsAndMaintenance: number;
    procurement: number;
    rdtAndE: number;
    militaryConstruction: number;
    familyHousing: number;
    otherPrograms: number;
    totalGrossCost: number;
  };
  earnedRevenue: {
    intragovernmental: number;
    withThePublic: number;
    totalEarnedRevenue: number;
  };
  netCostOfOperations: number;
}

/**
 * Statement of Changes in Net Position per OMB A-136 and SFFAS 7.
 */
export interface StatementOfChanges {
  fiscalYear: number;
  generatedDate: string;
  cumulativeResultsOfOperations: {
    beginningBalance: number;
    priorPeriodAdjustments: number;
    beginningBalanceAdjusted: number;
    financingSources: {
      appropriationsUsed: number;
      nonExchangeRevenue: number;
      donationsAndForfeitures: number;
      transfersInOut: number;
      imputedFinancing: number;
      other: number;
      totalFinancingSources: number;
    };
    netCostOfOperations: number;
    endingBalance: number;
  };
  unexpendedAppropriations: {
    beginningBalance: number;
    appropriationsReceived: number;
    appropriationsTransferred: number;
    otherAdjustments: number;
    appropriationsUsed: number;
    endingBalance: number;
  };
  totalNetPosition: number;
}

/**
 * Statement of Budgetary Resources per OMB A-136.
 */
export interface StatementOfBudgetaryResources {
  fiscalYear: number;
  generatedDate: string;
  budgetaryResources: {
    unobligatedBalanceBroughtForward: number;
    appropriations: number;
    spendingAuthority: number;
    totalBudgetaryResources: number;
  };
  statusOfBudgetaryResources: {
    newObligationsAndUpwardAdjustments: number;
    unobligatedBalanceEndOfYear: number;
    apportionedUnexpired: number;
    unapportionedUnexpired: number;
    expired: number;
    totalStatus: number;
  };
  changeInObligatedBalance: {
    unpaidObligationsBroughtForward: number;
    newObligations: number;
    outlaysGross: number;
    unpaidObligationsEndOfYear: number;
  };
  budgetAuthorityAndOutlaysNet: {
    budgetAuthorityGross: number;
    offsettingCollections: number;
    budgetAuthorityNet: number;
    outlaysGross: number;
    outlaysNet: number;
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumEndBalances(accounts: USSGLAccount[], prefixes: string[]): number {
  return accounts
    .filter(a => prefixes.some(p => a.accountNumber.startsWith(p)))
    .reduce((sum, a) => sum + a.endBalance, 0);
}

function sumBeginBalances(accounts: USSGLAccount[], prefixes: string[]): number {
  return accounts
    .filter(a => prefixes.some(p => a.accountNumber.startsWith(p)))
    .reduce((sum, a) => sum + a.beginBalance, 0);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a Federal Balance Sheet (Statement of Financial Position).
 *
 * Per OMB A-136, Section II.3.2 and SFFAS 1: Presents the financial position
 * showing assets, liabilities, and net position. Federal balance sheets include
 * intragovernmental and public (with the public) components.
 *
 * USSGL Mapping:
 *   Assets: 1000-1999 series
 *   Liabilities: 2000-2999 series
 *   Net Position: 3000-3999 series
 *
 * @param accounts - USSGL account balances
 * @param fiscalYear - fiscal year of the statement
 * @returns FederalBalanceSheet
 */
export function generateBalanceSheet(
  accounts: USSGLAccount[],
  fiscalYear: number,
): FederalBalanceSheet {
  // --- Intragovernmental Assets ---
  const fundBalanceWithTreasury = round2(sumEndBalances(accounts, ['1010']));
  const investments = round2(sumEndBalances(accounts, ['1310', '1311', '1312']));
  const arIGT = round2(sumEndBalances(accounts, ['1320', '1330', '1340']));
  const otherAssetsIGT = round2(sumEndBalances(accounts, ['1410', '1510', '1610']));
  const totalIntragovernmentalAssets = round2(
    fundBalanceWithTreasury + investments + arIGT + otherAssetsIGT,
  );

  // --- With the Public Assets ---
  const cashAndMonetaryAssets = round2(sumEndBalances(accounts, ['1110', '1120']));
  const accountsReceivableNet = round2(
    sumEndBalances(accounts, ['1310', '1320']) -
    Math.abs(sumEndBalances(accounts, ['1319', '1329'])),
  );
  const inventoryAndRelatedProperty = round2(
    sumEndBalances(accounts, ['1511', '1512', '1513', '1521']),
  );
  const ppe = sumEndBalances(accounts, ['1710', '1720', '1730', '1740', '1750']);
  const accumDepr = Math.abs(
    sumEndBalances(accounts, ['1719', '1729', '1739', '1749', '1759']),
  );
  const generalPPENet = round2(ppe - accumDepr);
  const otherAssetsPublic = round2(sumEndBalances(accounts, ['1810', '1910', '1990']));
  const totalWithThePublicAssets = round2(
    cashAndMonetaryAssets + accountsReceivableNet + inventoryAndRelatedProperty +
    generalPPENet + otherAssetsPublic,
  );

  const totalAssets = round2(totalIntragovernmentalAssets + totalWithThePublicAssets);

  // --- Intragovernmental Liabilities ---
  const apIGT = round2(sumEndBalances(accounts, ['2110']));
  const debtIGT = round2(sumEndBalances(accounts, ['2510', '2520']));
  const otherLiabIGT = round2(sumEndBalances(accounts, ['2310', '2410', '2910']));
  const totalIntragovernmentalLiab = round2(apIGT + debtIGT + otherLiabIGT);

  // --- With the Public Liabilities ---
  const apPublic = round2(sumEndBalances(accounts, ['2120']));
  const milRetirement = round2(sumEndBalances(accounts, ['2610', '2620']));
  const environmentalLiab = round2(sumEndBalances(accounts, ['2910', '2920']));
  const otherLiabPublic = round2(sumEndBalances(accounts, ['2190', '2290', '2990']));
  const totalWithThePublicLiab = round2(
    apPublic + milRetirement + environmentalLiab + otherLiabPublic,
  );

  const totalLiabilities = round2(totalIntragovernmentalLiab + totalWithThePublicLiab);

  // --- Net Position ---
  const unexpendedAppropriations = round2(
    sumEndBalances(accounts, ['3100', '3101', '3102']),
  );
  const cumulativeResultsOfOperations = round2(
    sumEndBalances(accounts, ['3310', '3320']),
  );
  const totalNetPosition = round2(unexpendedAppropriations + cumulativeResultsOfOperations);

  return {
    fiscalYear,
    generatedDate: new Date().toISOString(),
    assets: {
      intragovernmental: {
        fundBalanceWithTreasury,
        investments,
        accountsReceivable: arIGT,
        otherAssets: otherAssetsIGT,
        totalIntragovernmental: totalIntragovernmentalAssets,
      },
      withThePublic: {
        cashAndMonetaryAssets,
        accountsReceivableNet,
        inventoryAndRelatedProperty,
        generalPPENet,
        otherAssets: otherAssetsPublic,
        totalWithThePublic: totalWithThePublicAssets,
      },
      totalAssets,
    },
    liabilities: {
      intragovernmental: {
        accountsPayable: apIGT,
        debt: debtIGT,
        otherLiabilities: otherLiabIGT,
        totalIntragovernmental: totalIntragovernmentalLiab,
      },
      withThePublic: {
        accountsPayable: apPublic,
        militaryRetirementBenefits: milRetirement,
        environmentalLiabilities: environmentalLiab,
        otherLiabilities: otherLiabPublic,
        totalWithThePublic: totalWithThePublicLiab,
      },
      totalLiabilities,
    },
    netPosition: {
      unexpendedAppropriations,
      cumulativeResultsOfOperations,
      totalNetPosition,
    },
  };
}

/**
 * Generate a Statement of Net Cost.
 *
 * Per OMB A-136, Section II.3.3 and SFFAS 4: Presents gross cost less
 * earned revenue for each major program.
 *
 * @param accounts - USSGL account balances
 * @param fiscalYear - fiscal year of the statement
 * @returns StatementOfNetCost
 */
export function generateStatementOfNetCost(
  accounts: USSGLAccount[],
  fiscalYear: number,
): StatementOfNetCost {
  const militaryPersonnel = round2(sumEndBalances(accounts, ['6100', '6110']));
  const operationsAndMaintenance = round2(
    sumEndBalances(accounts, ['6200', '6210', '6220']),
  );
  const procurement = round2(sumEndBalances(accounts, ['6300', '6310']));
  const rdtAndE = round2(sumEndBalances(accounts, ['6400', '6410']));
  const militaryConstruction = round2(sumEndBalances(accounts, ['6500', '6510']));
  const familyHousing = round2(sumEndBalances(accounts, ['6600', '6610']));
  const otherPrograms = round2(sumEndBalances(accounts, ['6700', '6800', '6900']));

  const allExpenses = sumEndBalances(accounts, ['6']);
  const specificTotal =
    militaryPersonnel + operationsAndMaintenance + procurement +
    rdtAndE + militaryConstruction + familyHousing + otherPrograms;
  const unallocated = allExpenses - specificTotal;
  const totalGrossCost = round2(allExpenses);

  const intragovernmental = round2(sumEndBalances(accounts, ['5100', '5200', '5300']));
  const withThePublic = round2(sumEndBalances(accounts, ['5500', '5600', '5700', '5800']));
  const totalEarnedRevenue = round2(sumEndBalances(accounts, ['5']));

  const netCostOfOperations = round2(totalGrossCost - Math.abs(totalEarnedRevenue));

  return {
    fiscalYear,
    generatedDate: new Date().toISOString(),
    grossCost: {
      militaryPersonnel,
      operationsAndMaintenance,
      procurement,
      rdtAndE,
      militaryConstruction,
      familyHousing,
      otherPrograms: round2(otherPrograms + unallocated),
      totalGrossCost,
    },
    earnedRevenue: {
      intragovernmental,
      withThePublic,
      totalEarnedRevenue,
    },
    netCostOfOperations,
  };
}

/**
 * Generate a Statement of Changes in Net Position.
 *
 * Per OMB A-136, Section II.3.4 and SFFAS 7.
 *
 * @param accounts - USSGL account balances
 * @param fiscalYear - fiscal year of the statement
 * @returns StatementOfChanges
 */
export function generateStatementOfChangesInNetPosition(
  accounts: USSGLAccount[],
  fiscalYear: number,
): StatementOfChanges {
  const beginCRO = round2(sumBeginBalances(accounts, ['3310', '3320']));
  const priorPeriodAdj = round2(
    sumEndBalances(accounts, ['3305', '3306', '3307', '3308']),
  );
  const beginningBalanceAdjusted = round2(beginCRO + priorPeriodAdj);

  const appropriationsUsed = round2(sumEndBalances(accounts, ['5700', '5710']));
  const nonExchangeRevenue = round2(sumEndBalances(accounts, ['5100', '5110', '5120']));
  const donationsAndForfeitures = round2(sumEndBalances(accounts, ['5310', '5320']));
  const transfersInOut = round2(sumEndBalances(accounts, ['5720', '5730', '5740']));
  const imputedFinancing = round2(sumEndBalances(accounts, ['5780', '5790']));
  const otherFinancing = round2(sumEndBalances(accounts, ['5900', '5990']));
  const totalFinancingSources = round2(
    appropriationsUsed + nonExchangeRevenue + donationsAndForfeitures +
    transfersInOut + imputedFinancing + otherFinancing,
  );

  const grossCosts = sumEndBalances(accounts, ['6']);
  const earnedRevenue = sumEndBalances(accounts, ['5']);
  const netCostOfOperations = round2(grossCosts - Math.abs(earnedRevenue));

  const endingCRO = round2(beginningBalanceAdjusted + totalFinancingSources - netCostOfOperations);

  const beginUA = round2(sumBeginBalances(accounts, ['3100', '3101', '3102']));
  const appropriationsReceived = round2(sumEndBalances(accounts, ['3100']));
  const appropriationsTransferred = round2(sumEndBalances(accounts, ['3102']));
  const otherUAAdj = round2(sumEndBalances(accounts, ['3105', '3106']));
  const endingUA = round2(
    beginUA + appropriationsReceived + appropriationsTransferred +
    otherUAAdj - appropriationsUsed,
  );

  const totalNetPosition = round2(endingCRO + endingUA);

  return {
    fiscalYear,
    generatedDate: new Date().toISOString(),
    cumulativeResultsOfOperations: {
      beginningBalance: beginCRO,
      priorPeriodAdjustments: priorPeriodAdj,
      beginningBalanceAdjusted,
      financingSources: {
        appropriationsUsed,
        nonExchangeRevenue,
        donationsAndForfeitures,
        transfersInOut,
        imputedFinancing,
        other: otherFinancing,
        totalFinancingSources,
      },
      netCostOfOperations,
      endingBalance: endingCRO,
    },
    unexpendedAppropriations: {
      beginningBalance: beginUA,
      appropriationsReceived,
      appropriationsTransferred,
      otherAdjustments: otherUAAdj,
      appropriationsUsed,
      endingBalance: endingUA,
    },
    totalNetPosition,
  };
}

/**
 * Generate a Statement of Budgetary Resources (SBR).
 *
 * Per OMB A-136, Section II.3.5.
 *
 * @param appropriations - all Appropriation records for the entity
 * @param obligations - all Obligation records
 * @param disbursements - all Disbursement records
 * @param fiscalYear - fiscal year of the statement
 * @returns StatementOfBudgetaryResources
 */
export function generateStatementOfBudgetaryResources(
  appropriations: Appropriation[],
  obligations: Obligation[],
  disbursements: Disbursement[],
  fiscalYear: number,
): StatementOfBudgetaryResources {
  let totalUnobligatedBF = 0;
  let totalNewBudgetAuthority = 0;
  let totalSpendingAuthority = 0;
  let totalObligationsIncurred = 0;
  let totalUnobligatedEOY = 0;
  let totalApportioned = 0;
  let totalUnapportioned = 0;
  let totalExpired = 0;
  let totalDisbursed = 0;

  for (const approp of appropriations) {
    totalUnobligatedBF += approp.unobligatedBalance;
    totalNewBudgetAuthority += approp.totalAuthority;

    const offsettingCollections = Math.max(0, approp.totalAuthority - approp.allotted);
    totalSpendingAuthority += offsettingCollections;

    totalObligationsIncurred += approp.obligated;

    const unobligatedEOY = approp.totalAuthority - approp.obligated;
    totalUnobligatedEOY += Math.max(0, unobligatedEOY);

    if (approp.status === 'current') {
      totalApportioned += Math.max(0, approp.apportioned - approp.obligated);
      totalUnapportioned += Math.max(
        0,
        unobligatedEOY - (approp.apportioned - approp.obligated),
      );
    } else if (approp.status === 'expired') {
      totalExpired += Math.max(0, unobligatedEOY);
    }

    totalDisbursed += approp.disbursed;
  }

  // Override with actual disbursement records if available
  const activeDisbursements = disbursements.filter(
    d => d.status === 'released' || d.status === 'certified',
  );
  if (activeDisbursements.length > 0) {
    totalDisbursed = activeDisbursements.reduce((sum, d) => sum + d.amount, 0);
  }

  // Override with actual obligation records if available
  const activeObligations = obligations.filter(o => o.status !== 'deobligated');
  if (activeObligations.length > 0) {
    const oblTotal = activeObligations.reduce(
      (sum, o) => sum + o.amount + o.adjustmentAmount,
      0,
    );
    if (oblTotal > 0) {
      totalObligationsIncurred = oblTotal;
    }
  }

  const totalBudgetaryResources = round2(
    totalUnobligatedBF + totalNewBudgetAuthority + totalSpendingAuthority,
  );
  const totalStatus = round2(totalObligationsIncurred + totalUnobligatedEOY);

  const unpaidObligationsBroughtForward = round2(
    appropriations.reduce(
      (sum, a) => sum + (a.obligated - a.disbursed),
      0,
    ),
  );
  const unpaidObligationsEndOfYear = round2(
    unpaidObligationsBroughtForward + totalObligationsIncurred - totalDisbursed,
  );

  return {
    fiscalYear,
    generatedDate: new Date().toISOString(),
    budgetaryResources: {
      unobligatedBalanceBroughtForward: round2(totalUnobligatedBF),
      appropriations: round2(totalNewBudgetAuthority),
      spendingAuthority: round2(totalSpendingAuthority),
      totalBudgetaryResources,
    },
    statusOfBudgetaryResources: {
      newObligationsAndUpwardAdjustments: round2(totalObligationsIncurred),
      unobligatedBalanceEndOfYear: round2(totalUnobligatedEOY),
      apportionedUnexpired: round2(totalApportioned),
      unapportionedUnexpired: round2(totalUnapportioned),
      expired: round2(totalExpired),
      totalStatus,
    },
    changeInObligatedBalance: {
      unpaidObligationsBroughtForward,
      newObligations: round2(totalObligationsIncurred),
      outlaysGross: round2(totalDisbursed),
      unpaidObligationsEndOfYear,
    },
    budgetAuthorityAndOutlaysNet: {
      budgetAuthorityGross: round2(totalNewBudgetAuthority),
      offsettingCollections: round2(totalSpendingAuthority),
      budgetAuthorityNet: round2(totalNewBudgetAuthority - totalSpendingAuthority),
      outlaysGross: round2(totalDisbursed),
      outlaysNet: round2(totalDisbursed - totalSpendingAuthority),
    },
  };
}
