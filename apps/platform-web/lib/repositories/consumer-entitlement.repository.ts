import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameEntitlementEvidence } from "@math-vocabulary-hunt/platform-core";

import type { ConsumerAccountRecord } from "@/lib/auth/consumer-context";

export class SupabaseConsumerEntitlementRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getEvidence(account: ConsumerAccountRecord): Promise<GameEntitlementEvidence | Record<string, never>> {
    const complimentary = await this.client.rpc("get_own_active_complimentary_entitlement");
    const complimentaryExpiry = Array.isArray(complimentary.data) && complimentary.data.length === 1
      ? complimentary.data[0]?.expires_at : null;
    if (!complimentary.error && typeof complimentaryExpiry === "string" &&
      Number.isFinite(Date.parse(complimentaryExpiry)) && Date.parse(complimentaryExpiry) > Date.now()) {
      return { state: "subscription-active", periodEndsAt: complimentaryExpiry };
    }
    const { data, error } = await this.client
      .from("consumer_game_entitlements")
      .select("entitlement_state, trial_started_at, trial_ends_at, current_period_ends_at, grace_ends_at")
      .eq("user_id", account.userId)
      .maybeSingle();
    if (error) return {};
    if (!data) return { state: "no-entitlement", trialRedeemedAt: account.trialRedeemedAt };

    if (data.entitlement_state === "trial-pending" && account.trialRedeemedAt) {
      return { state: "trial-pending", trialRedeemedAt: account.trialRedeemedAt };
    }
    if (data.entitlement_state === "trial-active" && account.trialRedeemedAt && data.trial_started_at && data.trial_ends_at) {
      return { state: "trial-active", trialRedeemedAt: account.trialRedeemedAt, startsAt: data.trial_started_at, endsAt: data.trial_ends_at };
    }
    if (data.entitlement_state === "trial-expired" && account.trialRedeemedAt && data.trial_ends_at) {
      return { state: "trial-expired", trialRedeemedAt: account.trialRedeemedAt, endedAt: data.trial_ends_at };
    }
    if (data.entitlement_state === "subscription-active" && data.current_period_ends_at) {
      return { state: "subscription-active", periodEndsAt: data.current_period_ends_at };
    }
    if (data.entitlement_state === "subscription-past-due") {
      return { state: "subscription-past-due", periodEndsAt: data.current_period_ends_at };
    }
    if (data.entitlement_state === "subscription-grace-period" && data.current_period_ends_at && data.grace_ends_at) {
      return {
        state: "subscription-grace-period",
        periodEndsAt: data.current_period_ends_at,
        graceEndsAt: data.grace_ends_at
      };
    }
    if (data.entitlement_state === "subscription-canceled-through-period-end" && data.current_period_ends_at) {
      return { state: "subscription-canceled-through-period-end", periodEndsAt: data.current_period_ends_at };
    }
    if (data.entitlement_state === "subscription-expired" && data.current_period_ends_at) {
      return { state: "subscription-expired", endedAt: data.current_period_ends_at };
    }
    return {};
  }
}
