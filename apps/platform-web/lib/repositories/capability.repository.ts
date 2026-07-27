import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isBillingPlanKey, type BillingPlanKey } from "@math-vocabulary-hunt/platform-core";

export type CapabilityUsageSnapshot = Readonly<{
  planKey: BillingPlanKey;
  planExpiresAt: string | null;
  activeClassCount: number;
  activeClassLimit: number;
  activeActivityCount: number;
  activeActivityLimit: number;
}>;

function integer(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

export class SupabaseCapabilityRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getUsage(): Promise<CapabilityUsageSnapshot | null> {
    const { data, error } = await this.client.rpc("get_teacher_capability_usage");
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row || typeof row !== "object") return null;
    const value = row as Record<string, unknown>;
    const activeClassCount = integer(value.active_class_count);
    const activeClassLimit = integer(value.active_class_limit);
    const activeActivityCount = integer(value.active_activity_count);
    const activeActivityLimit = integer(value.active_activity_limit);
    const expiresAt = value.plan_expires_at === null ? null : typeof value.plan_expires_at === "string" && Number.isFinite(Date.parse(value.plan_expires_at)) ? value.plan_expires_at : undefined;
    if (!isBillingPlanKey(value.plan_key) || expiresAt === undefined || activeClassCount === null || activeClassLimit === null || activeActivityCount === null || activeActivityLimit === null) return null;
    if ((value.plan_key === "free") !== (expiresAt === null)) return null;
    return Object.freeze({
      planKey: value.plan_key,
      planExpiresAt: expiresAt,
      activeClassCount,
      activeClassLimit,
      activeActivityCount,
      activeActivityLimit
    });
  }
}
