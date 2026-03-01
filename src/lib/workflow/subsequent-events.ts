/**
 * Subsequent Events Procedure Log (ASC 855 / AU-C 560)
 *
 * Tracks completion of required subsequent events procedures
 * and classifies events as Type I (adjusting) or Type II (non-adjusting).
 */

export type SubsequentEventType = 'type_1_adjusting' | 'type_2_non_adjusting';

export interface SubsequentEvent {
  id: string;
  engagementId: string;
  eventDescription: string;
  eventDate: string;
  eventType: SubsequentEventType;
  procedurePerformed: string;
  conclusion: string;
  adjustmentRequired: boolean;
  disclosureRequired: boolean;
  adjustmentAmount?: number;
  identifiedBy: string;
  identifiedAt: string;
  reviewedBy?: string;
}

export interface SubsequentEventsProcedure {
  procedureKey: string;
  description: string;
  required: boolean;
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
  notes?: string;
}

export interface SubsequentEventsEvaluation {
  events: SubsequentEvent[];
  procedures: SubsequentEventsProcedure[];
  type1Events: SubsequentEvent[];
  type2Events: SubsequentEvent[];
  totalAdjustmentAmount: number;
  unreviewedEvents: SubsequentEvent[];
  proceduresComplete: boolean;
  allEventsReviewed: boolean;
  readyForOpinion: boolean;
  summary: string;
}

/**
 * Standard subsequent events procedures required per AU-C 560.
 */
export function getRequiredProcedures(): SubsequentEventsProcedure[] {
  return [
    {
      procedureKey: 'management_inquiry',
      description: 'Inquire of management regarding subsequent events affecting the financial statements',
      required: true,
      completed: false,
    },
    {
      procedureKey: 'board_minutes',
      description: 'Read minutes of board of directors, audit committee, and similar bodies held after balance sheet date',
      required: true,
      completed: false,
    },
    {
      procedureKey: 'legal_counsel',
      description: 'Obtain and evaluate attorney letters regarding litigation, claims, and assessments',
      required: true,
      completed: false,
    },
    {
      procedureKey: 'cash_receipts',
      description: 'Test subsequent cash receipts for accounts receivable collectibility',
      required: true,
      completed: false,
    },
    {
      procedureKey: 'cash_disbursements',
      description: 'Review subsequent cash disbursements for unrecorded liabilities',
      required: true,
      completed: false,
    },
    {
      procedureKey: 'post_close_entries',
      description: 'Review post-close journal entries for unusual or significant transactions',
      required: true,
      completed: false,
    },
    {
      procedureKey: 'interim_financials',
      description: 'Review available interim financial information for the subsequent period',
      required: false,
      completed: false,
    },
    {
      procedureKey: 'commitments_contingencies',
      description: 'Inquire about new commitments, contingencies, or borrowings after the balance sheet date',
      required: true,
      completed: false,
    },
    {
      procedureKey: 'regulatory_filings',
      description: 'Review any regulatory filings or correspondence received after the balance sheet date',
      required: false,
      completed: false,
    },
    {
      procedureKey: 'press_releases',
      description: 'Review press releases and public announcements made after the balance sheet date',
      required: false,
      completed: false,
    },
  ];
}

/**
 * Evaluate subsequent events procedures and events for readiness.
 */
export function evaluateSubsequentEvents(
  events: SubsequentEvent[],
  procedures: SubsequentEventsProcedure[]
): SubsequentEventsEvaluation {
  const type1 = events.filter(e => e.eventType === 'type_1_adjusting');
  const type2 = events.filter(e => e.eventType === 'type_2_non_adjusting');
  const unreviewed = events.filter(e => !e.reviewedBy);
  const totalAdjustment = type1
    .filter(e => e.adjustmentRequired)
    .reduce((s, e) => s + (e.adjustmentAmount ?? 0), 0);

  const requiredProcedures = procedures.filter(p => p.required);
  const completedRequired = requiredProcedures.filter(p => p.completed);
  const proceduresComplete = completedRequired.length === requiredProcedures.length;

  const allEventsReviewed = unreviewed.length === 0;
  const readyForOpinion = proceduresComplete && allEventsReviewed;

  let summary: string;
  if (readyForOpinion) {
    summary = `Subsequent events review complete. ${events.length} event(s) identified (${type1.length} Type I, ${type2.length} Type II). All required procedures performed.`;
    if (totalAdjustment > 0) {
      summary += ` Total adjustments required: $${Math.round(totalAdjustment).toLocaleString()}.`;
    }
  } else {
    const gaps: string[] = [];
    if (!proceduresComplete) {
      gaps.push(`${requiredProcedures.length - completedRequired.length} required procedure(s) not yet performed`);
    }
    if (!allEventsReviewed) {
      gaps.push(`${unreviewed.length} event(s) not yet reviewed`);
    }
    summary = `Subsequent events review incomplete: ${gaps.join('; ')}. Must be completed before opinion issuance.`;
  }

  return {
    events,
    procedures,
    type1Events: type1,
    type2Events: type2,
    totalAdjustmentAmount: totalAdjustment,
    unreviewedEvents: unreviewed,
    proceduresComplete,
    allEventsReviewed,
    readyForOpinion,
    summary,
  };
}
