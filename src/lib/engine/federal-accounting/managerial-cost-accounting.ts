/**
 * Managerial Cost Accounting Engine — SFFAS 4
 *
 * Implements full cost accumulation by output/program per SFFAS 4,
 * paragraphs 78-92. Federal entities must accumulate and report
 * the full cost of outputs by responsibility segment.
 *
 * Key concepts:
 *   - Full cost = direct costs + allocated indirect costs + inter-entity costs
 *   - Responsibility segments align with major programs/missions
 *   - Cost assignment uses direct tracing, cause-and-effect allocation,
 *     or reasonable allocation bases
 *   - Inter-entity costs (intragovernmental) are recognized as imputed costs
 *
 * References:
 *   - SFFAS 4 (Managerial Cost Accounting Concepts and Standards)
 *   - SFFAS 4, para 78-92 (Full Cost Reporting)
 *   - DoD FMR Vol. 4, Ch. 21 (Cost Accounting)
 *   - OMB A-136, Section II.3 (Required Supplementary Information)
 */

import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CostType = 'direct' | 'indirect' | 'inter_entity' | 'imputed';

export type AllocationMethod = 'direct_trace' | 'cause_and_effect' | 'benefits_received' | 'reasonable_allocation';

export interface ResponsibilitySegment {
  id: string;
  name: string;
  programCode: string;
  missionArea: string;
  parentSegmentId?: string;
}

export interface CostObject {
  id: string;
  segmentId: string;
  outputDescription: string;
  outputType: 'goods' | 'services' | 'mission_output' | 'support';
  unitOfMeasure: string;
  totalUnitsProduced: number;
  fiscalYear: number;
}

export interface CostAccumulation {
  id: string;
  costObjectId: string;
  costType: CostType;
  allocationMethod: AllocationMethod;
  ussglAccountNumber: string;
  amount: number;
  description: string;
  sourceEntity?: string;
  period: string;
  fiscalYear: number;
}

export interface UnitCostResult {
  costObjectId: string;
  outputDescription: string;
  totalDirectCosts: number;
  totalIndirectCosts: number;
  totalInterEntityCosts: number;
  totalImputedCosts: number;
  fullCost: number;
  unitsProduced: number;
  unitCost: number;
  costBreakdown: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
}

export interface IndirectCostPool {
  id: string;
  name: string;
  totalCost: number;
  allocationBase: AllocationMethod;
  allocationFactor: string;
  allocations: Array<{
    segmentId: string;
    allocationPct: number;
    allocatedAmount: number;
  }>;
  fiscalYear: number;
}

export interface CostFindingReport {
  id: string;
  reportDate: string;
  fiscalYear: number;
  segments: Array<{
    segment: ResponsibilitySegment;
    costObjects: UnitCostResult[];
    totalSegmentCost: number;
  }>;
  grandTotalCost: number;
  interEntityCostsTotal: number;
  imputedCostsTotal: number;
}

// ---------------------------------------------------------------------------
// Direct Cost Assignment
// ---------------------------------------------------------------------------

/**
 * Assign direct costs to a cost object.
 *
 * Direct costs are traced to specific outputs using cause-and-effect
 * relationships. Per SFFAS 4, para 80, direct costs should be traced
 * to outputs whenever economically feasible.
 *
 * @param costObjectId - The cost object receiving the cost
 * @param ussglAccount - The USSGL expense account (5000-6999)
 * @param amount - The cost amount
 * @param description - Description of the cost
 * @param period - Accounting period
 * @param fiscalYear - Fiscal year
 */
export function assignDirectCost(
  costObjectId: string,
  ussglAccount: string,
  amount: number,
  description: string,
  period: string,
  fiscalYear: number
): CostAccumulation {
  return {
    id: uuid(),
    costObjectId,
    costType: 'direct',
    allocationMethod: 'direct_trace',
    ussglAccountNumber: ussglAccount,
    amount,
    description,
    period,
    fiscalYear,
  };
}

// ---------------------------------------------------------------------------
// Indirect Cost Allocation
// ---------------------------------------------------------------------------

/**
 * Create an indirect cost pool and allocate to responsibility segments.
 *
 * Per SFFAS 4, para 84-86, indirect costs that cannot be directly traced
 * must be assigned using allocation methods that reflect a cause-and-effect
 * relationship or reasonable basis.
 *
 * Common allocation bases for DoD:
 *   - Direct labor hours/costs
 *   - Square footage
 *   - Headcount
 *   - Machine hours
 *   - Direct costs (step-down method)
 *
 * @param name - Pool name (e.g., "Overhead", "IT Support")
 * @param totalCost - Total cost in the pool
 * @param allocationBase - Method used for allocation
 * @param segmentShares - Map of segmentId -> allocation percentage (must sum to 1.0)
 * @param fiscalYear - Fiscal year
 */
export function allocateIndirectCosts(
  name: string,
  totalCost: number,
  allocationBase: AllocationMethod,
  segmentShares: Record<string, number>,
  fiscalYear: number
): IndirectCostPool {
  const allocations = Object.entries(segmentShares).map(([segmentId, pct]) => ({
    segmentId,
    allocationPct: pct,
    allocatedAmount: Math.round(totalCost * pct * 100) / 100,
  }));

  return {
    id: uuid(),
    name,
    totalCost,
    allocationBase,
    allocationFactor: `Allocated by ${allocationBase.replace(/_/g, ' ')}`,
    allocations,
    fiscalYear,
  };
}

/**
 * Perform step-down allocation of indirect costs.
 *
 * The step-down (sequential) method allocates support department costs
 * to other support departments and operating departments in a sequential
 * order. Each support department's costs are allocated only once.
 *
 * @param supportDepts - Ordered list of support departments to allocate
 * @param operatingDepts - Operating departments receiving allocations
 * @returns Allocations for each support department
 */
export function performStepDownAllocation(
  supportDepts: Array<{ id: string; name: string; totalCost: number; shares: Record<string, number> }>,
  operatingDepts: Array<{ id: string; name: string }>
): IndirectCostPool[] {
  const pools: IndirectCostPool[] = [];
  const accumulatedCosts: Record<string, number> = {};

  // Initialize operating dept accumulated costs
  for (const dept of operatingDepts) {
    accumulatedCosts[dept.id] = 0;
  }

  for (const support of supportDepts) {
    const totalToAllocate = support.totalCost + (accumulatedCosts[support.id] || 0);

    const allocations = Object.entries(support.shares)
      .filter(([id]) => id !== support.id)
      .map(([id, pct]) => {
        const allocated = Math.round(totalToAllocate * pct * 100) / 100;
        accumulatedCosts[id] = (accumulatedCosts[id] || 0) + allocated;
        return { segmentId: id, allocationPct: pct, allocatedAmount: allocated };
      });

    pools.push({
      id: uuid(),
      name: `Step-down: ${support.name}`,
      totalCost: totalToAllocate,
      allocationBase: 'reasonable_allocation',
      allocationFactor: `Step-down allocation from ${support.name}`,
      allocations,
      fiscalYear: 0,
    });
  }

  return pools;
}

// ---------------------------------------------------------------------------
// Inter-Entity Cost Assignment
// ---------------------------------------------------------------------------

/**
 * Recognize inter-entity (intragovernmental) costs.
 *
 * Per SFFAS 4, para 88-89, the full cost of an output includes the
 * costs of goods and services received from other federal entities.
 * These are recognized as imputed costs when not directly reimbursed.
 *
 * Common inter-entity costs in DoD:
 *   - FERS retirement (OPM imputed cost)
 *   - FEHB health insurance (OPM imputed cost)
 *   - FECA workers' compensation (DOL imputed cost)
 *   - Treasury judgment fund payments
 *
 * @param costObjectId - The cost object receiving the imputed cost
 * @param sourceEntity - The federal entity providing the service
 * @param amount - The imputed cost amount
 * @param description - Description
 * @param period - Accounting period
 * @param fiscalYear - Fiscal year
 */
export function assignInterEntityCost(
  costObjectId: string,
  sourceEntity: string,
  amount: number,
  description: string,
  period: string,
  fiscalYear: number
): CostAccumulation {
  return {
    id: uuid(),
    costObjectId,
    costType: 'inter_entity',
    allocationMethod: 'direct_trace',
    ussglAccountNumber: '6730',
    amount,
    description: `Inter-entity cost from ${sourceEntity}: ${description}`,
    sourceEntity,
    period,
    fiscalYear,
  };
}

/**
 * Recognize imputed financing costs.
 *
 * Per SFFAS 4, para 89, imputed costs are recognized for services
 * received from other federal entities that are not fully reimbursed.
 * The offsetting entry is to Imputed Financing Sources (USSGL 5780).
 */
export function assignImputedCost(
  costObjectId: string,
  sourceEntity: string,
  amount: number,
  description: string,
  period: string,
  fiscalYear: number
): CostAccumulation {
  return {
    id: uuid(),
    costObjectId,
    costType: 'imputed',
    allocationMethod: 'direct_trace',
    ussglAccountNumber: '6720',
    amount,
    description: `Imputed cost from ${sourceEntity}: ${description}`,
    sourceEntity,
    period,
    fiscalYear,
  };
}

// ---------------------------------------------------------------------------
// Unit Cost Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate unit cost for a cost object.
 *
 * Accumulates all assigned costs (direct, indirect, inter-entity, imputed)
 * and divides by the number of units produced to determine unit cost.
 *
 * Per SFFAS 4, para 91, unit cost information should be reported
 * as Required Supplementary Information (RSI).
 *
 * @param costObject - The cost object to calculate unit cost for
 * @param accumulations - All cost accumulations for this cost object
 */
export function calculateUnitCost(
  costObject: CostObject,
  accumulations: CostAccumulation[]
): UnitCostResult {
  const relevant = accumulations.filter((a) => a.costObjectId === costObject.id);

  const directCosts = relevant
    .filter((a) => a.costType === 'direct')
    .reduce((sum, a) => sum + a.amount, 0);
  const indirectCosts = relevant
    .filter((a) => a.costType === 'indirect')
    .reduce((sum, a) => sum + a.amount, 0);
  const interEntityCosts = relevant
    .filter((a) => a.costType === 'inter_entity')
    .reduce((sum, a) => sum + a.amount, 0);
  const imputedCosts = relevant
    .filter((a) => a.costType === 'imputed')
    .reduce((sum, a) => sum + a.amount, 0);

  const fullCost = directCosts + indirectCosts + interEntityCosts + imputedCosts;
  const unitCost = costObject.totalUnitsProduced > 0
    ? Math.round((fullCost / costObject.totalUnitsProduced) * 100) / 100
    : 0;

  const breakdown = [
    { category: 'Direct Costs', amount: directCosts, percentage: fullCost > 0 ? directCosts / fullCost : 0 },
    { category: 'Indirect Costs', amount: indirectCosts, percentage: fullCost > 0 ? indirectCosts / fullCost : 0 },
    { category: 'Inter-Entity Costs', amount: interEntityCosts, percentage: fullCost > 0 ? interEntityCosts / fullCost : 0 },
    { category: 'Imputed Costs', amount: imputedCosts, percentage: fullCost > 0 ? imputedCosts / fullCost : 0 },
  ];

  return {
    costObjectId: costObject.id,
    outputDescription: costObject.outputDescription,
    totalDirectCosts: directCosts,
    totalIndirectCosts: indirectCosts,
    totalInterEntityCosts: interEntityCosts,
    totalImputedCosts: imputedCosts,
    fullCost,
    unitsProduced: costObject.totalUnitsProduced,
    unitCost,
    costBreakdown: breakdown,
  };
}

// ---------------------------------------------------------------------------
// Cost Finding Report
// ---------------------------------------------------------------------------

/**
 * Generate a Cost Finding Report per OMB A-136 RSI requirements.
 *
 * Consolidates all cost data by responsibility segment and produces
 * the report structure required for the Statement of Net Cost and
 * Required Supplementary Information.
 *
 * @param segments - Responsibility segments
 * @param costObjects - All cost objects
 * @param accumulations - All cost accumulations
 * @param fiscalYear - Fiscal year
 */
export function generateCostFindingReport(
  segments: ResponsibilitySegment[],
  costObjects: CostObject[],
  accumulations: CostAccumulation[],
  fiscalYear: number
): CostFindingReport {
  let grandTotal = 0;
  let interEntityTotal = 0;
  let imputedTotal = 0;

  const segmentData = segments.map((segment) => {
    const segCostObjects = costObjects.filter((co) => co.segmentId === segment.id);
    const unitCostResults = segCostObjects.map((co) =>
      calculateUnitCost(co, accumulations)
    );

    const segTotal = unitCostResults.reduce((sum, r) => sum + r.fullCost, 0);
    grandTotal += segTotal;
    interEntityTotal += unitCostResults.reduce((sum, r) => sum + r.totalInterEntityCosts, 0);
    imputedTotal += unitCostResults.reduce((sum, r) => sum + r.totalImputedCosts, 0);

    return {
      segment,
      costObjects: unitCostResults,
      totalSegmentCost: segTotal,
    };
  });

  return {
    id: uuid(),
    reportDate: new Date().toISOString(),
    fiscalYear,
    segments: segmentData,
    grandTotalCost: grandTotal,
    interEntityCostsTotal: interEntityTotal,
    imputedCostsTotal: imputedTotal,
  };
}
