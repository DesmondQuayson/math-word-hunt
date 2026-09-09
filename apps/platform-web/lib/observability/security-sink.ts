import "server-only";

import { after } from "next/server";

import { withTimeout } from "@/lib/async/with-timeout";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

import { ConsoleMonitoringAdapter, emitOperationalEvent, type EmittedEvent, type MonitoringAdapter } from "./server";
import {
  alertWebhookUrl,
  deliverSecurityAlert,
  evaluateSecurityAlerts,
  type RaisedSecurityAlert,
  type SecurityAlertDelivery,
  type SecurityAlertRule,
  type SecurityAlertStore
} from "./security-alerts";
import { securityEnvironmentLabel, type SecurityEnvironment } from "./security-environment";
import { normalizeSecurityEvent, toStorageRow, type RawEmittedEvent } from "./security-pipeline";
import type { SecurityEvent, SecurityIngestSource } from "./security-schema";

/**
 * The security event sink: where an emitted line goes AFTER it has been
 * written to the structured console log.
 *
 * The console line is unconditional and unchanged — it is what the platform
 * log stream and any log drain see. Persistence is additive and opt-in
 * (`MVH_SECURITY_EVENT_SINK=database`), and it is scheduled with `after()`, so
 * it runs once the response has been sent. A sign-in, a webhook or an
 * authorization decision therefore pays nothing for it: the security decision
 * has already been made and answered before the store is touched, and a store
 * failure can neither slow nor change that answer.
 *
 * Failures of this path report themselves through a console-only event and
 * are never persisted, so a failing store cannot recurse into itself.
 */
export type SecurityEventSinkMode = "console" | "database";

export function securityEventSinkMode(source: Readonly<Record<string, string | undefined>> = process.env): SecurityEventSinkMode {
  return String(source.MVH_SECURITY_EVENT_SINK ?? "").trim().toLowerCase() === "database" ? "database" : "console";
}

const STORE_TIMEOUT_MS = 3_000;
const ALERT_TIMEOUT_MS = 6_000;
const MAXIMUM_BATCH = 500;

export type SecurityIngestOutcome = Readonly<{
  received: number;
  normalized: number;
  /** Rows the store reports as newly inserted; null when the store could not be reached. */
  stored: number | null;
  alerts: readonly RaisedSecurityAlert[];
  failure: string | null;
}>;

export type SecurityIngestInput = Readonly<{ raw: RawEmittedEvent; occurredAt?: Date | undefined }>;

type ServiceClient = NonNullable<ReturnType<typeof createServiceSupabaseClient>>;

function reportPipelineError(reason: string): void {
  emitOperationalEvent(new ConsoleMonitoringAdapter(), {
    category: "health",
    severity: "warning",
    code: "security-pipeline-error",
    // Stable per reason, so a sustained store outage reports once per five
    // seconds rather than once per event.
    correlationId: `security-pipeline-${reason}`,
    detail: { reason, sink: securityEventSinkMode() }
  });
}

function createAlertStore(client: ServiceClient, environment: SecurityEnvironment): SecurityAlertStore {
  return {
    async countSince(rule: SecurityAlertRule, since: Date, synthetic: boolean) {
      const result = await client.rpc("count_security_events_since", {
        p_event_types: [...rule.eventTypes],
        p_since: since.toISOString(),
        p_synthetic: synthetic,
        p_environment: environment,
        p_metadata_filter: rule.metadataFilter ?? {}
      });
      if (result.error) return null;
      const count = typeof result.data === "string" ? Number(result.data) : result.data;
      return typeof count === "number" && Number.isFinite(count) ? count : null;
    },
    async claim(rule: SecurityAlertRule, synthetic: boolean) {
      const result = await client.rpc("claim_security_alert", {
        p_rule_key: rule.key,
        p_synthetic: synthetic,
        p_cooldown_seconds: rule.cooldownSeconds
      });
      return !result.error && result.data === true;
    }
  };
}

async function recordAlert(client: ServiceClient, alert: RaisedSecurityAlert, delivery: SecurityAlertDelivery): Promise<void> {
  const result = await client.rpc("record_security_alert", {
    p_rule_key: alert.rule.key,
    p_severity: alert.rule.severity,
    p_environment: alert.environment,
    p_event_types: [...alert.rule.eventTypes],
    p_window_seconds: alert.rule.windowSeconds,
    p_threshold: alert.rule.threshold,
    p_count: alert.count,
    p_correlation_id: alert.correlationId,
    p_synthetic: alert.synthetic,
    p_delivery: delivery
  });
  if (result.error) reportPipelineError("alert-record-failed");
}

function announceAlert(alert: RaisedSecurityAlert, delivery: SecurityAlertDelivery): void {
  // The console line is what an external log destination sees. It carries the
  // rule and the count, never event metadata.
  emitOperationalEvent(new ConsoleMonitoringAdapter(), {
    category: "health",
    severity: alert.rule.severity === "critical" ? "critical" : "warning",
    code: "security-alert-raised",
    correlationId: alert.correlationId,
    detail: {
      rule: alert.rule.key,
      alertSeverity: alert.rule.severity,
      count: alert.count,
      threshold: alert.rule.threshold,
      windowSeconds: alert.rule.windowSeconds,
      deployment: alert.environment,
      synthetic: alert.synthetic,
      webhook: delivery.webhook ?? "not-configured"
    }
  });
}

/**
 * Normalizes, stores and evaluates one batch. Used by every ingest path:
 * in-process persistence, the log-drain endpoint and the owner's synthetic
 * scenarios. Never throws.
 */
export async function ingestSecurityEvents(
  inputs: readonly SecurityIngestInput[],
  options: Readonly<{ ingestSource: SecurityIngestSource; now?: Date; environment?: SecurityEnvironment }>
): Promise<SecurityIngestOutcome> {
  const now = options.now ?? new Date();
  const environment = options.environment ?? securityEnvironmentLabel();
  const events: SecurityEvent[] = [];
  for (const input of inputs.slice(0, MAXIMUM_BATCH)) {
    const event = normalizeSecurityEvent(input.raw, {
      environment,
      ingestSource: options.ingestSource,
      receivedAt: now,
      occurredAt: input.occurredAt
    });
    if (event) events.push(event);
  }
  const base = { received: inputs.length, normalized: events.length };
  if (events.length === 0) return Object.freeze({ ...base, stored: 0, alerts: [], failure: null });

  const client = createServiceSupabaseClient();
  if (!client) {
    reportPipelineError("store-unavailable");
    return Object.freeze({ ...base, stored: null, alerts: [], failure: "store-unavailable" });
  }

  let stored: number;
  try {
    const result = await withTimeout(
      Promise.resolve(client.rpc("record_security_events", { p_events: events.map(toStorageRow) })),
      STORE_TIMEOUT_MS,
      null
    );
    const count = result && !result.error ? (typeof result.data === "string" ? Number(result.data) : result.data) : null;
    if (typeof count !== "number" || !Number.isFinite(count)) {
      const failure = result === null ? "store-timeout" : "store-write-failed";
      reportPipelineError(failure);
      return Object.freeze({ ...base, stored: null, alerts: [], failure });
    }
    stored = count;
  } catch {
    reportPipelineError("store-write-failed");
    return Object.freeze({ ...base, stored: null, alerts: [], failure: "store-write-failed" });
  }

  // Real and synthetic events are evaluated in separate partitions; see
  // evaluateSecurityAlerts for why.
  const alerts: RaisedSecurityAlert[] = [];
  for (const synthetic of new Set(events.map((event) => event.synthetic))) {
    const touchedTypes = new Set(events.filter((event) => event.synthetic === synthetic).map((event) => event.eventType));
    try {
      const raised = await withTimeout(
        evaluateSecurityAlerts({ store: createAlertStore(client, environment), touchedTypes, synthetic, environment, now }),
        ALERT_TIMEOUT_MS,
        [] as readonly RaisedSecurityAlert[]
      );
      for (const alert of raised) {
        const delivery = await deliverSecurityAlert(alert, { webhook: alertWebhookUrl() });
        announceAlert(alert, delivery);
        await recordAlert(client, alert, delivery);
        alerts.push(alert);
      }
    } catch {
      reportPipelineError("alert-evaluation-failed");
    }
  }
  return Object.freeze({ ...base, stored, alerts, failure: null });
}

/**
 * Persists one emission after the current response completes. If there is no
 * request scope to attach to (a test, a script), it runs detached instead.
 * Either way the caller's own work is never awaited on it.
 */
export function scheduleSecurityEventPersistence(event: EmittedEvent): void {
  const work = () => ingestSecurityEvents([{ raw: event }], { ingestSource: "in-process" }).then(() => undefined, () => undefined);
  try {
    after(work);
  } catch {
    void work();
  }
}

/**
 * The adapter every producer emits through. Console always; persistence only
 * when the sink is configured for it. Producers keep their single call site.
 */
export function platformMonitoringAdapter(): MonitoringAdapter {
  const transport = new ConsoleMonitoringAdapter();
  if (securityEventSinkMode() !== "database") return transport;
  return {
    emit(event: EmittedEvent) {
      transport.emit(event);
      scheduleSecurityEventPersistence(event);
    }
  };
}
