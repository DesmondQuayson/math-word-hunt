import { describe, expect, it, vi } from "vitest";

import { parseConsumerBillingConfiguration } from "./consumer-config";
import type { ConsumerBillingCustomer, ConsumerBillingInvoice, ConsumerBillingSubscription } from "./consumer-models";
import type { SupabaseConsumerBillingRepository } from "./consumer-repository";
import {
  synchronizeConsumerSubscription,
  synchronizeCustomerSubscriptions,
  validateAuthoritativeSubscription
} from "./consumer-synchronizer";

const USER_ID = "90000000-0000-0000-0000-000000000001";
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

const customer: ConsumerBillingCustomer = { id: "cus_fixture123456", livemode: false, deleted: false, ownerUserId: USER_ID, email: null };
const subscription: ConsumerBillingSubscription = {
  id: "sub_fixture123456",
  customerId: customer.id,
  livemode: false,
  status: "active",
  price: { id: config.priceId, productId: config.productId, active: true, livemode: false, currency: "usd", amountMinorUnits: 599, interval: "month", intervalCount: 1, usageType: "licensed" },
  quantity: 1,
  currentPeriodStart: "2026-08-01T00:00:00.000Z",
  currentPeriodEnd: "2026-09-01T00:00:00.000Z",
  cancelAtPeriodEnd: false,
  canceledAt: null,
  endedAt: null,
  trialStart: null,
  trialEnd: null,
  latestInvoiceId: "in_fixture123456",
  ownerUserId: USER_ID
};
const paidInvoice: ConsumerBillingInvoice = {
  id: "in_fixture123456", customerId: customer.id, subscriptionId: subscription.id, livemode: false,
  paid: true, status: "paid", paidAt: "2026-08-01T00:05:00.000Z", amountPaidMinorUnits: 599
};

function repository() {
  return { synchronizeSubscription: vi.fn(async () => "subscription-active") } as unknown as SupabaseConsumerBillingRepository;
}
const validate = (overrides: Partial<ConsumerBillingSubscription>, configuration = config) =>
  validateAuthoritativeSubscription({ subscription: { ...subscription, ...overrides }, customer, ownerUserId: USER_ID, customerId: customer.id, config: configuration });

describe("authoritative subscription validation", () => {
  it("accepts the exact MathNexa monthly subscription for its owner", () => {
    expect(validate({})).toBeNull();
    expect(validate({ status: "canceled", endedAt: "2026-08-15T00:00:00.000Z" })).toBeNull();
  });

  it("refuses another owner, another customer, or a mismatched mode", () => {
    expect(validate({ ownerUserId: "90000000-0000-0000-0000-000000000002" })).toBe("ownership_conflict");
    expect(validate({ customerId: "cus_other" })).toBe("ownership_conflict");
    expect(validate({ livemode: true })).toBe("projection_conflict");
  });

  it("refuses an unknown provider status rather than guessing what it means", () => {
    expect(validate({ status: null })).toBe("unknown_subscription_status");
  });

  it("refuses a live subscription without a period boundary", () => {
    expect(validate({ currentPeriodEnd: null })).toBe("projection_conflict");
    expect(validate({ status: "trialing", currentPeriodEnd: null })).toBe("projection_conflict");
  });

  it("accepts a retired legacy price only when it is explicitly allowlisted", () => {
    const legacy = { price: { ...subscription.price!, id: "price_legacy456", amountMinorUnits: 499 } };
    expect(validate(legacy)).toBe("projection_conflict");
    expect(validate(legacy, legacyConfig)).toBeNull();
    // The current price still has to carry the current amount.
    expect(validate({ price: { ...subscription.price!, amountMinorUnits: 499 } }, legacyConfig)).toBe("projection_conflict");
  });
});

describe("single-subscription synchronization", () => {
  it("passes the provider paid timestamp only for a paid invoice of the same subscription", async () => {
    const repo = repository();
    const base = { source: "reconciliation" as const, eventRecordId: null, eventType: null, observedAt: "2026-09-07T12:00:00.000Z", ownerUserId: USER_ID, customerId: customer.id, subscription, config, repository: repo, correlationId: "test" };
    await synchronizeConsumerSubscription({ ...base, latestInvoice: paidInvoice });
    await synchronizeConsumerSubscription({ ...base, latestInvoice: { ...paidInvoice, paid: false, status: "open", paidAt: null } });
    await synchronizeConsumerSubscription({ ...base, latestInvoice: { ...paidInvoice, subscriptionId: "sub_other" } });
    await synchronizeConsumerSubscription({ ...base, latestInvoice: { ...paidInvoice, amountPaidMinorUnits: 0 } });
    const paidAt = (repo.synchronizeSubscription as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0].latestInvoicePaidAt);
    expect(paidAt).toEqual(["2026-08-01T00:05:00.000Z", null, null, null]);
  });
});

describe("customer-wide synchronization order", () => {
  const oldCanceled: ConsumerBillingSubscription = { ...subscription, id: "sub_fixture000111", status: "canceled", currentPeriodStart: "2026-06-01T00:00:00.000Z", currentPeriodEnd: "2026-07-01T00:00:00.000Z", canceledAt: "2026-06-20T00:00:00.000Z", endedAt: "2026-07-01T00:00:00.000Z" };
  const unknown: ConsumerBillingSubscription = { ...subscription, id: "sub_fixture999888", status: null };

  it("writes historical subscriptions first, the live one last, and reports what it skipped", async () => {
    const repo = repository();
    const result = await synchronizeCustomerSubscriptions({
      source: "reconciliation", ownerUserId: USER_ID, customerId: customer.id, customer,
      subscriptions: [subscription, unknown, oldCanceled], primary: null, latestInvoice: paidInvoice,
      config, repository: repo, correlationId: "test", now: new Date("2026-09-07T12:00:00.000Z")
    });
    const calls = (repo.synchronizeSubscription as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]);
    expect(calls.map((call) => call.subscription.id)).toEqual([oldCanceled.id, subscription.id]);
    expect(calls.every((call) => call.source === "reconciliation" && call.eventRecordId === null && call.observedAt === "2026-09-07T12:00:00.000Z")).toBe(true);
    expect(result.skipped).toEqual({ [unknown.id]: "unknown_subscription_status" });
    expect(result.state).toBe("subscription-active");
  });

  it("gives the triggering event's subscription the webhook bookkeeping and the event's own timestamp", async () => {
    const repo = repository();
    const result = await synchronizeCustomerSubscriptions({
      source: "webhook", ownerUserId: USER_ID, customerId: customer.id, customer,
      subscriptions: [subscription, oldCanceled],
      primary: { subscription, eventRecordId: "70000000-0000-0000-0000-000000000001", eventType: "invoice.paid", observedAt: "2026-09-01T00:00:00.000Z" },
      latestInvoice: paidInvoice, config, repository: repo, correlationId: "evt_test"
    });
    const calls = (repo.synchronizeSubscription as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]);
    expect(calls[0]).toMatchObject({ subscription: oldCanceled, source: "reconciliation", eventRecordId: null });
    expect(calls[1]).toMatchObject({ subscription, source: "webhook", eventRecordId: "70000000-0000-0000-0000-000000000001", eventType: "invoice.paid", observedAt: "2026-09-01T00:00:00.000Z" });
    expect(result.state).toBe("subscription-active");
  });

  it("never synchronizes a primary subscription that fails validation", async () => {
    const repo = repository();
    const result = await synchronizeCustomerSubscriptions({
      source: "webhook", ownerUserId: USER_ID, customerId: customer.id, customer,
      subscriptions: [unknown], primary: { subscription: unknown, eventRecordId: "70000000-0000-0000-0000-000000000001", eventType: "customer.subscription.updated", observedAt: "2026-09-01T00:00:00.000Z" },
      latestInvoice: null, config, repository: repo, correlationId: "evt_test"
    });
    expect(repo.synchronizeSubscription).not.toHaveBeenCalled();
    expect(result.state).toBeNull();
    expect(result.skipped).toEqual({ [unknown.id]: "unknown_subscription_status" });
  });
});
