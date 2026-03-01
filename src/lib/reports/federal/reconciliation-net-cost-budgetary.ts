/**
 * Reconciliation of Net Cost to Budgetary Obligations Generator
 *
 * Generates the Reconciliation of Net Operating Cost and Net Budgetary
 * Outlays (formerly titled "Reconciliation of Net Cost of Operations to
 * Budget") per OMB Circular A-136, Section II.3. This statement bridges
 * the proprietary (accrual-based) and budgetary (obligation-based)
 * accounting perspectives.
 *
 * The reconciliation starts with net cost of operations (from the Statement
 * of Net Cost, a proprietary/accrual measure) and adjusts for timing and
 * basis differences to arrive at net budgetary outlays (a budgetary measure):
 *
 *   1. Components of Net Cost That Are Not Part of Net Budgetary Outlays
 *      (e.g., depreciation, bad debt expense, revaluation gains/losses,
 *       changes in unfunded liabilities)
 *
 *   2. Components of Net Budgetary Outlays That Are Not Part of Net Cost
 *      (e.g., acquisition of capital assets, inventory purchases,
 *       prior period adjustments)
 *
 *   3. Other Temporary Timing Differences
 *
 * The result should equal net budgetary outlays as reported on the SBR.
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

/** Input for a single reconciliation adjustment item. */
export interface ReconciliationAdjustmentInput {
  description: string;
  currentYear: number;
  priorYear: number;
}

/** Input data for generating the Reconciliation of Net Cost to Budgetary Outlays. */
export interface ReconciliationData {
  /** Net cost of operations (from Statement of Net Cost). */
  netCostOfOperations: { currentYear: number; priorYear: number };

  /**
   * Components of net cost that are not part of net budgetary outlays.
   * These represent accrual-based expenses that do not use budgetary resources
   * in the current period.
   */
  componentsNotRequiringResources: {
    depreciation: ReconciliationAdjustmentInput;
    amortization: ReconciliationAdjustmentInput;
    revaluationGainsLosses: ReconciliationAdjustmentInput;
    badDebtExpense: ReconciliationAdjustmentInput;
    costOfGoodsSold: ReconciliationAdjustmentInput;
    otherNonBudgetary: ReconciliationAdjustmentInput;
  };

  /**
   * Components of net cost that require resources in future periods.
   * These represent unfunded liabilities recognized on an accrual basis
   * but not yet obligated or funded.
   */
  componentsRequiringFutureResources: {
    unfundedAnnualLeave: ReconciliationAdjustmentInput;
    unfundedFECA: ReconciliationAdjustmentInput;
    unfundedEmployeeBenefits: ReconciliationAdjustmentInput;
    unfundedEnvironmentalLiabilities: ReconciliationAdjustmentInput;
    otherUnfunded: ReconciliationAdjustmentInput;
  };

  /**
   * Components of net budgetary outlays that are not part of net cost.
   * These represent budgetary obligations/outlays for items capitalized
   * or otherwise not expensed in the current period.
   */
  resourcesNotFinancingNetCost: {
    acquisitionOfCapitalAssets: ReconciliationAdjustmentInput;
    acquisitionOfInventory: ReconciliationAdjustmentInput;
    priorPeriodAdjustments: ReconciliationAdjustmentInput;
    transfersOutWithoutReimbursement: ReconciliationAdjustmentInput;
    otherNonCost: ReconciliationAdjustmentInput;
  };

  /** Other temporary timing differences. */
  otherTimingDifferences: ReconciliationAdjustmentInput[];

  /** Expected net budgetary outlays (for validation against SBR). */
  expectedNetBudgetaryOutlays?: { currentYear: number; priorYear: number };
}

/**
 * Complete Reconciliation of Net Operating Cost and Net Budgetary Outlays.
 * Per OMB A-136, Section II.3 and SFFAS 53.
 */
export interface NetCostBudgetaryReconciliation {
  id: string;
  reportDate: string;
  fiscalYear: number;
  entityName: string;
  netCostOfOperations: ReconciliationItem;
  componentsNotRequiringResources: ReconciliationSection;
  componentsRequiringFutureResources: ReconciliationSection;
  resourcesNotFinancingNetCost: ReconciliationSection;
  otherTimingDifferences: ReconciliationSection;
  totalResourcesUsed: ReconciliationItem;
  netBudgetaryOutlays: ReconciliationItem;
  validation: {
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
 * Create a ReconciliationItem from an input adjustment.
 */
function makeItemFromInput(
  input: ReconciliationAdjustmentInput,
): ReconciliationItem {
  return makeItem(input.description, input.currentYear, input.priorYear);
}

/**
 * Build a ReconciliationSection from inputs and compute the subtotal.
 */
function buildSection(
  title: string,
  subtotalLabel: string,
  inputs: ReconciliationAdjustmentInput[],
): ReconciliationSection {
  const items = inputs.map(makeItemFromInput);
  const currentYear = items.reduce((sum, i) => sum + i.currentYear, 0);
  const priorYear = items.reduce((sum, i) => sum + i.priorYear, 0);
  const subtotal = makeItem(subtotalLabel, currentYear, priorYear);
  return { id: uuid(), title, items, subtotal };
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
 * perspective) by adjusting for four categories of differences:
 *
 *   1. Components of net cost that are NOT part of net budgetary outlays:
 *      - Depreciation/amortization (non-cash expense)
 *      - Revaluation gains and losses
 *      - Bad debt expense (accrued not obligated)
 *      - Cost of goods sold (from inventory, previously obligated)
 *      - Other non-budgetary charges
 *
 *   2. Components requiring resources in future periods:
 *      - Increase in unfunded annual leave liability
 *      - FECA actuarial liability changes
 *      - Unfunded employee benefits (e.g., OPEB)
 *      - Unfunded environmental/disposal liabilities
 *      - Other unfunded liabilities
 *
 *   3. Resources used that do NOT finance net cost:
 *      - Acquisition of capital assets (budgetary outlay, capitalized not expensed)
 *      - Acquisition of inventory (obligated, not yet consumed)
 *      - Prior period adjustments
 *      - Transfers out without reimbursement
 *      - Other non-cost outlays
 *
 *   4. Other temporary timing differences
 *
 * The resulting net budgetary outlays should agree with the SBR.
 *
 * @param data - Reconciliation input data
 * @param fiscalYear - The fiscal year of the report
 * @param entityName - Name of the reporting entity
 * @returns NetCostBudgetaryReconciliation with all sections and SBR validation
 *
 * @see OMB Circular A-136, Section II.3
 * @see SFFAS 53 (Budget and Accrual Reconciliation)
 * @see FASAB Technical Release 20 (SFFAS 53 Implementation Guidance)
 */
export function generateReconciliation(
  data: ReconciliationData,
  fiscalYear: number,
  entityName: string = 'Federal Reporting Entity',
): NetCostBudgetaryReconciliation {
  // -------------------------------------------------------------------------
  // Net Cost of Operations (starting point)
  // -------------------------------------------------------------------------
  const netCostOfOperations = makeItem(
    'Net Cost of Operations',
    data.netCostOfOperations.currentYear,
    data.netCostOfOperations.priorYear,
  );

  // -------------------------------------------------------------------------
  // Section 1: Components Not Requiring / Generating Resources
  // -------------------------------------------------------------------------
  const cnr = data.componentsNotRequiringResources;
  const componentsNotRequiringResources = buildSection(
    'Components of Net Cost That Are Not Part of Net Budgetary Outlays',
    'Total Components Not Part of Net Budgetary Outlays',
    [
      cnr.depreciation,
      cnr.amortization,
      cnr.revaluationGainsLosses,
      cnr.badDebtExpense,
      cnr.costOfGoodsSold,
      cnr.otherNonBudgetary,
    ],
  );

  // -------------------------------------------------------------------------
  // Section 2: Components Requiring Resources in Future Periods
  // -------------------------------------------------------------------------
  const cfr = data.componentsRequiringFutureResources;
  const componentsRequiringFutureResources = buildSection(
    'Components of Net Cost That Are Not Part of Net Budgetary Outlays ' +
    'but Require Resources in Future Periods',
    'Total Components Requiring Future Resources',
    [
      cfr.unfundedAnnualLeave,
      cfr.unfundedFECA,
      cfr.unfundedEmployeeBenefits,
      cfr.unfundedEnvironmentalLiabilities,
      cfr.otherUnfunded,
    ],
  );

  // -------------------------------------------------------------------------
  // Section 3: Resources Not Financing Net Cost
  // -------------------------------------------------------------------------
  const rnf = data.resourcesNotFinancingNetCost;
  const resourcesNotFinancingNetCost = buildSection(
    'Components of Net Budgetary Outlays That Are Not Part of Net Cost',
    'Total Resources Not Financing Net Cost',
    [
      rnf.acquisitionOfCapitalAssets,
      rnf.acquisitionOfInventory,
      rnf.priorPeriodAdjustments,
      rnf.transfersOutWithoutReimbursement,
      rnf.otherNonCost,
    ],
  );

  // -------------------------------------------------------------------------
  // Section 4: Other Temporary Timing Differences
  // -------------------------------------------------------------------------
  const otherTimingDifferences = buildSection(
    'Other Temporary Timing Differences',
    'Total Other Temporary Timing Differences',
    data.otherTimingDifferences,
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

  const totalAdjustmentsPY = round2(
    componentsNotRequiringResources.subtotal.priorYear +
    componentsRequiringFutureResources.subtotal.priorYear +
    resourcesNotFinancingNetCost.subtotal.priorYear +
    otherTimingDifferences.subtotal.priorYear,
  );

  const totalResourcesUsed = makeItem(
    'Total Resources Used to Finance Activities',
    round2(netCostOfOperations.currentYear + totalAdjustmentsCY),
    round2(netCostOfOperations.priorYear + totalAdjustmentsPY),
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

  if (data.expectedNetBudgetaryOutlays) {
    cyDiff = round2(
      netBudgetaryOutlays.currentYear -
      data.expectedNetBudgetaryOutlays.currentYear,
    );
    pyDiff = round2(
      netBudgetaryOutlays.priorYear -
      data.expectedNetBudgetaryOutlays.priorYear,
    );
    reconcilesWithSBR = Math.abs(cyDiff) < 0.01 && Math.abs(pyDiff) < 0.01;
  }

  return {
    id: uuid(),
    reportDate: new Date().toISOString(),
    fiscalYear,
    entityName,
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
