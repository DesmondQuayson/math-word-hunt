import { describe, expect, it, vi } from "vitest";

import { parseConsumerBillingConfiguration } from "./consumer-config";
import type { ConsumerBillingEvent, ConsumerBillingSubscription } from "./consumer-models";
import type { ConsumerBillingProvider } from "./consumer-provider";
import type { SupabaseConsumerBillingRepository } from "./consumer-repository";
import { processConsumerBillingWebhook } from "./consumer-webhook";

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
  trialStart: null,
  trialEnd: null,
  ownerUserId: USER_ID
};

function event(type = "customer.subscription.updated"): ConsumerBillingEvent {
  return {
    id: "evt_fixture123456",
    type,
    livemode: false,
    apiVersion: config.apiVersion,
    createdAt: "2026-07-31T12:00:00.000Z",
    objectId: type.startsWith("invoice.") ? "in_fixture123456" : subscription.id,
    customerId: type.startsWith("invoice.") ? null : subscription.customerId,
    subscriptionId: type.startsWith("invoice.") ? null : subscription.id,
    ownerUserId: USER_ID
  };
}

function dependencies(currentEvent = event()) {
  const authoritativeSubscription = currentEvent.livemode
    ? { ...subscription, livemode: true, price: { ...subscription.price!, livemode: true } }
    : subscription;
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
    listCustomerSubscriptions: vi.fn(async () => [authoritativeSubscription]),
    retrieveInvoice: vi.fn(async () => ({
      id: "in_fixture123456",
      customerId: subscription.customerId,
      subscriptionId: subscription.id,
      livemode: currentEvent.livemode,
      paid: currentEvent.type === "invoice.paid"
    }))
  } as unknown as ConsumerBillingProvider;
  const repository = {
    registerEvent: vi.fn(async () => ({
      id: "70000000-0000-0000-0000-000000000001",
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
    applyProjection: vi.fn(async () => "subscription-active")
  } as unknown as SupabaseConsumerBillingRepository;
  return { provider, repository };
}

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

  it("projects only authoritative retrieved subscription state", async () => {
    const deps = dependencies();
    await expect(processConsumerBillingWebhook({
      payload: "{\"signed\":true}",
      signature: "valid",
      config,
      ...deps
    })).resolves.toMatchObject({ status: 200, body: { state: "subscription-active" } });
    expect(deps.provider.retrieveSubscription).toHaveBeenCalledWith(subscription.id);
    expect(deps.repository.applyProjection).toHaveBeenCalledWith(expect.objectContaining({
      ownerUserId: USER_ID,
      subscription,
      graceDays: 7
    }));
  });

  it.each(["invoice.paid", "invoice.payment_failed"])(
    "resolves %s through the authoritative invoice and subscription",
    async (type) => {
      const deps = dependencies(event(type));
      await processConsumerBillingWebhook({
        payload: "{\"signed\":true}",
        signature: "valid",
        config,
        ...deps
      });
      expect(deps.provider.retrieveInvoice).toHaveBeenCalledWith("in_fixture123456");
      expect(deps.repository.applyProjection).toHaveBeenCalledWith(expect.objectContaining({
        eventType: type,
        subscription
      }));
    }
  );

  it("rejects an invoice whose retrieved payment state conflicts with the event", async () => {
    const deps = dependencies(event("invoice.paid"));
    (deps.provider.retrieveInvoice as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "in_fixture123456",
      customerId: subscription.customerId,
      subscriptionId: subscription.id,
      livemode: false,
      paid: false
    });
    await expect(processConsumerBillingWebhook({
      payload: "{\"signed\":true}",
      signature: "valid",
      config,
      ...deps
    })).resolves.toMatchObject({ status: 200, body: { state: "manual-review" } });
    expect(deps.repository.applyProjection).not.toHaveBeenCalled();
  });

  it("acknowledges exact duplicate receipts without repeating projection", async () => {
    const deps = dependencies();
    (deps.repository.registerEvent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "70000000-0000-0000-0000-000000000001",
      state: "processed",
      duplicate: true,
      conflict: false
    });
    await expect(processConsumerBillingWebhook({
      payload: "{\"signed\":true}",
      signature: "valid",
      config,
      ...deps
    })).resolves.toMatchObject({ status: 200, body: { state: "processed" } });
    expect(deps.repository.claimEvent).not.toHaveBeenCalled();
    expect(deps.repository.applyProjection).not.toHaveBeenCalled();
  });

  it("rejects replay conflicts and reports stale event rejection without access promotion", async () => {
    const conflict = dependencies();
    (conflict.repository.registerEvent as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "70000000-0000-0000-0000-000000000001",
      state: "processed",
      duplicate: true,
      conflict: true
    });
    await expect(processConsumerBillingWebhook({
      payload: "{\"altered\":true}",
      signature: "valid",
      config,
      ...conflict
    })).resolves.toMatchObject({ status: 409, body: { state: "manual-review" } });

    const stale = dependencies();
    (stale.repository.applyProjection as ReturnType<typeof vi.fn>).mockResolvedValueOnce("stale_ignored");
    await expect(processConsumerBillingWebhook({
      payload: "{\"signed\":true}",
      signature: "valid",
      config,
      ...stale
    })).resolves.toMatchObject({ status: 200, body: { state: "stale_ignored" } });
  });

  it("fails closed on browser-forged owner or price metadata", async () => {
    const owner = dependencies();
    (owner.repository.getMappingByCustomer as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "70000000-0000-0000-0000-000000000002",
      ownerUserId: "90000000-0000-0000-0000-000000000002",
      stripeCustomerId: subscription.customerId,
      environment: "test"
    });
    await expect(processConsumerBillingWebhook({
      payload: "{\"signed\":true}",
      signature: "valid",
      config,
      ...owner
    })).resolves.toMatchObject({ body: { state: "manual-review" } });
    expect(owner.repository.applyProjection).not.toHaveBeenCalled();

    const wrongPrice = dependencies();
    (wrongPrice.provider.retrieveSubscription as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ...subscription,
      price: { ...subscription.price!, amountMinorUnits: 1 }
    });
    await expect(processConsumerBillingWebhook({
      payload: "{\"signed\":true}",
      signature: "valid",
      config,
      ...wrongPrice
    })).resolves.toMatchObject({ body: { state: "manual-review" } });
    expect(wrongPrice.repository.applyProjection).not.toHaveBeenCalled();
  });
});
