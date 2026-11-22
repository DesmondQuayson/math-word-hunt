import { describe, expect, it, vi } from "vitest";

import { parseConsumerBillingConfiguration } from "./consumer-config";
import type { ConsumerBillingSubscription } from "./consumer-models";
import { confirmationKind, parseBillingEmailConfiguration, sendSubscriptionConfirmationEmail } from "./subscription-confirmation-email";

const config = parseConsumerBillingConfiguration({
  MVH_APP_ENVIRONMENT: "production-platform", MVH_ALLOW_LOCAL_PRODUCTION_REHEARSAL: "true", MVH_STRIPE_MODE: "test",
  BILLING_ENABLED: "true", BILLING_PROVIDER: "fixture", STRIPE_MODE: "test", STRIPE_API_VERSION: "2026-07-29.dahlia",
  STRIPE_PUBLISHABLE_KEY: "pk_test_fixture12345", STRIPE_SECRET_KEY: "sk_test_fixture12345", STRIPE_WEBHOOK_SECRET: "whsec_fixture12345",
  STRIPE_PRODUCT_MATHNEXA: "prod_mathnexa123", STRIPE_PRICE_MATHNEXA_MONTHLY: "price_mathnexa123", STRIPE_PORTAL_CONFIGURATION_ID: "bpc_mathnexa123",
  BILLING_APP_BASE_URL: "http://127.0.0.1:3000", BILLING_CHECKOUT_ENABLED: "true", BILLING_PORTAL_ENABLED: "true", BILLING_WEBHOOK_ENABLED: "true",
  BILLING_EMERGENCY_DEFAULT_DENY: "false", BILLING_RENEWAL_GRACE_DAYS: "7", BILLING_REFUND_REVIEW_DAYS: "7", BILLING_AUTOMATIC_REFUNDS: "false"
});

const base: ConsumerBillingSubscription = {
  id: "sub_fixture123456", customerId: "cus_fixture123456", livemode: false, status: "trialing", price: null, quantity: 1,
  currentPeriodStart: "2026-11-22T21:14:00.000Z", currentPeriodEnd: "2026-11-23T21:14:00.000Z", cancelAtPeriodEnd: false,
  canceledAt: null, endedAt: null, trialStart: "2026-11-22T21:14:00.000Z", trialEnd: "2026-11-23T21:14:00.000Z",
  latestInvoiceId: null, ownerUserId: "90000000-0000-0000-0000-000000000001"
};
const enabled = { MVH_BILLING_EMAILS: "enabled", RESEND_API_KEY: "re_test_fixture_key_0123456789" };
const send = (source: Record<string, string | undefined>, subscription = base, fetchImpl: ReturnType<typeof vi.fn> = vi.fn(async () => new Response("{\"id\":\"e1\"}", { status: 200 })), recipient = "teacher@example.test") =>
  sendSubscriptionConfirmationEmail({ ownerUserId: base.ownerUserId!, subscription, config, correlationId: "evt_test" }, { fetch: fetchImpl as unknown as typeof fetch, recipientFor: async () => recipient, source })
    .then((outcome) => ({ outcome, fetchImpl }));

describe("subscription confirmation sending", () => {
  it("is off unless switched on with a key, a valid sender and an allowed provider address", () => {
    expect(parseBillingEmailConfiguration({})).toBeNull();
    expect(parseBillingEmailConfiguration({ ...enabled, MVH_BILLING_EMAILS: "true" })).toBeNull();
    expect(parseBillingEmailConfiguration({ ...enabled, RESEND_API_KEY: "not-a-resend-key" })).toBeNull();
    expect(parseBillingEmailConfiguration({ ...enabled, MVH_BILLING_EMAIL_FROM: "MathNexa <x@y.com>\r\nBcc: z@q.com" })).toBeNull();
    expect(parseBillingEmailConfiguration({ ...enabled, MVH_EMAIL_API_BASE_URL: "https://attacker.example" })).toBeNull();
    expect(parseBillingEmailConfiguration(enabled)).toEqual({ apiKey: enabled.RESEND_API_KEY, from: "MathNexa <billing@auth.mathnexa.com>", apiBaseUrl: "https://api.resend.com" });
    expect(parseBillingEmailConfiguration({ ...enabled, MVH_EMAIL_API_BASE_URL: "http://127.0.0.1:3901/" })?.apiBaseUrl).toBe("http://127.0.0.1:3901");
  });

  it("confirms a running trial or a paid subscription without one, and nothing else", () => {
    expect(confirmationKind(base)).toBe("trial");
    expect(confirmationKind({ ...base, status: "active", trialStart: null, trialEnd: null })).toBe("subscription");
    for (const status of ["incomplete", "past_due", "canceled", "unpaid"] as const) expect(confirmationKind({ ...base, status, trialStart: null, trialEnd: null })).toBeNull();
    expect(confirmationKind({ ...base, status: "active" })).toBeNull(); // a trial that already ended is not a new start
  });

  it("sends once per subscription through Resend with an idempotency key, reply-to and the rendered message", async () => {
    const { outcome, fetchImpl } = await send({ ...enabled, MVH_SUPPORT_EMAIL: "help@example.com" });
    expect(outcome).toBe("sent");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${enabled.RESEND_API_KEY}`);
    expect(headers["Idempotency-Key"]).toBe("mathnexa-subscription-confirmation/sub_fixture123456");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ from: "MathNexa <billing@auth.mathnexa.com>", to: ["teacher@example.test"], subject: "Your MathNexa free trial has started" });
    expect(body.text).toContain("Manage or cancel in Stripe");
    expect(body.text).not.toMatch(/sub_|cus_|price_/);
  });

  it("skips quietly when off, unconfirmable or without a confirmed address", async () => {
    expect((await send({})).outcome).toBe("skipped");
    expect((await send(enabled, { ...base, status: "past_due", trialStart: null, trialEnd: null })).outcome).toBe("skipped");
    const noAddress = await send(enabled, base, undefined, null as unknown as string);
    expect(noAddress.outcome).toBe("skipped");
    expect(noAddress.fetchImpl).not.toHaveBeenCalled();
  });

  it("never throws: a refused, failing or hanging provider is reported as failed", async () => {
    expect((await send(enabled, base, vi.fn(async () => new Response("no", { status: 422 })))).outcome).toBe("failed");
    expect((await send(enabled, base, vi.fn(async () => { throw new Error("network down"); }))).outcome).toBe("failed");
    const aborted = vi.fn(async (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    vi.useFakeTimers();
    const pending = send(enabled, base, aborted);
    await vi.advanceTimersByTimeAsync(8_100);
    vi.useRealTimers();
    expect((await pending).outcome).toBe("failed");
  });
});
