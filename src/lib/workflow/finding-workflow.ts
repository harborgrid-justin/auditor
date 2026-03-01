export type WorkflowStatus =
  | 'open'
  | 'in_review'
  | 'reviewer_approved'
  | 'reviewer_rejected'
  | 'resolved'
  | 'accepted';

export type UserRole = 'admin' | 'auditor' | 'reviewer' | 'viewer';

interface Transition {
  from: WorkflowStatus;
  to: WorkflowStatus;
  allowedRoles: UserRole[];
}

/**
 * Defines all valid finding status transitions and which roles can perform them.
 */
const TRANSITIONS: Transition[] = [
  { from: 'open', to: 'in_review', allowedRoles: ['auditor', 'admin'] },
  { from: 'in_review', to: 'reviewer_approved', allowedRoles: ['reviewer', 'admin'] },
  { from: 'in_review', to: 'reviewer_rejected', allowedRoles: ['reviewer', 'admin'] },
  { from: 'reviewer_rejected', to: 'in_review', allowedRoles: ['auditor', 'admin'] },
  { from: 'reviewer_approved', to: 'resolved', allowedRoles: ['admin'] },
  { from: 'reviewer_approved', to: 'accepted', allowedRoles: ['admin'] },
  // Allow re-opening from resolved/accepted (admin only)
  { from: 'resolved', to: 'open', allowedRoles: ['admin'] },
  { from: 'accepted', to: 'open', allowedRoles: ['admin'] },
];

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if a status transition is valid for the given user role.
 */
export function canTransition(
  fromStatus: string,
  toStatus: string,
  userRole: string
): TransitionResult {
  const transition = TRANSITIONS.find(
    (t) => t.from === fromStatus && t.to === toStatus
  );

  if (!transition) {
    return {
      allowed: false,
      reason: `Transition from '${fromStatus}' to '${toStatus}' is not allowed`,
    };
  }

  if (!transition.allowedRoles.includes(userRole as UserRole)) {
    return {
      allowed: false,
      reason: `Role '${userRole}' cannot transition from '${fromStatus}' to '${toStatus}'`,
    };
  }

  return { allowed: true };
}

/**
 * Get available transitions for a given status and role.
 */
export function getAvailableTransitions(
  currentStatus: string,
  userRole: string
): WorkflowStatus[] {
  return TRANSITIONS.filter(
    (t) =>
      t.from === currentStatus &&
      t.allowedRoles.includes(userRole as UserRole)
  ).map((t) => t.to);
}
