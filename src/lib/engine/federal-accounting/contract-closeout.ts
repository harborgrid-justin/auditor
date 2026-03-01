/**
 * Contract Closeout Engine — Volume 10
 *
 * Manages the contract closeout process from completion through final
 * payment and contractor release. Implements FAR Part 4.804 and
 * DoD FMR Vol. 10 closeout requirements.
 *
 * Contract closeout timelines per FAR 4.804-1:
 *   - Firm-fixed-price: 6 months after physical completion
 *   - Cost-reimbursement: 36 months (or 20 months for quick closeout)
 *   - T&M / Labor Hour: 36 months
 *   - Other: 36 months
 *
 * Quick closeout eligibility per FAR 42.708:
 *   - Unsettled indirect costs are insignificant relative to total cost
 *   - The contractor has adequately established final indirect cost rates
 *   - Government contracting officer determines quick closeout is appropriate
 *
 * References:
 *   - FAR Part 4.804 (Closeout of Contract Files)
 *   - FAR 42.708 (Quick Closeout Procedures)
 *   - DoD FMR Vol. 10, Ch. 17 (Contract Closeout)
 *   - DFARS 204.804 (DoD Contract Closeout)
 *   - DD Form 1594 (Contract Completion Statement)
 */

import type { ContractRecord } from '@/types/dod-fmr';
import { v4 as uuid } from 'uuid';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CloseoutStatus =
  | 'not_started'
  | 'physically_complete'
  | 'closeout_initiated'
  | 'indirect_rates_settled'
  | 'final_payment_processed'
  | 'property_cleared'
  | 'patent_cleared'
  | 'release_obtained'
  | 'closed';

export interface CloseoutChecklist {
  id: string;
  contractId: string;
  contractNumber: string;
  contractType: string;
  status: CloseoutStatus;
  physicalCompletionDate?: string;
  closeoutDeadline: string;
  isOverdue: boolean;
  daysUntilDeadline: number;

  // Checklist items
  finalInvoiceReceived: boolean;
  finalIndirectRatesSettled: boolean;
  allModificationsExecuted: boolean;
  allDeliverablesAccepted: boolean;
  governmentPropertyDisposed: boolean;
  patentRoyaltiesCleared: boolean;
  securityClassificationReviewed: boolean;
  subcontractorIssuesResolved: boolean;
  plantClearanceCompleted: boolean;
  finalPaymentMade: boolean;
  contractorReleaseObtained: boolean;
  dd1594Completed: boolean;
  deobligationProcessed: boolean;

  quickCloseoutEligible: boolean;
  quickCloseoutApproved: boolean;
  notes: string[];
}

export interface QuickCloseoutEvaluation {
  eligible: boolean;
  reasons: string[];
  unsettledIndirectCosts: number;
  totalContractCost: number;
  unsettledRatio: number;
  insignificanceThreshold: number;
}

export interface DeobligationResult {
  contractId: string;
  contractNumber: string;
  previousObligated: number;
  deobligatedAmount: number;
  remainingObligated: number;
  deobligationDate: string;
  authority: string;
}

export interface DD1594Data {
  contractNumber: string;
  contractorName: string;
  contractType: string;
  dateOfAward: string;
  dateOfCompletion: string;
  totalContractAmount: number;
  totalPayments: number;
  unliquidatedObligations: number;
  excessFunds: number;
  closeoutDate: string;
  preparedBy: string;
  approvedBy: string;
}

export interface CloseoutTimelineResult {
  contractType: string;
  standardDeadlineMonths: number;
  quickCloseoutDeadlineMonths: number;
  physicalCompletionDate: string;
  standardDeadline: string;
  quickCloseoutDeadline: string;
  currentDate: string;
  daysRemaining: number;
  isOverdue: boolean;
}

// ---------------------------------------------------------------------------
// Closeout Timeline Calculation
// ---------------------------------------------------------------------------

/** Standard closeout timelines per FAR 4.804-1 (in months) */
const CLOSEOUT_TIMELINES: Record<string, { standard: number; quick: number }> = {
  firm_fixed_price: { standard: 6, quick: 6 },
  cost_plus: { standard: 36, quick: 20 },
  cost_reimbursement: { standard: 36, quick: 20 },
  time_and_materials: { standard: 36, quick: 20 },
  idiq: { standard: 36, quick: 20 },
  bpa: { standard: 6, quick: 6 },
  other: { standard: 36, quick: 20 },
};

/**
 * Calculate the closeout timeline for a contract.
 *
 * Per FAR 4.804-1, each contract type has specific maximum timeframes
 * for closeout after physical completion.
 *
 * @param contractType - The type of contract
 * @param physicalCompletionDate - Date the contract was physically completed
 * @returns Timeline details including deadlines and whether the contract is overdue
 */
export function calculateCloseoutTimeline(
  contractType: string,
  physicalCompletionDate: string
): CloseoutTimelineResult {
  const timeline = CLOSEOUT_TIMELINES[contractType] || CLOSEOUT_TIMELINES['other'];
  const completionDate = new Date(physicalCompletionDate);
  const now = new Date();

  const standardDeadline = new Date(completionDate);
  standardDeadline.setMonth(standardDeadline.getMonth() + timeline.standard);

  const quickDeadline = new Date(completionDate);
  quickDeadline.setMonth(quickDeadline.getMonth() + timeline.quick);

  const daysRemaining = Math.ceil(
    (standardDeadline.getTime() - now.getTime()) / 86_400_000
  );

  return {
    contractType,
    standardDeadlineMonths: timeline.standard,
    quickCloseoutDeadlineMonths: timeline.quick,
    physicalCompletionDate,
    standardDeadline: standardDeadline.toISOString().split('T')[0],
    quickCloseoutDeadline: quickDeadline.toISOString().split('T')[0],
    currentDate: now.toISOString().split('T')[0],
    daysRemaining,
    isOverdue: daysRemaining < 0,
  };
}

// ---------------------------------------------------------------------------
// Quick Closeout Eligibility
// ---------------------------------------------------------------------------

/**
 * Evaluate quick closeout eligibility per FAR 42.708.
 *
 * Quick closeout is available when unsettled indirect costs are
 * insignificant relative to total contract costs. The threshold
 * is typically 15% of total costs or less, at the discretion of
 * the contracting officer.
 *
 * @param totalContractCost - Total costs incurred under the contract
 * @param unsettledIndirectCosts - Amount of indirect costs not yet settled
 * @param insignificanceThreshold - Percentage threshold (default 0.15)
 */
export function evaluateQuickCloseout(
  totalContractCost: number,
  unsettledIndirectCosts: number,
  insignificanceThreshold: number = 0.15
): QuickCloseoutEvaluation {
  const reasons: string[] = [];

  if (totalContractCost <= 0) {
    return {
      eligible: false,
      reasons: ['Total contract cost must be positive'],
      unsettledIndirectCosts,
      totalContractCost,
      unsettledRatio: 0,
      insignificanceThreshold,
    };
  }

  const ratio = unsettledIndirectCosts / totalContractCost;
  const eligible = ratio <= insignificanceThreshold;

  if (eligible) {
    reasons.push(
      `Unsettled indirect costs (${(ratio * 100).toFixed(1)}%) are below the insignificance threshold (${(insignificanceThreshold * 100).toFixed(0)}%)`,
    );
    reasons.push('Quick closeout per FAR 42.708 is appropriate');
  } else {
    reasons.push(
      `Unsettled indirect costs (${(ratio * 100).toFixed(1)}%) exceed the insignificance threshold (${(insignificanceThreshold * 100).toFixed(0)}%)`,
    );
    reasons.push('Standard closeout procedures required — indirect rate settlement needed');
  }

  return {
    eligible,
    reasons,
    unsettledIndirectCosts,
    totalContractCost,
    unsettledRatio: ratio,
    insignificanceThreshold,
  };
}

// ---------------------------------------------------------------------------
// Closeout Checklist Management
// ---------------------------------------------------------------------------

/**
 * Initialize a closeout checklist for a contract.
 *
 * @param contract - The contract record
 * @param physicalCompletionDate - Date the contract was physically completed
 */
export function initializeCloseoutChecklist(
  contract: ContractRecord,
  physicalCompletionDate: string
): CloseoutChecklist {
  const timeline = calculateCloseoutTimeline(contract.contractType, physicalCompletionDate);

  return {
    id: uuid(),
    contractId: contract.id,
    contractNumber: contract.contractNumber,
    contractType: contract.contractType,
    status: 'physically_complete',
    physicalCompletionDate,
    closeoutDeadline: timeline.standardDeadline,
    isOverdue: timeline.isOverdue,
    daysUntilDeadline: timeline.daysRemaining,
    finalInvoiceReceived: false,
    finalIndirectRatesSettled: false,
    allModificationsExecuted: false,
    allDeliverablesAccepted: false,
    governmentPropertyDisposed: false,
    patentRoyaltiesCleared: false,
    securityClassificationReviewed: false,
    subcontractorIssuesResolved: false,
    plantClearanceCompleted: false,
    finalPaymentMade: false,
    contractorReleaseObtained: false,
    dd1594Completed: false,
    deobligationProcessed: false,
    quickCloseoutEligible: false,
    quickCloseoutApproved: false,
    notes: [],
  };
}

/**
 * Update the closeout status based on completed checklist items.
 *
 * Automatically advances the status as milestones are completed.
 */
export function updateCloseoutStatus(checklist: CloseoutChecklist): CloseoutChecklist {
  const updated = { ...checklist };

  if (updated.finalIndirectRatesSettled && updated.status === 'closeout_initiated') {
    updated.status = 'indirect_rates_settled';
  }

  if (updated.finalPaymentMade && updated.finalIndirectRatesSettled) {
    updated.status = 'final_payment_processed';
  }

  if (updated.governmentPropertyDisposed && updated.plantClearanceCompleted) {
    updated.status = 'property_cleared';
  }

  if (updated.patentRoyaltiesCleared && updated.status === 'property_cleared') {
    updated.status = 'patent_cleared';
  }

  if (updated.contractorReleaseObtained) {
    updated.status = 'release_obtained';
  }

  // Final closure requires all items complete
  const allComplete =
    updated.finalInvoiceReceived &&
    updated.finalIndirectRatesSettled &&
    updated.allModificationsExecuted &&
    updated.allDeliverablesAccepted &&
    updated.governmentPropertyDisposed &&
    updated.patentRoyaltiesCleared &&
    updated.securityClassificationReviewed &&
    updated.subcontractorIssuesResolved &&
    updated.plantClearanceCompleted &&
    updated.finalPaymentMade &&
    updated.contractorReleaseObtained &&
    updated.dd1594Completed &&
    updated.deobligationProcessed;

  if (allComplete) {
    updated.status = 'closed';
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Deobligation Processing
// ---------------------------------------------------------------------------

/**
 * Process unliquidated obligation de-obligation at contract closeout.
 *
 * Per DoD FMR Vol. 10, Ch. 17, excess funds on completed contracts
 * must be de-obligated and returned to the appropriation (if current)
 * or to the expired/cancelled account.
 *
 * @param contract - The contract record
 * @param totalPaymentsMade - Total payments made to date
 */
export function processDeobligation(
  contract: ContractRecord,
  totalPaymentsMade: number
): DeobligationResult {
  const excessFunds = contract.obligatedAmount - totalPaymentsMade;
  const deobligationAmount = excessFunds > 0 ? excessFunds : 0;

  return {
    contractId: contract.id,
    contractNumber: contract.contractNumber,
    previousObligated: contract.obligatedAmount,
    deobligatedAmount: deobligationAmount,
    remainingObligated: contract.obligatedAmount - deobligationAmount,
    deobligationDate: new Date().toISOString().split('T')[0],
    authority: 'DoD FMR Vol. 10, Ch. 17; FAR 4.804-5',
  };
}

// ---------------------------------------------------------------------------
// DD-1594 Generation
// ---------------------------------------------------------------------------

/**
 * Generate DD Form 1594 (Contract Completion Statement) data.
 *
 * The DD-1594 is required for contract file closure and documents
 * the final financial status of the contract.
 *
 * @param contract - The contract record
 * @param totalPayments - Total payments made
 * @param preparedBy - Person preparing the form
 * @param approvedBy - Person approving the closure
 */
export function generateDD1594(
  contract: ContractRecord,
  totalPayments: number,
  preparedBy: string,
  approvedBy: string
): DD1594Data {
  const ulo = contract.obligatedAmount - totalPayments;
  const excess = ulo > 0 ? ulo : 0;

  return {
    contractNumber: contract.contractNumber,
    contractorName: contract.vendorName,
    contractType: contract.contractType,
    dateOfAward: contract.periodOfPerformance.split(' - ')[0] || '',
    dateOfCompletion: contract.closeoutDate || new Date().toISOString().split('T')[0],
    totalContractAmount: contract.totalValue,
    totalPayments,
    unliquidatedObligations: ulo > 0 ? ulo : 0,
    excessFunds: excess,
    closeoutDate: new Date().toISOString().split('T')[0],
    preparedBy,
    approvedBy,
  };
}

// ---------------------------------------------------------------------------
// Closeout Reporting
// ---------------------------------------------------------------------------

/**
 * Generate a contract closeout aging report.
 *
 * Categorizes contracts by how long they've been awaiting closeout
 * relative to their FAR deadline.
 *
 * @param contracts - Contracts in closeout status
 */
export function generateCloseoutAgingReport(
  contracts: Array<{ contract: ContractRecord; physicalCompletionDate: string }>
): {
  onSchedule: number;
  within30Days: number;
  overdue30to90: number;
  overdue90to180: number;
  overdue180Plus: number;
  totalContracts: number;
  details: Array<{
    contractNumber: string;
    contractType: string;
    daysRemaining: number;
    category: string;
  }>;
} {
  const details: Array<{
    contractNumber: string;
    contractType: string;
    daysRemaining: number;
    category: string;
  }> = [];

  let onSchedule = 0;
  let within30 = 0;
  let overdue30to90 = 0;
  let overdue90to180 = 0;
  let overdue180Plus = 0;

  for (const { contract, physicalCompletionDate } of contracts) {
    const timeline = calculateCloseoutTimeline(
      contract.contractType,
      physicalCompletionDate
    );

    let category: string;
    if (timeline.daysRemaining > 30) {
      category = 'on_schedule';
      onSchedule++;
    } else if (timeline.daysRemaining > 0) {
      category = 'within_30_days';
      within30++;
    } else if (timeline.daysRemaining > -90) {
      category = 'overdue_30_to_90';
      overdue30to90++;
    } else if (timeline.daysRemaining > -180) {
      category = 'overdue_90_to_180';
      overdue90to180++;
    } else {
      category = 'overdue_180_plus';
      overdue180Plus++;
    }

    details.push({
      contractNumber: contract.contractNumber,
      contractType: contract.contractType,
      daysRemaining: timeline.daysRemaining,
      category,
    });
  }

  return {
    onSchedule,
    within30Days: within30,
    overdue30to90,
    overdue90to180,
    overdue180Plus,
    totalContracts: contracts.length,
    details,
  };
}
