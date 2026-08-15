import "server-only";

import type { AdminAnalyticsRange } from "@math-vocabulary-hunt/platform-core";

import { getPublicEnvironmentView } from "@/lib/environment/server";
import { loadServerFeatureFlags, type ServerFeatureFlag } from "@/lib/operations/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type Row = Record<string, unknown>;
export type AggregateMetric = Readonly<{ key: string; label: string; value: number | null; detail: string }>;
export type PopularSignal = Readonly<{ label: string; value: number }>;
export type ProviderHealth = Readonly<{ provider: string; state: "healthy" | "attention" | "unavailable" | "no-signal"; detail: string }>;
export type AdminAuditView = Readonly<{ action: string; target: string | null; createdAt: string }>;

export type AdminAnalyticsOperationsSnapshot = Readonly<{
  state: "ready" | "partial" | "unavailable";
  range: AdminAnalyticsRange;
  metrics: readonly AggregateMetric[];
  popular: Readonly<{ grades: readonly PopularSignal[]; topics: readonly PopularSignal[]; lessons: readonly PopularSignal[] }>;
  providers: readonly ProviderHealth[];
  build: Readonly<{ id: string; environment: string; migrationCount: number | null; latestMigration: string | null }>;
  storage: Readonly<{ objects: number | null; bytes: number | null; buckets: number | null }>;
  webhookQueue: Readonly<{ pending: number | null; failed: number | null }>;
  flags: readonly ServerFeatureFlag[];
  retention: Readonly<{ completedAt: string; deletedCount: number }> | null;
  audit: readonly AdminAuditView[];
}>;

const str = (value: unknown): string => typeof value === "string" ? value : "";
const date = (value: unknown): string | null => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];
const inRange = (range: AdminAnalyticsRange) => ({ start: `${range.from}T00:00:00.000Z`, end: `${range.to}T23:59:59.999Z` });

function top(values: Map<string, number>): PopularSignal[] {
  return [...values.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([label, value]) => ({ label, value }));
}

export async function loadAdminAnalyticsOperations(range: AdminAnalyticsRange): Promise<AdminAnalyticsOperationsSnapshot> {
  const client = createServiceSupabaseClient(); const window = inRange(range); const environment = getPublicEnvironmentView();
  const empty: AdminAnalyticsOperationsSnapshot = { state: "unavailable", range, metrics: [], popular: { grades: [], topics: [], lessons: [] }, providers: [], build: { id: environment.buildId, environment: environment.identity, migrationCount: null, latestMigration: null }, storage: { objects: null, bytes: null, buckets: null }, webhookQueue: { pending: null, failed: null }, flags: [], retention: null, audit: [] };
  if (!client) return empty;

  const [accounts, subscriptions, webhooks, launches, downloads, aggregateEvents, audit, flagsResult, retention, storage, migration] = await Promise.all([
    client.from("consumer_accounts").select("created_at,trial_redeemed_at").lte("created_at", window.end),
    client.from("billing_subscriptions").select("subscription_status,first_paid_at,canceled_at,last_payment_failed_at,created_at").not("owner_consumer_id", "is", null),
    client.from("billing_webhook_events").select("event_type,processing_state,received_at").gte("received_at", window.start).lte("received_at", window.end),
    client.from("game_launch_events").select("resource_id,launched_at").gte("launched_at", window.start).lte("launched_at", window.end),
    client.from("resource_download_events").select("resource_id,downloaded_at").gte("downloaded_at", window.start).lte("downloaded_at", window.end),
    client.from("platform_analytics_events").select("metric_key,occurred_at,grade_number,topic_slug,lesson_slug,outcome,quantity").gte("occurred_at", window.start).lte("occurred_at", window.end),
    client.from("admin_audit_log").select("action,target,created_at").gte("created_at", window.start).lte("created_at", window.end).order("created_at", { ascending: false }).limit(200),
    loadServerFeatureFlags(),
    client.from("platform_retention_runs").select("completed_at,deleted_event_count").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
    client.rpc("get_platform_storage_usage"),
    client.rpc("get_platform_migration_status")
  ]);
  const queryResults = [accounts, subscriptions, webhooks, launches, downloads, aggregateEvents, audit, retention, storage, migration];
  const partial = queryResults.some((result) => result.error) || flagsResult.state === "unavailable";
  const accountRows = rows(accounts.data); const subscriptionRows = rows(subscriptions.data); const webhookRows = rows(webhooks.data);
  const launchRows = rows(launches.data); const downloadRows = rows(downloads.data); const signalRows = rows(aggregateEvents.data);
  const within = (value: unknown) => { const parsed = date(value); return parsed !== null && parsed >= window.start && parsed <= window.end; };
  const accountGrowth = accountRows.filter((row) => within(row.created_at)).length;
  const trials = accountRows.filter((row) => within(row.trial_redeemed_at)).length;
  const conversions = subscriptionRows.filter((row) => within(row.first_paid_at)).length;
  const cancellations = subscriptionRows.filter((row) => within(row.canceled_at)).length;
  const failedPayments = subscriptionRows.filter((row) => within(row.last_payment_failed_at)).length;
  const activeSubscriptions = subscriptionRows.filter((row) => ["active", "trialing"].includes(str(row.subscription_status))).length;
  const quantity = (key: string, outcome?: string) => signalRows.filter((row) => row.metric_key === key && (!outcome || row.outcome === outcome)).reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);

  const resourceIds = [...new Set([...launchRows, ...downloadRows].map((row) => str(row.resource_id)).filter(Boolean))];
  const resourceTypes = resourceIds.length ? await client.from("content_resources").select("id,resource_type").in("id", resourceIds) : { data: [], error: null };
  const assignments = resourceIds.length ? await client.from("lesson_resource_assignments").select("resource_id,lesson_id").in("resource_id", resourceIds) : { data: [], error: null };
  const lessonIds = [...new Set(rows(assignments.data).map((row) => str(row.lesson_id)).filter(Boolean))];
  const lessons = lessonIds.length ? await client.from("content_lessons").select("id,topic_id,title,slug").in("id", lessonIds) : { data: [], error: null };
  const topicIds = [...new Set(rows(lessons.data).map((row) => str(row.topic_id)).filter(Boolean))];
  const topics = topicIds.length ? await client.from("content_topics").select("id,grade_id,title,slug").in("id", topicIds) : { data: [], error: null };
  const gradeIds = [...new Set(rows(topics.data).map((row) => str(row.grade_id)).filter(Boolean))];
  const grades = gradeIds.length ? await client.from("content_grades").select("id,grade_number,title").in("id", gradeIds) : { data: [], error: null };
  const hierarchyError = [resourceTypes, assignments, lessons, topics, grades].some((result) => result.error);
  const typeByResource = new Map(rows(resourceTypes.data).map((row) => [str(row.id), str(row.resource_type)]));
  const assignmentByResource = new Map(rows(assignments.data).map((row) => [str(row.resource_id), str(row.lesson_id)]));
  const lessonById = new Map(rows(lessons.data).map((row) => [str(row.id), row]));
  const topicById = new Map(rows(topics.data).map((row) => [str(row.id), row]));
  const gradeById = new Map(rows(grades.data).map((row) => [str(row.id), row]));
  const gradeCounts = new Map<string, number>(); const topicCounts = new Map<string, number>(); const lessonCounts = new Map<string, number>();
  const add = (map: Map<string, number>, key: string, value = 1) => { if (key) map.set(key, (map.get(key) ?? 0) + value); };
  for (const event of [...launchRows, ...downloadRows]) {
    const lesson = lessonById.get(assignmentByResource.get(str(event.resource_id)) ?? ""); const topic = topicById.get(str(lesson?.topic_id)); const grade = gradeById.get(str(topic?.grade_id));
    add(gradeCounts, str(grade?.title)); add(topicCounts, str(topic?.title)); add(lessonCounts, str(lesson?.title));
  }
  for (const event of signalRows) { const value = Number(event.quantity) || 0; add(gradeCounts, event.grade_number ? `Grade ${event.grade_number}` : "", value); add(topicCounts, str(event.topic_slug), value); add(lessonCounts, str(event.lesson_slug), value); }
  const homeworkDownloads = downloadRows.filter((row) => typeByResource.get(str(row.resource_id))?.startsWith("homework_")).length;
  const quizDownloads = downloadRows.filter((row) => typeByResource.get(str(row.resource_id))?.startsWith("quiz_")).length;
  const webhookFailed = webhookRows.filter((row) => ["retryable_failure", "manual_review", "failed"].includes(str(row.processing_state))).length;
  const webhookPending = webhookRows.filter((row) => ["received", "processing", "retryable_failure", "manual_review"].includes(str(row.processing_state))).length;
  const webhookSuccess = webhookRows.filter((row) => ["processed", "ignored"].includes(str(row.processing_state))).length;
  const emailSuccess = quantity("email-confirmation-success") + quantity("email-recovery-success");
  const emailFailure = quantity("email-confirmation-failure") + quantity("email-recovery-failure");
  const storageRows = rows(storage.data); const storageObjects = storage.error ? null : storageRows.reduce((sum, row) => sum + (Number(row.object_count) || 0), 0); const storageBytes = storage.error ? null : storageRows.reduce((sum, row) => sum + (Number(row.total_bytes) || 0), 0);
  const migrationRow = rows(migration.data)[0];
  const vercelErrors = quantity("vercel-error", "failure"); const supabaseErrors = quantity("supabase-error", "failure");
  const providers: ProviderHealth[] = [
    { provider: "Application", state: partial || hierarchyError ? "attention" : "healthy", detail: partial || hierarchyError ? "One or more server-owned signals are unavailable." : "All required server-owned queries completed." },
    { provider: "Email", state: emailSuccess + emailFailure === 0 ? "no-signal" : emailFailure ? "attention" : "healthy", detail: emailSuccess + emailFailure === 0 ? "No confirmation or recovery delivery signal is available." : `${emailSuccess} successful · ${emailFailure} failed` },
    { provider: "Stripe webhooks", state: webhookRows.length === 0 ? "no-signal" : webhookFailed ? "attention" : "healthy", detail: webhookRows.length === 0 ? "No webhook event exists in this range." : `${webhookSuccess} processed · ${webhookFailed} require attention` },
    { provider: "Vercel", state: vercelErrors ? "attention" : "no-signal", detail: vercelErrors ? `${vercelErrors} captured error signals` : "No connected Vercel error feed; absence is not health proof." },
    { provider: "Supabase", state: supabaseErrors ? "attention" : partial ? "unavailable" : "healthy", detail: supabaseErrors ? `${supabaseErrors} captured error signals` : partial ? "Database health could not be fully verified." : "Required database queries completed." },
    { provider: "Storage", state: storageObjects === null ? "unavailable" : "healthy", detail: storageObjects === null ? "Usage could not be read." : `${storageObjects} private objects accounted for.` }
  ];
  return {
    state: partial || hierarchyError ? "partial" : "ready", range,
    metrics: [
      { key: "account-growth", label: "Account growth", value: accountGrowth, detail: "Adult-owned consumer accounts created" },
      { key: "trials", label: "Trials", value: trials, detail: "One-time trials redeemed" },
      { key: "conversions", label: "Conversions", value: conversions, detail: "First verified paid events" },
      { key: "active-subscriptions", label: "Active subscriptions", value: activeSubscriptions, detail: "Current authoritative projections" },
      { key: "cancellations", label: "Cancellations", value: cancellations, detail: "Provider-confirmed cancellations" },
      { key: "failed-payments", label: "Failed payments", value: failedPayments, detail: "Provider-confirmed payment failures" },
      { key: "game-launches", label: "Game launches", value: launchRows.length, detail: "Entitlement-authorized launches" },
      { key: "game-completions", label: "Game completions", value: quantity("game-completion"), detail: quantity("game-completion") ? "Aggregate completion signals" : "No completion signal is currently available" },
      { key: "homework-downloads", label: "Homework downloads", value: homeworkDownloads, detail: "Entitlement-authorized downloads" },
      { key: "quiz-downloads", label: "Quiz downloads", value: quizDownloads, detail: "Entitlement-authorized downloads" },
      { key: "map-prep-launches", label: "MAP Prep launches", value: quantity("map-prep-launch"), detail: "Outbound launches to the separate application" },
      { key: "admin-activity", label: "Admin activity", value: rows(audit.data).length, detail: "Immutable owner audit events" }
    ],
    popular: { grades: top(gradeCounts), topics: top(topicCounts), lessons: top(lessonCounts) }, providers,
    build: { id: environment.buildId, environment: environment.identity, migrationCount: migrationRow ? Number(migrationRow.applied_count) : null, latestMigration: migrationRow ? str(migrationRow.latest_version) || null : null },
    storage: { objects: storageObjects, bytes: storageBytes, buckets: storage.error ? null : storageRows.length }, webhookQueue: { pending: webhooks.error ? null : webhookPending, failed: webhooks.error ? null : webhookFailed },
    flags: flagsResult.flags, retention: retention.data ? { completedAt: retention.data.completed_at, deletedCount: retention.data.deleted_event_count } : null,
    audit: rows(audit.data).map((row) => ({ action: str(row.action), target: str(row.target) || null, createdAt: str(row.created_at) }))
  };
}

export function aggregateAnalyticsCsv(snapshot: AdminAnalyticsOperationsSnapshot): string {
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [["category", "key", "label", "value", "from", "to"], ...snapshot.metrics.map((metric) => ["metric", metric.key, metric.label, metric.value ?? "unavailable", snapshot.range.from, snapshot.range.to])];
  for (const [kind, values] of Object.entries(snapshot.popular)) for (const item of values) lines.push(["popular", kind, item.label, item.value, snapshot.range.from, snapshot.range.to]);
  return lines.map((line) => line.map(escape).join(",")).join("\r\n") + "\r\n";
}

export function sanitizedAuditCsv(snapshot: AdminAnalyticsOperationsSnapshot): string {
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [["occurred_at", "action", "target"], ...snapshot.audit.map((event) => [event.createdAt, event.action, event.target ?? ""])].map((line) => line.map(escape).join(",")).join("\r\n") + "\r\n";
}
