import { describe, expect, it, vi } from "vitest";

import { parseConsumerBillingConfiguration } from "./consumer-config";
import type { ConsumerBillingEvent, ConsumerBillingSubscription } from "./consumer-models";
import type { ConsumerBillingProvider } from "./consumer-provider";
import type { SupabaseConsumerBillingRepository } from "./consumer-repository";
import { processConsumerBillingWebhook } from "./consumer-webhook";

const USER_ID = "90000000-0000-0000-0000-000000000001";
const RECEIPT_ID = "70000000-0000-0000-0000-000000000001";
const source = {
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
};
const config = parseConsumerBillingConfiguration(source);
const legacyConfig = parseConsumerBillingConfiguration({ ...source, STRIPE_LEGACY_PRICE_IDS_MATHNEXA_MONTHLY: "price_legacy456" });

const liveConfig = parseConsumerBillingConfiguration({
  MVH_APP_ENVIRONMENT: "production-platform",
  MVH_STRIPE_MODE: "live",
  MVH_COMMERCIAL_ACTIVATION: "live",
  MVH_EMAIL_DELIVERY: "transactional-verified",
  MVH_FIXTURE_POLICY: "forbidden",
  MVH_IDENTITY_MODEL: "consumer-v1",
  MVH_LEGAL_REVIEW: "owner-approved",
  MVH_TERMS_VERSION: "2026-08-01",
  MVH_PRIVACY_VERSION: "2026-08-01",
  MVH_CANCELLATION_POLICY_VERSION: "2026-08-01",
  MVH_REFUND_POLICY_VERSION: "2026-08-01",
  MVH_SUPPORT_EMAIL: "support@mathnexa.com",
  MVH_APPLICATION_ORIGIN: "https://mathnexa.com",
  MVH_SUBSCRIBER_MANAGEMENT_ORIGIN: "https://mathnexa-platform-production.vercel.app",
  BILLING_ENABLED: "true",
  BILLING_PROVIDER: "stripe",
  BILLING_LIVE_ACTIVATION: "owner-approved",
  STRIPE_MODE: "live",
  STRIPE_API_VERSION: "2026-07-29.dahlia",
  STRIPE_PUBLISHABLE_KEY: ["pk", "live", "fixture12345"].join("_"),
  STRIPE_SECRET_KEY: ["sk", "live", "fixture12345"].join("_"),
  STRIPE_WEBHOOK_SECRET: "whsec_fixture12345",
  STRIPE_PRODUCT_MATHNEXA: "prod_mathnexa123",
  STRIPE_PRICE_MATHNEXA_MONTHLY: "price_mathnexa123",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_mathnexa123",
  BILLING_APP_BASE_URL: "https://mathnexa.com",
  BILLING_PORTAL_ENABLED: "true",
  BILLING_WEBHOOK_ENABLED: "true",
  BILLING_EMERGENCY_DEFAULT_DENY: "false",
  BILLING_RENEWAL_GRACE_DAYS: "7",
  BILLING_REFUND_REVIEW_DAYS: "7",
  BILLING_AUTOMATIC_REFUNDS: "false"
});

const subscription: ConsumerBillingSubscription = {
  id: "sub_fixture123456",
  customerId: "cus_fixture123456",
  livemode: false,
  status: "active",
  price: {
    id: config.priceId,
    productId: config.productId,
    active: true,
    livemode: false,
    currency: "usd",
    amountMinorUnits: 599,
    interval: "month",
    intervalCount: 1,
    usageType: "licensed"
  },
  quantity: 1,
  currentPeriodStart: "2026-07-31T12:00:00.000Z",
  currentPeriodEnd: "2026-08-31T12:00:00.000Z",
  cancelAtPeriodEnd: false,
  canceledAt: null,
  endedAt: null,
  trialStart: null,
  trialEnd: null,
  latestInvoiceId: "in_fixture123456",
  ownerUserId: USER_ID
};

const oldCanceled: ConsumerBillingSubscription = {
  ...subscription,
  id: "sub_fixture000111",
  status: "canceled",
  currentPeriodStart: "2026-05-31T12:00:00.000Z",
  currentPeriodEnd: "2026-06-30T12:00:00.000Z",
  canceledAt: "2026-06-15T12:00:00.000Z",
  endedAt: "2026-06-30T12:00:00.000Z",
  latestInvoiceId: null
};

function event(type = "customer.subscription.updated", overrides: Partial<ConsumerBillingEvent> = {}): ConsumerBillingEvent {
  return {
    id: "evt_fixture123456",
    type,
    livemode: false,
    apiVersion: config.apiVersion,
    createdAt: "2026-07-31T12:00:00.000Z",
    objectId: type.startsWith("invoice.") ? "in_fixture123456" : subscription.id,
    customerId: type.startsWith("invoice.") ? null : subscription.customerId,
    subscriptionId: type.startsWith("invoice.") ? null : subscription.id,
    ownerUserId: USER_ID,
    ...overrides
  };
}

function dependencies(currentEvent = event(), options: Readonly<{ subscriptions?: readonly ConsumerBillingSubscription[]; retrieved?: ConsumerBillingSubscription }> = {}) {
  const authoritativeSubscription = options.retrieved ?? (currentEvent.livemode
    ? { ...subscription, livemode: true, price: { ...subscription.price!, livemode: true } }
    : subscription);
  const provider = {
    constructVerifiedEvent: vi.fn((_payload, signature) => {
      if (signature !== "valid") throw new Error("invalid");
      return currentEvent;
    }),
    retrieveCustomer: vi.fn(async () => ({
      id: subscription.customerId,
      livemode: currentEvent.livemode,
      deleted: false,
      ownerUserId: USER_ID,
      email: null
    })),
    retrieveSubscription: vi.fn(async () => authoritativeSubscription),
    listCustomerSubscriptions: vi.fn(async () => options.subscriptions ?? [authoritativeSubscription]),
    retrieveInvoice: vi.fn(async () => ({
      id: "in_fixture123456",
      customerId: subscription.customerId,
      subscriptionId: subscription.id,
      livemode: currentEvent.livemode,
      paid: currentEvent.type !== "invoice.payment_failed",
      status: currentEvent.type !== "invoice.payment_failed" ? "paid" : "open",
      paidAt: currentEvent.type !== "invoice.payment_failed" ? "2026-07-31T12:00:00.000Z" : null,
      amountPaidMinorUnits: currentEvent.type !== "invoice.payment_failed" ? 599 : 0
    }))
  } as unknown as ConsumerBillingProvider;
  const repository = {
    registerEvent: vi.fn(async () => ({
      id: RECEIPT_ID,
      state: "received",
      duplicate: false,
      conflict: false
    })),
    claimEvent: vi.fn(async () => true),
    finishEvent: vi.fn(async () => undefined),
    getMappingByCustomer: vi.fn(async () => ({
      id: "70000000-0000-0000-0000-000000000002",
      ownerUserId: USER_ID,
      stripeCustomerId: subscription.customerId,
      environment: currentEvent.livemode ? "live" : "test"
    })),
    synchronizeSubscription: vi.fn(async () => "subscription-active")
  } as unknown as SupabaseConsumerBillingRepository;
  return { provider, repository };
}

const signed = (deps: ReturnType<typeof dependencies>, override: Partial<Parameters<typeof processConsumerBillingWebhook>[0]> = {}) =>
  processConsumerBillingWebhook({ payload: "{\"signed\":true}", signature: "valid", config, ...deps, ...override });

describe("consumer Stripe webhook boundary", () => {
  it("rejects missing, invalid, and live signatures before database mutation", async () => {
    for (const signature of [null, "invalid"]) {
      const deps = dependencies();
      await expect(processConsumerBillingWebhook({
        payload: "{}",
        signature,
        config,
        ...deps
      })).resolves.toMatchObject({ status: 400, body: { state: "invalid-signature" } });
      expect(deps.repository.registerEvent).not.toHaveBeenCalled();
    }
    const deps = dependencies({ ...event(), livemode: true });
    await expect(processConsumerBillingWebhook({
      payload: "{}",
      signature: "valid",
      config,
      ...deps
    })).resolves.toMatchObject({ status: 400, body: { state: "live-event-rejected" } });
    expect(deps.repository.registerEvent).not.toHaveBeenCalled();
  });

  it("rejects Test events in Live and accepts only matching Live provider state", async () => {
    const testInLive = dependencies(event());
    await expect(processConsumerBillingWebhook({ payload: "{}", signature: "valid", config: liveConfig, ...testInLive }))
      .resolves.toMatchObject({ status: 400, body: { state: "test-event-rejected" } });
    expect(testInLive.repository.registerEvent).not.toHaveBeenCalled();

    const liveEvent = { ...event(), livemode: true };
    const matching = dependencies(liveEvent);
    await expect(processConsumerBillingWebhook({ payload: "{\"live\":true}", signature: "valid", config: liveConfig, ...matching }))
      .resolves.toMatchObject({ status: 200, body: { state: "subscription-active" } });
  });

  it("synchronizes only the authoritative retrieved subscription, with the event as the authority timestamp", async () => {
    const deps = dependencies();
    await expect(signed(deps)).resolves.toMatchObject({ status: 200, body: { state: "subscription-active" } });
    expect(deps.provider.retrieveSubscription).toHaveBeenCalledWith(subscription.id);
    expect(deps.repository.synchronizeSubscription).toHaveBeenCalledTimes(1);
    expect(deps.repository.synchronizeSubscription).toHaveBeenCalledWith(expect.objectContaining({
      source: "webhook",
      eventRecordId: RECEIPT_ID,
      eventType: "customer.subscription.updated",
      observedAt: "2026-07-31T12:00:00.000Z",
      ownerUserId: USER_ID,
      subscription,
      graceDays: 7
    }));
  });

  it.each(["invoice.paid", "invoice.payment_failed"])(
    "resolves %s through the authoritative invoice and subscription",
    async (type) => {
      const deps = dependencies(event(type));
      await signed(deps);
      expect(deps.provider.retrieveInvoice).toHaveBeenCalledWith("in_fixture123456");
      expect(deps.repository.synchronizeSubscription).toHaveBeenCalledWith(expect.objectContaining({
        eventType: type,
        subscription
      }));
    }
  );

  it("treats invoice.payment_succeeded as the same renewal signal as invoice.paid", async () => {
    // An endpoint configured with the older event name must still advance the
    // paid period; otherwise renewal sync depends on which box was ticked in
    // the Stripe dashboard.
    const deps = dependencies(event("invoice.payment_succeeded"));
    await expect(signed(deps)).resolves.toMatchObject({ status: 200, body: { state: "subscription-active" } });
    expect(deps.repository.synchronizeSubscription).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "invoice.paid",
      latestInvoicePaidAt: "2026-07-31T12:00:00.000Z"
    }));
  });

  it("rejects an invoice whose retrieved payment state conflicts with the event", async () => {
    const deps = dependencies(event("invoice.paid"));
    (deps.provider.retrieveInvoice as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "in_fixture123456",
      customerId: subscription.customerId,
      subscriptionId: subscription.id,
      livemode: false,
      paid: false,
      status: "open",
      paidAt: null,
      amountPaidMinorUnits: 0
    });
    await expect(signed(deps)).resolves.toMatchObject({ status: 200, body: { state: "manual-review" } });
    expect(deps.repository.finishEvent).toHaveBeenCalledWith(RECEIPT_ID, "manual_review", "invoice_state_conflict");
    expect(deps.repository.synchronizeSubscription).not.toHaveBeenCalled();
  });

  it("acknowledges exact duplicate receipts without repeating synchronization", async () => {
    const deps = dependencies();
    (deps.repository.registerEvent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: RECEIPT_ID,
      state: "processed",
      duplicate: true,
      conflict: false
    });
    await expect(signed(deps)).resolves.toMatchObject({ status: 200, body: { state: "processed" } });
    expect(deps.repository.claimEvent).not.toHaveBeenCalled();
    expect(deps.repository.synchronizeSubscription).not.toHaveBeenCalled();
  });

  it("rejects replay conflicts and reports stale event rejection without access promotion", async () => {
    const conflict = dependencies();
    (conflict.repository.registerEvent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: RECEIPT_ID,
      state: "processed",
      duplicate: true,
      conflict: true
    });
    await expect(signed(conflict, { payload: "{\"altered\":true}" })).resolves.toMatchObject({ status: 409, body: { state: "manual-review" } });

    const stale = dependencies();
    (stale.repository.synchronizeSubscription as ReturnType<typeof vi.fn>).mockResolvedValueOnce("stale_ignored");
    await expect(signed(stale)).resolves.toMatchObject({ status: 200, body: { state: "stale_ignored" } });
  });

  it("fails closed on browser-forged owner or price metadata", async () => {
    const owner = dependencies();
    (owner.repository.getMappingByCustomer as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "70000000-0000-0000-0000-000000000002",
      ownerUserId: "90000000-0000-0000-0000-000000000002",
      stripeCustomerId: subscription.customerId,
      environment: "test"
    });
    await expect(signed(owner)).resolves.toMatchObject({ body: { state: "manual-review" } });
    expect(owner.repository.finishEvent).toHaveBeenCalledWith(RECEIPT_ID, "manual_review", "ownership_conflict");
    expect(owner.repository.synchronizeSubscription).not.toHaveBeenCalled();

    const wrongPrice = dependencies(event(), { retrieved: { ...subscription, price: { ...subscription.price!, amountMinorUnits: 1 } } });
    await expect(signed(wrongPrice)).resolves.toMatchObject({ body: { state: "manual-review" } });
    expect(wrongPrice.repository.finishEvent).toHaveBeenCalledWith(RECEIPT_ID, "manual_review", "projection_conflict");
    expect(wrongPrice.repository.synchronizeSubscription).not.toHaveBeenCalled();
  });

  it("keeps processing when the endpoint renders another API version (drift is reported, not a permanent outage)", async () => {
    // Every authoritative object is re-fetched with the SDK's pinned version;
    // rejecting the event here used to convert a dashboard setting into a
    // silent renewal-sync outage for every customer.
    const deps = dependencies(event("customer.subscription.updated", { apiVersion: "2025-03-31.basil" }));
    await expect(signed(deps)).resolves.toMatchObject({ status: 200, body: { state: "subscription-active" } });
    expect(deps.repository.synchronizeSubscription).toHaveBeenCalledTimes(1);
  });

  it("reviews an unknown provider status instead of coercing it into an ended subscription", async () => {
    const deps = dependencies(event(), { retrieved: { ...subscription, status: null } });
    await expect(signed(deps)).resolves.toMatchObject({ status: 200, body: { state: "manual-review" } });
    expect(deps.repository.finishEvent).toHaveBeenCalledWith(RECEIPT_ID, "manual_review", "unknown_subscription_status");
    expect(deps.repository.synchronizeSubscription).not.toHaveBeenCalled();
  });

  it("keeps a subscriber on a retired legacy price entitled only when that price is explicitly accepted", async () => {
    const legacy: ConsumerBillingSubscription = { ...subscription, price: { ...subscription.price!, id: "price_legacy456", amountMinorUnits: 499 } };
    const accepted = dependencies(event(), { retrieved: legacy });
    await expect(signed(accepted, { config: legacyConfig })).resolves.toMatchObject({ status: 200, body: { state: "subscription-active" } });

    const rejected = dependencies(event(), { retrieved: legacy });
    await expect(signed(rejected)).resolves.toMatchObject({ status: 200, body: { state: "manual-review" } });
    expect(rejected.repository.finishEvent).toHaveBeenCalledWith(RECEIPT_ID, "manual_review", "projection_conflict");
  });

  it("synchronizes a customer's historical subscriptions before the live one so a missed final event cannot block the current subscription", async () => {
    const deps = dependencies(event(), { subscriptions: [subscription, oldCanceled] });
    await expect(signed(deps)).resolves.toMatchObject({ status: 200, body: { state: "subscription-active" } });
    const calls = (deps.repository.synchronizeSubscription as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ source: "reconciliation", eventRecordId: null, subscription: oldCanceled });
    expect(calls[1]).toMatchObject({ source: "webhook", eventRecordId: RECEIPT_ID, subscription });
  });

  it("requires human review when Stripe reports two live subscriptions for one customer", async () => {
    const second: ConsumerBillingSubscription = { ...subscription, id: "sub_fixture222333" };
    const deps = dependencies(event(), { subscriptions: [subscription, second] });
    await expect(signed(deps)).resolves.toMatchObject({ status: 200, body: { state: "manual-review" } });
    expect(deps.repository.finishEvent).toHaveBeenCalledWith(RECEIPT_ID, "manual_review", "duplicate_subscription");
    expect(deps.repository.synchronizeSubscription).not.toHaveBeenCalled();
  });

  it("returns a retryable failure and releases nothing when the provider is unavailable", async () => {
    const deps = dependencies();
    (deps.provider.retrieveSubscription as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("stripe down"));
    await expect(signed(deps)).resolves.toMatchObject({ status: 503, body: { received: false, state: "retryable-failure" } });
    expect(deps.repository.finishEvent).toHaveBeenCalledWith(RECEIPT_ID, "retryable_failure", "provider_unavailable");
    expect(deps.repository.synchronizeSubscription).not.toHaveBeenCalled();
  });
});
