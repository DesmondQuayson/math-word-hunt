import { describe, expect, it, vi } from "vitest";

import { ConsumerStripeBillingProvider } from "./consumer-stripe-provider";

describe("Stripe Sandbox consumer provider", () => {
  it("uses Setup-mode Checkout and never creates a subscription in Checkout", async () => {
    const create = vi.fn(async (parameters: Record<string, unknown>) => ({
      id: "cs_test_123456",
      customer: parameters.customer,
      client_reference_id: parameters.client_reference_id,
      metadata: parameters.metadata,
      mode: parameters.mode,
      status: "open",
      livemode: false,
      url: "https://checkout.stripe.test/session",
      setup_intent: null,
      managed_payments: { enabled: false },
      payment_intent: null,
      subscription: null
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
      currency: "usd",
      customer: "cus_test_123456",
      payment_method_types: ["card"],
      managed_payments: { enabled: false },
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

  it("requires a completed standard SetupIntent and rejects Managed Payments state", async () => {
    const retrieve = vi.fn(async () => ({
      id: "cs_test_123456",
      customer: "cus_test_123456",
      client_reference_id: "90000000-0000-0000-0000-000000000001",
      metadata: { mathnexa_account_id: "90000000-0000-0000-0000-000000000001" },
      mode: "setup",
      status: "complete",
      livemode: false,
      url: null,
      managed_payments: { enabled: false },
      payment_intent: null,
      subscription: null,
      setup_intent: {
        id: "seti_test_123456",
        status: "succeeded",
        payment_method: "pm_test_123456",
        managed_payments: { enabled: false }
      }
    }));
    const provider = new ConsumerStripeBillingProvider({
      checkout: { sessions: { retrieve } }
    } as never);
    await expect(provider.retrieveSetupCheckout("cs_test_123456")).resolves.toMatchObject({
      setupIntentId: "seti_test_123456",
      paymentMethodId: "pm_test_123456"
    });
    retrieve.mockResolvedValueOnce({
      ...(await retrieve()),
      managed_payments: { enabled: true }
    });
    await expect(provider.retrieveSetupCheckout("cs_test_123456")).rejects.toMatchObject({ category: "invalid-resource" });
    retrieve.mockResolvedValueOnce({
      ...(await retrieve()),
      setup_intent: {
        id: "seti_test_123456",
        status: "succeeded",
        payment_method: "pm_test_123456",
        managed_payments: { enabled: true }
      }
    });
    await expect(provider.retrieveSetupCheckout("cs_test_123456")).rejects.toMatchObject({ category: "invalid-resource" });
  });

  // Stripe stamps trial_start when it creates the subscription, a second or two
  // after the checkout event the activation answers (production, 2026-09-28).
  function trialStripe(shape: (created: number) => { trial_start: number; trial_end: number }) {
    const createdAt = Math.floor(Date.parse("2026-08-01T16:05:08.000Z") / 1000);
    const subscription = (parameters: Record<string, unknown>, trial: { trial_start: number; trial_end: number } | null) => ({
      id: "sub_test_123456",
      customer: parameters.customer ?? "cus_test_123456",
      livemode: false,
      status: trial ? "trialing" : "active",
      items: { data: [{ quantity: 1, price: { id: "price_test_123456", product: "prod_test_123456", active: true, livemode: false, currency: "usd", unit_amount: 599, recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } } }] },
      current_period_start: trial?.trial_start ?? createdAt,
      current_period_end: trial?.trial_end ?? createdAt + 30 * 86_400,
      cancel_at_period_end: false,
      canceled_at: null,
      trial_start: trial?.trial_start ?? null,
      trial_end: trial?.trial_end ?? null,
      managed_payments: null,
      metadata: parameters.metadata ?? { mathnexa_account_id: "90000000-0000-0000-0000-000000000001", mathnexa_plan: "mathnexa-monthly" }
    });
    const create = vi.fn(async (parameters: Record<string, unknown>) => subscription(parameters, parameters.trial_period_days || parameters.trial_end ? shape(createdAt) : null));
    const update = vi.fn(async (_reference: string, parameters: Record<string, unknown>) => {
      const trial = shape(createdAt);
      return subscription({}, { trial_start: trial.trial_start, trial_end: parameters.trial_end as number });
    });
    return { createdAt, create, update, provider: new ConsumerStripeBillingProvider({ subscriptions: { create, update } } as never) };
  }
  const request = (trialEndsAt: string | null) => ({
    userId: "90000000-0000-0000-0000-000000000001",
    customerId: "cus_test_123456",
    paymentMethodId: "pm_test_123456",
    priceId: "price_test_123456",
    trialEndsAt,
    idempotencyKey: "mvh-consumer-subscription-key"
  });
  // The activation computes this from the checkout event, two seconds before Stripe creates the subscription.
  const checkoutTrialEnd = "2026-08-02T16:05:06.000Z";

  it("requests the trial as a duration, so the created subscription already has Stripe's exact 24-hour shape", async () => {
    const stripe = trialStripe((created) => ({ trial_start: created, trial_end: created + 86_400 }));
    const subscription = await stripe.provider.createSubscription(request(checkoutTrialEnd));
    const parameters = stripe.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(parameters).toMatchObject({
      customer: "cus_test_123456",
      default_payment_method: "pm_test_123456",
      items: [{ price: "price_test_123456", quantity: 1 }],
      collection_method: "charge_automatically",
      trial_period_days: 1,
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } }
    });
    // An end instant computed from the checkout time is exactly what made the
    // created event 24 h minus two seconds; it must never be sent again.
    expect(parameters).not.toHaveProperty("trial_end");
    expect(stripe.create.mock.calls[0]![1]).toEqual({ idempotencyKey: "mvh-consumer-subscription-key" });
    expect(stripe.update).not.toHaveBeenCalled();
    expect(subscription.trialStart).toBe(new Date(stripe.createdAt * 1000).toISOString());
    expect(Date.parse(subscription.trialEnd!) - Date.parse(subscription.trialStart!)).toBe(86_400_000);
    // Two seconds later than the checkout-based end, and that is correct: Stripe's clock is authoritative.
    expect(Date.parse(subscription.trialEnd!) - Date.parse(checkoutTrialEnd)).toBe(2_000);
  });

  it("corrects any other shape from Stripe's own trial_start instead of accepting it", async () => {
    const stripe = trialStripe((created) => ({ trial_start: created, trial_end: created + 86_399 }));
    const subscription = await stripe.provider.createSubscription(request(checkoutTrialEnd));
    expect(stripe.update).toHaveBeenCalledWith("sub_test_123456", {
      trial_end: stripe.createdAt + 86_400,
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      proration_behavior: "none"
    }, { idempotencyKey: "mvh-consumer-subscription-key:exact-trial-end" });
    expect(Date.parse(subscription.trialEnd!) - Date.parse(subscription.trialStart!)).toBe(86_400_000);
  });

  it("asks for no trial when the account has already used it", async () => {
    const stripe = trialStripe((created) => ({ trial_start: created, trial_end: created + 86_400 }));
    const subscription = await stripe.provider.createSubscription(request(null));
    const parameters = stripe.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(parameters).not.toHaveProperty("trial_period_days");
    expect(parameters).not.toHaveProperty("trial_end");
    expect(parameters).not.toHaveProperty("trial_settings");
    expect(stripe.update).not.toHaveBeenCalled();
    expect(subscription.trialStart).toBeNull();
  });

  it("lists subscriptions without an unsupported five-level expansion", async () => {
    const list = vi.fn(async () => ({ data: [] }));
    const provider = new ConsumerStripeBillingProvider({ subscriptions: { list } } as never);

    await expect(provider.listCustomerSubscriptions("cus_test_123456")).resolves.toEqual([]);
    expect(list).toHaveBeenCalledWith({
      customer: "cus_test_123456",
      status: "all",
      limit: 100
    });
  });

  it("maps Dahlia invoice status when the legacy paid boolean is omitted", async () => {
    const retrieve = vi.fn()
      .mockResolvedValueOnce({
        id: "in_test_paid", customer: "cus_test_123456", livemode: false,
        status: "paid", amount_due: 599, amount_paid: 599, amount_remaining: 0,
        parent: { subscription_details: { subscription: "sub_test_123456" } }
      })
      .mockResolvedValueOnce({
        id: "in_test_open", customer: "cus_test_123456", livemode: false,
        status: "open", amount_due: 599, amount_paid: 0, amount_remaining: 599,
        parent: { subscription_details: { subscription: "sub_test_123456" } }
      })
      .mockResolvedValueOnce({
        id: "in_test_conflict", customer: "cus_test_123456", livemode: false,
        status: "paid", amount_due: 599, amount_paid: 0, amount_remaining: 599,
        parent: { subscription_details: { subscription: "sub_test_123456" } }
      });
    const provider = new ConsumerStripeBillingProvider({
      invoices: { retrieve },
      invoicePayments: { list: vi.fn(async () => ({ data: [] })) },
      paymentIntents: { retrieve: vi.fn() }
    } as never);

    await expect(provider.retrieveInvoice("in_test_paid")).resolves.toMatchObject({ paid: true });
    await expect(provider.retrieveInvoice("in_test_open")).resolves.toMatchObject({ paid: false });
    await expect(provider.retrieveInvoice("in_test_conflict")).rejects.toMatchObject({ category: "invalid-resource" });
  });

  it("fails closed on Managed Payments subscriptions, invoices, PaymentIntents, and events", async () => {
    const subscription = {
      id: "sub_test_123456",
      customer: "cus_test_123456",
      livemode: false,
      status: "active",
      items: { data: [] },
      cancel_at_period_end: false,
      canceled_at: null,
      trial_start: null,
      trial_end: null,
      metadata: {},
      managed_payments: { enabled: true }
    };
    const provider = new ConsumerStripeBillingProvider({
      subscriptions: { retrieve: vi.fn(async () => subscription) },
      invoices: { retrieve: vi.fn(async () => ({
        id: "in_test_123456", customer: "cus_test_123456", parent: {
          subscription_details: { subscription: "sub_test_123456" }
        }, livemode: false, paid: true
      })) },
      invoicePayments: { list: vi.fn(async () => ({ data: [{
        payment: { type: "payment_intent", payment_intent: {
          id: "pi_test_123456", managed_payments: { enabled: true }
        } }
      }] })) },
      paymentIntents: { retrieve: vi.fn() },
      webhooks: { constructEvent: vi.fn(() => ({
        id: "evt_test_123456", type: "invoice.paid", livemode: false,
        api_version: "2026-07-29.dahlia", created: 1,
        data: { object: { id: "in_test_123456", managed_payments: { enabled: true } } }
      })) }
    } as never);
    await expect(provider.retrieveSubscription(subscription.id)).rejects.toMatchObject({ category: "invalid-resource" });
    await expect(provider.retrieveInvoice("in_test_123456")).rejects.toMatchObject({ category: "invalid-resource" });
    expect(() => provider.constructVerifiedEvent("{}", "signature", "secret")).toThrow(expect.objectContaining({ category: "invalid-resource" }));
  });
});

describe("webhook signature verification", () => {
  const payload = JSON.stringify({
    id: "evt_test_signature",
    object: "event",
    api_version: "2026-07-29.dahlia",
    created: 1_780_000_000,
    livemode: false,
    type: "invoice.paid",
    data: { object: { id: "in_test_123456", object: "invoice", customer: "cus_test_123456", parent: { subscription_details: { subscription: "sub_test_123456" } } } }
  });
  const secret = "whsec_unit_test_secret_value_1234567890";

  it("accepts only a payload signed with the endpoint secret and never an unsigned or re-signed body", async () => {
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe("sk_test_unit_placeholder_key_000", { apiVersion: "2026-07-29.dahlia" });
    const provider = new ConsumerStripeBillingProvider(stripe);
    const timestamp = Math.floor(Date.now() / 1000);
    const valid = Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp });
    expect(provider.constructVerifiedEvent(payload, valid, secret)).toMatchObject({
      id: "evt_test_signature", type: "invoice.paid", objectId: "in_test_123456", customerId: "cus_test_123456", livemode: false
    });
    const forged = Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_another_secret_value_0987654321", timestamp });
    expect(() => provider.constructVerifiedEvent(payload, forged, secret)).toThrow();
    expect(() => provider.constructVerifiedEvent(payload, "t=1,v1=deadbeef", secret)).toThrow();
    expect(() => provider.constructVerifiedEvent(`${payload} `, valid, secret)).toThrow();
  });
});
