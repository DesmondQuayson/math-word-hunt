import "server-only";

import { isTerminalConsumerSubscriptionStatus } from "@math-vocabulary-hunt/platform-core";

import type { ConsumerBillingConfiguration } from "./consumer-config";
import {
  MATHNEXA_MONTHLY_AMOUNT,
  type ConsumerBillingCustomer,
  type ConsumerBillingInvoice,
  type ConsumerBillingSubscription
} from "./consumer-models";
import { emitBillingLifecycleEvent, redactProviderReference } from "./consumer-observability";
import type {
  SubscriptionSynchronizationSource,
  SupabaseConsumerBillingRepository
} from "./consumer-repository";

/**
 * Reasons an authoritative Stripe snapshot is refused before it can touch the
 * projection. Each is a manual-review class, never a silent revocation.
 */
export type SubscriptionValidationFailure =
  | "ownership_conflict"
  | "projection_conflict"
  | "unknown_subscription_status";

export function validateAuthoritativeSubscription(input: Readonly<{
  subscription: ConsumerBillingSubscription;
  customer: ConsumerBillingCustomer;
  ownerUserId: string;
  customerId: string;
  config: ConsumerBillingConfiguration;
}>): SubscriptionValidationFailure | null {
  const { subscription, customer, config } = input;
  const expectedLivemode = config.stripeMode === "live";
  if (customer.deleted || customer.livemode !== expectedLivemode || customer.ownerUserId !== input.ownerUserId ||
    subscription.ownerUserId !== input.ownerUserId || subscription.customerId !== input.customerId) {
    return "ownership_conflict";
  }
  if (subscription.status === null) return "unknown_subscription_status";
  const price = subscription.price;
  if (!price || subscription.livemode !== expectedLivemode || price.livemode !== expectedLivemode ||
    subscription.quantity !== 1 || !config.acceptedPriceIds.includes(price.id) ||
    price.productId !== config.productId || price.currency !== "usd" ||
    price.interval !== "month" || price.intervalCount !== 1 || price.usageType !== "licensed" ||
    (price.id === config.priceId && price.amountMinorUnits !== MATHNEXA_MONTHLY_AMOUNT)) {
    return "projection_conflict";
  }
  if ((subscription.status === "active" || subscription.status === "trialing") && !subscription.currentPeriodEnd) {
    return "projection_conflict";
  }
  return null;
}

export type SubscriptionSynchronizationRequest = Readonly<{
  source: SubscriptionSynchronizationSource;
  /** Required for webhook synchronization, null otherwise. */
  eventRecordId: string | null;
  eventType: string | null;
  /** Authority timestamp: event.created for webhooks, fetch time otherwise. */
  observedAt: string;
  ownerUserId: string;
  customerId: string;
  subscription: ConsumerBillingSubscription;
  latestInvoice: ConsumerBillingInvoice | null;
  config: ConsumerBillingConfiguration;
  repository: SupabaseConsumerBillingRepository;
  correlationId: string;
}>;

export const SYNCHRONIZATION_NON_STATE_RESULTS = new Set([
  "stale_ignored",
  "superseded_ignored",
  "conflicting_current_subscription",
  "trial_shape_conflict"
]);

/**
 * Applies one authoritative subscription snapshot through the canonical
 * database synchronizer and reports it. Returns the projected entitlement state
 * or one of the non-state results above.
 */
export async function synchronizeConsumerSubscription(request: SubscriptionSynchronizationRequest): Promise<string> {
  const { subscription, latestInvoice } = request;
  const paidEvidence = latestInvoice && latestInvoice.paid && latestInvoice.subscriptionId === subscription.id &&
    (latestInvoice.amountPaidMinorUnits === null || latestInvoice.amountPaidMinorUnits > 0)
    ? latestInvoice.paidAt
    : null;
  const state = await request.repository.synchronizeSubscription({
    source: request.source,
    eventRecordId: request.eventRecordId,
    eventType: request.eventType,
    observedAt: request.observedAt,
    ownerUserId: request.ownerUserId,
    customerId: request.customerId,
    subscription,
    latestInvoicePaidAt: paidEvidence,
    graceDays: request.config.renewalGraceDays,
    emergencyDefaultDeny: request.config.emergencyDefaultDeny
  });
  const renewal = request.eventType === "invoice.paid" || request.eventType === "invoice.payment_succeeded";
  emitBillingLifecycleEvent(renewal ? "SUBSCRIPTION_RENEWAL_SYNCHRONIZED" : "SUBSCRIPTION_SYNCHRONIZED", {
    source: request.source,
    eventType: request.eventType,
    subscriptionSuffix: redactProviderReference(subscription.id),
    providerStatus: subscription.status,
    periodEnd: subscription.currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    result: state
  }, request.correlationId);
  return state;
}

export type CustomerSynchronizationRequest = Readonly<{
  source: SubscriptionSynchronizationSource;
  ownerUserId: string;
  customerId: string;
  customer: ConsumerBillingCustomer;
  subscriptions: readonly ConsumerBillingSubscription[];
  /** The subscription the triggering event named; synchronized last, with the event's bookkeeping. */
  primary: Readonly<{ subscription: ConsumerBillingSubscription; eventRecordId: string | null; eventType: string | null; observedAt: string }> | null;
  latestInvoice: ConsumerBillingInvoice | null;
  config: ConsumerBillingConfiguration;
  repository: SupabaseConsumerBillingRepository;
  correlationId: string;
  now?: Date;
}>;

export type CustomerSynchronizationResult = Readonly<{
  /** Result for the primary subscription, or for the live subscription when there is no primary. */
  state: string | null;
  states: Readonly<Record<string, string>>;
  skipped: Readonly<Record<string, SubscriptionValidationFailure>>;
}>;

/**
 * Synchronizes every subscription Stripe reports for one customer, terminal
 * ones first so a historical subscription that never received its final event
 * releases the "one current subscription" slot before the live one is written.
 * Snapshots that fail validation are reported and skipped, never projected.
 */
export async function synchronizeCustomerSubscriptions(request: CustomerSynchronizationRequest): Promise<CustomerSynchronizationResult> {
  const observedAt = (request.now ?? new Date()).toISOString();
  const primaryId = request.primary?.subscription.id ?? null;
  const ordered = [...request.subscriptions]
    .filter((subscription) => subscription.id !== primaryId)
    .sort((left, right) => {
      const leftTerminal = isTerminalConsumerSubscriptionStatus(left.status) ? 0 : 1;
      const rightTerminal = isTerminalConsumerSubscriptionStatus(right.status) ? 0 : 1;
      return leftTerminal - rightTerminal;
    });
  const states: Record<string, string> = {};
  const skipped: Record<string, SubscriptionValidationFailure> = {};
  for (const subscription of ordered) {
    const failure = validateAuthoritativeSubscription({
      subscription, customer: request.customer, ownerUserId: request.ownerUserId, customerId: request.customerId, config: request.config
    });
    if (failure) {
      skipped[subscription.id] = failure;
      if (failure === "unknown_subscription_status") {
        emitBillingLifecycleEvent("SUBSCRIPTION_STATUS_UNKNOWN", {
          subscriptionSuffix: redactProviderReference(subscription.id), source: request.source
        }, request.correlationId);
      }
      continue;
    }
    states[subscription.id] = await synchronizeConsumerSubscription({
      source: request.source === "webhook" ? "reconciliation" : request.source,
      eventRecordId: null,
      eventType: null,
      observedAt,
      ownerUserId: request.ownerUserId,
      customerId: request.customerId,
      subscription,
      latestInvoice: request.latestInvoice,
      config: request.config,
      repository: request.repository,
      correlationId: request.correlationId
    });
  }
  let state: string | null = null;
  if (request.primary) {
    const failure = validateAuthoritativeSubscription({
      subscription: request.primary.subscription, customer: request.customer, ownerUserId: request.ownerUserId, customerId: request.customerId, config: request.config
    });
    if (failure) {
      skipped[request.primary.subscription.id] = failure;
    } else {
      state = await synchronizeConsumerSubscription({
        source: request.source,
        eventRecordId: request.primary.eventRecordId,
        eventType: request.primary.eventType,
        observedAt: request.primary.observedAt,
        ownerUserId: request.ownerUserId,
        customerId: request.customerId,
        subscription: request.primary.subscription,
        latestInvoice: request.latestInvoice,
        config: request.config,
        repository: request.repository,
        correlationId: request.correlationId
      });
      states[request.primary.subscription.id] = state;
    }
  } else {
    const live = request.subscriptions.filter((subscription) => !isTerminalConsumerSubscriptionStatus(subscription.status));
    const authoritative = live[0] ?? request.subscriptions[request.subscriptions.length - 1] ?? null;
    state = authoritative ? states[authoritative.id] ?? null : null;
  }
  return Object.freeze({ state, states: Object.freeze(states), skipped: Object.freeze(skipped) });
}
