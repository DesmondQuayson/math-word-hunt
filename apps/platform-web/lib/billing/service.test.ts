import { describe, expect, it, vi } from "vitest";

import { parseBillingConfiguration } from "./config";
import type { BillingProvider } from "./provider";
import type { SupabaseBillingRepository } from "./repository";
import { BillingOperationError, createHostedCheckout, getCheckoutDisplayState } from "./service";

const config = parseBillingConfiguration({ BILLING_ENABLED: "true", BILLING_ENVIRONMENT: "test", BILLING_PROVIDER: "fixture", STRIPE_MODE: "test", STRIPE_API_VERSION: "2026-07-29.dahlia", STRIPE_PUBLISHABLE_KEY: "pk_test_fixture12345", STRIPE_SECRET_KEY: "sk_test_fixture12345", STRIPE_WEBHOOK_SECRET: "whsec_fixture12345", STRIPE_PRODUCT_TEACHER_PRO: "prod_fixture123", STRIPE_PRICE_TEACHER_PRO_MONTHLY: "price_monthly123", STRIPE_PRICE_TEACHER_PRO_ANNUAL: "price_annual123", STRIPE_PORTAL_CONFIGURATION_ID: "bpc_fixture123", BILLING_APP_BASE_URL: "http://127.0.0.1:3000", BILLING_CHECKOUT_ENABLED: "true", BILLING_PORTAL_ENABLED: "true", BILLING_WEBHOOK_ENABLED: "true", BILLING_EMERGENCY_DEFAULT_DENY: "false" });
if (!config.enabled) throw new Error("test config");
const context = { configured: true, status: "active", userId: "50000000-0000-0000-0000-000000000001", email: "teacher@example.test", profile: {} } as const;

function setup(session: Record<string, unknown>, subscriptions: readonly Record<string, unknown>[] = []) {
  const provider = { retrieveCheckoutSession: vi.fn(async () => ({ id: "cs_fixture123", customerId: "cus_fixture123", ownerReference: context.userId, status: "open", paymentStatus: "unpaid", livemode: false, url: null, ...session })) } as unknown as BillingProvider;
  const repository = { getCustomerMapping: vi.fn(async () => ({ id: "mapping", ownerTeacherId: context.userId, stripeCustomerId: "cus_fixture123", environment: "test" })), getCurrentSubscriptions: vi.fn(async () => subscriptions) } as unknown as SupabaseBillingRepository;
  return { provider, repository };
}

describe("Checkout status and kill-switch behavior", () => {
  it.each([
    [{ status: "open" }, [], "processing"],
    [{ status: "complete", paymentStatus: "unpaid" }, [], "payment-incomplete"],
    [{ status: "expired" }, [], "expired"],
    [{ customerId: "cus_foreign" }, [], "manual-review"],
    [{ status: "complete", paymentStatus: "paid" }, [{ status: "active", periodEnd: "2030-01-01T00:00:00.000Z" }], "active"]
  ])("derives a safe display state", async (session, subscriptions, expected) => {
    expect(await getCheckoutDisplayState({ context: context as never, config, sessionId: "cs_fixture123", ...setup(session, subscriptions) })).toBe(expected);
  });

  it("rejects malformed session references and provider outages", async () => {
    const deps = setup({});
    expect(await getCheckoutDisplayState({ context: context as never, config, sessionId: "not-a-session", ...deps })).toBe("unavailable");
    (deps.provider.retrieveCheckoutSession as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("offline"));
    expect(await getCheckoutDisplayState({ context: context as never, config, sessionId: "cs_fixture123", ...deps })).toBe("unavailable");
  });

  it("prevents Checkout before any provider call when its kill switch is off", async () => {
    const deps = setup({});
    await expect(createHostedCheckout({ context: context as never, config: { ...config, checkoutEnabled: false }, planKey: "teacher-pro-monthly", returnDestination: "/pricing", ...deps })).rejects.toMatchObject({ code: "checkout-disabled" } satisfies Partial<BillingOperationError>);
    expect(deps.provider.retrieveCheckoutSession).not.toHaveBeenCalled();
  });
});
