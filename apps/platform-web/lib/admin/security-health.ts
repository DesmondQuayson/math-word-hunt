import "server-only";

import { withTimeout } from "@/lib/async/with-timeout";
import { SECURITY_ALERT_RULES, alertWebhookUrl } from "@/lib/observability/security-alerts";
import { drainSecretConfigured } from "@/lib/observability/security-drain";
import { isSyntheticSecurityTestingAllowed, securityEnvironmentLabel } from "@/lib/observability/security-environment";
import { securityEventRetentionDays } from "@/lib/observability/security-retention";
import { securityEventSinkMode } from "@/lib/observability/security-sink";
import { SYNTHETIC_SECURITY_SCENARIOS } from "@/lib/observability/security-synthetic";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

import {
  buildAdminSecurityHealthSnapshot,
  type AdminSecurityHealthSnapshot,
  type SecurityRuleView,
  type SecurityScenarioView,
  type SecuritySummaryRow
} from "./security-health-model";

const LOAD_TIMEOUT_MS = 8_000;
const RECENT_EVENTS = 60;
const RECENT_ALERTS = 25;

type Row = Readonly<Record<string, unknown>>;
const rows = (value: unknown): readonly Row[] => Array.isArray(value) ? value as Row[] : [];

const RULE_VIEWS: readonly SecurityRuleView[] = Object.freeze(SECURITY_ALERT_RULES.map((rule) => Object.freeze({
  key: rule.key,
  title: rule.title,
  severity: rule.severity,
  threshold: rule.threshold,
  windowSeconds: rule.windowSeconds,
  cooldownSeconds: rule.cooldownSeconds,
  ownerAction: rule.ownerAction
})));

const SCENARIO_VIEWS: readonly SecurityScenarioView[] = Object.freeze(
  Object.entries(SYNTHETIC_SECURITY_SCENARIOS).map(([key, value]) => Object.freeze({
    key,
    title: value.title,
    description: value.description,
    expectedAlert: value.expectedAlert
  }))
);

/**
 * Loads the Security Health section for an already-authorized admin. Reads
 * only the deployment's own label, only the bounded evidence columns, and
 * only through the service client; a slow or failing store degrades to a
 * visibly unavailable section, never to a blank page or an estimate.
 */
export async function loadAdminSecurityHealth(): Promise<AdminSecurityHealthSnapshot> {
  const environment = securityEnvironmentLabel();
  const now = new Date();
  const configuration = {
    environment,
    now,
    sinkMode: securityEventSinkMode(),
    drainConfigured: drainSecretConfigured() !== null,
    alertWebhookConfigured: alertWebhookUrl() !== null,
    syntheticAllowed: isSyntheticSecurityTestingAllowed(),
    retentionDays: securityEventRetentionDays(),
    rules: RULE_VIEWS,
    scenarios: SCENARIO_VIEWS
  };
  const client = createServiceSupabaseClient();
  if (!client) {
    return buildAdminSecurityHealthSnapshot({ ...configuration, summary: null, events: null, alerts: null, pipeline: null });
  }
  const loaded = await withTimeout(
    Promise.all([
      client.rpc("summarize_security_events", { p_environment: environment }),
      client.from("security_events")
        .select("occurred_at,event_type,severity,source,outcome,environment,correlation_id,synthetic,ingest_source,metadata")
        .eq("environment", environment)
        .order("occurred_at", { ascending: false })
        .limit(RECENT_EVENTS),
      client.from("security_alerts")
        .select("fired_at,rule_key,severity,environment,count,threshold,window_seconds,correlation_id,synthetic,delivery")
        .eq("environment", environment)
        .order("fired_at", { ascending: false })
        .limit(RECENT_ALERTS),
      client.rpc("security_pipeline_health", { p_environment: environment })
    ]),
    LOAD_TIMEOUT_MS,
    null
  );
  if (!loaded) {
    return buildAdminSecurityHealthSnapshot({ ...configuration, summary: null, events: null, alerts: null, pipeline: null });
  }
  const [summary, events, alerts, pipeline] = loaded;
  return buildAdminSecurityHealthSnapshot({
    ...configuration,
    summary: summary.error ? null : rows(summary.data) as readonly SecuritySummaryRow[],
    events: events.error ? null : rows(events.data),
    alerts: alerts.error ? null : rows(alerts.data),
    pipeline: pipeline.error ? null : rows(pipeline.data)
  });
}
