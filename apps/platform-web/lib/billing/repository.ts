import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { NormalizedBillingEvent, NormalizedSubscription, PaidPlanKey } from "./models";

export type CustomerMapping = Readonly<{ id: string; ownerTeacherId: string; stripeCustomerId: string; environment: "test" | "live" }>;
export type SubscriptionProjection = Readonly<{ id: string; stripeSubscriptionId: string; planKey: PaidPlanKey; status: string; periodEnd: string | null; cancelAtPeriodEnd: boolean }>;

export class SupabaseBillingRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getCustomerMapping(ownerTeacherId: string, environment: "test" | "live"): Promise<CustomerMapping | null> {
    const { data, error } = await this.client.from("billing_customers").select("id, owner_teacher_id, stripe_customer_id, stripe_environment").eq("owner_teacher_id", ownerTeacherId).eq("stripe_environment", environment).maybeSingle();
    if (error) throw new Error("Billing database unavailable");
    if (!data) return null;
    return { id: data.id, ownerTeacherId: data.owner_teacher_id, stripeCustomerId: data.stripe_customer_id, environment: data.stripe_environment };
  }

  async storeCustomerMapping(ownerTeacherId: string, environment: "test" | "live", stripeCustomerId: string): Promise<CustomerMapping> {
    const { data, error } = await this.client.from("billing_customers").insert({ owner_teacher_id: ownerTeacherId, stripe_environment: environment, stripe_customer_id: stripeCustomerId }).select("id, owner_teacher_id, stripe_customer_id, stripe_environment").single();
    if (error || !data) {
      const winner = await this.getCustomerMapping(ownerTeacherId, environment);
      if (winner) return winner;
      throw new Error("Billing customer mapping unavailable");
    }
    return { id: data.id, ownerTeacherId: data.owner_teacher_id, stripeCustomerId: data.stripe_customer_id, environment: data.stripe_environment };
  }

  async getMappingByCustomer(stripeCustomerId: string, environment: "test" | "live"): Promise<CustomerMapping | null> {
    const { data, error } = await this.client.from("billing_customers").select("id, owner_teacher_id, stripe_customer_id, stripe_environment").eq("stripe_customer_id", stripeCustomerId).eq("stripe_environment", environment).maybeSingle();
    if (error) throw new Error("Billing database unavailable");
    return data ? { id: data.id, ownerTeacherId: data.owner_teacher_id, stripeCustomerId: data.stripe_customer_id, environment: data.stripe_environment } : null;
  }

  async getOwnerAccountStatus(ownerTeacherId: string): Promise<string | null> {
    const { data, error } = await this.client.from("teacher_profiles").select("account_status").eq("user_id", ownerTeacherId).maybeSingle();
    if (error) throw new Error("Billing database unavailable");
    return data?.account_status ?? null;
  }

  async getCurrentSubscriptions(ownerTeacherId: string, environment: "test" | "live"): Promise<readonly SubscriptionProjection[]> {
    const { data, error } = await this.client.from("billing_subscriptions").select("id, stripe_subscription_id, plan_key, subscription_status, current_period_end, cancel_at_period_end").eq("owner_teacher_id", ownerTeacherId).eq("stripe_environment", environment).not("subscription_status", "in", "(canceled,incomplete_expired)");
    if (error) throw new Error("Billing database unavailable");
    return (data ?? []).map((row) => ({ id: row.id, stripeSubscriptionId: row.stripe_subscription_id, planKey: row.plan_key, status: row.subscription_status, periodEnd: row.current_period_end, cancelAtPeriodEnd: row.cancel_at_period_end }));
  }

  async getLatestSubscription(ownerTeacherId: string, environment: "test" | "live"): Promise<SubscriptionProjection | null> {
    const { data, error } = await this.client.from("billing_subscriptions").select("id, stripe_subscription_id, plan_key, subscription_status, current_period_end, cancel_at_period_end").eq("owner_teacher_id", ownerTeacherId).eq("stripe_environment", environment).order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("Billing database unavailable");
    return data ? { id: data.id, stripeSubscriptionId: data.stripe_subscription_id, planKey: data.plan_key, status: data.subscription_status, periodEnd: data.current_period_end, cancelAtPeriodEnd: data.cancel_at_period_end } : null;
  }

  async registerEvent(event: NormalizedBillingEvent, payloadSha256: string): Promise<{ id: string; state: string; duplicate: boolean; conflict: boolean }> {
    const environment = event.livemode ? "live" : "test";
    const { data, error } = await this.client.from("billing_webhook_events").insert({ stripe_event_id: event.id, event_type: event.type, stripe_environment: environment, stripe_object_id: event.objectId, event_created_at: event.createdAt, payload_sha256: payloadSha256, api_version: event.apiVersion }).select("id, processing_state").single();
    if (!error && data) return { id: data.id, state: data.processing_state, duplicate: false, conflict: false };
    const existing = await this.client.from("billing_webhook_events").select("id, processing_state, payload_sha256").eq("stripe_event_id", event.id).eq("stripe_environment", environment).maybeSingle();
    if (existing.error || !existing.data) throw new Error("Billing event receipt unavailable");
    return { id: existing.data.id, state: existing.data.processing_state, duplicate: true, conflict: existing.data.payload_sha256 !== payloadSha256 };
  }

  async claimEvent(id: string): Promise<boolean> {
    const { data, error } = await this.client.rpc("claim_billing_webhook_event", { p_event_record_id: id, p_lease_seconds: 30 });
    if (error) throw new Error("Billing event claim unavailable");
    return data === true;
  }

  async finishEvent(id: string, state: "processed" | "retryable_failure" | "manual_review" | "ignored", failureClass: string | null, replay = false) {
    const { error } = await this.client.rpc("finish_billing_webhook_event", { p_event_record_id: id, p_state: state, p_failure_class: failureClass, p_replay: replay });
    if (error) throw new Error("Billing event completion unavailable");
  }

  async applyProjection(input: Readonly<{ eventRecordId: string; eventCreatedAt: string; ownerTeacherId: string; environment: "test" | "live"; customerId: string; subscription: NormalizedSubscription; planKey: PaidPlanKey; eligible: boolean }>): Promise<string> {
    const { data, error } = await this.client.rpc("apply_billing_subscription_projection", {
      p_event_record_id: input.eventRecordId, p_owner_teacher_id: input.ownerTeacherId,
      p_stripe_environment: input.environment, p_stripe_customer_id: input.customerId,
      p_stripe_subscription_id: input.subscription.id, p_plan_key: input.planKey,
      p_stripe_price_id: input.subscription.price?.id ?? "", p_subscription_status: input.subscription.status ?? "canceled",
      p_current_period_start: input.subscription.currentPeriodStart, p_current_period_end: input.subscription.currentPeriodEnd,
      p_cancel_at_period_end: input.subscription.cancelAtPeriodEnd, p_canceled_at: input.subscription.canceledAt,
      p_event_created_at: input.eventCreatedAt, p_entitlement_eligible: input.eligible
    });
    if (error) throw new Error("Billing projection unavailable");
    return String(data);
  }

  async listUnresolved() {
    const { data, error } = await this.client.from("billing_webhook_events").select("id, event_type, processing_state, failure_class, attempt_count, replay_count, received_at").in("processing_state", ["retryable_failure", "manual_review"]).order("received_at");
    if (error) throw new Error("Billing diagnostics unavailable");
    return data ?? [];
  }
}
