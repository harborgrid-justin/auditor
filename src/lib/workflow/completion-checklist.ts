/**
 * Engagement Completion Checklist (ISQM 1 / SQCS No. 8)
 *
 * Systematic checklist to verify all required audit procedures are completed
 * before an opinion can be issued. Some items are auto-checked based on
 * database state; others require manual confirmation.
 */

export type ChecklistCategory = 'planning' | 'fieldwork' | 'review' | 'reporting' | 'quality' | 'documentation';

export type ChecklistStatus = 'not_started' | 'in_progress' | 'completed' | 'not_applicable';

export interface ChecklistItem {
  itemKey: string;
  category: ChecklistCategory;
  description: string;
  autoCheck: boolean;
  required: boolean;
}

export interface ChecklistItemStatus extends ChecklistItem {
  status: ChecklistStatus;
  autoCheckResult?: boolean;
  completedBy?: string;
  completedAt?: string;
  notes?: string;
}

export interface ChecklistEvaluation {
  items: ChecklistItemStatus[];
  totalItems: number;
  completedItems: number;
  requiredItems: number;
  requiredCompleted: number;
  completionRate: number;
  requiredCompletionRate: number;
  readyForOpinion: boolean;
  blockingItems: ChecklistItemStatus[];
  summary: string;
}

/**
 * Standard engagement completion checklist items.
 * Based on professional standards (AU-C, PCAOB AS, ISQM).
 */
export const STANDARD_CHECKLIST: ChecklistItem[] = [
  // Planning
  {
    itemKey: 'planning_risk_assessment',
    category: 'planning',
    description: 'Risk assessment procedures completed and documented',
    autoCheck: false,
    required: true,
  },
  {
    itemKey: 'planning_materiality',
    category: 'planning',
    description: 'Materiality determined and documented (overall, performance, trivial)',
    autoCheck: true,
    required: true,
  },
  {
    itemKey: 'planning_audit_strategy',
    category: 'planning',
    description: 'Overall audit strategy and detailed audit plan established',
    autoCheck: false,
    required: true,
  },
  {
    itemKey: 'planning_independence',
    category: 'planning',
    description: 'Independence confirmed for all engagement team members',
    autoCheck: true,
    required: true,
  },

  // Fieldwork
  {
    itemKey: 'fieldwork_controls_testing',
    category: 'fieldwork',
    description: 'Internal controls tested and results evaluated',
    autoCheck: true,
    required: true,
  },
  {
    itemKey: 'fieldwork_substantive_testing',
    category: 'fieldwork',
    description: 'Substantive procedures performed for all material accounts',
    autoCheck: true,
    required: true,
  },
  {
    itemKey: 'fieldwork_sampling_completed',
    category: 'fieldwork',
    description: 'Sampling plans executed and results evaluated',
    autoCheck: true,
    required: true,
  },
  {
    itemKey: 'fieldwork_analytical_procedures',
    category: 'fieldwork',
    description: 'Analytical procedures performed as substantive evidence',
    autoCheck: true,
    required: true,
  },
  {
    itemKey: 'fieldwork_journal_entry_testing',
    category: 'fieldwork',
    description: 'Journal entry testing completed (fraud risk procedure)',
    autoCheck: true,
    required: true,
  },
  {
    itemKey: 'fieldwork_related_parties',
    category: 'fieldwork',
    description: 'Related party identification and transaction review completed',
    autoCheck: true,
    required: true,
  },

  // Review
  {
    itemKey: 'review_findings_dispositioned',
    category: 'review',
    description: 'All audit findings reviewed and dispositioned',
    autoCheck: true,
    required: true,
  },
  {
    itemKey: 'review_going_concern',
    category: 'review',
    description: 'Going concern assessment completed',
    autoCheck: true,
    required: true,
  },
  {
    itemKey: 'review_subsequent_events',
    category: 'review',
    description: 'Subsequent events procedures performed through report date',
    autoCheck: true,
    required: true,
  },
  {
    itemKey: 'review_sud_evaluated',
    category: 'review',
    description: 'Summary of unadjusted differences evaluated (aggregate below materiality)',
    autoCheck: true,
    required: true,
  },
  {
    itemKey: 'review_assertion_coverage',
    category: 'review',
    description: 'Assertion coverage verified for all material accounts',
    autoCheck: true,
    required: true,
  },
  {
    itemKey: 'review_scope_limitations',
    category: 'review',
    description: 'All scope limitations resolved or impact assessed',
    autoCheck: true,
    required: true,
  },

  // Reporting
  {
    itemKey: 'reporting_management_representations',
    category: 'reporting',
    description: 'Management representation letter obtained',
    autoCheck: false,
    required: true,
  },
  {
    itemKey: 'reporting_governance_communication',
    category: 'reporting',
    description: 'Required communications with those charged with governance completed (AU-C 260)',
    autoCheck: false,
    required: true,
  },
  {
    itemKey: 'reporting_management_letter',
    category: 'reporting',
    description: 'Management letter prepared for control deficiencies',
    autoCheck: false,
    required: false,
  },

  // Quality
  {
    itemKey: 'quality_engagement_review',
    category: 'quality',
    description: 'Engagement partner review of audit documentation completed',
    autoCheck: false,
    required: true,
  },
  {
    itemKey: 'quality_eqr',
    category: 'quality',
    description: 'Engagement quality review completed (if applicable per ISQM/PCAOB)',
    autoCheck: false,
    required: false,
  },
  {
    itemKey: 'quality_consultation',
    category: 'quality',
    description: 'Required consultations documented and conclusions implemented',
    autoCheck: false,
    required: false,
  },

  // Documentation
  {
    itemKey: 'documentation_workpapers',
    category: 'documentation',
    description: 'Audit documentation assembled and reviewed',
    autoCheck: false,
    required: true,
  },
  {
    itemKey: 'documentation_archival',
    category: 'documentation',
    description: 'Engagement file ready for archival (60-day assembly period)',
    autoCheck: false,
    required: false,
  },
];

/**
 * Evaluate the completion checklist for an engagement.
 * Auto-check items are evaluated based on provided engagement state.
 */
export function evaluateChecklist(items: ChecklistItemStatus[]): ChecklistEvaluation {
  const requiredItems = items.filter(i => i.required);
  const completedItems = items.filter(i => i.status === 'completed' || i.status === 'not_applicable');
  const requiredCompleted = requiredItems.filter(i => i.status === 'completed' || i.status === 'not_applicable');

  const totalItems = items.length;
  const completionRate = totalItems > 0 ? completedItems.length / totalItems : 0;
  const requiredCompletionRate = requiredItems.length > 0 ? requiredCompleted.length / requiredItems.length : 0;

  const blockingItems = requiredItems.filter(i => i.status !== 'completed' && i.status !== 'not_applicable');
  const readyForOpinion = blockingItems.length === 0;

  const summary = readyForOpinion
    ? `All ${requiredItems.length} required checklist items are complete. Engagement is ready for opinion issuance.`
    : `${blockingItems.length} required item(s) remain incomplete: ${blockingItems.map(i => i.description).join('; ')}`;

  return {
    items,
    totalItems,
    completedItems: completedItems.length,
    requiredItems: requiredItems.length,
    requiredCompleted: requiredCompleted.length,
    completionRate,
    requiredCompletionRate,
    readyForOpinion,
    blockingItems,
    summary,
  };
}

/**
 * Perform auto-checks based on engagement database state.
 */
export function performAutoChecks(
  state: {
    materialitySet: boolean;
    independenceConfirmed: boolean;
    controlsTested: boolean;
    assertionCoverageComplete: boolean;
    samplingCompleted: boolean;
    analyticsRun: boolean;
    journalEntryTestingRun: boolean;
    relatedPartiesReviewed: boolean;
    findingsDispositioned: boolean;
    goingConcernAssessed: boolean;
    subsequentEventsReviewed: boolean;
    sudEvaluated: boolean;
    scopeLimitationsResolved: boolean;
  }
): Record<string, boolean> {
  return {
    planning_materiality: state.materialitySet,
    planning_independence: state.independenceConfirmed,
    fieldwork_controls_testing: state.controlsTested,
    fieldwork_substantive_testing: state.assertionCoverageComplete,
    fieldwork_sampling_completed: state.samplingCompleted,
    fieldwork_analytical_procedures: state.analyticsRun,
    fieldwork_journal_entry_testing: state.journalEntryTestingRun,
    fieldwork_related_parties: state.relatedPartiesReviewed,
    review_findings_dispositioned: state.findingsDispositioned,
    review_going_concern: state.goingConcernAssessed,
    review_subsequent_events: state.subsequentEventsReviewed,
    review_sud_evaluated: state.sudEvaluated,
    review_assertion_coverage: state.assertionCoverageComplete,
    review_scope_limitations: state.scopeLimitationsResolved,
  };
}
