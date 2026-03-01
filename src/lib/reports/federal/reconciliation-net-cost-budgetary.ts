/**
 * Reconciliation of Net Cost to Budgetary Obligations Generator
 *
 * Generates the Reconciliation of Net Operating Cost and Net Budgetary
 * Outlays (formerly titled "Reconciliation of Net Cost of Operations to
 * Budget") per OMB Circular A-136, Section II.3. This statement bridges
 * the proprietary (accrual-based) and budgetary (obligation-based)
 * accounting perspectives.
 *
 * Data is derived from DoDEngagementData USSGL accounts, property records,
 * environmental liabilities, actuarial liabilities, and obligations.
 *
 * The reconciliation starts with net cost of operations (from the Statement
 * of Net Cost, a proprietary/accrual measure) and adjusts for timing and
 * basis differences to arrive at net budgetary outlays (a budgetary measure):
 *
 *   1. Components of Net Cost That Are Not Part of Net Budgetary Outlays
 *      (e.g., depreciation, bad debt expense, revaluation gains/losses,
 *       changes in unfunded liabilities)
 *
 *   2. Components of Net Cost Requiring Resources in Future Periods
 *      (e.g., unfunded leave, FECA, environmental liabilities)
 *
 *   3. Components of Net Budgetary Outlays That Are Not Part of Net Cost
 *      (e.g., acquisition of capital assets, inventory purchases,
 *       prior period adjustments)
 *
 *   4. Other Temporary Timing Differences
 *
 * The result should equal net budgetary outlays as reported on the SBR.
 *
 * USSGL Account Mapping:
 *   6700-6799: Depreciation and amortization expense
 *   6720: Bad debt expense
 *   6730-6739: Gains/losses on disposition and revaluation
 *   2210-2219: Unfunded annual leave liability
 *   2900-2999: Other unfunded liabilities
 *   1710-1799: Property, Plant, and Equipment (capital asset acquisitions)
 *   1521-1529: Inventory (purchased not yet consumed)
 *
 * References:
 *   - OMB Circular A-136, Section II.3 (Reconciliation Statement)
 *   - SFFAS 7: Accounting for Revenue and Other Financing Sources
 *   - SFFAS 4: Managerial Cost Accounting Standards
 *   - SFFAS 5: Accounting for Liabilities of the Federal Government
 *   - SFFAS 53: Budget and Accrual Reconciliation
 *   - FASAB Technical Release 20: Implementation Guidance for SFFAS 53
 *   - DoD FMR 7000.14-R, Vol. 6A, Ch. 4: Financial Statements
 *   - USSGL TFM Supplement, Section V (Crosswalk)
 */

import type {
  USSGLAccount,
  DoDEngagementData,
  DoDComponentCode,
  PropertyRecord,
  EnvironmentalLiability,
  ActuarialLiability,
  SF133Data,
} from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Rounding precision for financial statement amounts. */
const ROUNDING_PRECISION = 2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single reconciliation line item. */
export interface ReconciliationItem {
  id: string;
  description: string;
  currentYear: number;
  priorYear: number;
}

/** A section of the reconciliation with subtotal. */
export interface ReconciliationSection {
  id: string;
  title: string;
  items: ReconciliationItem[];
  subtotal: ReconciliationItem;
}

/**
 * Complete Reconciliation of Net Operating Cost and Net Budgetary Outlays.
 * Per OMB A-136, Section II.3 and SFFAS 53.
 */
export interface NetCostBudgetaryReconciliationReport {
  id: string;
  fiscalYear: number;
  dodComponent: string;
  reportingPeriodEnd: string;
  netCostOfOperations: ReconciliationItem;
  componentsNotRequiringResources: ReconciliationSection;
  componentsRequiringFutureResources: ReconciliationSection;
  resourcesNotFinancingNetCost: ReconciliationSection;
  otherTimingDifferences: ReconciliationSection;
  totalResourcesUsed: ReconciliationItem;
  netBudgetaryOutlays: ReconciliationItem;
  validation: {
    /** Whether reconciled outlays agree with SBR net outlays. */
    reconcilesWithSBR: boolean;
    currentYearDifference: number;
    priorYearDifference: number;
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Round a number to the standard financial statement precision.
 */
function round2(n: number): number {
  return Math.round(n * 10 ** ROUNDING_PRECISION) / 10 ** ROUNDING_PRECISION;
}

/**
 * Create a ReconciliationItem.
 */
function makeItem(
  description: string,
  currentYear: number,
  priorYear: number,
): ReconciliationItem {
  return {
    id: uuid(),
    description,
    currentYear: round2(currentYear),
    priorYear: round2(priorYear),
  };
}

/**
 * Build a ReconciliationSection from items and compute the subtotal.
 */
function buildSection(
  title: string,
  subtotalLabel: string,
  items: ReconciliationItem[],
): ReconciliationSection {
  const currentYear = items.reduce((sum, i) => sum + i.currentYear, 0);
  const priorYear = items.reduce((sum, i) => sum + i.priorYear, 0);
  const subtotal = makeItem(subtotalLabel, currentYear, priorYear);
  return { id: uuid(), title, items, subtotal };
}

/**
 * Sum end-balance for proprietary USSGL accounts in a numeric range.
 */
function sumRange(
  accounts: USSGLAccount[],
  minAcct: number,
  maxAcct: number,
  absoluteValue = true,
): number {
  return accounts
    .filter((a) => {
      const n = parseInt(a.accountNumber, 10);
      return a.accountType === 'proprietary' && n >= minAcct && n <= maxAcct;
    })
    .reduce(
      (sum, a) => sum + (absoluteValue ? Math.abs(a.endBalance) : a.endBalance),
      0,
    );
}

/**
 * Sum begin-balance for proprietary USSGL accounts in a numeric range.
 */
function sumBeginRange(
  accounts: USSGLAccount[],
  minAcct: number,
  maxAcct: number,
  absoluteValue = true,
): number {
  return accounts
    .filter((a) => {
      const n = parseInt(a.accountNumber, 10);
      return a.accountType === 'proprietary' && n >= minAcct && n <= maxAcct;
    })
    .reduce(
      (sum, a) =>
        sum + (absoluteValue ? Math.abs(a.beginBalance) : a.beginBalance),
      0,
    );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates the Reconciliation of Net Operating Cost and Net Budgetary
 * Outlays per OMB A-136, Section II.3 and SFFAS 53.
 *
 * This statement bridges the accrual-based net cost of operations
 * (proprietary perspective) to net budgetary outlays (budgetary
 * perspective) by adjusting for four categories of differences,
 * all derived from DoDEngagementData:
 *
 *   1. Components of net cost NOT part of net budgetary outlays:
 *      - Depreciation/amortization (USSGL 6700-6799)
 *      - Revaluation gains and losses (USSGL 6730-6739)
 *      - Bad debt expense (USSGL 6720)
 *      - Cost of goods sold (USSGL 6500-6599)
 *      - Other non-budgetary charges
 *
 *   2. Components requiring resources in future periods:
 *      - Unfunded annual leave (USSGL 2210 change)
 *      - FECA actuarial liability (from actuarialLiabilities)
 *      - Unfunded employee benefits (from actuarialLiabilities)
 *      - Environmental liabilities (from environmentalLiabilities)
 *      - Other unfunded (USSGL 2900 change)
 *
 *   3. Resources NOT financing net cost:
 *      - Capital asset acquisitions (from propertyRecords)
 *      - Inventory purchases (USSGL 1521-1529 change)
 *      - Transfers out without reimbursement
 *      - Other non-cost outlays
 *
 *   4. Other temporary timing differences
 *
 * The resulting net budgetary outlays are validated against SF-133
 * data when available.
 *
 * @param data - Complete DoD engagement dataset
 * @returns NetCostBudgetaryReconciliationReport with all sections and SBR validation
 *
 * @see OMB Circular A-136, Section II.3
 * @see SFFAS 53 (Budget and Accrual Reconciliation)
 * @see FASAB Technical Release 20 (SFFAS 53 Implementation Guidance)
 */
export function generateReconciliation(
  data: DoDEngagementData,
): NetCostBudgetaryReconciliationReport {
  const accts = data.ussglAccounts;
  const fiscalYear = data.fiscalYear;

  // -------------------------------------------------------------------------
  // Net Cost of Operations (starting point)
  // Derived from USSGL: expenses (6000-6999) less earned revenue (5000-5699)
  // -------------------------------------------------------------------------
  const totalExpenses = sumRange(accts, 6000, 6999);
  const totalEarnedRevenue = sumRange(accts, 5000, 5699);
  const netCostCY = round2(totalExpenses - totalEarnedRevenue);

  const netCostOfOperations = makeItem(
    'Net Cost of Operations',
    netCostCY,
    0,
  );

  // -------------------------------------------------------------------------
  // Section 1: Components Not Requiring / Generating Resources
  // These are accrual expenses that do not consume budgetary resources.
  // -------------------------------------------------------------------------

  // Depreciation expense (USSGL 6700-6719)
  const depreciationCY = sumRange(accts, 6700, 6719);
  const depreciation = makeItem(
    'Depreciation and Amortization',
    -depreciationCY,
    0,
  );

  // Revaluation gains/losses (USSGL 6730-6739)
  const revaluationCY = sumRange(accts, 6730, 6739);
  const revaluation = makeItem(
    'Revaluation of Assets and Liabilities (+/-)',
    -revaluationCY,
    0,
  );

  // Bad debt expense (USSGL 6720-6729)
  const badDebtCY = sumRange(accts, 6720, 6729);
  const badDebt = makeItem('Bad Debt Expense', -badDebtCY, 0);

  // Cost of goods sold (USSGL 6500-6599)
  const cogsCY = sumRange(accts, 6500, 6599);
  const cogs = makeItem(
    'Cost of Goods Sold (from Inventory, Previously Obligated)',
    -cogsCY,
    0,
  );

  // Other non-budgetary: USSGL 6800-6899 (miscellaneous losses)
  const otherNonBudgetaryCY = sumRange(accts, 6800, 6899);
  const otherNonBudgetary = makeItem(
    'Other Non-Budgetary Charges',
    -otherNonBudgetaryCY,
    0,
  );

  const componentsNotRequiringResources = buildSection(
    'Components of Net Cost That Are Not Part of Net Budgetary Outlays',
    'Total Components Not Part of Net Budgetary Outlays',
    [depreciation, revaluation, badDebt, cogs, otherNonBudgetary],
  );

  // -------------------------------------------------------------------------
  // Section 2: Components Requiring Resources in Future Periods
  // These are unfunded liabilities recognized on an accrual basis.
  // -------------------------------------------------------------------------

  // Unfunded annual leave: change in USSGL 2210-2219
  const leaveEnd = sumRange(accts, 2210, 2219);
  const leaveBegin = sumBeginRange(accts, 2210, 2219);
  const unfundedLeaveCY = round2(leaveEnd - leaveBegin);
  const unfundedLeave = makeItem(
    'Increase/(Decrease) in Unfunded Annual Leave',
    -unfundedLeaveCY,
    0,
  );

  // FECA actuarial liability changes
  const fecaLiabilities = (data.actuarialLiabilities ?? []).filter(
    (a) => a.benefitType === 'feca',
  );
  const fecaChangeCY = fecaLiabilities.reduce(
    (s, a) => s + a.actuarialGainLoss,
    0,
  );
  const unfundedFECA = makeItem(
    'Increase/(Decrease) in FECA Actuarial Liability',
    -fecaChangeCY,
    0,
  );

  // Unfunded employee benefits (pensions, health)
  const employeeBenefits = (data.actuarialLiabilities ?? []).filter(
    (a) =>
      a.benefitType === 'fers' ||
      a.benefitType === 'csrs' ||
      a.benefitType === 'opeb_health' ||
      a.benefitType === 'military_retirement',
  );
  const employeeBenefitsCY = employeeBenefits.reduce(
    (s, a) => s + a.unfundedPortion,
    0,
  );
  const unfundedBenefits = makeItem(
    'Increase/(Decrease) in Unfunded Employee Benefits',
    -employeeBenefitsCY,
    0,
  );

  // Environmental liabilities changes
  const envLiabTotal = (data.environmentalLiabilities ?? []).reduce(
    (s, e) => s + e.recordedLiability,
    0,
  );
  const unfundedEnv = makeItem(
    'Increase/(Decrease) in Environmental/Disposal Liabilities',
    -envLiabTotal,
    0,
  );

  // Other unfunded: change in USSGL 2900-2999
  const otherUnfundedEnd = sumRange(accts, 2900, 2999);
  const otherUnfundedBegin = sumBeginRange(accts, 2900, 2999);
  const otherUnfundedCY = round2(otherUnfundedEnd - otherUnfundedBegin);
  const otherUnfunded = makeItem(
    'Increase/(Decrease) in Other Unfunded Liabilities',
    -otherUnfundedCY,
    0,
  );

  const componentsRequiringFutureResources = buildSection(
    'Components of Net Cost That Are Not Part of Net Budgetary Outlays ' +
    'but Require Resources in Future Periods',
    'Total Components Requiring Future Resources',
    [unfundedLeave, unfundedFECA, unfundedBenefits, unfundedEnv, otherUnfunded],
  );

  // -------------------------------------------------------------------------
  // Section 3: Resources Not Financing Net Cost
  // These are budgetary outlays for items capitalized or otherwise
  // not expensed in the current period.
  // -------------------------------------------------------------------------

  // Capital asset acquisitions: from property records (current year acquisitions)
  const currentYearAcquisitions = (data.propertyRecords ?? [])
    .filter(
      (p) =>
        p.fiscalYear === fiscalYear &&
        (p.category === 'general_ppe' || p.category === 'internal_use_software'),
    )
    .reduce((s, p) => s + p.acquisitionCost, 0);
  const capitalAssets = makeItem(
    'Acquisition of Capital Assets',
    currentYearAcquisitions,
    0,
  );

  // Inventory purchases: change in USSGL 1521-1529
  const inventoryEnd = sumRange(accts, 1521, 1529);
  const inventoryBegin = sumBeginRange(accts, 1521, 1529);
  const inventoryChangeCY = round2(inventoryEnd - inventoryBegin);
  const inventoryPurchases = makeItem(
    'Acquisition of Inventory',
    inventoryChangeCY,
    0,
  );

  // Transfers out without reimbursement
  // Derive from intragovernmental transactions (transfers)
  const transfersOut = data.intragovernmentalTransactions
    .filter(
      (t) =>
        t.transactionType === 'transfer' &&
        t.buyerSellerIndicator === 'seller',
    )
    .reduce((s, t) => s + t.amount, 0);
  const transfersOutItem = makeItem(
    'Transfers Out Without Reimbursement',
    -transfersOut,
    0,
  );

  // Other non-cost: prior period adjustments, etc.
  const otherNonCostCY = 0; // No specific data field; placeholder
  const otherNonCost = makeItem(
    'Other Non-Cost Outlays',
    otherNonCostCY,
    0,
  );

  const resourcesNotFinancingNetCost = buildSection(
    'Components of Net Budgetary Outlays That Are Not Part of Net Cost',
    'Total Resources Not Financing Net Cost',
    [capitalAssets, inventoryPurchases, transfersOutItem, otherNonCost],
  );

  // -------------------------------------------------------------------------
  // Section 4: Other Temporary Timing Differences
  // -------------------------------------------------------------------------

  // UDO changes: difference between obligations incurred and costs recognized
  const openObligations = data.obligations.filter(
    (o) => o.status === 'open' || o.status === 'partially_liquidated',
  );
  const udoBalance = openObligations.reduce(
    (s, o) => s + o.unliquidatedBalance,
    0,
  );

  const timingItems: ReconciliationItem[] = [];
  if (udoBalance > 0) {
    timingItems.push(
      makeItem('Change in Undelivered Orders', udoBalance, 0),
    );
  }

  // Prepaid/deferred: USSGL 1410-1419 (advances and prepayments)
  const prepaidEnd = sumRange(accts, 1410, 1419);
  const prepaidBegin = sumBeginRange(accts, 1410, 1419);
  const prepaidChange = round2(prepaidEnd - prepaidBegin);
  if (Math.abs(prepaidChange) > 0.01) {
    timingItems.push(
      makeItem('Change in Advances and Prepayments', prepaidChange, 0),
    );
  }

  // Add a zero-row if no timing differences
  if (timingItems.length === 0) {
    timingItems.push(
      makeItem('No Other Timing Differences', 0, 0),
    );
  }

  const otherTimingDifferences = buildSection(
    'Other Temporary Timing Differences',
    'Total Other Temporary Timing Differences',
    timingItems,
  );

  // -------------------------------------------------------------------------
  // Total Resources Used to Finance Activities
  // -------------------------------------------------------------------------
  const totalAdjustmentsCY = round2(
    componentsNotRequiringResources.subtotal.currentYear +
    componentsRequiringFutureResources.subtotal.currentYear +
    resourcesNotFinancingNetCost.subtotal.currentYear +
    otherTimingDifferences.subtotal.currentYear,
  );

  const totalResourcesUsed = makeItem(
    'Total Resources Used to Finance Activities',
    round2(netCostOfOperations.currentYear + totalAdjustmentsCY),
    0,
  );

  // -------------------------------------------------------------------------
  // Net Budgetary Outlays
  // -------------------------------------------------------------------------
  const netBudgetaryOutlays = makeItem(
    'Net Budgetary Outlays',
    totalResourcesUsed.currentYear,
    totalResourcesUsed.priorYear,
  );

  // -------------------------------------------------------------------------
  // Validation: Reconciliation should agree with SBR net outlays
  // -------------------------------------------------------------------------
  let reconcilesWithSBR = true;
  let cyDiff = 0;
  let pyDiff = 0;

  if (data.sf133Data && data.sf133Data.length > 0) {
    const sbrNetOutlays = data.sf133Data.reduce(
      (s, sf) => s + sf.outlays.outlaysNet,
      0,
    );
    cyDiff = round2(netBudgetaryOutlays.currentYear - sbrNetOutlays);
    reconcilesWithSBR = Math.abs(cyDiff) < 0.01;
  }

  return {
    id: uuid(),
    fiscalYear,
    dodComponent: data.dodComponent,
    reportingPeriodEnd: `${fiscalYear}-09-30`,
    netCostOfOperations,
    componentsNotRequiringResources,
    componentsRequiringFutureResources,
    resourcesNotFinancingNetCost,
    otherTimingDifferences,
    totalResourcesUsed,
    netBudgetaryOutlays,
    validation: {
      reconcilesWithSBR,
      currentYearDifference: cyDiff,
      priorYearDifference: pyDiff,
    },
    generatedAt: new Date().toISOString(),
  };
}
