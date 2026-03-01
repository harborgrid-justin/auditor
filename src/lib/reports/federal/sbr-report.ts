/**
 * Statement of Budgetary Resources (SBR) Generator
 *
 * Generates the audited Statement of Budgetary Resources per OMB Circular
 * A-136, Section II.3. The SBR is a principal financial statement that
 * presents the budgetary resources available to a federal entity and their
 * status at the end of the reporting period. It is the only federal financial
 * statement that is directly tied to the budget execution process and the
 * SF-133 Report on Budget Execution and Budgetary Resources.
 *
 * The SBR has four main sections:
 *   1. Budgetary Resources - total resources available
 *   2. Status of Budgetary Resources - how resources were used
 *   3. Change in Obligated Balance - movement in unpaid obligations
 *   4. Budget Authority and Outlays, Net - net authority and outlays
 *
 * References:
 *   - OMB Circular A-136, Section II.3 (Statement of Budgetary Resources)
 *   - SFFAS 7: Accounting for Revenue and Other Financing Sources
 *   - 31 U.S.C. 1105: Budget contents and submission to Congress
 *   - DoD FMR 7000.14-R, Vol. 6A, Ch. 4: Financial Statements
 *   - DoD FMR 7000.14-R, Vol. 3, Ch. 8: Budget Execution
 *   - Treasury Financial Manual, Part 2, Ch. 4600 (SF-133)
 */

import type {
  Appropriation,
  Obligation,
  Disbursement,
  USSGLAccount,
  SF133Data,
  DoDEngagementData,
  DoDComponentCode,
} from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Rounding precision for financial statement amounts. */
const ROUNDING_PRECISION = 2;

/**
 * USSGL budgetary account prefixes used to derive SBR line items
 * from the trial balance. Ref: USSGL TFM Supplement, Section IV.
 */
const USSGL_BUDGETARY = {
  /** 4010 - Budgetary Fund Balance with Treasury */
  fundBalanceBudgetary: '4010',
  /** 4119/4130 - Appropriations received */
  appropriationsReceived: ['4119', '4130', '4140'],
  /** 4170 - Borrowing authority */
  borrowingAuthority: ['4170', '4175'],
  /** 4200-4299 - Spending authority from offsetting collections */
  spendingAuthority: ['420', '421', '422', '423', '424', '425'],
  /** 4610-4659 - Allotments and sub-allotments */
  allotments: ['461', '462', '463', '464', '465'],
  /** 4801-4831 - Obligations incurred */
  obligationsIncurred: ['480', '481', '482', '483'],
  /** 4901-4908 - Delivered orders / outlays */
  outlays: ['490', '491', '492'],
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single line item on the SBR with current and prior year amounts. */
export interface SBRLineItem {
  id: string;
  lineNumber: string;
  description: string;
  currentYear: number;
  priorYear: number;
}

/** Section I: Budgetary Resources. */
export interface BudgetaryResourcesSection {
  unobligatedBalanceBroughtForward: SBRLineItem;
  adjustmentsToUnobligatedBalance: SBRLineItem;
  recoveries: SBRLineItem;
  newBudgetAuthority: SBRLineItem;
  borrowingAuthority: SBRLineItem;
  contractAuthority: SBRLineItem;
  spendingAuthorityFromOffsettingCollections: SBRLineItem;
  totalBudgetaryResources: SBRLineItem;
}

/** Section II: Status of Budgetary Resources. */
export interface StatusOfBudgetaryResourcesSection {
  newObligationsAndUpwardAdjustments: SBRLineItem;
  unobligatedBalanceEndOfYear: SBRLineItem;
  apportionedUnexpired: SBRLineItem;
  reapportionedUnexpired: SBRLineItem;
  unapportionedUnexpired: SBRLineItem;
  expiredUnobligatedBalance: SBRLineItem;
  totalStatusOfBudgetaryResources: SBRLineItem;
}

/** Section III: Change in Obligated Balance. */
export interface ChangeInObligatedBalanceSection {
  unpaidObligationsBroughtForward: SBRLineItem;
  newObligationsAndUpwardAdjustments: SBRLineItem;
  outlaysGross: SBRLineItem;
  actualTransfersUnpaidObligations: SBRLineItem;
  recoveriesOfPriorYearUnpaidObligations: SBRLineItem;
  unpaidObligationsEndOfYear: SBRLineItem;
  uncollectedPaymentsFederalSourcesBOY: SBRLineItem;
  changeInUncollectedPayments: SBRLineItem;
  uncollectedPaymentsFederalSourcesEOY: SBRLineItem;
  memorandumObligatedBalanceStartOfYear: SBRLineItem;
  memorandumObligatedBalanceEndOfYear: SBRLineItem;
}

/** Section IV: Budget Authority and Outlays, Net. */
export interface BudgetAuthorityAndOutlaysSection {
  budgetAuthorityGross: SBRLineItem;
  actualOffsettingCollections: SBRLineItem;
  changeInUncollectedPayments: SBRLineItem;
  anticipatedOffsettingCollections: SBRLineItem;
  budgetAuthorityNet: SBRLineItem;
  outlaysGross: SBRLineItem;
  actualOffsettingCollectionsOutlays: SBRLineItem;
  outlaysNet: SBRLineItem;
  distributedOffsettingReceipts: SBRLineItem;
  agencyOutlaysNet: SBRLineItem;
}

/**
 * Complete Statement of Budgetary Resources.
 * Per OMB A-136, Section II.3.
 */
export interface SBRReport {
  id: string;
  fiscalYear: number;
  dodComponent: string;
  reportingPeriodEnd: string;
  budgetaryResources: BudgetaryResourcesSection;
  statusOfBudgetaryResources: StatusOfBudgetaryResourcesSection;
  changeInObligatedBalance: ChangeInObligatedBalanceSection;
  budgetAuthorityAndOutlays: BudgetAuthorityAndOutlaysSection;
  crossCuttingValidation: {
    totalBudgetaryResourcesBalance: boolean;
    statusEqualsResources: boolean;
    obligatedBalanceReconciles: boolean;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * (10 ** ROUNDING_PRECISION)) / (10 ** ROUNDING_PRECISION);
}

function makeLine(
  lineNumber: string,
  description: string,
  currentYear: number,
  priorYear: number = 0,
): SBRLineItem {
  return {
    id: uuid(),
    lineNumber,
    description,
    currentYear: round2(currentYear),
    priorYear: round2(priorYear),
  };
}

/**
 * Sum the ending balances of USSGL accounts whose account number
 * starts with any of the given prefixes.
 */
function sumEndBalances(accounts: USSGLAccount[], prefixes: string[]): number {
  return accounts
    .filter(a => prefixes.some(p => a.accountNumber.startsWith(p)))
    .reduce((sum, a) => sum + a.endBalance, 0);
}

/**
 * Sum the beginning balances of USSGL accounts matching prefixes.
 */
function sumBeginBalances(accounts: USSGLAccount[], prefixes: string[]): number {
  return accounts
    .filter(a => prefixes.some(p => a.accountNumber.startsWith(p)))
    .reduce((sum, a) => sum + a.beginBalance, 0);
}

/**
 * Aggregate SF-133 data across all treasury account symbols.
 */
function aggregateSF133(sf133Records: SF133Data[]): {
  unobBOY: number;
  adjustments: number;
  newBA: number;
  spendAuth: number;
  totalBR: number;
  newOblig: number;
  unobEOY: number;
  apportionedUnexpired: number;
  unapportionedUnexpired: number;
  expired: number;
  outlaysNet: number;
  obligatedBalanceNetBegin: number;
  obligatedBalanceNetEnd: number;
} {
  return sf133Records.reduce(
    (acc, sf) => ({
      unobBOY: acc.unobBOY + sf.budgetaryResources.unobligatedBalanceBroughtForward,
      adjustments: acc.adjustments + sf.budgetaryResources.adjustments,
      newBA: acc.newBA + sf.budgetaryResources.newBudgetAuthority,
      spendAuth: acc.spendAuth + sf.budgetaryResources.spendingAuthority,
      totalBR: acc.totalBR + sf.budgetaryResources.totalBudgetaryResources,
      newOblig: acc.newOblig + sf.statusOfBudgetaryResources.newObligationsAndUpwardAdjustments,
      unobEOY: acc.unobEOY + sf.statusOfBudgetaryResources.unobligatedBalanceEndOfYear,
      apportionedUnexpired: acc.apportionedUnexpired + sf.statusOfBudgetaryResources.apportionedUnexpired,
      unapportionedUnexpired: acc.unapportionedUnexpired + sf.statusOfBudgetaryResources.unapportionedUnexpired,
      expired: acc.expired + sf.statusOfBudgetaryResources.expired,
      outlaysNet: acc.outlaysNet + sf.outlays.outlaysNet,
      obligatedBalanceNetBegin: acc.obligatedBalanceNetBegin + sf.outlays.obligatedBalanceNetBeginning,
      obligatedBalanceNetEnd: acc.obligatedBalanceNetEnd + sf.outlays.obligatedBalanceNetEnd,
    }),
    {
      unobBOY: 0, adjustments: 0, newBA: 0, spendAuth: 0, totalBR: 0,
      newOblig: 0, unobEOY: 0, apportionedUnexpired: 0,
      unapportionedUnexpired: 0, expired: 0, outlaysNet: 0,
      obligatedBalanceNetBegin: 0, obligatedBalanceNetEnd: 0,
    },
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates the Statement of Budgetary Resources (SBR) from DoD engagement data.
 *
 * The SBR presents four sections per OMB A-136, Section II.3:
 *   1. Budgetary Resources - total resources available from appropriations,
 *      spending authority, and other sources.
 *   2. Status of Budgetary Resources - obligations incurred and unobligated
 *      balances at end of year (apportioned, unapportioned, expired).
 *   3. Change in Obligated Balance - unpaid obligations movement from BOY
 *      to EOY, including outlays and recoveries.
 *   4. Budget Authority and Outlays, Net - gross budget authority less
 *      offsetting collections and receipts.
 *
 * Data is sourced from appropriation records, obligation records, disbursement
 * records, USSGL budgetary accounts, and SF-133 execution data. Where SF-133
 * data is available it takes precedence; otherwise figures are derived from
 * the underlying obligation and appropriation records.
 *
 * @param data - Complete DoD engagement dataset
 * @returns SBRReport with all four sections and cross-cutting validation
 *
 * @see OMB Circular A-136, Section II.3
 * @see 31 U.S.C. 1105 (Budget contents)
 * @see DoD FMR 7000.14-R, Vol. 6A, Ch. 4
 */
export function generateSBR(data: DoDEngagementData): SBRReport {
  const { appropriations, obligations, disbursements, ussglAccounts, collections } = data;
  const sf133Records = data.sf133Data ?? [];
  const fiscalYear = data.fiscalYear;

  const budgetaryAccounts = ussglAccounts.filter(a => a.accountType === 'budgetary');

  // -------------------------------------------------------------------------
  // Derive values from appropriation / obligation / disbursement records
  // -------------------------------------------------------------------------
  const totalAuthority = appropriations.reduce((s, a) => s + a.totalAuthority, 0);
  const totalApportioned = appropriations.reduce((s, a) => s + a.apportioned, 0);
  const totalObligated = appropriations.reduce((s, a) => s + a.obligated, 0);
  const totalDisbursed = appropriations.reduce((s, a) => s + a.disbursed, 0);
  const totalUnobligated = appropriations.reduce((s, a) => s + a.unobligatedBalance, 0);

  const activeObligations = obligations.filter(o => o.status !== 'deobligated');
  const obligationsIncurred = activeObligations.length > 0
    ? activeObligations.reduce((s, o) => s + o.amount + o.adjustmentAmount, 0)
    : totalObligated;

  const activeDisbursements = disbursements.filter(
    d => d.status === 'released' || d.status === 'certified',
  );
  const grossOutlays = activeDisbursements.length > 0
    ? activeDisbursements.reduce((s, d) => s + d.amount, 0)
    : totalDisbursed;

  const totalCollections = collections.reduce((s, c) => s + c.amount, 0);

  // -------------------------------------------------------------------------
  // SF-133 overlay: use SF-133 data when available for authoritative figures
  // -------------------------------------------------------------------------
  const sf133 = sf133Records.length > 0 ? aggregateSF133(sf133Records) : null;

  const unobBOY = sf133?.unobBOY ?? totalUnobligated;
  const adjustments = sf133?.adjustments ?? 0;
  const newBudgetAuth = sf133?.newBA ?? totalAuthority;
  const spendAuth = sf133?.spendAuth ?? totalCollections;
  const totalBR = sf133?.totalBR ?? (unobBOY + adjustments + newBudgetAuth + spendAuth);

  const newObligAndAdj = sf133?.newOblig ?? obligationsIncurred;
  const unobEOY = sf133?.unobEOY ?? (totalBR - newObligAndAdj);
  const apportionedUnexpired = sf133?.apportionedUnexpired
    ?? appropriations.filter(a => a.status === 'current').reduce((s, a) => s + Math.max(0, a.apportioned - a.obligated), 0);
  const unapportionedUnexpired = sf133?.unapportionedUnexpired
    ?? appropriations.filter(a => a.status === 'current').reduce((s, a) => s + Math.max(0, a.unobligatedBalance - (a.apportioned - a.obligated)), 0);
  const expiredUnob = sf133?.expired
    ?? appropriations.filter(a => a.status === 'expired').reduce((s, a) => s + a.unobligatedBalance, 0);

  const outlaysNet = sf133?.outlaysNet ?? grossOutlays;

  // -------------------------------------------------------------------------
  // Recoveries from prior year obligations (deobligated amounts)
  // -------------------------------------------------------------------------
  const recoveries = obligations
    .filter(o => o.status === 'deobligated')
    .reduce((s, o) => s + Math.abs(o.adjustmentAmount), 0);

  // -------------------------------------------------------------------------
  // Change in obligated balance derivations
  // -------------------------------------------------------------------------
  const unpaidObligBOY = sf133?.obligatedBalanceNetBegin
    ?? appropriations.reduce((s, a) => s + (a.obligated - a.disbursed), 0);
  const unpaidObligEOY = sf133?.obligatedBalanceNetEnd
    ?? (unpaidObligBOY + newObligAndAdj - grossOutlays - recoveries);

  const uncollectedPaymentsBOY = sumBeginBalances(budgetaryAccounts, ['422', '425']);
  const uncollectedPaymentsEOY = sumEndBalances(budgetaryAccounts, ['422', '425']);
  const changeInUncollected = uncollectedPaymentsEOY - uncollectedPaymentsBOY;

  const obligatedBalBOY = unpaidObligBOY - Math.abs(uncollectedPaymentsBOY);
  const obligatedBalEOY = unpaidObligEOY - Math.abs(uncollectedPaymentsEOY);

  // -------------------------------------------------------------------------
  // Budget Authority and Outlays, Net
  // -------------------------------------------------------------------------
  const budgetAuthorityGross = newBudgetAuth + spendAuth;
  const budgetAuthorityNet = budgetAuthorityGross - totalCollections - changeInUncollected;

  // -------------------------------------------------------------------------
  // Assemble report sections
  // -------------------------------------------------------------------------
  const budgetaryResources: BudgetaryResourcesSection = {
    unobligatedBalanceBroughtForward: makeLine('1000', 'Unobligated balance brought forward, October 1', unobBOY),
    adjustmentsToUnobligatedBalance: makeLine('1020', 'Adjustment to unobligated balance brought forward', adjustments),
    recoveries: makeLine('1021', 'Recoveries of prior year unpaid obligations', recoveries),
    newBudgetAuthority: makeLine('1100', 'Appropriations (discretionary and mandatory)', newBudgetAuth),
    borrowingAuthority: makeLine('1300', 'Borrowing authority (discretionary and mandatory)', sumEndBalances(budgetaryAccounts, USSGL_BUDGETARY.borrowingAuthority)),
    contractAuthority: makeLine('1400', 'Contract authority (discretionary and mandatory)', 0),
    spendingAuthorityFromOffsettingCollections: makeLine('1700', 'Spending authority from offsetting collections', spendAuth),
    totalBudgetaryResources: makeLine('1910', 'Total budgetary resources', totalBR),
  };

  const statusSection: StatusOfBudgetaryResourcesSection = {
    newObligationsAndUpwardAdjustments: makeLine('2190', 'New obligations and upward adjustments (total)', newObligAndAdj),
    unobligatedBalanceEndOfYear: makeLine('2200', 'Unobligated balance, end of year (total)', unobEOY),
    apportionedUnexpired: makeLine('2204', 'Apportioned, unexpired accounts', apportionedUnexpired),
    reapportionedUnexpired: makeLine('2205', 'Reapportioned, unexpired accounts', 0),
    unapportionedUnexpired: makeLine('2304', 'Unapportioned, unexpired accounts', unapportionedUnexpired),
    expiredUnobligatedBalance: makeLine('2404', 'Expired unobligated balance, end of year', expiredUnob),
    totalStatusOfBudgetaryResources: makeLine('2500', 'Total budgetary resources', newObligAndAdj + unobEOY),
  };

  const changeSection: ChangeInObligatedBalanceSection = {
    unpaidObligationsBroughtForward: makeLine('3000', 'Unpaid obligations, brought forward, October 1', unpaidObligBOY),
    newObligationsAndUpwardAdjustments: makeLine('3010', 'New obligations and upward adjustments', newObligAndAdj),
    outlaysGross: makeLine('3020', 'Outlays (gross)', -grossOutlays),
    actualTransfersUnpaidObligations: makeLine('3030', 'Actual transfers, unpaid obligations (net)', 0),
    recoveriesOfPriorYearUnpaidObligations: makeLine('3040', 'Recoveries of prior year unpaid obligations', -recoveries),
    unpaidObligationsEndOfYear: makeLine('3050', 'Unpaid obligations, end of year', unpaidObligEOY),
    uncollectedPaymentsFederalSourcesBOY: makeLine('3060', 'Uncollected payments, Federal sources, brought forward, October 1', uncollectedPaymentsBOY),
    changeInUncollectedPayments: makeLine('3070', 'Change in uncollected payments, Federal sources', changeInUncollected),
    uncollectedPaymentsFederalSourcesEOY: makeLine('3090', 'Uncollected payments, Federal sources, end of year', uncollectedPaymentsEOY),
    memorandumObligatedBalanceStartOfYear: makeLine('3100', 'Obligated balance, start of year (net)', obligatedBalBOY),
    memorandumObligatedBalanceEndOfYear: makeLine('3200', 'Obligated balance, end of year (net)', obligatedBalEOY),
  };

  const authoritySection: BudgetAuthorityAndOutlaysSection = {
    budgetAuthorityGross: makeLine('4000', 'Budget authority, gross (discretionary and mandatory)', budgetAuthorityGross),
    actualOffsettingCollections: makeLine('4030', 'Actual offsetting collections (discretionary and mandatory)', -totalCollections),
    changeInUncollectedPayments: makeLine('4040', 'Change in uncollected payments, Federal sources', -changeInUncollected),
    anticipatedOffsettingCollections: makeLine('4050', 'Anticipated offsetting collections (discretionary and mandatory)', 0),
    budgetAuthorityNet: makeLine('4070', 'Budget authority, net (discretionary and mandatory)', budgetAuthorityNet),
    outlaysGross: makeLine('4080', 'Outlays, gross (discretionary and mandatory)', grossOutlays),
    actualOffsettingCollectionsOutlays: makeLine('4090', 'Actual offsetting collections (discretionary and mandatory)', -totalCollections),
    outlaysNet: makeLine('4100', 'Outlays, net (discretionary and mandatory)', grossOutlays - totalCollections),
    distributedOffsettingReceipts: makeLine('4110', 'Distributed offsetting receipts', 0),
    agencyOutlaysNet: makeLine('4190', 'Agency outlays, net (discretionary and mandatory)', grossOutlays - totalCollections),
  };

  // -------------------------------------------------------------------------
  // Cross-cutting validation
  // -------------------------------------------------------------------------
  const totalBRBalance = Math.abs(totalBR - (newObligAndAdj + unobEOY)) < 0.01;
  const statusEqResources = Math.abs(
    statusSection.totalStatusOfBudgetaryResources.currentYear
    - budgetaryResources.totalBudgetaryResources.currentYear,
  ) < 0.01;
  const obligBalReconciles = Math.abs(
    (unpaidObligBOY + newObligAndAdj - grossOutlays - recoveries) - unpaidObligEOY,
  ) < 0.01;

  return {
    id: uuid(),
    fiscalYear,
    dodComponent: data.dodComponent,
    reportingPeriodEnd: `${fiscalYear}-09-30`,
    budgetaryResources,
    statusOfBudgetaryResources: statusSection,
    changeInObligatedBalance: changeSection,
    budgetAuthorityAndOutlays: authoritySection,
    crossCuttingValidation: {
      totalBudgetaryResourcesBalance: totalBRBalance,
      statusEqualsResources: statusEqResources,
      obligatedBalanceReconciles: obligBalReconciles,
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Reconciles the SBR to SF-133 execution data and identifies discrepancies.
 *
 * Per OMB A-136, the SBR and SF-133 must agree on total budgetary resources,
 * obligations incurred, and net outlays. Any differences indicate data integrity
 * issues that must be resolved prior to audit.
 *
 * @param sbr - Generated SBR report
 * @param sf133Data - SF-133 execution reports
 * @returns Reconciliation result with itemized differences
 *
 * @see OMB A-136, Section II.3 (SBR/SF-133 reconciliation requirement)
 * @see DoD FMR 7000.14-R, Vol. 6A, Ch. 2
 */
export function reconcileSBRToSF133(
  sbr: SBRReport,
  sf133Data: SF133Data[],
): {
  reconciled: boolean;
  differences: Array<{
    id: string;
    item: string;
    sbrAmount: number;
    sf133Amount: number;
    difference: number;
  }>;
} {
  const sf133 = aggregateSF133(sf133Data);
  const differences: Array<{
    id: string;
    item: string;
    sbrAmount: number;
    sf133Amount: number;
    difference: number;
  }> = [];

  const checks: Array<{ item: string; sbrVal: number; sf133Val: number }> = [
    {
      item: 'Total Budgetary Resources',
      sbrVal: sbr.budgetaryResources.totalBudgetaryResources.currentYear,
      sf133Val: sf133.totalBR,
    },
    {
      item: 'New Obligations and Upward Adjustments',
      sbrVal: sbr.statusOfBudgetaryResources.newObligationsAndUpwardAdjustments.currentYear,
      sf133Val: sf133.newOblig,
    },
    {
      item: 'Net Outlays',
      sbrVal: sbr.budgetAuthorityAndOutlays.outlaysNet.currentYear,
      sf133Val: sf133.outlaysNet,
    },
  ];

  for (const check of checks) {
    const diff = round2(check.sbrVal - check.sf133Val);
    if (Math.abs(diff) > 0.01) {
      differences.push({
        id: uuid(),
        item: check.item,
        sbrAmount: check.sbrVal,
        sf133Amount: check.sf133Val,
        difference: diff,
      });
    }
  }

  return { reconciled: differences.length === 0, differences };
}
