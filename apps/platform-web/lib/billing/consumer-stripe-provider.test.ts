import { describe, expect, it, vi } from "vitest";

import { ConsumerStripeBillingProvider } from "./consumer-stripe-provider";

describe("Stripe Sandbox consumer provider", () => {
  it("uses Setup-mode Checkout and never creates a subscription in Checkout", async () => {
    const create = vi.fn(async (parameters: Record<string, unknown>) => ({
      id: "cs_test_123456",
      customer: parameters.customer,
      client_reference_id: parameters.client_reference_id,
      metadata: parameters.metadata,
      status: "open",
      livemode: false,
      url: "https://checkout.stripe.test/session",
      setup_intent: null
    }));
    const provider = new ConsumerStripeBillingProvider({
      checkout: { sessions: { create } }
    } as never);
    await provider.createSetupCheckout({
      userId: "90000000-0000-0000-0000-000000000001",
      customerId: "cus_test_123456",
      successUrl: "https://mathnexa.example/checkout/status?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://mathnexa.example/pricing?checkout=canceled",
      idempotencyKey: "mvh-consumer-setup-key"
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      mode: "setup",
      customer: "cus_test_123456",
      payment_method_types: ["card"],
      setup_intent_data: {
        metadata: expect.objectContaining({
          mathnexa_account_id: "90000000-0000-0000-0000-000000000001"
        })
      }
    }), { idempotencyKey: "mvh-consumer-setup-key" });
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("subscription_data");
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("line_items");
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty("expires_at");
  });

  it("creates the monthly subscription server-side with the exact supplied trial end", async () => {
    const trialEndsAt = "2026-08-01T16:05:06.000Z";
    const create = vi.fn(async (parameters: Record<string, unknown>) => ({
      id: "sub_test_123456",
      customer: parameters.customer,
      livemode: false,
      status: "trialing",
      items: {
        data: [{
          quantity: 1,
          price: {
            id: "price_test_123456",
            product: "prod_test_123456",
            active: true,
            livemode: false,
            currency: "usd",
            unit_amount: 599,
            recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }
          }
        }]
      },
      current_period_start: 1785513906,
      current_period_end: 1785600306,
      cancel_at_period_end: false,
      canceled_at: null,
      trial_start: 1785513906,
      trial_end: Math.floor(Date.parse(trialEndsAt) / 1000),
      metadata: parameters.metadata
    }));
    const provider = new ConsumerStripeBillingProvider({
      subscriptions: { create }
    } as never);
    await provider.createSubscription({
      userId: "90000000-0000-0000-0000-000000000001",
      customerId: "cus_test_123456",
      paymentMethodId: "pm_test_123456",
      priceId: "price_test_123456",
      trialEndsAt,
      idempotencyKey: "mvh-consumer-subscription-key"
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      customer: "cus_test_123456",
      default_payment_method: "pm_test_123456",
      items: [{ price: "price_test_123456", quantity: 1 }],
      collection_method: "charge_automatically",
      trial_end: Math.floor(Date.parse(trialEndsAt) / 1000)
    }), { idempotencyKey: "mvh-consumer-subscription-key" });
  });
});
