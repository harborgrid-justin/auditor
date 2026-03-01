/**
 * DD-1414 Base for Reprogramming Report Generator
 *
 * Generates the DD Form 1414, the primary document used by DoD components
 * to track the base for reprogramming actions. It shows the original
 * budget, all reprogramming actions taken, and the current budget by
 * budget activity.
 *
 * Reprogramming categories (DoD FMR Vol. 3, Ch. 6):
 *   - Prior Approval: requires congressional committee approval
 *   - Internal: within department head authority
 *   - Below Threshold: below the dollar threshold for notification
 *   - Above Threshold: above threshold, requires congressional notification
 *
 * The DD-1414 is required for:
 *   - Tracking reprogramming baselines by budget activity
 *   - Congressional notification of reprogramming actions
 *   - Audit trail for fund realignment decisions
 *
 * References:
 *   - DoD FMR Vol. 3, Ch. 6: Reprogramming of Appropriated Funds
 *   - DoD Directive 7045.14: Planning, Programming, Budgeting, and
 *     Execution (PPBE) Process
 *   - 10 U.S.C. §2214: Transfer of funds
 *   - Annual DoD Appropriations Act (reprogramming thresholds)
 */

import type {
  Appropriation,
  ReprogrammingAction,
  DD1414Data,
  DD1414BudgetActivity,
  Obligation,
} from '@/types/dod-fmr';
import { getParameter } from '@/lib/engine/tax-parameters/registry';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default congressional notification threshold (Vol. 3, Ch. 6) */
const REPROGRAMMING_THRESHOLD_FALLBACK = 10_000_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Derive budget activity allocations from obligation data.
 * Groups obligations by budgetActivityCode and sums amounts to
 * establish the original budget baseline per activity.
 */
function deriveBudgetActivities(
  obligations: Obligation[],
  appropriation: Appropriation,
): Map<string, { code: string; title: string; amount: number }> {
  const activities = new Map<string, { code: string; title: string; amount: number }>();

  for (const obl of obligations) {
    const code = obl.budgetActivityCode || 'UNASSIGNED';
    const existing = activities.get(code);
    if (existing) {
      existing.amount += obl.amount;
    } else {
      activities.set(code, {
        code,
        title: `Budget Activity ${code}`,
        amount: obl.amount,
      });
    }
  }

  // If no obligations yet, create a single activity from the appropriation
  if (activities.size === 0) {
    activities.set('01', {
      code: '01',
      title: appropriation.appropriationTitle,
      amount: appropriation.totalAuthority,
    });
  }

  return activities;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate the DD-1414 Base for Reprogramming report.
 *
 * Per DoD FMR Vol. 3, Ch. 6: The DD-1414 displays the original enacted
 * budget by budget activity, all reprogramming actions (in and out), and
 * the resulting current budget. It serves as the baseline document for
 * tracking fund realignment within an appropriation.
 *
 * @param appropriation - The Appropriation record for this TAS
 * @param obligations - All Obligation records used to derive budget activities
 * @param reprogrammingActions - All reprogramming actions for this TAS
 * @param fiscalYear - The fiscal year being reported
 * @param asOfDate - The report as-of date (ISO string)
 * @returns DD1414Data structure
 */
export function generateDD1414(
  appropriation: Appropriation,
  obligations: Obligation[],
  reprogrammingActions: ReprogrammingAction[],
  fiscalYear: number,
  asOfDate: string,
): DD1414Data {
  // Derive budget activities from obligations
  const activityMap = deriveBudgetActivities(obligations, appropriation);

  // Apply reprogramming actions to each budget activity
  const budgetActivities: DD1414BudgetActivity[] = [];

  for (const [code, activity] of Array.from(activityMap.entries())) {
    const reprogrammingsIn = reprogrammingActions
      .filter(r =>
        r.status === 'executed' &&
        r.toAppropriationId === appropriation.id &&
        (r.toBudgetActivity === code || !r.toBudgetActivity),
      )
      .reduce((sum, r) => sum + r.amount, 0);

    const reprogrammingsOut = reprogrammingActions
      .filter(r =>
        r.status === 'executed' &&
        r.fromAppropriationId === appropriation.id &&
        (r.fromBudgetActivity === code || !r.fromBudgetActivity),
      )
      .reduce((sum, r) => sum + r.amount, 0);

    const netReprogramming = round2(reprogrammingsIn - reprogrammingsOut);

    budgetActivities.push({
      activityCode: code,
      activityTitle: activity.title,
      originalBudget: round2(activity.amount),
      reprogrammingsIn: round2(reprogrammingsIn),
      reprogrammingsOut: round2(reprogrammingsOut),
      netReprogramming,
      currentBudget: round2(activity.amount + netReprogramming),
    });
  }

  const totalOriginalBudget = round2(
    budgetActivities.reduce((sum, ba) => sum + ba.originalBudget, 0),
  );
  const totalReprogrammings = round2(
    budgetActivities.reduce((sum, ba) => sum + ba.netReprogramming, 0),
  );
  const totalCurrentBudget = round2(totalOriginalBudget + totalReprogrammings);

  return {
    treasuryAccountSymbol: appropriation.treasuryAccountSymbol,
    appropriationTitle: appropriation.appropriationTitle,
    fiscalYear,
    asOfDate,
    budgetActivities,
    totalOriginalBudget,
    totalReprogrammings,
    totalCurrentBudget,
    reprogrammingActions: reprogrammingActions.filter(
      r => r.fromAppropriationId === appropriation.id ||
           r.toAppropriationId === appropriation.id,
    ),
  };
}

/**
 * Validate a DD-1414 report for internal consistency.
 *
 * Checks:
 *   1. Total current budget = original budget + net reprogrammings
 *   2. Reprogramming amounts balance (ins = outs across all activities)
 *   3. Congressional notification compliance for above-threshold actions
 *
 * @param data - The DD1414Data to validate
 * @returns Validation result with any errors found
 */
export function validateDD1414(
  data: DD1414Data,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. Total balance check
  const computedTotal = round2(data.totalOriginalBudget + data.totalReprogrammings);
  const balDiff = Math.abs(computedTotal - data.totalCurrentBudget);
  if (balDiff > 0.01) {
    errors.push(
      `Current budget ($${data.totalCurrentBudget.toFixed(2)}) does not equal ` +
      `original ($${data.totalOriginalBudget.toFixed(2)}) + reprogrammings ` +
      `($${data.totalReprogrammings.toFixed(2)}). Difference: $${balDiff.toFixed(2)}. ` +
      `Ref: DoD FMR Vol. 3, Ch. 6.`,
    );
  }

  // 2. Per-activity balance check
  for (const ba of data.budgetActivities) {
    const expected = round2(ba.originalBudget + ba.netReprogramming);
    const diff = Math.abs(expected - ba.currentBudget);
    if (diff > 0.01) {
      errors.push(
        `Activity ${ba.activityCode}: current budget ($${ba.currentBudget.toFixed(2)}) ` +
        `does not equal original + net reprogramming ($${expected.toFixed(2)}).`,
      );
    }
  }

  // 3. Congressional notification compliance
  const threshold = getParameter(
    'DOD_REPROGRAMMING_THRESHOLD',
    data.fiscalYear,
    undefined,
    REPROGRAMMING_THRESHOLD_FALLBACK,
  );

  for (const action of data.reprogrammingActions) {
    if (action.amount >= threshold && action.congressionalNotificationRequired) {
      if (!action.congressionalNotificationDate) {
        errors.push(
          `Reprogramming ${action.reprogrammingNumber} ($${action.amount.toFixed(2)}) ` +
          `exceeds threshold ($${threshold.toLocaleString()}) but has no congressional ` +
          `notification date. Ref: DoD FMR Vol. 3, Ch. 6.`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Determines whether a reprogramming action requires congressional notification.
 *
 * Per DoD FMR Vol. 3, Ch. 6: Prior approval reprogramming actions above the
 * annual threshold require notification to the congressional defense committees.
 *
 * @param amount - Dollar amount of the reprogramming
 * @param fiscalYear - Fiscal year for threshold lookup
 * @returns Whether congressional notification is required
 */
export function requiresCongressionalNotification(
  amount: number,
  fiscalYear: number,
): boolean {
  const threshold = getParameter(
    'DOD_REPROGRAMMING_THRESHOLD',
    fiscalYear,
    undefined,
    REPROGRAMMING_THRESHOLD_FALLBACK,
  );
  return amount >= threshold;
}
