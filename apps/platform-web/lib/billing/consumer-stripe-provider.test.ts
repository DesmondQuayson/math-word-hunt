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

  it("creates the monthly subscription server-side with the exact supplied trial end", async () => {
    const trialEndsAt = "2026-08-01T16:05:06.000Z";
    const requestedTrialEnd = Math.floor(Date.parse(trialEndsAt) / 1000);
    const authoritativeTrialStart = requestedTrialEnd - 86_398;
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
      current_period_start: authoritativeTrialStart,
      current_period_end: requestedTrialEnd,
      cancel_at_period_end: false,
      canceled_at: null,
      trial_start: authoritativeTrialStart,
      trial_end: requestedTrialEnd,
      managed_payments: null,
      metadata: parameters.metadata
    }));
    const update = vi.fn(async (_reference: string, parameters: Record<string, unknown>) => ({
      ...(await create({
        customer: "cus_test_123456",
        metadata: {
          mathnexa_account_id: "90000000-0000-0000-0000-000000000001",
          mathnexa_plan: "mathnexa-monthly"
        }
      })),
      current_period_end: parameters.trial_end,
      trial_end: parameters.trial_end
    }));
    const provider = new ConsumerStripeBillingProvider({
      subscriptions: { create, update }
    } as never);
    const subscription = await provider.createSubscription({
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
      trial_end: requestedTrialEnd
    }), { idempotencyKey: "mvh-consumer-subscription-key" });
    expect(update).toHaveBeenCalledWith("sub_test_123456", {
      trial_end: authoritativeTrialStart + 86_400,
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      proration_behavior: "none"
    }, { idempotencyKey: "mvh-consumer-subscription-key:exact-trial-end" });
    expect(Date.parse(subscription.trialEnd!) - Date.parse(subscription.trialStart!)).toBe(86_400_000);
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
