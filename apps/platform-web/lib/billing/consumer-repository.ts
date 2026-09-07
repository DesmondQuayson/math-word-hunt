import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { selectAuthoritativeConsumerSubscription } from "@math-vocabulary-hunt/platform-core";

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

/**
 * The locally synchronized view of one Stripe subscription. `status` is the
 * provider status as last synchronized; `lastSynchronizedAt` says how fresh
 * that snapshot is and `lastSynchronizationSource` which path wrote it.
 */
export type ConsumerSubscriptionProjection = Readonly<{
  id: string;
  stripeSubscriptionId: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  endedAt: string | null;
  trialEnd: string | null;
  firstPaidAt: string | null;
  lastPaidAt: string | null;
  lastPaymentFailedAt: string | null;
  renewalGraceEndsAt: string | null;
  latestInvoiceId: string | null;
  lastSynchronizedAt: string | null;
  lastSynchronizationSource: string | null;
  latestAuthoritativeEventCreatedAt: string | null;
  updatedAt: string | null;
}>;

export type SubscriptionSynchronizationSource = "webhook" | "reconciliation" | "admin";

export type SubscriptionSynchronizationInput = Readonly<{
  source: SubscriptionSynchronizationSource;
  eventRecordId: string | null;
  eventType: string | null;
  observedAt: string;
  ownerUserId: string;
  customerId: string;
  subscription: ConsumerBillingSubscription;
  latestInvoicePaidAt: string | null;
  graceDays: number;
  emergencyDefaultDeny: boolean;
}>;

export type ReconciliationSweepCandidate = Readonly<{
  ownerUserId: string;
  stripeSubscriptionId: string;
  status: string;
  currentPeriodEnd: string | null;
  lastSynchronizedAt: string | null;
}>;

const SUBSCRIPTION_COLUMNS = "id, stripe_subscription_id, subscription_status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, ended_at, trial_end, first_paid_at, last_paid_at, last_payment_failed_at, renewal_grace_ends_at, latest_invoice_id, last_synchronized_at, last_synchronization_source, latest_authoritative_event_created_at, updated_at";

type SubscriptionRow = Record<string, unknown>;

const text = (value: unknown): string | null => typeof value === "string" && value.length > 0 ? value : null;

function projection(row: SubscriptionRow): ConsumerSubscriptionProjection {
  return {
    id: String(row.id),
    stripeSubscriptionId: String(row.stripe_subscription_id),
    status: String(row.subscription_status),
    currentPeriodStart: text(row.current_period_start),
    currentPeriodEnd: text(row.current_period_end),
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    canceledAt: text(row.canceled_at),
    endedAt: text(row.ended_at),
    trialEnd: text(row.trial_end),
    firstPaidAt: text(row.first_paid_at),
    lastPaidAt: text(row.last_paid_at),
    lastPaymentFailedAt: text(row.last_payment_failed_at),
    renewalGraceEndsAt: text(row.renewal_grace_ends_at),
    latestInvoiceId: text(row.latest_invoice_id),
    lastSynchronizedAt: text(row.last_synchronized_at),
    lastSynchronizationSource: text(row.last_synchronization_source),
    latestAuthoritativeEventCreatedAt: text(row.latest_authoritative_event_created_at),
    updatedAt: text(row.updated_at)
  };
}

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

  /** Every synchronized subscription row of the account, any status. */
  async getSubscriptions(ownerUserId: string): Promise<readonly ConsumerSubscriptionProjection[]> {
    const { data, error } = await this.client
      .from("billing_subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .eq("owner_consumer_id", ownerUserId)
      .eq("stripe_environment", this.environment);
    if (error) throw new Error("Consumer billing database unavailable");
    return ((data ?? []) as SubscriptionRow[]).map(projection);
  }

  async getCurrentSubscriptions(ownerUserId: string): Promise<readonly ConsumerSubscriptionProjection[]> {
    const { data, error } = await this.client
      .from("billing_subscriptions")
      .select(SUBSCRIPTION_COLUMNS)
      .eq("owner_consumer_id", ownerUserId)
      .eq("stripe_environment", this.environment)
      .not("subscription_status", "in", "(canceled,incomplete_expired)");
    if (error) throw new Error("Consumer billing database unavailable");
    return ((data ?? []) as SubscriptionRow[]).map(projection);
  }

  /**
   * The subscription row that speaks for the account: a live subscription over
   * any historical one, then the furthest-reaching period. Never "the most
   * recently updated row" — a late event on an old canceled subscription must
   * not become what the Account page describes.
   */
  async getAuthoritativeSubscription(ownerUserId: string): Promise<ConsumerSubscriptionProjection | null> {
    return selectAuthoritativeConsumerSubscription(await this.getSubscriptions(ownerUserId));
  }

  /** @deprecated Kept for existing callers; delegates to the authoritative selection. */
  async getLatestSubscription(ownerUserId: string): Promise<ConsumerSubscriptionProjection | null> {
    return this.getAuthoritativeSubscription(ownerUserId);
  }

  /**
   * Subscriptions whose local record is due for an authoritative re-check:
   * live rows whose recorded period boundary is about to pass or has passed,
   * and live rows that have not been synchronized recently. Bounded.
   */
  async listSubscriptionsDueForReconciliation(input: Readonly<{
    periodEndBefore: string;
    synchronizedBefore: string;
    limit: number;
  }>): Promise<readonly ReconciliationSweepCandidate[]> {
    const { data, error } = await this.client
      .from("billing_subscriptions")
      .select("owner_consumer_id, stripe_subscription_id, subscription_status, current_period_end, last_synchronized_at")
      .eq("stripe_environment", this.environment)
      .not("owner_consumer_id", "is", null)
      .not("subscription_status", "in", "(canceled,incomplete_expired)")
      .or(`current_period_end.lt.${input.periodEndBefore},last_synchronized_at.is.null,last_synchronized_at.lt.${input.synchronizedBefore}`)
      .order("current_period_end", { ascending: true, nullsFirst: true })
      .limit(Math.max(1, Math.min(input.limit, 200)));
    if (error) throw new Error("Consumer billing database unavailable");
    return ((data ?? []) as SubscriptionRow[]).map((row) => ({
      ownerUserId: String(row.owner_consumer_id),
      stripeSubscriptionId: String(row.stripe_subscription_id),
      status: String(row.subscription_status),
      currentPeriodEnd: text(row.current_period_end),
      lastSynchronizedAt: text(row.last_synchronized_at)
    }));
  }

  /**
   * Wins the right to contact the provider for this customer now, or returns
   * false when another request did so within the minimum interval.
   */
  async claimReconciliationAttempt(ownerUserId: string, minimumIntervalSeconds: number): Promise<boolean> {
    const { data, error } = await this.client.rpc("mark_consumer_billing_reconciliation_attempt", {
      p_owner_user_id: ownerUserId,
      p_stripe_environment: this.environment,
      p_minimum_interval_seconds: minimumIntervalSeconds
    });
    if (error) throw new Error("Consumer billing reconciliation claim unavailable");
    return data === true;
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

  /**
   * The one write path for subscription state. Both webhook processing and
   * reconciliation call this; the database function owns the projection rules,
   * stale-snapshot rejection, and the current-subscription precedence.
   */
  async synchronizeSubscription(input: SubscriptionSynchronizationInput): Promise<string> {
    const { subscription } = input;
    if (subscription.status === null) throw new Error("Consumer billing synchronization refused an unknown status");
    const bothPeriodBounds = subscription.currentPeriodStart !== null && subscription.currentPeriodEnd !== null;
    const { data, error } = await this.client.rpc("synchronize_consumer_billing_subscription", {
      p_source: input.source,
      p_event_record_id: input.eventRecordId,
      p_event_type: input.eventType,
      p_owner_user_id: input.ownerUserId,
      p_stripe_environment: this.environment,
      p_stripe_customer_id: input.customerId,
      p_stripe_subscription_id: subscription.id,
      p_stripe_price_id: subscription.price?.id ?? "",
      p_subscription_status: subscription.status,
      p_current_period_start: bothPeriodBounds ? subscription.currentPeriodStart : null,
      p_current_period_end: bothPeriodBounds ? subscription.currentPeriodEnd : null,
      p_cancel_at_period_end: subscription.cancelAtPeriodEnd,
      p_canceled_at: subscription.canceledAt,
      p_ended_at: subscription.endedAt,
      p_trial_start: subscription.trialStart,
      p_trial_end: subscription.trialEnd,
      p_latest_invoice_id: subscription.latestInvoiceId,
      p_latest_invoice_paid_at: input.latestInvoicePaidAt,
      p_observed_at: input.observedAt,
      p_grace_days: input.graceDays,
      p_emergency_default_deny: input.emergencyDefaultDeny
    });
    if (error) throw new Error("Consumer billing synchronization unavailable");
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
