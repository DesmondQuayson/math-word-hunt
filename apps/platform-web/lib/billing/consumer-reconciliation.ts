import "server-only";

import { isTerminalConsumerSubscriptionStatus } from "@math-vocabulary-hunt/platform-core";

import type { ConsumerBillingConfiguration } from "./consumer-config";
import type { ConsumerBillingInvoice } from "./consumer-models";
import { emitBillingLifecycleEvent, redactProviderReference } from "./consumer-observability";
import { ConsumerBillingProviderError, type ConsumerBillingProvider } from "./consumer-provider";
import type {
  ConsumerSubscriptionProjection,
  SubscriptionSynchronizationSource,
  SupabaseConsumerBillingRepository
} from "./consumer-repository";
import { synchronizeCustomerSubscriptions } from "./consumer-synchronizer";

/**
 * How often one customer's record may be re-checked against Stripe on demand.
 * A denied customer who keeps refreshing costs at most one provider round trip
 * per interval; concurrent requests are serialized by the database claim.
 */
export const RECONCILIATION_MINIMUM_INTERVAL_SECONDS = 300;

export type ReconciliationOutcome = Readonly<{
  outcome: "synchronized" | "no-customer" | "no-subscriptions" | "throttled" | "unavailable" | "manual-review";
  /** Whether any locally stored subscription row changed status, period, or cancellation flag. */
  changed: boolean;
  states: readonly string[];
  /** Freshest synchronization timestamp across the account's rows after the run. */
  lastSynchronizedAt: string | null;
  detail: string | null;
}>;

export type ReconciliationRequest = Readonly<{
  ownerUserId: string;
  config: ConsumerBillingConfiguration;
  provider: ConsumerBillingProvider;
  repository: SupabaseConsumerBillingRepository;
  source: Exclude<SubscriptionSynchronizationSource, "webhook">;
  /** Bypass the per-customer interval (admin action, scheduled sweep). */
  force?: boolean;
  minimumIntervalSeconds?: number;
  correlationId?: string;
  now?: Date;
}>;

function fingerprint(rows: readonly ConsumerSubscriptionProjection[]): string {
  return [...rows]
    .sort((left, right) => left.stripeSubscriptionId.localeCompare(right.stripeSubscriptionId))
    .map((row) => [row.stripeSubscriptionId, row.status, row.currentPeriodEnd, row.cancelAtPeriodEnd, row.trialEnd, row.renewalGraceEndsAt].join("|"))
    .join("\n");
}

function freshest(rows: readonly ConsumerSubscriptionProjection[]): string | null {
  return rows.reduce<string | null>((latest, row) => {
    if (!row.lastSynchronizedAt) return latest;
    return !latest || Date.parse(row.lastSynchronizedAt) > Date.parse(latest) ? row.lastSynchronizedAt : latest;
  }, null);
}

function entitledLocally(rows: readonly ConsumerSubscriptionProjection[], nowMs: number): boolean {
  return rows.some((row) => !isTerminalConsumerSubscriptionStatus(row.status) &&
    ((row.status === "active" && row.currentPeriodEnd !== null && Date.parse(row.currentPeriodEnd) > nowMs) ||
      (row.status === "trialing" && row.trialEnd !== null && Date.parse(row.trialEnd) > nowMs)));
}

export type ReconciliationSweepSummary = Readonly<{
  checked: number;
  synchronized: number;
  repaired: number;
  manualReview: number;
  unavailable: number;
  noSubscriptions: number;
  candidates: number;
  truncated: boolean;
}>;

/**
 * Scheduled drift detection: re-check every live subscription whose recorded
 * boundary is about to pass or has passed, or that has not been confirmed for
 * two days. Repairs go through the same synchronizer as everything else; the
 * summary carries counts only, never identifiers.
 */
export async function runConsumerReconciliationSweep(input: Readonly<{
  config: ConsumerBillingConfiguration;
  provider: ConsumerBillingProvider;
  repository: SupabaseConsumerBillingRepository;
  limit: number;
  now?: Date;
}>): Promise<ReconciliationSweepSummary> {
  const now = input.now ?? new Date();
  const candidates = await input.repository.listSubscriptionsDueForReconciliation({
    periodEndBefore: new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString(),
    synchronizedBefore: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
    limit: input.limit
  });
  const owners = [...new Set(candidates.map((candidate) => candidate.ownerUserId))];
  const summary = { checked: 0, synchronized: 0, repaired: 0, manualReview: 0, unavailable: 0, noSubscriptions: 0, candidates: candidates.length, truncated: candidates.length >= input.limit };
  for (const ownerUserId of owners) {
    const outcome = await reconcileConsumerBilling({
      ownerUserId, config: input.config, provider: input.provider, repository: input.repository,
      source: "reconciliation", force: true, correlationId: `sweep-${ownerUserId.slice(0, 8)}`, now
    });
    summary.checked += 1;
    if (outcome.outcome === "synchronized") { summary.synchronized += 1; if (outcome.changed) summary.repaired += 1; }
    else if (outcome.outcome === "manual-review") summary.manualReview += 1;
    else if (outcome.outcome === "unavailable") summary.unavailable += 1;
    else if (outcome.outcome === "no-subscriptions" || outcome.outcome === "no-customer") summary.noSubscriptions += 1;
  }
  emitBillingLifecycleEvent("RECONCILIATION_SWEEP_COMPLETED", { ...summary }, `sweep-${now.toISOString().slice(0, 10)}`);
  return Object.freeze(summary);
}

/**
 * Re-reads the customer's subscriptions from Stripe and re-applies the
 * canonical projection. Webhook-only systems drift when an event is lost,
 * rejected, delayed, or delivered to a redirecting host; this is the read
 * path that repairs that drift without anyone editing a database row.
 *
 * It never creates, cancels, refunds, or modifies anything at the provider.
 */
export async function reconcileConsumerBilling(request: ReconciliationRequest): Promise<ReconciliationOutcome> {
  const now = request.now ?? new Date();
  const correlationId = request.correlationId ?? `reconcile-${request.ownerUserId.slice(0, 8)}`;
  const { repository, provider, config } = request;

  const mapping = await repository.getCustomerMapping(request.ownerUserId);
  if (!mapping) return Object.freeze({ outcome: "no-customer", changed: false, states: [], lastSynchronizedAt: null, detail: null });

  const before = await repository.getSubscriptions(request.ownerUserId);
  if (!request.force) {
    const claimed = await repository.claimReconciliationAttempt(
      request.ownerUserId,
      request.minimumIntervalSeconds ?? RECONCILIATION_MINIMUM_INTERVAL_SECONDS
    );
    if (!claimed) {
      return Object.freeze({ outcome: "throttled", changed: false, states: [], lastSynchronizedAt: freshest(before), detail: null });
    }
  }

  try {
    const customer = await provider.retrieveCustomer(mapping.stripeCustomerId);
    const expectedLivemode = config.stripeMode === "live";
    if (customer.deleted || customer.livemode !== expectedLivemode || (customer.ownerUserId !== null && customer.ownerUserId !== request.ownerUserId)) {
      emitBillingLifecycleEvent("ENTITLEMENT_MISMATCH_UNRESOLVED", { source: request.source, reason: "customer_ownership" }, correlationId);
      return Object.freeze({ outcome: "manual-review", changed: false, states: [], lastSynchronizedAt: freshest(before), detail: "customer_ownership" });
    }
    const subscriptions = await provider.listCustomerSubscriptions(mapping.stripeCustomerId);
    if (subscriptions.length === 0) {
      emitBillingLifecycleEvent("SUBSCRIPTION_RECONCILED", { source: request.source, outcome: "no-subscriptions", changed: false }, correlationId);
      return Object.freeze({ outcome: "no-subscriptions", changed: false, states: [], lastSynchronizedAt: freshest(before), detail: null });
    }
    const live = subscriptions.filter((subscription) => !isTerminalConsumerSubscriptionStatus(subscription.status));
    if (live.length > 1) {
      // Two live subscriptions for one customer is double billing at the
      // provider. Historical rows still synchronize; the live pair is reviewed.
      await synchronizeCustomerSubscriptions({
        source: request.source, ownerUserId: request.ownerUserId, customerId: mapping.stripeCustomerId, customer,
        subscriptions: subscriptions.filter((subscription) => isTerminalConsumerSubscriptionStatus(subscription.status)),
        primary: null, latestInvoice: null, config, repository, correlationId, now
      });
      emitBillingLifecycleEvent("ENTITLEMENT_MISMATCH_UNRESOLVED", { source: request.source, reason: "duplicate_live_subscriptions", count: live.length }, correlationId);
      return Object.freeze({ outcome: "manual-review", changed: false, states: [], lastSynchronizedAt: freshest(await repository.getSubscriptions(request.ownerUserId)), detail: "duplicate_live_subscriptions" });
    }

    let latestInvoice: ConsumerBillingInvoice | null = null;
    const current = live[0] ?? null;
    if (current?.latestInvoiceId) {
      try {
        latestInvoice = await provider.retrieveInvoice(current.latestInvoiceId);
      } catch (error) {
        // Paid evidence improves grace classification but is not required to
        // synchronize status and period. A missing invoice must not block repair.
        if (!(error instanceof ConsumerBillingProviderError)) throw error;
        latestInvoice = null;
      }
    }

    const result = await synchronizeCustomerSubscriptions({
      source: request.source, ownerUserId: request.ownerUserId, customerId: mapping.stripeCustomerId, customer,
      subscriptions, primary: null, latestInvoice, config, repository, correlationId, now
    });
    const after = await repository.getSubscriptions(request.ownerUserId);
    const changed = fingerprint(before) !== fingerprint(after);
    const states = Object.values(result.states);
    const skipped = Object.entries(result.skipped);
    const repairedEntitlement = changed && !entitledLocally(before, now.getTime()) && entitledLocally(after, now.getTime());

    emitBillingLifecycleEvent("SUBSCRIPTION_RECONCILED", {
      source: request.source,
      outcome: skipped.length > 0 && states.length === 0 ? "manual-review" : "synchronized",
      changed,
      subscriptionsChecked: subscriptions.length,
      liveSubscriptions: live.length,
      subscriptionSuffix: redactProviderReference(current?.id ?? null),
      states: states.join(","),
      skipped: skipped.map(([, reason]) => reason).join(",")
    }, correlationId);
    if (repairedEntitlement) {
      emitBillingLifecycleEvent("ENTITLEMENT_MISMATCH_REPAIRED", {
        source: request.source,
        subscriptionSuffix: redactProviderReference(current?.id ?? null),
        periodEnd: current?.currentPeriodEnd ?? null,
        providerStatus: current?.status ?? null
      }, correlationId);
    }
    if (skipped.length > 0 && states.length === 0) {
      return Object.freeze({ outcome: "manual-review", changed, states, lastSynchronizedAt: freshest(after), detail: skipped.map(([, reason]) => reason).join(",") });
    }
    return Object.freeze({ outcome: "synchronized", changed, states, lastSynchronizedAt: freshest(after), detail: null });
  } catch {
    emitBillingLifecycleEvent("SUBSCRIPTION_RECONCILIATION_UNAVAILABLE", { source: request.source }, correlationId);
    return Object.freeze({ outcome: "unavailable", changed: false, states: [], lastSynchronizedAt: freshest(before), detail: null });
  }
}
