import type { SecurityEnvironment } from "@/lib/observability/security-environment";
import { SECURITY_EVENT_REGISTRY, SECURITY_SEVERITIES, isSecurityEventType, type SecuritySeverity } from "@/lib/observability/security-schema";

/**
 * Pure shaping of security-store rows into the Security Health view.
 *
 * Everything here is derived from server-side rows the database has already
 * bounded by window. Nothing is estimated: a query that failed leaves its
 * section visibly unavailable rather than showing zero.
 */
export type SecurityWindowKey = "hour" | "day" | "week";
export const SECURITY_WINDOWS: readonly (readonly [SecurityWindowKey, string])[] = Object.freeze([
  ["hour", "Last hour"],
  ["day", "Last 24 hours"],
  ["week", "Last 7 days"]
]);

export type SecuritySummaryRow = Readonly<{
  event_type: string;
  severity: string;
  synthetic: boolean;
  last_hour: number | string;
  last_day: number | string;
  last_week: number | string;
  last_occurred_at: string | null;
}>;

export type SecurityClassSummary = Readonly<{
  eventType: string;
  summary: string;
  source: string;
  severity: SecuritySeverity;
  hour: number;
  day: number;
  week: number;
  lastOccurredAt: string | null;
}>;

export type SecurityEventView = Readonly<{
  occurredAt: string;
  eventType: string;
  summary: string;
  severity: SecuritySeverity;
  source: string;
  outcome: string;
  environment: string;
  correlationId: string;
  synthetic: boolean;
  ingestSource: string;
  detail: string;
}>;

export type SecurityAlertView = Readonly<{
  firedAt: string;
  ruleKey: string;
  severity: SecuritySeverity;
  environment: string;
  count: number;
  threshold: number;
  windowSeconds: number;
  correlationId: string;
  synthetic: boolean;
  delivery: string;
}>;

export type SecurityPipelineView = Readonly<{ source: string; lastReceivedAt: string | null; eventsLastDay: number }>;

export type SecurityRuleView = Readonly<{
  key: string;
  title: string;
  severity: SecuritySeverity;
  threshold: number;
  windowSeconds: number;
  cooldownSeconds: number;
  ownerAction: string;
}>;

export type SecurityScenarioView = Readonly<{ key: string; title: string; description: string; expectedAlert: string | null }>;

export type SecurityGroup = Readonly<{ key: string; label: string; classes: readonly SecurityClassSummary[] }>;

export type AdminSecurityHealthSnapshot = Readonly<{
  state: "ready" | "partial" | "unavailable";
  environment: SecurityEnvironment;
  generatedAt: string;
  sinkMode: "console" | "database";
  drainConfigured: boolean;
  alertWebhookConfigured: boolean;
  syntheticAllowed: boolean;
  retentionDays: number;
  severityTotals: Readonly<Record<SecurityWindowKey, Readonly<Record<SecuritySeverity, number>>>>;
  syntheticTotals: Readonly<Record<SecurityWindowKey, number>>;
  classes: readonly SecurityClassSummary[];
  topClasses: readonly SecurityClassSummary[];
  groups: readonly SecurityGroup[];
  recentEvents: readonly SecurityEventView[];
  recentAlerts: readonly SecurityAlertView[];
  pipeline: readonly SecurityPipelineView[];
  lastEventAt: string | null;
  rules: readonly SecurityRuleView[];
  scenarios: readonly SecurityScenarioView[];
}>;

const SEVERITY_RANK: Readonly<Record<SecuritySeverity, number>> = { critical: 4, high: 3, medium: 2, info: 1 };

/** Metadata keys that are safe and useful to show. Everything else stays in the store. */
const DISPLAYED_METADATA_KEYS = [
  "reason", "scope", "dimension", "result", "state", "surface", "destinationClass", "component", "eventType",
  "source", "failureClass", "step", "route", "scenario", "retryable", "enforced", "otherDevicesSignedOut",
  "userAgentFamily", "providerStatus", "variable", "probe", "ticketAudience", "anomaly"
] as const;
const MAXIMUM_DISPLAYED_PAIRS = 6;
const MAXIMUM_DISPLAYED_VALUE = 40;

const GROUPS: readonly (readonly [string, string, readonly string[]])[] = Object.freeze([
  ["authentication", "Authentication and rate limiting", ["consumer-auth", "rate-limiter", "school-access"]],
  ["authorization", "Authorization, admin and egress", ["authorization", "admin-auth", "scheduler", "egress"]],
  ["billing", "Webhooks and subscription synchronization", ["billing-webhook", "billing-sync"]],
  ["environment", "Environment and configuration", ["staging-gate", "configuration", "dependency"]],
  ["health", "Observability self-reports", ["security-synthetic", "security-pipeline", "security-alerts"]]
]);

export function isSecuritySeverity(value: unknown): value is SecuritySeverity {
  return typeof value === "string" && (SECURITY_SEVERITIES as readonly string[]).includes(value);
}

const number = (value: unknown): number => {
  const parsed = typeof value === "string" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
};
const text = (value: unknown, fallback = ""): string => typeof value === "string" ? value : fallback;
const instant = (value: unknown): string | null => typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

function describe(eventType: string): Readonly<{ summary: string; source: string; severity: SecuritySeverity }> {
  if (isSecurityEventType(eventType)) {
    const descriptor = SECURITY_EVENT_REGISTRY[eventType];
    return { summary: descriptor.summary, source: descriptor.source, severity: descriptor.severity };
  }
  return { summary: "Unregistered event class", source: "unknown", severity: "info" };
}

function emptyTotals(): Record<SecurityWindowKey, Record<SecuritySeverity, number>> {
  return {
    hour: { info: 0, medium: 0, high: 0, critical: 0 },
    day: { info: 0, medium: 0, high: 0, critical: 0 },
    week: { info: 0, medium: 0, high: 0, critical: 0 }
  };
}

function byImportance(a: SecurityClassSummary, b: SecurityClassSummary): number {
  return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.day - a.day || b.week - a.week || a.eventType.localeCompare(b.eventType);
}

/** Collapses summary rows (one per class × stored severity × partition) into one class per event type. */
export function summarizeSecurityClasses(rows: readonly SecuritySummaryRow[]): Readonly<{
  classes: readonly SecurityClassSummary[];
  severityTotals: AdminSecurityHealthSnapshot["severityTotals"];
  syntheticTotals: AdminSecurityHealthSnapshot["syntheticTotals"];
}> {
  const totals = emptyTotals();
  const synthetic = { hour: 0, day: 0, week: 0 };
  const classes = new Map<string, { hour: number; day: number; week: number; lastOccurredAt: string | null; severity: SecuritySeverity }>();
  for (const row of rows) {
    const hour = number(row.last_hour);
    const day = number(row.last_day);
    const week = number(row.last_week);
    if (row.synthetic) {
      synthetic.hour += hour;
      synthetic.day += day;
      synthetic.week += week;
      continue;
    }
    const severity = isSecuritySeverity(row.severity) ? row.severity : describe(row.event_type).severity;
    totals.hour[severity] += hour;
    totals.day[severity] += day;
    totals.week[severity] += week;
    const existing = classes.get(row.event_type);
    const lastOccurredAt = instant(row.last_occurred_at);
    if (!existing) {
      classes.set(row.event_type, { hour, day, week, lastOccurredAt, severity });
      continue;
    }
    existing.hour += hour;
    existing.day += day;
    existing.week += week;
    if (SEVERITY_RANK[severity] > SEVERITY_RANK[existing.severity]) existing.severity = severity;
    if (lastOccurredAt && (!existing.lastOccurredAt || lastOccurredAt > existing.lastOccurredAt)) existing.lastOccurredAt = lastOccurredAt;
  }
  const list = [...classes.entries()].map(([eventType, value]) => {
    const described = describe(eventType);
    return Object.freeze({
      eventType,
      summary: described.summary,
      source: described.source,
      severity: value.severity,
      hour: value.hour,
      day: value.day,
      week: value.week,
      lastOccurredAt: value.lastOccurredAt
    });
  }).sort(byImportance);
  return Object.freeze({ classes: Object.freeze(list), severityTotals: Object.freeze(totals), syntheticTotals: Object.freeze(synthetic) });
}

export function groupSecurityClasses(classes: readonly SecurityClassSummary[]): readonly SecurityGroup[] {
  return GROUPS.map(([key, label, sources]) => Object.freeze({
    key,
    label,
    classes: Object.freeze(classes.filter((item) => sources.includes(item.source)))
  }));
}

/** A compact, allowlisted rendering of an event's metadata. Never the whole object. */
export function describeSecurityMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const record = metadata as Record<string, unknown>;
  const pairs: string[] = [];
  for (const key of DISPLAYED_METADATA_KEYS) {
    if (pairs.length >= MAXIMUM_DISPLAYED_PAIRS) break;
    const value = record[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") continue;
    pairs.push(`${key}: ${String(value).slice(0, MAXIMUM_DISPLAYED_VALUE)}`);
  }
  return pairs.join(" · ");
}

export function toSecurityEventView(row: Readonly<Record<string, unknown>>): SecurityEventView | null {
  const occurredAt = instant(row.occurred_at);
  const eventType = text(row.event_type);
  if (!occurredAt || !eventType) return null;
  const described = describe(eventType);
  return Object.freeze({
    occurredAt,
    eventType,
    summary: described.summary,
    severity: isSecuritySeverity(row.severity) ? row.severity : described.severity,
    source: text(row.source, described.source),
    outcome: text(row.outcome, "observed"),
    environment: text(row.environment, "unknown"),
    correlationId: text(row.correlation_id, "—"),
    synthetic: row.synthetic === true,
    ingestSource: text(row.ingest_source, "unknown"),
    detail: describeSecurityMetadata(row.metadata)
  });
}

export function toSecurityAlertView(row: Readonly<Record<string, unknown>>): SecurityAlertView | null {
  const firedAt = instant(row.fired_at);
  const ruleKey = text(row.rule_key);
  if (!firedAt || !ruleKey) return null;
  const delivery = row.delivery && typeof row.delivery === "object" && !Array.isArray(row.delivery)
    ? Object.entries(row.delivery as Record<string, unknown>).map(([sink, state]) => `${sink}: ${String(state)}`).join(" · ")
    : "";
  return Object.freeze({
    firedAt,
    ruleKey,
    severity: isSecuritySeverity(row.severity) ? row.severity : "info",
    environment: text(row.environment, "unknown"),
    count: number(row.count),
    threshold: number(row.threshold),
    windowSeconds: number(row.window_seconds),
    correlationId: text(row.correlation_id, "—"),
    synthetic: row.synthetic === true,
    delivery: delivery || "recorded only"
  });
}

export function toSecurityPipelineView(row: Readonly<Record<string, unknown>>): SecurityPipelineView {
  return Object.freeze({
    source: text(row.ingest_source, "unknown"),
    lastReceivedAt: instant(row.last_received_at),
    eventsLastDay: number(row.events_last_day)
  });
}

export function describeWindowSeconds(seconds: number): string {
  if (seconds % 86_400 === 0) return `${seconds / 86_400} d`;
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  return `${Math.round(seconds / 60)} min`;
}

export type SecurityHealthInput = Readonly<{
  environment: SecurityEnvironment;
  now: Date;
  sinkMode: "console" | "database";
  drainConfigured: boolean;
  alertWebhookConfigured: boolean;
  syntheticAllowed: boolean;
  retentionDays: number;
  summary: readonly SecuritySummaryRow[] | null;
  events: readonly Readonly<Record<string, unknown>>[] | null;
  alerts: readonly Readonly<Record<string, unknown>>[] | null;
  pipeline: readonly Readonly<Record<string, unknown>>[] | null;
  rules: readonly SecurityRuleView[];
  scenarios: readonly SecurityScenarioView[];
}>;

export function buildAdminSecurityHealthSnapshot(input: SecurityHealthInput): AdminSecurityHealthSnapshot {
  const sections = [input.summary, input.events, input.alerts, input.pipeline];
  const missing = sections.filter((section) => section === null).length;
  const state = missing === sections.length ? "unavailable" : missing > 0 ? "partial" : "ready";
  const summarized = summarizeSecurityClasses(input.summary ?? []);
  const recentEvents = (input.events ?? []).map(toSecurityEventView).filter((view): view is SecurityEventView => view !== null);
  const recentAlerts = (input.alerts ?? []).map(toSecurityAlertView).filter((view): view is SecurityAlertView => view !== null);
  const pipeline = (input.pipeline ?? []).map(toSecurityPipelineView);
  const lastEventAt = pipeline.reduce<string | null>((latest, item) =>
    item.lastReceivedAt && (!latest || item.lastReceivedAt > latest) ? item.lastReceivedAt : latest, null);
  return Object.freeze({
    state,
    environment: input.environment,
    generatedAt: input.now.toISOString(),
    sinkMode: input.sinkMode,
    drainConfigured: input.drainConfigured,
    alertWebhookConfigured: input.alertWebhookConfigured,
    syntheticAllowed: input.syntheticAllowed,
    retentionDays: input.retentionDays,
    severityTotals: summarized.severityTotals,
    syntheticTotals: summarized.syntheticTotals,
    classes: summarized.classes,
    topClasses: Object.freeze([...summarized.classes].sort((a, b) => b.day - a.day || byImportance(a, b)).filter((item) => item.day > 0).slice(0, 5)),
    groups: groupSecurityClasses(summarized.classes),
    recentEvents: Object.freeze(recentEvents),
    recentAlerts: Object.freeze(recentAlerts),
    pipeline: Object.freeze(pipeline),
    lastEventAt,
    rules: input.rules,
    scenarios: input.scenarios
  });
}
