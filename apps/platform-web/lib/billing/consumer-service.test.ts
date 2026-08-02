import { describe, expect, it, vi } from "vitest";

import type { ConsumerContext } from "@/lib/auth/consumer-context";
import type { CommercialConsentDecision } from "@/lib/commercial/policy";

import { parseConsumerBillingConfiguration } from "./consumer-config";
import type { ConsumerBillingProvider } from "./consumer-provider";
import type { SupabaseConsumerBillingRepository } from "./consumer-repository";
import {
  activateConsumerSetupCheckout,
  createConsumerPortal,
  createConsumerSetupCheckout
} from "./consumer-service";

const USER_ID = "90000000-0000-0000-0000-000000000001";
const consent = Object.freeze({
  subscriptionTermsAccepted: true,
  automaticRenewalAccepted: true,
  trialAccepted: true,
  monthlyPriceAccepted: true,
  cancellationPolicyAccepted: true,
  refundPolicyAccepted: true,
  privacyAndTermsAccepted: true
}) satisfies CommercialConsentDecision;
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

function context(trialRedeemedAt: string | null = null): ConsumerContext {
  return {
    status: "active",
    userId: USER_ID,
    email: "member@example.invalid",
    account: {
      userId: USER_ID,
      accountStatus: "active",
      emailConfirmedAt: "2026-07-31T12:00:00.000Z",
      trialRedeemedAt,
      deletionRequestedAt: null,
      deletionCompletedAt: null,
      createdAt: "2026-07-31T12:00:00.000Z",
      updatedAt: "2026-07-31T12:00:00.000Z"
    }
  };
}

const price = {
  id: config.priceId,
  productId: config.productId,
  active: true,
  livemode: false,
  currency: "usd",
  amountMinorUnits: 599,
  interval: "month",
  intervalCount: 1,
  usageType: "licensed"
} as const;

function dependencies(redeemedAt: string | null = null) {
  const mapping = {
    id: "70000000-0000-0000-0000-000000000001",
    ownerUserId: USER_ID,
    stripeCustomerId: "cus_fixture123456",
    environment: "test" as const
  };
  const provider = {
    retrieveCustomer: vi.fn(async () => ({
      id: mapping.stripeCustomerId,
      livemode: false,
      deleted: false,
      ownerUserId: USER_ID,
      email: "member@example.invalid"
    })),
    createCustomer: vi.fn(),
    retrievePrice: vi.fn(async () => price),
    createSetupCheckout: vi.fn(async () => ({
      id: "cs_fixture123456",
      customerId: mapping.stripeCustomerId,
      ownerUserId: USER_ID,
      status: "complete" as const,
      livemode: false,
      url: "http://127.0.0.1:3000/checkout/status?session_id=cs_fixture123456",
      setupIntentId: "seti_fixture123456",
      paymentMethodId: "pm_fixture123456"
    })),
    retrieveSetupCheckout: vi.fn(),
    createSubscription: vi.fn(),
    retrieveSubscription: vi.fn(),
    listCustomerSubscriptions: vi.fn(async () => []),
    retrieveInvoice: vi.fn(),
    retrievePortalConfiguration: vi.fn(async () => ({
      id: config.portalConfigurationId,
      active: true,
      livemode: false,
      cancelAtPeriodEnd: true,
      paymentMethodUpdateEnabled: true,
      invoiceHistoryEnabled: true
    })),
    createPortalSession: vi.fn(async () => ({ url: "http://127.0.0.1:3000/subscription?billing=fixture-portal" })),
    constructVerifiedEvent: vi.fn()
  } as unknown as ConsumerBillingProvider;
  const repository = {
    getCustomerMapping: vi.fn(async () => mapping),
    getMappingByCustomer: vi.fn(async () => mapping),
    getCurrentSubscriptions: vi.fn(async () => []),
    getAccount: vi.fn(async () => ({
      user_id: USER_ID,
      account_status: "active",
      trial_redeemed_at: redeemedAt,
      trial_redemption_checkout_hash: null
    })),
    claimTrial: vi.fn(async () => "claimed"),
    recordCommercialAcceptance: vi.fn(async () => ({ id: "60000000-0000-0000-0000-000000000001", ownerUserId: USER_ID, environment: "test" })),
    bindCommercialAcceptance: vi.fn(async () => true),
    hasCurrentCommercialAcceptance: vi.fn(async () => true)
  } as unknown as SupabaseConsumerBillingRepository;
  return { mapping, provider, repository };
}

describe("consumer Setup Checkout and subscription activation", () => {
  it("creates only the one $5.99 monthly Setup Checkout for the authenticated owner", async () => {
    const deps = dependencies();
    await expect(createConsumerSetupCheckout({
      context: context(),
      config,
      consent,
      ...deps
    })).resolves.toMatchObject({ trialEligible: true });
    expect(deps.provider.retrievePrice).toHaveBeenCalledWith(config.priceId);
    expect(deps.provider.createSetupCheckout).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      customerId: deps.mapping.stripeCustomerId,
      successUrl: expect.stringContaining("/checkout/status?session_id="),
      cancelUrl: "http://127.0.0.1:3000/pricing?checkout=canceled"
    }));
    expect(deps.repository.recordCommercialAcceptance).toHaveBeenCalledWith(USER_ID, consent);
    expect(deps.repository.bindCommercialAcceptance).toHaveBeenCalledOnce();
  });

  it("does not create Setup Checkout without current server-bound consent", async () => {
    const deps = dependencies();
    (deps.repository.bindCommercialAcceptance as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    await expect(createConsumerSetupCheckout({ context: context(), config, consent, ...deps }))
      .rejects.toMatchObject({ code: "commercial-consent-required" });
  });

  it("creates an exact server-timed 24-hour trial after successful payment-method setup", async () => {
    const deps = dependencies();
    const createdAt = "2026-07-31T16:05:06.000Z";
    const trialEnd = "2026-08-01T16:05:06.000Z";
    const subscription = {
      id: "sub_fixture123456",
      customerId: deps.mapping.stripeCustomerId,
      livemode: false,
      status: "trialing" as const,
      price,
      quantity: 1,
      currentPeriodStart: createdAt,
      currentPeriodEnd: trialEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      trialStart: createdAt,
      trialEnd,
      ownerUserId: USER_ID
    };
    (deps.provider.createSubscription as ReturnType<typeof vi.fn>).mockResolvedValue(subscription);
    const session = await (deps.provider.createSetupCheckout as ReturnType<typeof vi.fn>).mock.results[0]?.value ??
      {
        id: "cs_fixture123456",
        customerId: deps.mapping.stripeCustomerId,
        ownerUserId: USER_ID,
        status: "complete" as const,
        livemode: false,
        url: null,
        setupIntentId: "seti_fixture123456",
        paymentMethodId: "pm_fixture123456"
      };
    await expect(activateConsumerSetupCheckout({
      session,
      eventCreatedAt: createdAt,
      config,
      ...deps
    })).resolves.toEqual(subscription);
    expect(deps.repository.claimTrial).toHaveBeenCalledOnce();
    expect(deps.provider.createSubscription).toHaveBeenCalledWith(expect.objectContaining({
      paymentMethodId: "pm_fixture123456",
      priceId: config.priceId,
      trialEndsAt: trialEnd
    }));
    expect(Date.parse(trialEnd) - Date.parse(createdAt)).toBe(86_400 * 1000);
  });

  it("does not grant a second introductory trial", async () => {
    const redeemedAt = "2026-07-01T00:00:00.000Z";
    const deps = dependencies(redeemedAt);
    const createdAt = "2026-07-31T16:05:06.000Z";
    const active = {
      id: "sub_fixture654321",
      customerId: deps.mapping.stripeCustomerId,
      livemode: false,
      status: "active" as const,
      price,
      quantity: 1,
      currentPeriodStart: createdAt,
      currentPeriodEnd: "2026-08-31T16:05:06.000Z",
      cancelAtPeriodEnd: false,
      canceledAt: null,
      trialStart: null,
      trialEnd: null,
      ownerUserId: USER_ID
    };
    (deps.provider.createSubscription as ReturnType<typeof vi.fn>).mockResolvedValue(active);
    await activateConsumerSetupCheckout({
      session: {
        id: "cs_fixture654321",
        customerId: deps.mapping.stripeCustomerId,
        ownerUserId: USER_ID,
        status: "complete",
        livemode: false,
        url: null,
        setupIntentId: "seti_fixture654321",
        paymentMethodId: "pm_fixture654321"
      },
      eventCreatedAt: createdAt,
      config,
      ...deps
    });
    expect(deps.repository.claimTrial).not.toHaveBeenCalled();
    expect(deps.provider.createSubscription).toHaveBeenCalledWith(expect.objectContaining({
      trialEndsAt: null
    }));
  });

  it("rejects cross-account setup completion and Portal ownership conflicts", async () => {
    const deps = dependencies();
    await expect(activateConsumerSetupCheckout({
      session: {
        id: "cs_fixture123456",
        customerId: deps.mapping.stripeCustomerId,
        ownerUserId: "90000000-0000-0000-0000-000000000002",
        status: "complete",
        livemode: false,
        url: null,
        setupIntentId: "seti_fixture123456",
        paymentMethodId: "pm_fixture123456"
      },
      eventCreatedAt: "2026-07-31T16:05:06.000Z",
      config,
      ...deps
    })).rejects.toMatchObject({ code: "ownership-conflict" });
    (deps.provider.retrieveCustomer as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: deps.mapping.stripeCustomerId,
      livemode: false,
      deleted: false,
      ownerUserId: "90000000-0000-0000-0000-000000000002",
      email: null
    });
    await expect(createConsumerPortal({
      context: context(),
      config,
      ...deps
    })).rejects.toMatchObject({ code: "ownership-conflict" });
    expect(deps.provider.createPortalSession).not.toHaveBeenCalled();
  });

  it("accepts only the configured provider redirect boundary", async () => {
    const deps = dependencies();
    await expect(createConsumerPortal({
      context: context(),
      config,
      ...deps
    })).resolves.toEqual({
      url: "http://127.0.0.1:3000/subscription?billing=fixture-portal"
    });
    (deps.provider.createPortalSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      url: "https://attacker.example/redirect"
    });
    await expect(createConsumerPortal({
      context: context(),
      config,
      ...deps
    })).rejects.toMatchObject({ code: "provider-resource-invalid" });
  });

  it("keeps Portal cancellation available while deletion is pending", async () => {
    const deps = dependencies();
    const active = context();
    if (active.status !== "active") throw new Error("test context unavailable");
    const deletionPending: ConsumerContext = {
      ...active,
      status: "deletion-pending",
      account: { ...active.account, accountStatus: "deletion-pending", deletionRequestedAt: "2026-08-01T00:00:00.000Z" }
    };
    await expect(createConsumerPortal({ context: deletionPending, config, ...deps })).resolves.toBeTruthy();
  });

  it("rejects Test-mode Price and Portal resources under a Live configuration", async () => {
    const deps = dependencies();
    const liveConfig = {
      ...config,
      provider: "stripe" as const,
      stripeMode: "live" as const,
      commercialActivation: "live" as const,
      applicationBaseUrl: "https://mathnexa.com",
      subscriberManagementBaseUrl: "https://mathnexa-platform-production.vercel.app"
    };
    await expect(createConsumerSetupCheckout({ context: context(), config: liveConfig, consent, ...deps }))
      .rejects.toMatchObject({ code: "provider-resource-invalid" });
    await expect(createConsumerPortal({ context: context(), config: liveConfig, ...deps }))
      .rejects.toMatchObject({ code: "ownership-conflict" });

    (deps.provider.retrieveCustomer as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: deps.mapping.stripeCustomerId,
      livemode: true,
      deleted: false,
      ownerUserId: USER_ID,
      email: null
    });
    await expect(createConsumerPortal({ context: context(), config: liveConfig, ...deps }))
      .rejects.toMatchObject({ code: "provider-resource-invalid" });
  });
});
