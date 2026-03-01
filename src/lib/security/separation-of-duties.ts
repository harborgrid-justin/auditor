/**
 * Separation of Duties (SoD) Enforcement Engine
 *
 * Prevents conflicts of interest by ensuring that no single individual
 * can perform incompatible functions in the financial management process.
 * This is a critical internal control requirement for DoD systems.
 *
 * SoD rules enforced:
 *   1. Certifying officers cannot certify their own disbursements
 *   2. Fund control officers cannot both allocate and obligate same funds
 *   3. ADA investigators cannot investigate their own violations
 *   4. Report preparers cannot be sole signoff authority
 *   5. Disbursing officers cannot approve their own advances
 *   6. Contracting officers cannot approve payments on their own contracts
 *
 * References:
 *   - DoD FMR Vol. 5, Ch. 5: Certifying Officers
 *   - DoD FMR Vol. 5, Ch. 6: Disbursing Officers
 *   - DoD FMR Vol. 3, Ch. 8: Fund Control Procedures
 *   - NIST SP 800-53 Rev. 5, AC-5: Separation of Duties
 *   - OMB Circular A-123: Management's Responsibility for Internal Controls
 *   - GAO Standards for Internal Control (Green Book), Principle 10
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SoDRule {
  id: string;
  name: string;
  description: string;
  /** The action being performed */
  action: string;
  /** The prior action that conflicts */
  conflictingPriorAction: string;
  /** Reference to the DoD FMR or regulation */
  reference: string;
  /** Whether the rule can be overridden with justification */
  overridable: boolean;
}

export interface SoDCheckResult {
  allowed: boolean;
  violations: SoDViolation[];
}

export interface SoDViolation {
  ruleId: string;
  ruleName: string;
  description: string;
  action: string;
  conflictingAction: string;
  userId: string;
  reference: string;
}

export interface ActionRecord {
  userId: string;
  action: string;
  entityId: string;
  entityType: string;
  performedAt: string;
}

// ---------------------------------------------------------------------------
// SoD Rules
// ---------------------------------------------------------------------------

const SOD_RULES: SoDRule[] = [
  {
    id: 'SOD-001',
    name: 'Certifying Officer Self-Certification',
    description: 'A certifying officer cannot certify disbursements they initiated or approved',
    action: 'certify_disbursement',
    conflictingPriorAction: 'initiate_disbursement',
    reference: 'DoD FMR Vol. 5, Ch. 5; 31 U.S.C. §3528',
    overridable: false,
  },
  {
    id: 'SOD-002',
    name: 'Fund Allocation and Obligation Conflict',
    description: 'The officer who allocates funds cannot also obligate those same funds',
    action: 'record_obligation',
    conflictingPriorAction: 'allocate_funds',
    reference: 'DoD FMR Vol. 3, Ch. 8; NIST 800-53 AC-5',
    overridable: false,
  },
  {
    id: 'SOD-003',
    name: 'ADA Self-Investigation',
    description: 'An ADA investigator cannot investigate violations attributed to themselves',
    action: 'investigate_ada_violation',
    conflictingPriorAction: 'responsible_for_ada_violation',
    reference: 'DoD FMR Vol. 14, Ch. 3; 31 U.S.C. §1351',
    overridable: false,
  },
  {
    id: 'SOD-004',
    name: 'Report Preparer Self-Signoff',
    description: 'The preparer of an audit report cannot be the sole signoff authority',
    action: 'signoff_report',
    conflictingPriorAction: 'prepare_report',
    reference: 'GAO Yellow Book; AICPA AU-C 220',
    overridable: false,
  },
  {
    id: 'SOD-005',
    name: 'Disbursing Officer Self-Advance',
    description: 'A disbursing officer cannot approve advances to themselves',
    action: 'approve_advance',
    conflictingPriorAction: 'request_advance',
    reference: 'DoD FMR Vol. 5, Ch. 6; 31 U.S.C. §3321',
    overridable: false,
  },
  {
    id: 'SOD-006',
    name: 'Contracting Officer Payment Approval',
    description: 'A contracting officer cannot approve payments on contracts they awarded',
    action: 'approve_contract_payment',
    conflictingPriorAction: 'award_contract',
    reference: 'DoD FMR Vol. 10, Ch. 1; FAR 1.602',
    overridable: true,
  },
  {
    id: 'SOD-007',
    name: 'Debt Write-off Self-Approval',
    description: 'An officer cannot approve write-off of debts owed to themselves or that they manage',
    action: 'approve_debt_writeoff',
    conflictingPriorAction: 'manage_debt',
    reference: 'DoD FMR Vol. 16, Ch. 4',
    overridable: false,
  },
  {
    id: 'SOD-008',
    name: 'Reprogramming Self-Approval',
    description: 'The requester of a reprogramming action cannot also be the approver',
    action: 'approve_reprogramming',
    conflictingPriorAction: 'request_reprogramming',
    reference: 'DoD FMR Vol. 3, Ch. 6',
    overridable: false,
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate that an action does not violate separation of duties rules.
 *
 * Checks the proposed action against the history of prior actions on the
 * same entity to detect conflicts.
 *
 * @param userId - The user attempting the action
 * @param action - The action being performed
 * @param entityId - The entity the action is performed on
 * @param priorActions - History of prior actions on this entity
 * @returns SoDCheckResult with any violations
 */
export function validateSoD(
  userId: string,
  action: string,
  entityId: string,
  priorActions: ActionRecord[],
): SoDCheckResult {
  const violations: SoDViolation[] = [];

  for (const rule of SOD_RULES) {
    if (rule.action !== action) continue;

    // Check if the same user performed the conflicting prior action
    const conflict = priorActions.find(
      pa =>
        pa.userId === userId &&
        pa.action === rule.conflictingPriorAction &&
        pa.entityId === entityId,
    );

    if (conflict) {
      violations.push({
        ruleId: rule.id,
        ruleName: rule.name,
        description: rule.description,
        action,
        conflictingAction: rule.conflictingPriorAction,
        userId,
        reference: rule.reference,
      });
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
}

/**
 * Check for a specific conflict between two users/actions.
 *
 * Simplified check when you know the specific users and actions
 * involved.
 *
 * @param userId - User performing the current action
 * @param action - The action being performed
 * @param priorUserId - User who performed the prior action
 * @param priorAction - The prior action
 * @returns Whether a conflict exists
 */
export function checkConflict(
  userId: string,
  action: string,
  priorUserId: string,
  priorAction: string,
): { conflict: boolean; rule?: SoDRule } {
  if (userId !== priorUserId) {
    return { conflict: false };
  }

  const rule = SOD_RULES.find(
    r => r.action === action && r.conflictingPriorAction === priorAction,
  );

  return {
    conflict: !!rule,
    rule,
  };
}

/**
 * Get all SoD rules.
 * Used for compliance documentation and admin review.
 */
export function getSoDRules(): SoDRule[] {
  return [...SOD_RULES];
}

/**
 * Get SoD rules applicable to a specific action.
 */
export function getRulesForAction(action: string): SoDRule[] {
  return SOD_RULES.filter(r => r.action === action);
}
