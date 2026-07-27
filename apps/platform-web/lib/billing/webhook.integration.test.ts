import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import { STRIPE_API_VERSION, parseBillingConfiguration } from "./config";
import type { BillingProvider } from "./provider";
import type { SupabaseBillingRepository } from "./repository";
import { StripeBillingProvider } from "./stripe-provider";
import { processBillingWebhook } from "./webhook";

const secret = "whsec_fixture12345";
const stripe = new Stripe("sk_test_fixture12345", { apiVersion: STRIPE_API_VERSION });
const verifier = new StripeBillingProvider(stripe);
const config = parseBillingConfiguration({
  BILLING_ENABLED: "true", BILLING_ENVIRONMENT: "test", BILLING_PROVIDER: "fixture", STRIPE_MODE: "test",
  STRIPE_API_VERSION, STRIPE_PUBLISHABLE_KEY: "pk_test_fixture12345", STRIPE_SECRET_KEY: "sk_test_fixture12345",
  STRIPE_WEBHOOK_SECRET: secret, STRIPE_PRODUCT_TEACHER_PRO: "prod_fixture123",
  STRIPE_PRICE_TEACHER_PRO_MONTHLY: "price_monthly123", STRIPE_PRICE_TEACHER_PRO_ANNUAL: "price_annual123",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_fixture123", BILLING_APP_BASE_URL: "http://127.0.0.1:3000",
  BILLING_CHECKOUT_ENABLED: "true", BILLING_PORTAL_ENABLED: "true", BILLING_WEBHOOK_ENABLED: "true", BILLING_EMERGENCY_DEFAULT_DENY: "false"
});
if (!config.enabled) throw new Error("test config");

const timestamp = Math.floor(Date.now() / 1000);
function payload(type = "customer.subscription.updated", livemode = false, apiVersion: string = STRIPE_API_VERSION, eventId = "evt_fixture123") {
  return JSON.stringify({ id: eventId, object: "event", api_version: apiVersion, created: timestamp, livemode, type, data: { object: { id: "sub_fixture123", object: "subscription", customer: "cus_fixture123", metadata: { mvh_teacher_id: "50000000-0000-0000-0000-000000000001" } } } });
}
const signature = (body: string) => Stripe.webhooks.generateTestHeaderString({ payload: body, secret, timestamp });

function dependencies() {
  const subscription = { id: "sub_fixture123", customerId: "cus_fixture123", livemode: false, status: "active" as const, price: { id: "price_monthly123", productId: "prod_fixture123", active: true, livemode: false, currency: "usd", amountMinorUnits: 999, interval: "month", intervalCount: 1, usageType: "licensed" }, quantity: 1, currentPeriodStart: "2026-07-26T00:00:00.000Z", currentPeriodEnd: "2027-07-26T00:00:00.000Z", cancelAtPeriodEnd: false, canceledAt: null, trialEnd: null, ownerReference: "50000000-0000-0000-0000-000000000001" };
  const provider: BillingProvider = {
    ...verifier,
    constructVerifiedEvent: verifier.constructVerifiedEvent.bind(verifier),
    retrieveCustomer: vi.fn(async () => ({ id: "cus_fixture123", livemode: false, deleted: false, ownerReference: "50000000-0000-0000-0000-000000000001", email: null })),
    retrieveSubscription: vi.fn(async () => subscription),
    listCustomerSubscriptions: vi.fn(async () => [subscription]),
    retrieveCheckoutSession: vi.fn(), retrievePrice: vi.fn(), createCustomer: vi.fn(), createCheckoutSession: vi.fn(), createPortalSession: vi.fn(), retrieveInvoice: vi.fn(), expireCheckoutSession: vi.fn()
  };
  const repository = {
    registerEvent: vi.fn(async () => ({ id: "receipt", state: "received", duplicate: false, conflict: false })),
    claimEvent: vi.fn(async () => true), finishEvent: vi.fn(async () => undefined),
    getMappingByCustomer: vi.fn(async () => ({ id: "mapping", ownerTeacherId: "50000000-0000-0000-0000-000000000001", stripeCustomerId: "cus_fixture123", environment: "test" })),
    getOwnerAccountStatus: vi.fn(async () => "active"), applyProjection: vi.fn(async () => "active")
  };
  return { provider, repository: repository as unknown as SupabaseBillingRepository, repositoryMock: repository, subscription };
}

describe("verified webhook boundary", () => {
  it.each([[null, "invalid-signature"], ["bad", "invalid-signature"]])("rejects missing or invalid signatures", async (header, state) => {
    const body = payload(); const deps = dependencies();
    expect(await processBillingWebhook({ payload: body, signature: header, config, ...deps })).toMatchObject({ status: 400, body: { state } });
    expect(deps.repositoryMock.registerEvent).not.toHaveBeenCalled();
  });
  it("rejects an altered payload and live-mode event", async () => {
    const body = payload(); const deps = dependencies();
    expect((await processBillingWebhook({ payload: `${body} `, signature: signature(body), config, ...deps })).status).toBe(400);
    const live = payload(undefined, true);
    expect(await processBillingWebhook({ payload: live, signature: signature(live), config, ...deps })).toMatchObject({ status: 400, body: { state: "environment-mismatch" } });
  });
  it("acknowledges signed unsupported events without mutation", async () => {
    const body = payload("charge.succeeded"); const deps = dependencies();
    expect(await processBillingWebhook({ payload: body, signature: signature(body), config, ...deps })).toMatchObject({ status: 200, body: { state: "ignored" } });
    expect(deps.repositoryMock.registerEvent).not.toHaveBeenCalled();
  });
  it("projects an active subscription only after the real signature boundary", async () => {
    const body = payload(); const deps = dependencies();
    expect(await processBillingWebhook({ payload: body, signature: signature(body), config, ...deps })).toMatchObject({ status: 200, body: { state: "active" } });
    expect(deps.repositoryMock.applyProjection).toHaveBeenCalledWith(expect.objectContaining({ eligible: true }));
  });
  it("does not register events when the webhook kill switch is active", async () => {
    const body = payload(); const deps = dependencies();
    expect(await processBillingWebhook({ payload: body, signature: signature(body), config: { ...config, webhookEnabled: false }, ...deps })).toMatchObject({ status: 503, body: { state: "webhook-disabled" } });
    expect(deps.repositoryMock.registerEvent).not.toHaveBeenCalled();
  });
  it("rejects a signed API-version mismatch before receipt", async () => {
    const body = payload(undefined, false, "2025-01-01.acacia"); const deps = dependencies();
    expect(await processBillingWebhook({ payload: body, signature: signature(body), config, ...deps })).toMatchObject({ status: 400, body: { state: "api-version-mismatch" } });
    expect(deps.repositoryMock.registerEvent).not.toHaveBeenCalled();
  });
  it("acknowledges a previously processed duplicate but rejects a conflicting event body", async () => {
    const body = payload(); const deps = dependencies();
    deps.repositoryMock.registerEvent.mockResolvedValueOnce({ id: "receipt", state: "processed", duplicate: true, conflict: false });
    expect(await processBillingWebhook({ payload: body, signature: signature(body), config, ...deps })).toMatchObject({ status: 200, body: { state: "processed" } });
    deps.repositoryMock.registerEvent.mockResolvedValueOnce({ id: "receipt", state: "processed", duplicate: true, conflict: true });
    expect(await processBillingWebhook({ payload: body, signature: signature(body), config, ...deps })).toMatchObject({ status: 409, body: { state: "manual-review" } });
  });
  it("classifies unknown owners, metadata conflicts, unknown prices, and duplicate subscriptions for manual review", async () => {
    for (const mutate of [
      (deps: ReturnType<typeof dependencies>) => (deps.repositoryMock.getMappingByCustomer as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null),
      (deps: ReturnType<typeof dependencies>) => deps.repositoryMock.getMappingByCustomer.mockResolvedValueOnce({ id: "mapping", ownerTeacherId: "50000000-0000-0000-0000-000000000002", stripeCustomerId: "cus_fixture123", environment: "test" }),
      (deps: ReturnType<typeof dependencies>) => (deps.provider.retrieveSubscription as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ...deps.subscription, price: null }),
      (deps: ReturnType<typeof dependencies>) => (deps.provider.listCustomerSubscriptions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        deps.subscription, { ...deps.subscription, id: "sub_duplicate" }
      ])
    ]) {
      const body = payload(); const deps = dependencies(); mutate(deps);
      expect(await processBillingWebhook({ payload: body, signature: signature(body), config, ...deps })).toMatchObject({ status: 200, body: { state: "manual-review" } });
    }
  });
  it("returns retryable failures for provider and database outages", async () => {
    const body = payload();
    const database = dependencies(); database.repositoryMock.registerEvent.mockRejectedValueOnce(new Error("offline"));
    expect(await processBillingWebhook({ payload: body, signature: signature(body), config, ...database })).toMatchObject({ status: 503, body: { state: "database-unavailable" } });
    const provider = dependencies(); (provider.provider.retrieveCustomer as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("offline"));
    expect(await processBillingWebhook({ payload: body, signature: signature(body), config, ...provider })).toMatchObject({ status: 503, body: { state: "retryable-failure" } });
    expect(provider.repositoryMock.finishEvent).toHaveBeenCalledWith("receipt", "retryable_failure", "provider_unavailable");
  });
  it("does not report a stale projection as newly active", async () => {
    const body = payload(); const deps = dependencies(); deps.repositoryMock.applyProjection.mockResolvedValueOnce("stale_ignored");
    expect(await processBillingWebhook({ payload: body, signature: signature(body), config, ...deps })).toMatchObject({ status: 200, body: { state: "stale-ignored" } });
  });
});
