/**
 * Real-time Alert Rules
 *
 * Evaluates incoming platform events against a configurable set of alert
 * rules and dispatches notifications through the appropriate channel.
 *
 * Pre-configured rules cover key DoD financial audit scenarios:
 *   - Antideficiency Act (ADA) violations
 *   - Fund exhaustion forecasts
 *   - Repeated failed login attempts
 *   - Improper payment detection
 *   - FMR revision impacts on active rules
 *   - Debt referral deadline proximity
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'warning' | 'info';

export type AlertChannel = 'email' | 'sms' | 'webhook' | 'console';

export interface AlertRule {
  /** Unique identifier for this rule. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Longer description shown in alert messages. */
  description: string;
  /** Severity level dictating urgency and routing. */
  severity: AlertSeverity;
  /** Channel(s) the alert should be dispatched to. */
  channels: AlertChannel[];
  /** Minimum seconds between repeated firings for the same rule + entity. */
  cooldownSeconds: number;
  /** Returns `true` when the incoming event should trigger this rule. */
  condition: (event: AlertEvent) => boolean;
  /** If `true`, the rule is evaluated; otherwise it is skipped. */
  enabled: boolean;
}

export interface AlertEvent {
  /** Domain-specific event type (e.g. `"ada_violation"`, `"login_failed"`). */
  type: string;
  /** ISO-8601 timestamp of the event. */
  timestamp: string;
  /** Arbitrary payload carrying event details. */
  payload: Record<string, unknown>;
  /** Optional entity key used for per-entity cooldown tracking. */
  entityId?: string;
}

export interface TriggeredAlert {
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  channels: AlertChannel[];
  event: AlertEvent;
  triggeredAt: string;
}

// ---------------------------------------------------------------------------
// Cooldown tracker
// ---------------------------------------------------------------------------

/** Map of `ruleId:entityId` → last-triggered epoch millis. */
const cooldownMap = new Map<string, number>();

function cooldownKey(rule: AlertRule, event: AlertEvent): string {
  return `${rule.id}:${event.entityId ?? '__global__'}`;
}

function isCoolingDown(rule: AlertRule, event: AlertEvent): boolean {
  const key = cooldownKey(rule, event);
  const lastFired = cooldownMap.get(key);
  if (lastFired === undefined) return false;
  const elapsed = (Date.now() - lastFired) / 1000;
  return elapsed < rule.cooldownSeconds;
}

function recordCooldown(rule: AlertRule, event: AlertEvent): void {
  const key = cooldownKey(rule, event);
  cooldownMap.set(key, Date.now());
}

// ---------------------------------------------------------------------------
// Pre-configured alert rules
// ---------------------------------------------------------------------------

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  // 1. ADA violation → immediate alert (critical)
  {
    id: 'ada-violation',
    name: 'ADA Violation Detected',
    description:
      'An Antideficiency Act violation has been detected. ' +
      'Immediate reporting to Congress is required per 31 U.S.C. § 1351.',
    severity: 'critical',
    channels: ['email', 'sms', 'webhook'],
    cooldownSeconds: 0, // every occurrence must fire
    enabled: true,
    condition: (event: AlertEvent): boolean => {
      return event.type === 'ada_violation';
    },
  },

  // 2. Fund exhaustion < 30 days → warning
  {
    id: 'fund-exhaustion-warning',
    name: 'Fund Exhaustion Approaching',
    description:
      'Projected fund exhaustion within 30 days based on current obligation rate. ' +
      'Review planned commitments and consider requesting additional allotments.',
    severity: 'warning',
    channels: ['email', 'webhook'],
    cooldownSeconds: 86_400, // once per day per fund
    enabled: true,
    condition: (event: AlertEvent): boolean => {
      if (event.type !== 'fund_balance_update') return false;
      const daysRemaining = event.payload.projectedDaysRemaining as number | undefined;
      return daysRemaining !== undefined && daysRemaining < 30;
    },
  },

  // 3. 3+ failed login attempts → account lockout alert (high)
  {
    id: 'failed-login-lockout',
    name: 'Account Lockout – Repeated Failed Logins',
    description:
      'Three or more consecutive failed login attempts detected. ' +
      'The account has been flagged for potential lockout per DoD access control policy.',
    severity: 'high',
    channels: ['email', 'webhook'],
    cooldownSeconds: 900, // 15 minutes between re-alerts per user
    enabled: true,
    condition: (event: AlertEvent): boolean => {
      if (event.type !== 'login_failed') return false;
      const consecutiveFailures = event.payload.consecutiveFailures as number | undefined;
      return consecutiveFailures !== undefined && consecutiveFailures >= 3;
    },
  },

  // 4. Improper payment detection → high alert
  {
    id: 'improper-payment',
    name: 'Improper Payment Detected',
    description:
      'A payment has been flagged as improper under IPERA/PIIA criteria. ' +
      'Recovery action and root-cause analysis are required.',
    severity: 'high',
    channels: ['email', 'sms', 'webhook'],
    cooldownSeconds: 0, // every occurrence
    enabled: true,
    condition: (event: AlertEvent): boolean => {
      return event.type === 'improper_payment_detected';
    },
  },

  // 5. FMR revision affecting active rules → medium
  {
    id: 'fmr-revision-impact',
    name: 'FMR Revision Impacts Active Rules',
    description:
      'A Financial Management Regulation (FMR) volume/chapter revision has been ' +
      'published that may affect currently active compliance rules. Review required.',
    severity: 'medium',
    channels: ['email', 'webhook'],
    cooldownSeconds: 3_600, // once per hour per FMR reference
    enabled: true,
    condition: (event: AlertEvent): boolean => {
      if (event.type !== 'fmr_revision') return false;
      const affectsActiveRules = event.payload.affectsActiveRules as boolean | undefined;
      return affectsActiveRules === true;
    },
  },

  // 6. Debt referral deadline approaching → warning
  {
    id: 'debt-referral-deadline',
    name: 'Debt Referral Deadline Approaching',
    description:
      'A delinquent debt is approaching the 120-day referral deadline to the ' +
      'Treasury Offset Program (TOP) per the Debt Collection Improvement Act.',
    severity: 'warning',
    channels: ['email', 'webhook'],
    cooldownSeconds: 86_400, // once per day per debt
    enabled: true,
    condition: (event: AlertEvent): boolean => {
      if (event.type !== 'debt_status_update') return false;
      const daysUntilReferral = event.payload.daysUntilReferralDeadline as number | undefined;
      return daysUntilReferral !== undefined && daysUntilReferral <= 14;
    },
  },
];

// ---------------------------------------------------------------------------
// Rule registry
// ---------------------------------------------------------------------------

let activeRules: AlertRule[] = [...DEFAULT_ALERT_RULES];

/**
 * Replaces the full set of active alert rules.
 */
export function setAlertRules(rules: AlertRule[]): void {
  activeRules = [...rules];
  console.info(`[alerting] ${activeRules.length} alert rule(s) loaded.`);
}

/**
 * Adds a single rule to the active set.
 */
export function addAlertRule(rule: AlertRule): void {
  activeRules.push(rule);
  console.info(`[alerting] Rule "${rule.id}" added.`);
}

/**
 * Removes a rule by its ID. Returns `true` if the rule was found and removed.
 */
export function removeAlertRule(ruleId: string): boolean {
  const before = activeRules.length;
  activeRules = activeRules.filter((r) => r.id !== ruleId);
  const removed = activeRules.length < before;
  if (removed) console.info(`[alerting] Rule "${ruleId}" removed.`);
  return removed;
}

/**
 * Returns a read-only snapshot of the active rules.
 */
export function getAlertRules(): ReadonlyArray<AlertRule> {
  return [...activeRules];
}

// ---------------------------------------------------------------------------
// Evaluation engine
// ---------------------------------------------------------------------------

/**
 * Evaluates an incoming event against every enabled alert rule.
 *
 * For each rule whose condition matches and that is not in cooldown, an
 * alert is triggered via {@link triggerAlert}.
 *
 * @returns An array of {@link TriggeredAlert}s that fired.
 */
export async function evaluateAlertRules(event: AlertEvent): Promise<TriggeredAlert[]> {
  const triggered: TriggeredAlert[] = [];

  for (const rule of activeRules) {
    if (!rule.enabled) continue;

    try {
      if (!rule.condition(event)) continue;
    } catch (err) {
      console.error(`[alerting] Error evaluating condition for rule "${rule.id}":`, err);
      continue;
    }

    if (isCoolingDown(rule, event)) {
      console.debug(`[alerting] Rule "${rule.id}" skipped – cooling down.`);
      continue;
    }

    const alert = await triggerAlert(rule, event);
    triggered.push(alert);
    recordCooldown(rule, event);
  }

  return triggered;
}

// ---------------------------------------------------------------------------
// Alert dispatch
// ---------------------------------------------------------------------------

/**
 * Dispatches a single alert to all channels configured on the rule.
 *
 * Each channel handler is intentionally fire-and-forget so that a
 * transient failure on one channel does not block the others.
 */
export async function triggerAlert(
  rule: AlertRule,
  event: AlertEvent,
): Promise<TriggeredAlert> {
  const alert: TriggeredAlert = {
    ruleId: rule.id,
    ruleName: rule.name,
    severity: rule.severity,
    channels: rule.channels,
    event,
    triggeredAt: new Date().toISOString(),
  };

  const dispatches = rule.channels.map((channel) =>
    dispatchToChannel(channel, rule, alert).catch((err) => {
      console.error(
        `[alerting] Failed to dispatch rule "${rule.id}" to channel "${channel}":`,
        err,
      );
    }),
  );

  await Promise.allSettled(dispatches);

  return alert;
}

// ---------------------------------------------------------------------------
// Channel handlers
// ---------------------------------------------------------------------------

async function dispatchToChannel(
  channel: AlertChannel,
  rule: AlertRule,
  alert: TriggeredAlert,
): Promise<void> {
  switch (channel) {
    case 'console':
      dispatchConsole(rule, alert);
      break;
    case 'email':
      await dispatchEmail(rule, alert);
      break;
    case 'sms':
      await dispatchSms(rule, alert);
      break;
    case 'webhook':
      await dispatchWebhook(rule, alert);
      break;
    default: {
      const _exhaustive: never = channel;
      console.warn(`[alerting] Unknown channel: ${_exhaustive}`);
    }
  }
}

function dispatchConsole(_rule: AlertRule, alert: TriggeredAlert): void {
  const label = `[ALERT][${alert.severity.toUpperCase()}]`;
  console.warn(`${label} ${alert.ruleName} — ${_rule.description}`);
  console.warn(`${label} Event: ${JSON.stringify(alert.event)}`);
}

async function dispatchEmail(rule: AlertRule, alert: TriggeredAlert): Promise<void> {
  // Integration point: plug in an SMTP or SES client.
  console.info(
    `[alerting:email] Would send email for rule "${rule.id}" (severity=${alert.severity}).`,
  );
}

async function dispatchSms(rule: AlertRule, alert: TriggeredAlert): Promise<void> {
  // Integration point: plug in Twilio, SNS, or equivalent.
  console.info(
    `[alerting:sms] Would send SMS for rule "${rule.id}" (severity=${alert.severity}).`,
  );
}

async function dispatchWebhook(rule: AlertRule, alert: TriggeredAlert): Promise<void> {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    console.debug('[alerting:webhook] ALERT_WEBHOOK_URL not configured – skipping.');
    return;
  }

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(alert),
  });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Clears the cooldown tracker. Useful in tests.
 */
export function resetCooldowns(): void {
  cooldownMap.clear();
  console.info('[alerting] Cooldown tracker reset.');
}
