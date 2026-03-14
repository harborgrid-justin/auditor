/**
 * OpenTelemetry Distributed Tracing Setup
 *
 * Provides distributed tracing for the DoD Financial Audit Platform.
 * Conforms to the OpenTelemetry specification (https://opentelemetry.io/docs/specs/otel/).
 *
 * Features:
 *   - OTLP exporter with fallback to console
 *   - W3C Trace Context propagation
 *   - Automatic span context management
 *   - Custom attribute injection for audit-domain concerns
 */

import {
  BasicTracerProvider,
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import {
  trace,
  context,
  SpanStatusCode,
  SpanKind,
  Span,
  Tracer,
  Attributes,
  Context,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { Logger } from '@nestjs/common';

const otelLogger = new Logger('OpenTelemetry');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TracingConfig {
  serviceName: string;
  serviceVersion?: string;
  environment?: string;
  otlpEndpoint?: string;
  /** When true the OTLP exporter is skipped and spans go to the console. */
  consoleOnly?: boolean;
  /** Maximum queue size for the batch span processor. */
  maxQueueSize?: number;
  /** Maximum batch size for the batch span processor. */
  maxExportBatchSize?: number;
}

export interface SpanOptions {
  kind?: SpanKind;
  attributes?: Attributes;
  parentContext?: Context;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let tracerProvider: NodeTracerProvider | null = null;
let defaultTracer: Tracer | null = null;
let initialized = false;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initializes the OpenTelemetry SDK for this service.
 *
 * Must be called once at application startup, **before** any other imports
 * that should be instrumented (HTTP, Express, pg, etc.).
 *
 * @param config - Tracing configuration, at minimum a `serviceName`.
 * @returns The configured `NodeTracerProvider`.
 */
export function initTracing(config: TracingConfig): NodeTracerProvider {
  if (initialized && tracerProvider) {
    otelLogger.warn('Tracing is already initialized – returning existing provider.');
    return tracerProvider;
  }

  const {
    serviceName,
    serviceVersion = '1.0.0',
    environment = process.env.NODE_ENV ?? 'development',
    otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces',
    consoleOnly = false,
    maxQueueSize = 2048,
    maxExportBatchSize = 512,
  } = config;

  // --- Resource ----------------------------------------------------------
  const resource = new Resource({
    [SEMRESATTRS_SERVICE_NAME]: serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
    'audit.platform': 'dod-financial-audit',
  });

  // --- Provider ----------------------------------------------------------
  tracerProvider = new NodeTracerProvider({ resource });

  // --- Exporter ----------------------------------------------------------
  if (consoleOnly) {
    tracerProvider.addSpanProcessor(
      new SimpleSpanProcessor(new ConsoleSpanExporter()),
    );
    otelLogger.log('Console span exporter enabled.');
  } else {
    try {
      const otlpExporter = new OTLPTraceExporter({ url: otlpEndpoint });
      tracerProvider.addSpanProcessor(
        new BatchSpanProcessor(otlpExporter, {
          maxQueueSize,
          maxExportBatchSize,
        }),
      );
      otelLogger.log(`OTLP exporter configured → ${otlpEndpoint}`);
    } catch (err) {
      otelLogger.warn(`Failed to create OTLP exporter – falling back to console: ${err}`);
      tracerProvider.addSpanProcessor(
        new SimpleSpanProcessor(new ConsoleSpanExporter()),
      );
    }
  }

  // --- Propagator --------------------------------------------------------
  tracerProvider.register({
    propagator: new W3CTraceContextPropagator(),
  });

  // --- Auto-instrumentation ----------------------------------------------
  registerInstrumentations({
    tracerProvider,
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
    ],
  });

  defaultTracer = trace.getTracer(serviceName, serviceVersion);
  initialized = true;

  otelLogger.log(`Tracing initialized for service "${serviceName}" (${environment}).`);
  return tracerProvider;
}

// ---------------------------------------------------------------------------
// Span helpers
// ---------------------------------------------------------------------------

/**
 * Creates (and starts) a new span.
 *
 * The span is automatically linked to the current context unless an explicit
 * `parentContext` is provided in the options.
 *
 * @param name       - Human-readable span name (e.g. `"audit.validateObligation"`).
 * @param options    - Optional kind, attributes, and parent context.
 * @returns The active {@link Span}.
 */
export function createSpan(name: string, options: SpanOptions = {}): Span {
  const tracer = getTracer();
  const { kind = SpanKind.INTERNAL, attributes = {}, parentContext } = options;

  const ctx = parentContext ?? context.active();
  const span = tracer.startSpan(name, { kind, attributes }, ctx);
  return span;
}

/**
 * Wraps an async function inside a traced span. The span is ended
 * automatically when the function resolves or rejects.
 */
export async function withSpan<T>(
  name: string,
  options: SpanOptions,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const span = createSpan(name, options);
  const ctx = trace.setSpan(context.active(), span);

  return context.with(ctx, async () => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

// ---------------------------------------------------------------------------
// Context helpers
// ---------------------------------------------------------------------------

/**
 * Returns the trace ID from the currently active span, or `undefined` if
 * there is no active span.
 */
export function getTraceId(): string | undefined {
  const span = trace.getSpan(context.active());
  if (!span) return undefined;
  return span.spanContext().traceId;
}

/**
 * Returns the span ID from the currently active span, or `undefined` if
 * there is no active span.
 */
export function getSpanId(): string | undefined {
  const span = trace.getSpan(context.active());
  if (!span) return undefined;
  return span.spanContext().spanId;
}

/**
 * Retrieves the module-level tracer, creating a fallback no-op tracer if
 * {@link initTracing} has not been called.
 */
export function getTracer(): Tracer {
  if (defaultTracer) return defaultTracer;
  otelLogger.warn('Tracer requested before initTracing() – returning no-op tracer.');
  return trace.getTracer('dod-audit-noop');
}

/**
 * Returns the underlying `NodeTracerProvider`, or `null` if tracing has
 * not been initialized.
 */
export function getTracerProvider(): NodeTracerProvider | null {
  return tracerProvider;
}

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------

/**
 * Gracefully shuts down the tracer provider, flushing any pending spans.
 * Should be called during application shutdown (e.g. SIGTERM handler).
 */
export async function shutdownTracing(): Promise<void> {
  if (!tracerProvider) return;
  otelLogger.log('Shutting down tracer provider…');
  await tracerProvider.shutdown();
  tracerProvider = null;
  defaultTracer = null;
  initialized = false;
  otelLogger.log('Tracer provider shut down.');
}
