import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConsumerBillingEvent, ConsumerBillingSubscription } from "./consumer-models";
import { COMMERCIAL_POLICY, type CommercialConsentDecision } from "@/lib/commercial/policy";

export type StripeEnvironment = "test" | "live";

export type ConsumerCustomerMapping = Readonly<{
  id: string;
  ownerUserId: string;
  stripeCustomerId: string;
  environment: StripeEnvironment;
}>;

export type ConsumerCommercialAcceptance = Readonly<{
  id: string;
  ownerUserId: string;
  environment: StripeEnvironment;
}>;

export type ConsumerSubscriptionProjection = Readonly<{
  id: string;
  stripeSubscriptionId: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
  firstPaidAt: string | null;
  lastPaymentFailedAt: string | null;
  renewalGraceEndsAt: string | null;
}>;

export class SupabaseConsumerBillingRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly environment: StripeEnvironment
  ) {}

  async getAccount(ownerUserId: string) {
    const { data, error } = await this.client
      .from("consumer_accounts")
      .select("user_id, account_status, trial_redeemed_at, trial_redemption_checkout_hash")
      .eq("user_id", ownerUserId)
      .maybeSingle();
    if (error) throw new Error("Consumer billing database unavailable");
    return data;
  }

  async getCustomerMapping(ownerUserId: string): Promise<ConsumerCustomerMapping | null> {
    const { data, error } = await this.client
      .from("billing_customers")
      .select("id, owner_consumer_id, stripe_customer_id, stripe_environment")
      .eq("owner_consumer_id", ownerUserId)
      .eq("stripe_environment", this.environment)
      .maybeSingle();
    if (error) throw new Error("Consumer billing database unavailable");
    return data ? {
      id: data.id,
      ownerUserId: data.owner_consumer_id,
      stripeCustomerId: data.stripe_customer_id,
      environment: this.environment
    } : null;
  }

  async storeCustomerMapping(ownerUserId: string, stripeCustomerId: string): Promise<ConsumerCustomerMapping> {
    const { data, error } = await this.client
      .from("billing_customers")
      .insert({
        owner_consumer_id: ownerUserId,
        stripe_environment: this.environment,
        stripe_customer_id: stripeCustomerId
      })
      .select("id, owner_consumer_id, stripe_customer_id")
      .single();
    if (error || !data) {
      const winner = await this.getCustomerMapping(ownerUserId);
      if (winner) return winner;
      throw new Error("Consumer billing customer mapping unavailable");
    }
    return {
      id: data.id,
      ownerUserId: data.owner_consumer_id,
      stripeCustomerId: data.stripe_customer_id,
      environment: this.environment
    };
  }

  async getMappingByCustomer(stripeCustomerId: string): Promise<ConsumerCustomerMapping | null> {
    const { data, error } = await this.client
      .from("billing_customers")
      .select("id, owner_consumer_id, stripe_customer_id")
      .eq("stripe_customer_id", stripeCustomerId)
      .eq("stripe_environment", this.environment)
      .maybeSingle();
    if (error) throw new Error("Consumer billing database unavailable");
    return data?.owner_consumer_id ? {
      id: data.id,
      ownerUserId: data.owner_consumer_id,
      stripeCustomerId: data.stripe_customer_id,
      environment: this.environment
    } : null;
  }

  async getCurrentSubscriptions(ownerUserId: string): Promise<readonly ConsumerSubscriptionProjection[]> {
    const { data, error } = await this.client
      .from("billing_subscriptions")
      .select("id, stripe_subscription_id, subscription_status, current_period_end, cancel_at_period_end, trial_end, first_paid_at, last_payment_failed_at, renewal_grace_ends_at")
      .eq("owner_consumer_id", ownerUserId)
      .eq("stripe_environment", this.environment)
      .not("subscription_status", "in", "(canceled,incomplete_expired)");
    if (error) throw new Error("Consumer billing database unavailable");
    return (data ?? []).map((row) => ({
      id: row.id,
      stripeSubscriptionId: row.stripe_subscription_id,
      status: row.subscription_status,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      trialEnd: row.trial_end,
      firstPaidAt: row.first_paid_at,
      lastPaymentFailedAt: row.last_payment_failed_at,
      renewalGraceEndsAt: row.renewal_grace_ends_at
    }));
  }

  async getLatestSubscription(ownerUserId: string): Promise<ConsumerSubscriptionProjection | null> {
    const { data, error } = await this.client
      .from("billing_subscriptions")
      .select("id, stripe_subscription_id, subscription_status, current_period_end, cancel_at_period_end, trial_end, first_paid_at, last_payment_failed_at, renewal_grace_ends_at")
      .eq("owner_consumer_id", ownerUserId)
      .eq("stripe_environment", this.environment)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Consumer billing database unavailable");
    return data ? {
      id: data.id,
      stripeSubscriptionId: data.stripe_subscription_id,
      status: data.subscription_status,
      currentPeriodEnd: data.current_period_end,
      cancelAtPeriodEnd: data.cancel_at_period_end,
      trialEnd: data.trial_end,
      firstPaidAt: data.first_paid_at,
      lastPaymentFailedAt: data.last_payment_failed_at,
      renewalGraceEndsAt: data.renewal_grace_ends_at
    } : null;
  }

  async claimTrial(ownerUserId: string, checkoutHash: string, redeemedAt: string): Promise<string> {
    const { data, error } = await this.client.rpc("claim_consumer_trial_redemption", {
      p_owner_user_id: ownerUserId,
      p_checkout_hash: checkoutHash,
      p_redeemed_at: redeemedAt
    });
    if (error) throw new Error("Consumer trial claim unavailable");
    return String(data);
  }

  async recordCommercialAcceptance(
    ownerUserId: string,
    decision: CommercialConsentDecision
  ): Promise<ConsumerCommercialAcceptance> {
    const { data, error } = await this.client
      .from("consumer_commercial_acceptances")
      .insert({
        owner_user_id: ownerUserId,
        stripe_environment: this.environment,
        product_key: COMMERCIAL_POLICY.productKey,
        amount_minor_units: COMMERCIAL_POLICY.amountMinorUnits,
        currency: COMMERCIAL_POLICY.currency,
        billing_interval: COMMERCIAL_POLICY.interval,
        trial_seconds: COMMERCIAL_POLICY.trialSeconds,
        terms_version: COMMERCIAL_POLICY.termsVersion,
        privacy_version: COMMERCIAL_POLICY.privacyVersion,
        cancellation_policy_version: COMMERCIAL_POLICY.cancellationVersion,
        refund_policy_version: COMMERCIAL_POLICY.refundVersion,
        subscription_terms_accepted: decision.subscriptionTermsAccepted,
        automatic_renewal_accepted: decision.automaticRenewalAccepted,
        trial_accepted: decision.trialAccepted,
        monthly_price_accepted: decision.monthlyPriceAccepted,
        cancellation_policy_accepted: decision.cancellationPolicyAccepted,
        refund_policy_accepted: decision.refundPolicyAccepted,
        privacy_and_terms_accepted: decision.privacyAndTermsAccepted
      })
      .select("id, owner_user_id, stripe_environment")
      .single();
    if (error || !data) throw new Error("Commercial acceptance unavailable");
    if (data.owner_user_id !== ownerUserId || data.stripe_environment !== this.environment) {
      throw new Error("Commercial acceptance ownership conflict");
    }
    return { id: data.id, ownerUserId: data.owner_user_id, environment: this.environment };
  }

  async bindCommercialAcceptance(
    acceptanceId: string,
    ownerUserId: string,
    checkoutHash: string
  ): Promise<boolean> {
    const { data, error } = await this.client.rpc("bind_consumer_checkout_acceptance", {
      p_acceptance_id: acceptanceId,
      p_owner_user_id: ownerUserId,
      p_stripe_environment: this.environment,
      p_checkout_hash: checkoutHash
    });
    if (error) throw new Error("Commercial acceptance binding unavailable");
    return data === true;
  }

  async hasCurrentCommercialAcceptance(ownerUserId: string, checkoutHash: string): Promise<boolean> {
    const { data, error } = await this.client.rpc("has_current_consumer_checkout_acceptance", {
      p_owner_user_id: ownerUserId,
      p_stripe_environment: this.environment,
      p_checkout_hash: checkoutHash
    });
    if (error) throw new Error("Commercial acceptance verification unavailable");
    return data === true;
  }

  async registerEvent(event: ConsumerBillingEvent, payloadSha256: string) {
    const { data, error } = await this.client
      .from("billing_webhook_events")
      .insert({
        stripe_event_id: event.id,
        event_type: event.type,
        stripe_environment: this.environment,
        stripe_object_id: event.objectId,
        event_created_at: event.createdAt,
        payload_sha256: payloadSha256,
        api_version: event.apiVersion
      })
      .select("id, processing_state")
      .single();
    if (!error && data) return { id: data.id, state: data.processing_state, duplicate: false, conflict: false };
    const existing = await this.client
      .from("billing_webhook_events")
      .select("id, processing_state, payload_sha256")
      .eq("stripe_event_id", event.id)
      .eq("stripe_environment", this.environment)
      .maybeSingle();
    if (existing.error || !existing.data) throw new Error("Consumer billing receipt unavailable");
    return {
      id: existing.data.id,
      state: existing.data.processing_state,
      duplicate: true,
      conflict: existing.data.payload_sha256 !== payloadSha256
    };
  }

  async claimEvent(id: string): Promise<boolean> {
    const { data, error } = await this.client.rpc("claim_billing_webhook_event", {
      p_event_record_id: id,
      p_lease_seconds: 30
    });
    if (error) throw new Error("Consumer billing receipt claim unavailable");
    return data === true;
  }

  async finishEvent(
    id: string,
    state: "processed" | "retryable_failure" | "manual_review" | "ignored",
    failureClass: string | null
  ) {
    const { error } = await this.client.rpc("finish_billing_webhook_event", {
      p_event_record_id: id,
      p_state: state,
      p_failure_class: failureClass,
      p_replay: false
    });
    if (error) throw new Error("Consumer billing receipt completion unavailable");
  }

  async applyProjection(input: Readonly<{
    eventRecordId: string;
    eventType: string;
    eventCreatedAt: string;
    ownerUserId: string;
    customerId: string;
    subscription: ConsumerBillingSubscription;
    graceDays: number;
    emergencyDefaultDeny: boolean;
  }>): Promise<string> {
    const { data, error } = await this.client.rpc("apply_consumer_billing_projection", {
      p_event_record_id: input.eventRecordId,
      p_event_type: input.eventType,
      p_owner_user_id: input.ownerUserId,
      p_stripe_environment: this.environment,
      p_stripe_customer_id: input.customerId,
      p_stripe_subscription_id: input.subscription.id,
      p_stripe_price_id: input.subscription.price?.id ?? "",
      p_subscription_status: input.subscription.status ?? "canceled",
      p_current_period_start: input.subscription.currentPeriodStart,
      p_current_period_end: input.subscription.currentPeriodEnd,
      p_cancel_at_period_end: input.subscription.cancelAtPeriodEnd,
      p_canceled_at: input.subscription.canceledAt,
      p_trial_start: input.subscription.trialStart,
      p_trial_end: input.subscription.trialEnd,
      p_event_created_at: input.eventCreatedAt,
      p_grace_days: input.graceDays,
      p_emergency_default_deny: input.emergencyDefaultDeny
    });
    if (error) throw new Error("Consumer billing projection unavailable");
    return String(data);
  }

  async revokeCustomer(eventRecordId: string, ownerUserId: string, eventCreatedAt: string): Promise<string> {
    const { data, error } = await this.client.rpc("revoke_consumer_billing_customer", {
      p_event_record_id: eventRecordId,
      p_owner_user_id: ownerUserId,
      p_stripe_environment: this.environment,
      p_event_created_at: eventCreatedAt
    });
    if (error) throw new Error("Consumer billing revocation unavailable");
    return String(data);
  }
}
