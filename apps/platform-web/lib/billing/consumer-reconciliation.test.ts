import { describe, expect, it, vi } from "vitest";

import { parseConsumerBillingConfiguration } from "./consumer-config";
import type { ConsumerBillingSubscription } from "./consumer-models";
import type { ConsumerBillingProvider } from "./consumer-provider";
import { reconcileConsumerBilling, runConsumerReconciliationSweep } from "./consumer-reconciliation";
import type { ConsumerSubscriptionProjection, SupabaseConsumerBillingRepository } from "./consumer-repository";

const USER_ID = "90000000-0000-0000-0000-000000000001";
const config = parseConsumerBillingConfiguration({
  MVH_APP_ENVIRONMENT: "production-platform",
  MVH_ALLOW_LOCAL_PRODUCTION_REHEARSAL: "true",
  MVH_STRIPE_MODE: "test",
  BILLING_ENABLED: "true",
  BILLING_PROVIDER: "fixture",
  STRIPE_MODE: "test",
  STRIPE_API_VERSION: "2026-07-29.dahlia",
  STRIPE_PUBLISHABLE_KEY: "pk_test_fixture12345",
  STRIPE_SECRET_KEY: "sk_test_fixture12345",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture12345",
  STRIPE_PRODUCT_MATHNEXA: "prod_mathnexa123",
  STRIPE_PRICE_MATHNEXA_MONTHLY: "price_mathnexa123",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_mathnexa123",
  BILLING_APP_BASE_URL: "http://127.0.0.1:3000",
  BILLING_CHECKOUT_ENABLED: "true",
  BILLING_PORTAL_ENABLED: "true",
  BILLING_WEBHOOK_ENABLED: "true",
  BILLING_EMERGENCY_DEFAULT_DENY: "false",
  BILLING_RENEWAL_GRACE_DAYS: "7",
  BILLING_REFUND_REVIEW_DAYS: "7",
  BILLING_AUTOMATIC_REFUNDS: "false"
});
const now = new Date("2026-09-07T12:00:00.000Z");
const customer = { id: "cus_fixture123456", livemode: false, deleted: false, ownerUserId: USER_ID, email: null };
const mapping = { id: "70000000-0000-0000-0000-000000000002", ownerUserId: USER_ID, stripeCustomerId: customer.id, environment: "test" as const };

const renewed: ConsumerBillingSubscription = {
  id: "sub_fixture123456", customerId: customer.id, livemode: false, status: "active",
  price: { id: config.priceId, productId: config.productId, active: true, livemode: false, currency: "usd", amountMinorUnits: 599, interval: "month", intervalCount: 1, usageType: "licensed" },
  quantity: 1, currentPeriodStart: "2026-09-01T00:00:00.000Z", currentPeriodEnd: "2026-10-01T00:00:00.000Z",
  cancelAtPeriodEnd: false, canceledAt: null, endedAt: null, trialStart: null, trialEnd: null, latestInvoiceId: "in_fixture_renewal", ownerUserId: USER_ID
};

function row(overrides: Partial<ConsumerSubscriptionProjection> = {}): ConsumerSubscriptionProjection {
  return {
    id: "80000000-0000-0000-0000-000000000001", stripeSubscriptionId: renewed.id, status: "active",
    currentPeriodStart: "2026-08-01T00:00:00.000Z", currentPeriodEnd: "2026-09-01T00:00:00.000Z", cancelAtPeriodEnd: false,
    canceledAt: null, endedAt: null, trialEnd: null, firstPaidAt: "2026-08-01T00:05:00.000Z", lastPaidAt: "2026-08-01T00:05:00.000Z",
    lastPaymentFailedAt: null, renewalGraceEndsAt: null, latestInvoiceId: "in_fixture_first", lastSynchronizedAt: "2026-08-01T00:05:00.000Z",
    lastSynchronizationSource: "webhook", latestAuthoritativeEventCreatedAt: "2026-08-01T00:05:00.000Z", updatedAt: "2026-08-01T00:05:00.000Z",
    ...overrides
  };
}

function harness(options: Readonly<{
  mapping?: typeof mapping | null;
  before?: readonly ConsumerSubscriptionProjection[];
  after?: readonly ConsumerSubscriptionProjection[];
  claimed?: boolean;
  subscriptions?: readonly ConsumerBillingSubscription[];
  providerFailure?: boolean;
}> = {}) {
  const before = options.before ?? [row()];
  const after = options.after ?? [row({ currentPeriodStart: "2026-09-01T00:00:00.000Z", currentPeriodEnd: "2026-10-01T00:00:00.000Z", lastSynchronizedAt: now.toISOString(), lastSynchronizationSource: "reconciliation" })];
  const getSubscriptions = vi.fn().mockResolvedValueOnce(before).mockResolvedValue(after);
  const repository = {
    getCustomerMapping: vi.fn(async () => options.mapping === undefined ? mapping : options.mapping),
    getSubscriptions,
    claimReconciliationAttempt: vi.fn(async () => options.claimed ?? true),
    synchronizeSubscription: vi.fn(async () => "subscription-active"),
    listSubscriptionsDueForReconciliation: vi.fn(async () => [])
  } as unknown as SupabaseConsumerBillingRepository;
  const provider = {
    retrieveCustomer: vi.fn(async () => { if (options.providerFailure) throw new Error("stripe unavailable"); return customer; }),
    listCustomerSubscriptions: vi.fn(async () => options.subscriptions ?? [renewed]),
    retrieveInvoice: vi.fn(async () => ({ id: "in_fixture_renewal", customerId: customer.id, subscriptionId: renewed.id, livemode: false, paid: true, status: "paid", paidAt: "2026-09-01T00:03:00.000Z", amountPaidMinorUnits: 599 }))
  } as unknown as ConsumerBillingProvider;
  return { repository, provider };
}

const run = (deps: ReturnType<typeof harness>, overrides: Partial<Parameters<typeof reconcileConsumerBilling>[0]> = {}) =>
  reconcileConsumerBilling({ ownerUserId: USER_ID, config, source: "reconciliation", now, ...deps, ...overrides });

describe("on-demand Stripe reconciliation", () => {
  it("repairs a stale local period from the authoritative subscription without any webhook (the missed-renewal case)", async () => {
    const deps = harness();
    const outcome = await run(deps);
    expect(outcome).toMatchObject({ outcome: "synchronized", changed: true, states: ["subscription-active"] });
    expect(deps.provider.retrieveInvoice).toHaveBeenCalledWith("in_fixture_renewal");
    expect(deps.repository.synchronizeSubscription).toHaveBeenCalledWith(expect.objectContaining({
      source: "reconciliation", eventRecordId: null, eventType: null, observedAt: now.toISOString(),
      subscription: renewed, latestInvoicePaidAt: "2026-09-01T00:03:00.000Z"
    }));
    expect(outcome.lastSynchronizedAt).toBe(now.toISOString());
  });

  it("reports no change when the provider agrees with the local record", async () => {
    const same = [row()];
    const deps = harness({ before: same, after: same });
    await expect(run(deps)).resolves.toMatchObject({ outcome: "synchronized", changed: false });
  });

  it("does nothing for an account with no billing customer and never calls the provider", async () => {
    const deps = harness({ mapping: null });
    await expect(run(deps)).resolves.toMatchObject({ outcome: "no-customer", changed: false });
    expect(deps.provider.retrieveCustomer).not.toHaveBeenCalled();
    expect(deps.repository.claimReconciliationAttempt).not.toHaveBeenCalled();
  });

  it("is throttled per customer so a refreshing customer cannot drive provider traffic", async () => {
    const deps = harness({ claimed: false });
    const outcome = await run(deps);
    expect(outcome).toMatchObject({ outcome: "throttled", changed: false, lastSynchronizedAt: "2026-08-01T00:05:00.000Z" });
    expect(deps.provider.retrieveCustomer).not.toHaveBeenCalled();
    expect(deps.repository.synchronizeSubscription).not.toHaveBeenCalled();
  });

  it("bypasses the throttle for an explicit owner or scheduled request", async () => {
    const deps = harness({ claimed: false });
    await expect(run(deps, { source: "admin", force: true })).resolves.toMatchObject({ outcome: "synchronized", changed: true });
    expect(deps.repository.claimReconciliationAttempt).not.toHaveBeenCalled();
    expect(deps.repository.synchronizeSubscription).toHaveBeenCalledWith(expect.objectContaining({ source: "admin" }));
  });

  it("reports the provider being unavailable instead of throwing or changing anything", async () => {
    const deps = harness({ providerFailure: true });
    await expect(run(deps)).resolves.toMatchObject({ outcome: "unavailable", changed: false, lastSynchronizedAt: "2026-08-01T00:05:00.000Z" });
    expect(deps.repository.synchronizeSubscription).not.toHaveBeenCalled();
  });

  it("refuses to pick between two live subscriptions and leaves that to a human", async () => {
    const twin = { ...renewed, id: "sub_fixture222333" };
    const historical: ConsumerBillingSubscription = { ...renewed, id: "sub_fixture000111", status: "canceled", endedAt: "2026-07-01T00:00:00.000Z", canceledAt: "2026-06-20T00:00:00.000Z", currentPeriodStart: "2026-06-01T00:00:00.000Z", currentPeriodEnd: "2026-07-01T00:00:00.000Z" };
    const deps = harness({ subscriptions: [renewed, twin, historical] });
    await expect(run(deps)).resolves.toMatchObject({ outcome: "manual-review", detail: "duplicate_live_subscriptions" });
    const synced = (deps.repository.synchronizeSubscription as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0].subscription.id);
    expect(synced).toEqual([historical.id]);
  });

  it("reports no subscriptions at the provider without inventing a projection", async () => {
    const deps = harness({ subscriptions: [] });
    await expect(run(deps)).resolves.toMatchObject({ outcome: "no-subscriptions", changed: false });
    expect(deps.repository.synchronizeSubscription).not.toHaveBeenCalled();
  });
});

describe("scheduled reconciliation sweep", () => {
  it("re-checks each due owner once and reports counts only", async () => {
    const deps = harness();
    (deps.repository.listSubscriptionsDueForReconciliation as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { ownerUserId: USER_ID, stripeSubscriptionId: renewed.id, status: "active", currentPeriodEnd: "2026-09-01T00:00:00.000Z", lastSynchronizedAt: null },
      { ownerUserId: USER_ID, stripeSubscriptionId: "sub_fixture_dup", status: "active", currentPeriodEnd: "2026-09-01T00:00:00.000Z", lastSynchronizedAt: null }
    ]);
    const summary = await runConsumerReconciliationSweep({ ...deps, config, limit: 50, now });
    expect(summary).toEqual({ checked: 1, synchronized: 1, repaired: 1, manualReview: 0, unavailable: 0, noSubscriptions: 0, candidates: 2, truncated: false });
    expect(Object.keys(summary).sort()).toEqual(["candidates", "checked", "manualReview", "noSubscriptions", "repaired", "synchronized", "truncated", "unavailable"]);
  });
});
