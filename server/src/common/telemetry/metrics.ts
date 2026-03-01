/**
 * Prometheus Metrics
 *
 * Provides application-level metrics for the DoD Financial Audit Platform.
 * Follows Prometheus naming conventions and best practices:
 *   - https://prometheus.io/docs/practices/naming/
 *   - https://prometheus.io/docs/practices/instrumentation/
 *
 * Metric categories:
 *   Counters   – monotonically increasing values (requests, findings, violations)
 *   Gauges     – values that can go up and down (active engagements, balances)
 *   Histograms – distribution of durations / sizes (latency, rule execution)
 */

import client, {
  Registry,
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
  Metric,
} from 'prom-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetricsConfig {
  /** Prefix prepended to every metric name (default: `dod_audit`). */
  prefix?: string;
  /** Whether to collect Node.js default metrics (CPU, memory, GC, etc.). */
  collectDefaults?: boolean;
  /** Default labels applied to every metric. */
  defaultLabels?: Record<string, string>;
  /** Histogram bucket boundaries for request duration (seconds). */
  durationBuckets?: number[];
  /** Histogram bucket boundaries for rule execution time (seconds). */
  ruleTimeBuckets?: number[];
}

export interface MetricsCollection {
  // Counters
  requestCount: Counter<string>;
  auditFindingsCount: Counter<string>;
  adaViolationsDetected: Counter<string>;

  // Gauges
  activeEngagements: Gauge<string>;
  fundBalanceTotal: Gauge<string>;
  obligationsOutstanding: Gauge<string>;

  // Histograms
  requestDuration: Histogram<string>;
  ruleExecutionTime: Histogram<string>;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let registry: Registry | null = null;
let metrics: MetricsCollection | null = null;
let initialized = false;

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

const DEFAULT_DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

const DEFAULT_RULE_TIME_BUCKETS = [
  0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5,
];

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initializes all Prometheus metric collectors.
 *
 * Safe to call multiple times – subsequent calls return the existing
 * {@link MetricsCollection} without re-registration.
 */
export function initMetrics(config: MetricsConfig = {}): MetricsCollection {
  if (initialized && metrics) {
    return metrics;
  }

  const {
    prefix = 'dod_audit',
    collectDefaults = true,
    defaultLabels = {},
    durationBuckets = DEFAULT_DURATION_BUCKETS,
    ruleTimeBuckets = DEFAULT_RULE_TIME_BUCKETS,
  } = config;

  registry = new Registry();

  if (Object.keys(defaultLabels).length > 0) {
    registry.setDefaultLabels(defaultLabels);
  }

  if (collectDefaults) {
    collectDefaultMetrics({ register: registry, prefix: `${prefix}_` });
  }

  // -----------------------------------------------------------------------
  // Counters
  // -----------------------------------------------------------------------

  const requestCount = new Counter({
    name: `${prefix}_request_count_total`,
    help: 'Total number of HTTP requests received.',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry],
  });

  const auditFindingsCount = new Counter({
    name: `${prefix}_audit_findings_count_total`,
    help: 'Total number of audit findings recorded across all engagements.',
    labelNames: ['severity', 'category', 'engagement_id'],
    registers: [registry],
  });

  const adaViolationsDetected = new Counter({
    name: `${prefix}_ada_violations_detected_total`,
    help: 'Total number of Antideficiency Act (ADA) violations detected.',
    labelNames: ['violation_type', 'fund_code', 'agency'],
    registers: [registry],
  });

  // -----------------------------------------------------------------------
  // Gauges
  // -----------------------------------------------------------------------

  const activeEngagements = new Gauge({
    name: `${prefix}_active_engagements`,
    help: 'Number of audit engagements currently in progress.',
    labelNames: ['engagement_type', 'agency'],
    registers: [registry],
  });

  const fundBalanceTotal = new Gauge({
    name: `${prefix}_fund_balance_total`,
    help: 'Current fund balance across tracked appropriation accounts (USD).',
    labelNames: ['fund_code', 'fiscal_year', 'agency'],
    registers: [registry],
  });

  const obligationsOutstanding = new Gauge({
    name: `${prefix}_obligations_outstanding`,
    help: 'Total outstanding obligations awaiting liquidation (USD).',
    labelNames: ['fund_code', 'fiscal_year', 'status'],
    registers: [registry],
  });

  // -----------------------------------------------------------------------
  // Histograms
  // -----------------------------------------------------------------------

  const requestDuration = new Histogram({
    name: `${prefix}_request_duration_seconds`,
    help: 'Duration of HTTP requests in seconds.',
    labelNames: ['method', 'route', 'status_code'],
    buckets: durationBuckets,
    registers: [registry],
  });

  const ruleExecutionTime = new Histogram({
    name: `${prefix}_rule_execution_time_seconds`,
    help: 'Time taken to execute individual audit/compliance rules in seconds.',
    labelNames: ['rule_id', 'rule_category'],
    buckets: ruleTimeBuckets,
    registers: [registry],
  });

  metrics = {
    requestCount,
    auditFindingsCount,
    adaViolationsDetected,
    activeEngagements,
    fundBalanceTotal,
    obligationsOutstanding,
    requestDuration,
    ruleExecutionTime,
  };

  initialized = true;
  console.info('[metrics] Prometheus metrics initialized.');

  return metrics;
}

// ---------------------------------------------------------------------------
// Endpoint data generation
// ---------------------------------------------------------------------------

/**
 * Returns the serialised Prometheus exposition text for the `/metrics`
 * endpoint.  Content-Type should be set to {@link getContentType}.
 */
export async function generateMetricsOutput(): Promise<string> {
  if (!registry) {
    throw new Error('[metrics] Metrics have not been initialized. Call initMetrics() first.');
  }
  return registry.metrics();
}

/**
 * Returns the correct `Content-Type` header value for Prometheus scraping.
 */
export function getContentType(): string {
  if (!registry) {
    return 'text/plain; version=0.0.4; charset=utf-8';
  }
  return registry.contentType;
}

// ---------------------------------------------------------------------------
// Convenience helpers
// ---------------------------------------------------------------------------

/**
 * Returns the current {@link MetricsCollection}, or throws if metrics have
 * not been initialized.
 */
export function getMetrics(): MetricsCollection {
  if (!metrics) {
    throw new Error('[metrics] Metrics have not been initialized. Call initMetrics() first.');
  }
  return metrics;
}

/**
 * Returns the underlying Prometheus {@link Registry}, or `null` if not
 * yet initialized.
 */
export function getRegistry(): Registry | null {
  return registry;
}

/**
 * Returns a single metric by its registered name, or `undefined`.
 */
export function getMetricByName(name: string): Metric | undefined {
  if (!registry) return undefined;
  return registry.getSingleMetric(name);
}

/**
 * Resets every registered metric to its initial value.
 * Useful in test suites.
 */
export function resetAllMetrics(): void {
  if (!registry) return;
  registry.resetMetrics();
  console.info('[metrics] All metrics reset.');
}

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------

/**
 * Clears the registry, removing all collectors.
 * Should be called during application teardown.
 */
export function shutdownMetrics(): void {
  if (!registry) return;
  registry.clear();
  registry = null;
  metrics = null;
  initialized = false;
  console.info('[metrics] Metrics registry cleared.');
}
