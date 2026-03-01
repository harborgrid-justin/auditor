/**
 * Session Management Hardening
 *
 * Implements NIST SP 800-53 session management controls:
 *   - AC-11: Session Lock (idle timeout)
 *   - AC-12: Session Termination (max duration)
 *   - Concurrent session limits
 *   - Re-authentication for sensitive operations
 *
 * DoD-specific requirements:
 *   - 15-minute idle timeout (NIST 800-53 AC-12)
 *   - 8-hour maximum session duration
 *   - Maximum 3 concurrent sessions per user
 *   - Re-auth required for: disbursement certification, ADA reporting,
 *     report finalization, reprogramming approval
 *
 * References:
 *   - NIST SP 800-53 Rev. 5, AC-11/AC-12: Session Controls
 *   - NIST SP 800-63B: Digital Identity Guidelines (Session Management)
 *   - DoDI 8500.01: Cybersecurity
 *   - DISA STIG: Application Security
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Idle timeout in milliseconds: 15 minutes per NIST 800-53 AC-12 */
export const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

/** Maximum session duration in milliseconds: 8 hours */
export const SESSION_MAX_DURATION_MS = 8 * 60 * 60 * 1000;

/** Maximum concurrent sessions per user */
export const MAX_CONCURRENT_SESSIONS = 3;

/** Actions requiring re-authentication */
export const SENSITIVE_ACTIONS = [
  'certify_disbursement',
  'approve_disbursement',
  'report_ada_violation',
  'finalize_report',
  'approve_reprogramming',
  'approve_debt_writeoff',
  'modify_fund_control',
  'activate_legislation',
] as const;

export type SensitiveAction = typeof SENSITIVE_ACTIONS[number];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionInfo {
  userId: string;
  sessionId: string;
  createdAt: number;
  lastActivityAt: number;
  ipAddress: string;
  userAgent: string;
}

export interface SessionValidationResult {
  valid: boolean;
  reason?: string;
  requiresReAuth?: boolean;
  remainingIdleMs?: number;
  remainingTotalMs?: number;
}

// ---------------------------------------------------------------------------
// Internal state — in production, use Redis or database
// ---------------------------------------------------------------------------

const activeSessions = new Map<string, SessionInfo>();
const userSessionIndex = new Map<string, Set<string>>();
const reAuthTimestamps = new Map<string, number>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enforce session timeout rules.
 *
 * Checks both idle timeout and maximum session duration.
 *
 * @param sessionId - The session to validate
 * @returns Validation result
 */
export function enforceSessionTimeout(sessionId: string): SessionValidationResult {
  const session = activeSessions.get(sessionId);
  if (!session) {
    return { valid: false, reason: 'Session not found or expired.' };
  }

  const now = Date.now();

  // Check idle timeout
  const idleMs = now - session.lastActivityAt;
  if (idleMs > SESSION_IDLE_TIMEOUT_MS) {
    terminateSession(sessionId);
    return {
      valid: false,
      reason: `Session expired due to ${Math.round(idleMs / 60000)} minutes of inactivity. ` +
              `Maximum idle time is ${SESSION_IDLE_TIMEOUT_MS / 60000} minutes. ` +
              `Ref: NIST 800-53 AC-12.`,
    };
  }

  // Check max duration
  const totalMs = now - session.createdAt;
  if (totalMs > SESSION_MAX_DURATION_MS) {
    terminateSession(sessionId);
    return {
      valid: false,
      reason: `Session expired after ${Math.round(totalMs / 3600000)} hours. ` +
              `Maximum session duration is ${SESSION_MAX_DURATION_MS / 3600000} hours. ` +
              `Ref: NIST 800-53 AC-12.`,
    };
  }

  // Update last activity
  session.lastActivityAt = now;

  return {
    valid: true,
    remainingIdleMs: SESSION_IDLE_TIMEOUT_MS - idleMs,
    remainingTotalMs: SESSION_MAX_DURATION_MS - totalMs,
  };
}

/**
 * Check if re-authentication is required for a sensitive action.
 *
 * Per NIST 800-63B: Sensitive operations should require recent
 * authentication (within the last 5 minutes).
 *
 * @param userId - The user attempting the action
 * @param action - The sensitive action
 * @returns Whether re-authentication is required
 */
export function requireReAuth(
  userId: string,
  action: string,
): { required: boolean; reason?: string } {
  if (!SENSITIVE_ACTIONS.includes(action as SensitiveAction)) {
    return { required: false };
  }

  const lastReAuth = reAuthTimestamps.get(userId);
  const REAUTH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  if (!lastReAuth || (Date.now() - lastReAuth) > REAUTH_WINDOW_MS) {
    return {
      required: true,
      reason: `Action '${action}' requires re-authentication. ` +
              `Please verify your credentials to proceed. ` +
              `Ref: NIST 800-63B.`,
    };
  }

  return { required: false };
}

/**
 * Record a successful re-authentication.
 */
export function recordReAuth(userId: string): void {
  reAuthTimestamps.set(userId, Date.now());
}

/**
 * Enforce concurrent session limits.
 *
 * @param userId - The user creating a new session
 * @param newSessionId - The new session ID
 * @param sessionInfo - Session metadata
 * @returns Whether the new session is allowed
 */
export function limitConcurrentSessions(
  userId: string,
  newSessionId: string,
  sessionInfo: Omit<SessionInfo, 'userId' | 'sessionId'>,
): { allowed: boolean; terminatedSessions: string[]; reason?: string } {
  const userSessions = userSessionIndex.get(userId) || new Set();
  const terminatedSessions: string[] = [];

  // Clean up expired sessions first
  for (const sid of Array.from(userSessions)) {
    const session = activeSessions.get(sid);
    if (!session) {
      userSessions.delete(sid);
      continue;
    }
    const idleMs = Date.now() - session.lastActivityAt;
    const totalMs = Date.now() - session.createdAt;
    if (idleMs > SESSION_IDLE_TIMEOUT_MS || totalMs > SESSION_MAX_DURATION_MS) {
      terminateSession(sid);
      terminatedSessions.push(sid);
    }
  }

  // Check if adding a new session would exceed the limit
  if (userSessions.size >= MAX_CONCURRENT_SESSIONS) {
    // Terminate the oldest session to make room
    let oldestSession: SessionInfo | null = null;
    let oldestId = '';
    for (const sid of Array.from(userSessions)) {
      const session = activeSessions.get(sid);
      if (session && (!oldestSession || session.createdAt < oldestSession.createdAt)) {
        oldestSession = session;
        oldestId = sid;
      }
    }
    if (oldestId) {
      terminateSession(oldestId);
      terminatedSessions.push(oldestId);
    }
  }

  // Register the new session
  const session: SessionInfo = {
    userId,
    sessionId: newSessionId,
    ...sessionInfo,
  };
  activeSessions.set(newSessionId, session);

  if (!userSessionIndex.has(userId)) {
    userSessionIndex.set(userId, new Set());
  }
  userSessionIndex.get(userId)!.add(newSessionId);

  return {
    allowed: true,
    terminatedSessions,
  };
}

/**
 * Terminate a specific session.
 */
export function terminateSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    const userSessions = userSessionIndex.get(session.userId);
    if (userSessions) {
      userSessions.delete(sessionId);
    }
    activeSessions.delete(sessionId);
  }
}

/**
 * Get all active sessions for a user.
 */
export function getUserSessions(userId: string): SessionInfo[] {
  const sessionIds = userSessionIndex.get(userId) || new Set();
  const sessions: SessionInfo[] = [];
  for (const sid of Array.from(sessionIds)) {
    const session = activeSessions.get(sid);
    if (session) sessions.push(session);
  }
  return sessions;
}

/**
 * Check if an action is classified as sensitive.
 */
export function isSensitiveAction(action: string): boolean {
  return SENSITIVE_ACTIONS.includes(action as SensitiveAction);
}
