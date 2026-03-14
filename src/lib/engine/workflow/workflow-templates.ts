/**
 * Pre-built Workflow Templates
 *
 * Standard approval workflow definitions per DoD FMR 7000.14-R requirements.
 * Each template encodes the multi-step approval chain, threshold-based
 * auto-approval rules, SLA targets, and escalation policies mandated by
 * the applicable FMR volume and statutory authority.
 *
 * Templates are immutable reference definitions. At runtime they are used
 * by WorkflowEngine.startWorkflow() to create mutable WorkflowInstance
 * objects that track the state of a specific approval.
 */

import type { WorkflowDefinition } from './workflow-engine';

// ── Obligation Approval ──────────────────────────────────────────────
/**
 * Threshold-based obligation approval per DoD FMR Vol 3, Ch 8.
 *
 *  - < $25,000:   Financial Manager only (micro-purchase threshold)
 *  - $25K–$250K:  + Comptroller review
 *  - > $250,000:  + CFO approval
 *
 * Auto-approve thresholds allow low-dollar obligations to flow through
 * the chain without manual intervention at higher levels.
 */
export const OBLIGATION_APPROVAL_WORKFLOW: WorkflowDefinition = {
  id: 'obligation-approval',
  name: 'Obligation Approval Workflow',
  entityType: 'obligation',
  steps: [
    {
      stepIndex: 0,
      requiredRole: 'financial_manager',
      description: 'Financial Manager certifies fund availability and approves obligation',
      escalateAfterHours: 24,
    },
    {
      stepIndex: 1,
      requiredRole: 'comptroller',
      description: 'Comptroller reviews obligation for compliance and budget alignment',
      autoApproveBelow: 25_000,
      escalateAfterHours: 48,
    },
    {
      stepIndex: 2,
      requiredRole: 'cfo',
      description: 'CFO provides final approval for high-value obligations',
      autoApproveBelow: 250_000,
      escalateAfterHours: 72,
    },
  ],
  escalationRules: [
    {
      afterHours: 72,
      escalateTo: 'cfo',
      notifyOriginal: true,
    },
  ],
  slaHours: 120,
};

// ── ADA Investigation ────────────────────────────────────────────────
/**
 * Anti-Deficiency Act violation investigation and reporting workflow
 * per DoD FMR Vol 14 and 31 U.S.C. §1351.
 *
 * Five mandatory steps:
 *  1. Identify – Fund manager flags the potential violation
 *  2. Investigate – IG/comptroller conducts preliminary investigation
 *     (must complete within 14 weeks per Vol 14, Ch 3)
 *  3. Report to Comptroller – Comptroller reviews investigation findings
 *  4. Report to President – Head of agency reports to President through
 *     OMB, Congress, and Comptroller General per 31 U.S.C. §1351
 *  5. Corrective Action – Responsible official documents remediation
 */
export const ADA_INVESTIGATION_WORKFLOW: WorkflowDefinition = {
  id: 'ada-investigation',
  name: 'ADA Violation Investigation Workflow',
  entityType: 'ada_violation',
  steps: [
    {
      stepIndex: 0,
      requiredRole: 'fund_manager',
      description: 'Identify and document potential ADA violation',
      escalateAfterHours: 8,
    },
    {
      stepIndex: 1,
      requiredRole: 'inspector_general',
      description: 'Conduct preliminary investigation per DoD FMR Vol 14, Ch 3 (14-week limit)',
      escalateAfterHours: 2352, // 14 weeks = 2352 hours
    },
    {
      stepIndex: 2,
      requiredRole: 'comptroller',
      description: 'Review investigation findings and confirm or dismiss violation',
      escalateAfterHours: 72,
    },
    {
      stepIndex: 3,
      requiredRole: 'agency_head',
      description: 'Report to President through OMB and to Congress per 31 U.S.C. §1351',
      escalateAfterHours: 48,
    },
    {
      stepIndex: 4,
      requiredRole: 'responsible_officer',
      description: 'Document and implement corrective actions to prevent recurrence',
      escalateAfterHours: 720, // 30 days
    },
  ],
  escalationRules: [
    {
      afterHours: 48,
      escalateTo: 'comptroller',
      notifyOriginal: true,
    },
    {
      afterHours: 168,
      escalateTo: 'agency_head',
      notifyOriginal: true,
    },
  ],
  slaHours: 3360, // 20 weeks total
};

// ── Journal Entry Approval ───────────────────────────────────────────
/**
 * Journal entry approval enforcing segregation of duties per DoD FMR
 * Vol 4, Ch 2. The preparer, reviewer, and approver must be different
 * individuals — enforced by WorkflowEngine.processStep().
 *
 *  1. Preparer – Creates and submits the journal entry
 *  2. Reviewer – Validates supporting documentation and accuracy
 *  3. Approver – Authorizes posting to the general ledger
 */
export const JOURNAL_ENTRY_APPROVAL_WORKFLOW: WorkflowDefinition = {
  id: 'journal-entry-approval',
  name: 'Journal Entry Approval Workflow',
  entityType: 'journal_entry',
  steps: [
    {
      stepIndex: 0,
      requiredRole: 'accountant',
      description: 'Prepare journal entry with supporting documentation',
      escalateAfterHours: 24,
    },
    {
      stepIndex: 1,
      requiredRole: 'senior_accountant',
      description: 'Review journal entry for accuracy and proper classification',
      escalateAfterHours: 24,
    },
    {
      stepIndex: 2,
      requiredRole: 'financial_manager',
      description: 'Approve journal entry for posting to the general ledger',
      escalateAfterHours: 48,
    },
  ],
  escalationRules: [
    {
      afterHours: 48,
      escalateTo: 'comptroller',
      notifyOriginal: true,
    },
  ],
  slaHours: 72,
};

// ── Year-End Closing ─────────────────────────────────────────────────
/**
 * Fiscal year-end closing workflow per DoD FMR Vol 3, Ch 9 and
 * Vol 4, Ch 2. Requires four levels of review to ensure all
 * adjustments are recorded, accounts are reconciled, and the
 * financial statements are ready for audit.
 *
 *  1. Accountant – Prepares closing entries and reconciliations
 *  2. Fund Manager – Validates fund balance adjustments
 *  3. Comptroller – Reviews consolidated financial data
 *  4. CFO – Certifies year-end financial statements
 */
export const YEAR_END_CLOSING_WORKFLOW: WorkflowDefinition = {
  id: 'year-end-closing',
  name: 'Year-End Closing Workflow',
  entityType: 'year_end_closing',
  steps: [
    {
      stepIndex: 0,
      requiredRole: 'accountant',
      description: 'Prepare closing entries and account reconciliations',
      escalateAfterHours: 48,
    },
    {
      stepIndex: 1,
      requiredRole: 'fund_manager',
      description: 'Validate fund balance adjustments and unliquidated obligations',
      escalateAfterHours: 48,
    },
    {
      stepIndex: 2,
      requiredRole: 'comptroller',
      description: 'Review consolidated financial data for completeness and accuracy',
      escalateAfterHours: 72,
    },
    {
      stepIndex: 3,
      requiredRole: 'cfo',
      description: 'Certify year-end financial statements for audit',
      escalateAfterHours: 72,
    },
  ],
  escalationRules: [
    {
      afterHours: 72,
      escalateTo: 'cfo',
      notifyOriginal: true,
    },
  ],
  slaHours: 240, // 10 days
};

// ── Reimbursable Agreement ───────────────────────────────────────────
/**
 * Reimbursable work agreement approval per DoD FMR Vol 11A, Ch 3.
 * Ensures the receiving agency has authority, the performing agency
 * has capacity, and the agreement is funded before work begins.
 *
 *  1. Program Manager – Validates requirement and work scope
 *  2. Fund Manager – Verifies fund availability and obligation authority
 *  3. Comptroller – Approves the agreement for execution
 */
export const REIMBURSABLE_AGREEMENT_WORKFLOW: WorkflowDefinition = {
  id: 'reimbursable-agreement',
  name: 'Reimbursable Agreement Approval Workflow',
  entityType: 'reimbursable_agreement',
  steps: [
    {
      stepIndex: 0,
      requiredRole: 'program_manager',
      description: 'Validate requirement, work scope, and performing agency capacity',
      escalateAfterHours: 48,
    },
    {
      stepIndex: 1,
      requiredRole: 'fund_manager',
      description: 'Verify fund availability and obligation authority for the agreement',
      escalateAfterHours: 48,
    },
    {
      stepIndex: 2,
      requiredRole: 'comptroller',
      description: 'Approve reimbursable agreement for execution',
      escalateAfterHours: 72,
    },
  ],
  escalationRules: [
    {
      afterHours: 72,
      escalateTo: 'cfo',
      notifyOriginal: true,
    },
  ],
  slaHours: 168, // 7 days
};

// ── Reprogramming ────────────────────────────────────────────────────
/**
 * Reprogramming action approval per DoD FMR Vol 3, Ch 6 and
 * 10 U.S.C. §2214. Above-threshold reprogramming requires
 * congressional notification before execution.
 *
 *  1. Budget Analyst – Prepares DD-1414 and validates amounts
 *  2. Comptroller – Reviews for compliance with appropriation law
 *  3. CFO – Approves the reprogramming action
 *  4. Congressional Notification – Formal notification to defense
 *     committees (required when amount exceeds statutory threshold)
 *
 * The congressional_notification step auto-approves for below-threshold
 * reprogramming actions (< $10M for O&M per current thresholds).
 */
export const REPROGRAMMING_WORKFLOW: WorkflowDefinition = {
  id: 'reprogramming',
  name: 'Reprogramming Action Approval Workflow',
  entityType: 'reprogramming',
  steps: [
    {
      stepIndex: 0,
      requiredRole: 'budget_analyst',
      description: 'Prepare DD-1414 reprogramming document and validate amounts',
      escalateAfterHours: 48,
    },
    {
      stepIndex: 1,
      requiredRole: 'comptroller',
      description: 'Review reprogramming for compliance with appropriation law',
      escalateAfterHours: 72,
    },
    {
      stepIndex: 2,
      requiredRole: 'cfo',
      description: 'Approve reprogramming action for execution',
      escalateAfterHours: 72,
    },
    {
      stepIndex: 3,
      requiredRole: 'congressional_liaison',
      description: 'Submit congressional notification to defense committees (if above threshold)',
      autoApproveBelow: 10_000_000,
      escalateAfterHours: 240, // 10 days for congressional review
    },
  ],
  escalationRules: [
    {
      afterHours: 72,
      escalateTo: 'cfo',
      notifyOriginal: true,
    },
    {
      afterHours: 240,
      escalateTo: 'agency_head',
      notifyOriginal: true,
    },
  ],
  slaHours: 480, // 20 days
};

// ── Aggregated Template List ─────────────────────────────────────────

/**
 * All available workflow templates. Used by the service layer to look up
 * templates by name or entity type, and by the API to enumerate options.
 */
export const WORKFLOW_TEMPLATES: WorkflowDefinition[] = [
  OBLIGATION_APPROVAL_WORKFLOW,
  ADA_INVESTIGATION_WORKFLOW,
  JOURNAL_ENTRY_APPROVAL_WORKFLOW,
  YEAR_END_CLOSING_WORKFLOW,
  REIMBURSABLE_AGREEMENT_WORKFLOW,
  REPROGRAMMING_WORKFLOW,
];
