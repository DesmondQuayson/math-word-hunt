import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type AdminMetric = Readonly<{
  key: string;
  label: string;
  value: number | null;
  detail: string;
}>;

export type AdminAuditSummary = Readonly<{
  action: string;
  target: string | null;
  createdAt: string;
}>;

export type AdminDashboardSnapshot = Readonly<{
  state: "ready" | "unavailable";
  metrics: readonly AdminMetric[];
  emailHealth: "healthy" | "attention" | "no-events" | "unavailable";
  webhookHealth: "healthy" | "attention" | "no-events" | "unavailable";
  systemHealth: "operational" | "degraded";
  recentActions: readonly AdminAuditSummary[];
}>;

const unavailableMetrics: readonly AdminMetric[] = [
  ["games", "Published games", "Content service unavailable"],
  ["drafts", "Draft resources", "Content service unavailable"],
  ["homework", "Homework", "Content service unavailable"],
  ["quizzes", "Quizzes", "Content service unavailable"],
  ["downloads", "Recent downloads", "Download projection unavailable"],
  ["subscribers", "Active subscribers", "Billing projection unavailable"],
  ["trials", "Trials", "Billing projection unavailable"],
  ["failed-payments", "Failed payments", "Billing projection unavailable"]
].map(([key, label, detail]) => ({ key, label, value: null, detail }));

export async function loadAdminDashboard(): Promise<AdminDashboardSnapshot> {
  const client = createServiceSupabaseClient();
  if (!client) return {
    state: "unavailable", metrics: unavailableMetrics, emailHealth: "unavailable",
    webhookHealth: "unavailable", systemHealth: "degraded", recentActions: []
  };

  const [games, drafts, homework, quizzes, downloads, subscribers, trials, failedPayments, webhookFailures, webhookEvents, emailFailures, emailEvents, actions] = await Promise.all([
    client.from("content_resources").select("id", { count: "exact", head: true }).eq("resource_type", "game").eq("publication_state", "published"),
    client.from("content_resources").select("id", { count: "exact", head: true }).eq("publication_state", "draft"),
    client.from("content_resources").select("id", { count: "exact", head: true }).in("resource_type", ["homework_pdf", "homework_answer_key"]).eq("publication_state", "published"),
    client.from("content_resources").select("id", { count: "exact", head: true }).in("resource_type", ["quiz_pdf", "quiz_answer_key"]).eq("publication_state", "published"),
    client.from("resource_download_events").select("id", { count: "exact", head: true }).gte("downloaded_at", new Date(Date.now()-30*86_400_000).toISOString()),
    client.from("billing_subscriptions").select("id", { count: "exact", head: true }).eq("subscription_status", "active"),
    client.from("billing_subscriptions").select("id", { count: "exact", head: true }).eq("subscription_status", "trialing"),
    client.from("billing_subscriptions").select("id", { count: "exact", head: true }).in("subscription_status", ["past_due", "unpaid"]),
    client.from("billing_webhook_events").select("id", { count: "exact", head: true }).in("processing_state", ["failed", "manual_review"]),
    client.from("billing_webhook_events").select("id", { count: "exact", head: true }),
    client.from("platform_analytics_events").select("id", { count: "exact", head: true }).in("metric_key", ["email-confirmation-failure","email-recovery-failure"]),
    client.from("platform_analytics_events").select("id", { count: "exact", head: true }).in("metric_key", ["email-confirmation-success","email-confirmation-failure","email-recovery-success","email-recovery-failure"]),
    client.from("admin_audit_log").select("action,target,created_at").order("created_at", { ascending: false }).limit(6)
  ]);
  const results = [games, drafts, homework, quizzes, downloads, subscribers, trials, failedPayments, webhookFailures, webhookEvents, emailFailures, emailEvents, actions];
  if (results.some((result) => result.error)) return {
    state: "unavailable", metrics: unavailableMetrics, emailHealth: "unavailable",
    webhookHealth: "unavailable", systemHealth: "degraded", recentActions: []
  };

  const count = (value: Readonly<{ count: number | null }>) => value.count ?? 0;
  const webhookCount = count(webhookEvents);
  const failureCount = count(webhookFailures);
  const emailCount = count(emailEvents);
  const emailFailureCount = count(emailFailures);
  return {
    state: "ready",
    metrics: [
      { key: "games", label: "Published games", value: count(games), detail: "Reviewed game resources" },
      { key: "drafts", label: "Draft resources", value: count(drafts), detail: "Awaiting validation or review" },
      { key: "homework", label: "Homework", value: count(homework), detail: "Published PDFs and answer keys" },
      { key: "quizzes", label: "Quizzes", value: count(quizzes), detail: "Published PDFs and answer keys" },
      { key: "downloads", label: "Recent downloads", value: count(downloads), detail: "Entitlement-authorized downloads in the last 30 days" },
      { key: "subscribers", label: "Active subscribers", value: count(subscribers), detail: "Authoritative billing projection" },
      { key: "trials", label: "Trials", value: count(trials), detail: "Currently trialing subscriptions" },
      { key: "failed-payments", label: "Failed payments", value: count(failedPayments), detail: "Past-due or unpaid projections" }
    ],
    emailHealth: emailCount === 0 ? "no-events" : emailFailureCount > 0 ? "attention" : "healthy",
    webhookHealth: webhookCount === 0 ? "no-events" : failureCount > 0 ? "attention" : "healthy",
    systemHealth: "operational",
    recentActions: (actions.data ?? []).map((entry) => ({
      action: entry.action,
      target: entry.target,
      createdAt: entry.created_at
    }))
  };
}
