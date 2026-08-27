import "server-only";

import { cache } from "react";

import { withTimeout } from "@/lib/async/with-timeout";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type ServerFeatureFlag = Readonly<{
  key: "maintenance-mode" | "announcement-published" | "checkout-emergency-disabled" | "admin-emergency-disabled";
  enabled: boolean;
  message: string | null;
  version: number;
  updatedAt: string;
}>;

type FlagResult = Readonly<{ state: "ready"; flags: readonly ServerFeatureFlag[] }> | Readonly<{ state: "unavailable"; flags: readonly [] }>;

export async function loadServerFeatureFlags(): Promise<FlagResult> {
  const client = createServiceSupabaseClient();
  if (!client) return { state: "unavailable", flags: [] };
  const result = await client.from("platform_feature_flags").select("flag_key,enabled,message,version,updated_at").order("flag_key");
  if (result.error || !result.data) return { state: "unavailable", flags: [] };
  return {
    state: "ready",
    flags: result.data.map((row) => ({
      key: row.flag_key as ServerFeatureFlag["key"], enabled: row.enabled === true,
      message: typeof row.message === "string" ? row.message : null,
      version: Number(row.version), updatedAt: row.updated_at
    }))
  };
}

export async function inspectAdminEmergencyFlag(): Promise<"enabled" | "disabled" | "unavailable"> {
  const result = await loadServerFeatureFlags();
  if (result.state === "unavailable") return "unavailable";
  const flag = result.flags.find((item) => item.key === "admin-emergency-disabled");
  return !flag ? "unavailable" : flag.enabled ? "enabled" : "disabled";
}

export async function isCheckoutOperational(): Promise<boolean> {
  // Phase 8 rolls out with hosted admin disabled before the migration is applied.
  // In that state the established billing environment variables remain authoritative.
  if (process.env.MVH_ADMIN_ENABLED !== "true") return true;
  const result = await loadServerFeatureFlags();
  if (result.state === "unavailable") return false;
  return !result.flags.some((flag) => flag.enabled && (flag.key === "maintenance-mode" || flag.key === "checkout-emergency-disabled"));
}

// Deduped per request and time-boxed: notices render on every page via the
// shell, must never block first paint, and fail open to "no notices".
export const loadPublicOperationalNotices = cache(
  (): Promise<readonly Readonly<{ kind: "maintenance" | "announcement"; message: string }>[]> =>
    withTimeout(computePublicOperationalNotices(), 3000, [])
);

async function computePublicOperationalNotices(): Promise<readonly Readonly<{ kind: "maintenance" | "announcement"; message: string }>[]> {
  if (process.env.MVH_ADMIN_ENABLED !== "true") return [];
  const result = await loadServerFeatureFlags();
  if (result.state === "unavailable") return [];
  const notices: Array<Readonly<{ kind: "maintenance" | "announcement"; message: string }>> = [];
  for (const flag of result.flags) {
    if (flag.enabled && flag.message && flag.key === "maintenance-mode") notices.push({ kind: "maintenance", message: flag.message });
    if (flag.enabled && flag.message && flag.key === "announcement-published") notices.push({ kind: "announcement", message: flag.message });
  }
  return notices;
}

export async function recordAggregateSignal(input: Readonly<{
  metricKey: "game-completion" | "map-prep-launch" | "email-confirmation-success" | "email-confirmation-failure" |
    "email-recovery-success" | "email-recovery-failure" | "vercel-error" | "supabase-error";
  outcome: "success" | "failure" | "unavailable";
  source: "runtime" | "email" | "vercel" | "supabase" | "system";
  gradeNumber?: number | null;
  topicSlug?: string | null;
  lessonSlug?: string | null;
  quantity?: number;
}>): Promise<boolean> {
  const client = createServiceSupabaseClient();
  if (!client) return false;
  const result = await client.rpc("record_platform_aggregate_event", {
    p_metric_key: input.metricKey, p_occurred_at: new Date().toISOString(),
    p_grade_number: input.gradeNumber ?? null, p_topic_slug: input.topicSlug ?? null,
    p_lesson_slug: input.lessonSlug ?? null, p_outcome: input.outcome,
    p_quantity: input.quantity ?? 1, p_source: input.source
  });
  return !result.error;
}
