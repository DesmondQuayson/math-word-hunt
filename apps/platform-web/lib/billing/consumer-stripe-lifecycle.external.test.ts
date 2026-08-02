import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { expect, test } from "vitest";

import { STRIPE_API_VERSION } from "./config";
import type { ConsumerBillingConfiguration } from "./consumer-config";
import { SupabaseConsumerBillingRepository } from "./consumer-repository";
import { ConsumerStripeBillingProvider } from "./consumer-stripe-provider";
import { processConsumerBillingWebhook } from "./consumer-webhook";

const enabled = process.env.MVH_PHASE7C_SANDBOX_LIFECYCLE === "true";
const evidencePath = process.env.PHASE7C_SANDBOX_EVIDENCE_PATH ?? "";
const productId = process.env.STRIPE_PRODUCT_MATHNEXA ?? "";
const priceId = process.env.STRIPE_PRICE_MATHNEXA_MONTHLY ?? "";
const portalId = process.env.STRIPE_PORTAL_CONFIGURATION_ID ?? "";
const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const supabaseUrl = process.env.SUPABASE_TEST_URL ?? "";
const supabaseSecret = process.env.SUPABASE_TEST_SECRET_KEY ?? "";
const GRACE_SECONDS = 7 * 24 * 60 * 60;
const INVOICE_FINALIZATION_SECONDS = 60 * 60;
const INVOICE_FINALIZATION_MARGIN_SECONDS = 5 * 60;

type Evidence = {
  passed: boolean;
  blocker: string | null;
  monthlyPriceUsd599: boolean;
  successfulMonthlyRenewal: boolean;
  failedRenewal: boolean;
  graceSeconds: number | null;
  graceNonExtending: boolean;
  paymentRecovery: boolean;
  cancellationAtPeriodEnd: boolean;
  entitlementRemovedAtExpiration: boolean;
  replayProtection: boolean;
  staleEventProtection: boolean;
  noEducationalDataCreated: boolean;
  stripeCleanupZero: boolean;
  clockStatus: string | null;
  subscriptionStatus: string | null;
  renewalInvoiceStatus: string | null;
  paymentIntentStatus: string | null;
  lastWebhookEventReached: string | null;
  invoiceCreatedAcknowledged: boolean;
  defaultPaymentMethodConfirmed: boolean;
  paidEntitlementExtendedOnce: boolean;
  failureReason: string | null;
  lastWebhookState: string | null;
  expirationProjectionState: string | null;
  expirationEntitlementState: string | null;
  expirationTimestampDeltaSeconds: number | null;
  deletionReplayState: string | null;
};

const evidence: Evidence = {
  passed: false,
  blocker: "not-started",
  monthlyPriceUsd599: false,
  successfulMonthlyRenewal: false,
  failedRenewal: false,
  graceSeconds: null,
  graceNonExtending: false,
  paymentRecovery: false,
  cancellationAtPeriodEnd: false,
  entitlementRemovedAtExpiration: false,
  replayProtection: false,
  staleEventProtection: false,
  noEducationalDataCreated: false,
  stripeCleanupZero: false,
  clockStatus: null,
  subscriptionStatus: null,
  renewalInvoiceStatus: null,
  paymentIntentStatus: null,
  lastWebhookEventReached: null,
  invoiceCreatedAcknowledged: false,
  defaultPaymentMethodConfirmed: false,
  paidEntitlementExtendedOnce: false,
  failureReason: null,
  lastWebhookState: null,
  expirationProjectionState: null,
  expirationEntitlementState: null,
  expirationTimestampDeltaSeconds: null,
  deletionReplayState: null
};

function saveEvidence() {
  if (!evidencePath) return;
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

function requireEnvironment() {
  const requirements = [
    [secretKey, "sk_test_"], [webhookSecret, "whsec_"], [productId, "prod_"],
    [priceId, "price_"], [portalId, "bpc_"], [supabaseUrl, "http"], [supabaseSecret, ""]
  ] as const;
  if (requirements.some(([value, prefix]) => !value || !value.startsWith(prefix))) {
    throw new Error("sandbox-environment-invalid");
  }
}

const objectId = (value: unknown): string | null => typeof value === "string"
  ? value
  : value && typeof value === "object" && "id" in value && typeof value.id === "string"
    ? value.id
    : null;

function periodEnd(subscription: Stripe.Subscription): number {
  const value = (subscription as unknown as Record<string, unknown>).current_period_end ??
    (subscription.items.data[0] as unknown as Record<string, unknown> | undefined)?.current_period_end;
  if (typeof value !== "number") throw new Error("subscription-period-end-missing");
  return value;
}

async function waitFor<T>(label: string, read: () => Promise<T>, accept: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`${label}-timed-out`);
}

function isMissing(error: unknown) {
  const value = error as { statusCode?: number; code?: string };
  return value?.statusCode === 404 || value?.code === "resource_missing";
}

test.skipIf(!enabled)("completes the remaining real Stripe Sandbox renewal lifecycle", async () => {
  requireEnvironment();
  const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
  const admin = createClient(supabaseUrl, supabaseSecret, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const repository = new SupabaseConsumerBillingRepository(admin, "test");
  const provider = new ConsumerStripeBillingProvider(stripe);
  const config: ConsumerBillingConfiguration = Object.freeze({
    enabled: true,
    provider: "stripe",
    stripeMode: "test",
    commercialActivation: "rehearsal",
    apiVersion: STRIPE_API_VERSION,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY!,
    secretKey,
    webhookSecret,
    productId,
    priceId,
    portalConfigurationId: portalId,
    applicationBaseUrl: "http://127.0.0.1:3000",
    subscriberManagementBaseUrl: "http://127.0.0.1:3000",
    checkoutEnabled: true,
    portalEnabled: true,
    webhookEnabled: true,
    emergencyDefaultDeny: false,
    renewalGraceDays: 7,
    refundReviewDays: 7,
    automaticRefunds: false,
    supportEmail: null
  });
  const runId = randomUUID().replaceAll("-", "");
  const email = `phase7c-renewal-${runId}@example.invalid`;
  let phase = "sandbox-resource-validation";
  let clockId: string | null = null;
  let customerId: string | null = null;
  let subscriptionId: string | null = null;

  const waitForClockReady = async (id: string) => waitFor(
    "test-clock-ready",
    () => stripe.testHelpers.testClocks.retrieve(id),
    (value) => {
      if (value.status === "internal_failure") throw new Error("test-clock-internal-failure");
      evidence.clockStatus = value.status;
      return value.status === "ready";
    }
  );

  const deleteHarnessClock = async (id: string) => {
    const clock = await stripe.testHelpers.testClocks.retrieve(id);
    if (clock.status === "advancing") await waitForClockReady(id);
    await stripe.testHelpers.testClocks.del(id);
  };

  const processEvent = async (
    type: string,
    object: Stripe.Subscription | Stripe.Invoice,
    created: number,
    eventId = `evt_${randomUUID().replaceAll("-", "")}`
  ) => {
    const payload = JSON.stringify({
      id: eventId,
      object: "event",
      api_version: STRIPE_API_VERSION,
      created,
      data: { object },
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      type
    });
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
      timestamp: Math.floor(Date.now() / 1000)
    });
    const result = await processConsumerBillingWebhook({ payload, signature, config, provider, repository });
    if (result.status >= 200 && result.status < 300) {
      evidence.lastWebhookEventReached = type;
      evidence.lastWebhookState = result.body.state;
    }
    return { ...result, eventId, payload, signature };
  };

  const entitlement = async (userId: string) => {
    const { data, error } = await admin.from("consumer_game_entitlements")
      .select("entitlement_state, current_period_ends_at, grace_ends_at, authoritative_version")
      .eq("user_id", userId).single();
    if (error) throw new Error("entitlement-read-failed");
    return data;
  };

  try {
    const [product, price, portal] = await Promise.all([
      stripe.products.retrieve(productId),
      stripe.prices.retrieve(priceId),
      stripe.billingPortal.configurations.retrieve(portalId)
    ]);
    expect(product.livemode).toBe(false);
    expect(price.livemode).toBe(false);
    expect(price.product).toBe(productId);
    expect(price.currency).toBe("usd");
    expect(price.unit_amount).toBe(599);
    expect(price.recurring?.interval).toBe("month");
    expect(price.recurring?.interval_count).toBe(1);
    expect(portal.livemode).toBe(false);
    evidence.monthlyPriceUsd599 = true;

    phase = "prior-synthetic-reconciliation";
    for await (const priorClock of stripe.testHelpers.testClocks.list({ limit: 100 })) {
      if (priorClock.name?.startsWith("MathNexa phase7c ")) {
        await deleteHarnessClock(priorClock.id);
      }
    }

    phase = "local-consumer-creation";
    const identityMode = await admin.rpc("set_platform_identity_model", { p_identity_model: "consumer-v1" });
    if (identityMode.error) throw new Error("consumer-identity-mode-failed");
    const createdUser = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: `Mx7c-${randomUUID()}-Strong!`
    });
    if (createdUser.error || !createdUser.data.user) throw new Error("consumer-account-create-failed");
    const userId = createdUser.data.user.id;

    phase = "stripe-test-clock-setup";
    const initialTime = Math.floor(Date.now() / 1000) - 60;
    const clock = await stripe.testHelpers.testClocks.create({
      frozen_time: initialTime,
      name: `MathNexa phase7c ${runId.slice(0, 12)}`
    });
    clockId = clock.id;
    const metadata = {
      application: "mathnexa",
      environment: "sandbox",
      phase: "7c",
      rehearsal: "remaining-lifecycle",
      rehearsal_id: runId,
      mathnexa_account_id: userId,
      mathnexa_plan: "mathnexa-monthly"
    };
    const customer = await stripe.customers.create({ email, test_clock: clock.id, metadata });
    customerId = customer.id;
    const paymentMethod = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: paymentMethod.id }
    });
    await repository.storeCustomerMapping(userId, customer.id);

    phase = "initial-paid-subscription-setup";
    let subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId, quantity: 1 }],
      default_payment_method: paymentMethod.id,
      collection_method: "charge_automatically",
      payment_behavior: "error_if_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      metadata
    });
    subscriptionId = subscription.id;
    const initialInvoiceId = objectId(subscription.latest_invoice);
    if (!initialInvoiceId) throw new Error("initial-invoice-missing");
    const initialInvoice = await stripe.invoices.retrieve(initialInvoiceId);
    expect(initialInvoice.status).toBe("paid");
    const initialPaid = await processEvent("invoice.paid", initialInvoice, initialInvoice.created);
    expect(initialPaid).toMatchObject({ status: 200, body: { state: "subscription-active" } });

    const advanceClock = async (target: number) => {
      await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: target });
      const ready = await waitForClockReady(clock.id);
      if (ready.frozen_time !== target) throw new Error("test-clock-target-mismatch");
      return ready;
    };
    const cycleInvoice = async (minimumCreated: number) => waitFor(
      "cycle-invoice-created",
      async () => (await stripe.invoices.list({ customer: customer.id, subscription: subscription.id, limit: 100 })).data,
      (invoices) => invoices.some((invoice) =>
        invoice.id !== initialInvoice.id && invoice.created >= minimumCreated - 120 &&
        invoice.billing_reason === "subscription_cycle"
      )
    ).then((invoices) => invoices.find((invoice) =>
      invoice.id !== initialInvoice.id && invoice.created >= minimumCreated - 120 &&
      invoice.billing_reason === "subscription_cycle"
    )!);

    const paymentIntentStatus = async (invoiceId: string): Promise<string | null> => {
      const payments = await stripe.invoicePayments.list({
        invoice: invoiceId,
        limit: 100,
        expand: ["data.payment.payment_intent"]
      });
      const payment = payments.data.find((candidate) => candidate.payment.type === "payment_intent");
      if (!payment || payment.payment.type !== "payment_intent") return null;
      const intent = payment.payment.payment_intent;
      if (!intent) return null;
      return typeof intent === "string"
        ? (await stripe.paymentIntents.retrieve(intent)).status
        : intent.status;
    };

    const finalizeCycleInvoice = async (
      invoice: Stripe.Invoice,
      expected: "paid" | "failed"
    ): Promise<Stripe.Invoice> => {
      const createdAcknowledgement = await processEvent("invoice.created", invoice, invoice.created);
      if (createdAcknowledgement.status < 200 || createdAcknowledgement.status >= 300) {
        throw new Error("invoice-created-webhook-not-acknowledged");
      }
      evidence.invoiceCreatedAcknowledged = true;
      let authoritative = await stripe.invoices.retrieve(invoice.id);
      evidence.renewalInvoiceStatus = authoritative.status;
      if (authoritative.status === "draft") {
        const currentClock = await stripe.testHelpers.testClocks.retrieve(clock.id);
        evidence.clockStatus = currentClock.status;
        const finalizationTarget = Math.max(
          currentClock.frozen_time + 1,
          authoritative.created + INVOICE_FINALIZATION_SECONDS + INVOICE_FINALIZATION_MARGIN_SECONDS
        );
        await advanceClock(finalizationTarget);
      }
      authoritative = await waitFor(
        expected === "paid" ? "renewal-invoice-paid" : "renewal-invoice-failed",
        () => stripe.invoices.retrieve(invoice.id),
        (value) => expected === "paid"
          ? value.status === "paid" && value.amount_remaining === 0
          : value.status === "open" && value.attempted && value.amount_remaining > 0
      );
      evidence.renewalInvoiceStatus = authoritative.status;
      evidence.paymentIntentStatus = await paymentIntentStatus(authoritative.id);
      return authoritative;
    };

    phase = "successful-monthly-renewal";
    const firstRenewalAt = periodEnd(subscription);
    const customerBeforeRenewal = await stripe.customers.retrieve(customer.id);
    if ("deleted" in customerBeforeRenewal && customerBeforeRenewal.deleted) {
      throw new Error("renewal-customer-deleted");
    }
    if (objectId(customerBeforeRenewal.invoice_settings.default_payment_method) !== paymentMethod.id ||
      objectId(subscription.default_payment_method) !== paymentMethod.id) {
      throw new Error("renewal-default-payment-method-missing");
    }
    evidence.defaultPaymentMethodConfirmed = true;
    const beforeRenewalEntitlement = await entitlement(userId);
    await advanceClock(firstRenewalAt + 60);
    const renewalDraft = await cycleInvoice(firstRenewalAt);
    const paidRenewal = await finalizeCycleInvoice(renewalDraft, "paid");
    expect(paidRenewal.amount_paid).toBe(599);
    expect(paidRenewal.currency).toBe("usd");
    if (evidence.paymentIntentStatus !== null) expect(evidence.paymentIntentStatus).toBe("succeeded");
    subscription = await stripe.subscriptions.retrieve(subscription.id);
    evidence.subscriptionStatus = subscription.status;
    expect(subscription.status).toBe("active");
    const paidRenewalResult = await processEvent("invoice.paid", paidRenewal, paidRenewal.created);
    expect(paidRenewalResult).toMatchObject({ status: 200, body: { state: "subscription-active" } });
    const afterRenewalEntitlement = await entitlement(userId);
    expect(afterRenewalEntitlement.authoritative_version).toBe(beforeRenewalEntitlement.authoritative_version + 1);
    expect(Date.parse(afterRenewalEntitlement.current_period_ends_at!)).toBe(periodEnd(subscription) * 1000);
    expect(Date.parse(afterRenewalEntitlement.current_period_ends_at!))
      .toBeGreaterThan(Date.parse(beforeRenewalEntitlement.current_period_ends_at!));
    evidence.paidEntitlementExtendedOnce = true;
    evidence.successfulMonthlyRenewal = true;

    phase = "failed-renewal";
    const failingMethod = await stripe.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: failingMethod.id }
    });
    subscription = await stripe.subscriptions.update(subscription.id, {
      default_payment_method: failingMethod.id,
      proration_behavior: "none"
    });
    const failedRenewalAt = periodEnd(subscription);
    await advanceClock(failedRenewalAt + 60);
    const failedDraft = await cycleInvoice(failedRenewalAt);
    const failedInvoice = await finalizeCycleInvoice(failedDraft, "failed");
    if (evidence.paymentIntentStatus !== null) {
      expect(["requires_payment_method", "requires_action"]).toContain(evidence.paymentIntentStatus);
    }
    subscription = await stripe.subscriptions.retrieve(subscription.id);
    evidence.subscriptionStatus = subscription.status;
    const failedResult = await processEvent("invoice.payment_failed", failedInvoice, failedInvoice.created);
    expect(failedResult).toMatchObject({ status: 200, body: { state: "subscription-grace-period" } });
    const firstGrace = await entitlement(userId);
    const graceSeconds = Math.floor((Date.parse(firstGrace.grace_ends_at!) - failedInvoice.created * 1000) / 1000);
    expect(graceSeconds).toBe(GRACE_SECONDS);
    evidence.failedRenewal = true;
    evidence.graceSeconds = graceSeconds;

    phase = "non-extending-grace-and-replay";
    const retryCreated = failedInvoice.created + 60;
    const retryEvent = await processEvent("invoice.payment_failed", failedInvoice, retryCreated);
    expect(retryEvent).toMatchObject({ status: 200, body: { state: "subscription-grace-period" } });
    const afterRetry = await entitlement(userId);
    expect(afterRetry.grace_ends_at).toBe(firstGrace.grace_ends_at);
    evidence.graceNonExtending = true;
    const replay = await processConsumerBillingWebhook({
      payload: retryEvent.payload,
      signature: retryEvent.signature,
      config,
      provider,
      repository
    });
    expect(replay).toMatchObject({ status: 200, body: { state: "processed" } });
    expect((await entitlement(userId)).authoritative_version).toBe(afterRetry.authoritative_version);
    evidence.replayProtection = true;

    phase = "stale-renewal-event";
    const stale = await processEvent("customer.subscription.updated", subscription, failedInvoice.created - 1);
    expect(stale).toMatchObject({ status: 200, body: { state: "stale_ignored" } });
    expect((await entitlement(userId)).grace_ends_at).toBe(firstGrace.grace_ends_at);
    evidence.staleEventProtection = true;

    phase = "payment-recovery";
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: paymentMethod.id }
    });
    subscription = await stripe.subscriptions.update(subscription.id, {
      default_payment_method: paymentMethod.id,
      proration_behavior: "none"
    });
    const recoveredInvoice = await stripe.invoices.pay(failedInvoice.id, { payment_method: paymentMethod.id });
    expect(recoveredInvoice.status).toBe("paid");
    expect(recoveredInvoice.amount_remaining).toBe(0);
    subscription = await stripe.subscriptions.retrieve(subscription.id);
    const recoveredAt = recoveredInvoice.status_transitions.paid_at ?? retryCreated + 60;
    const recovery = await processEvent("invoice.paid", recoveredInvoice, recoveredAt);
    expect(recovery).toMatchObject({ status: 200, body: { state: "subscription-active" } });
    const recoveredEntitlement = await entitlement(userId);
    expect(recoveredEntitlement.grace_ends_at).toBeNull();
    evidence.paymentRecovery = true;

    phase = "period-end-cancellation";
    subscription = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
      proration_behavior: "none"
    });
    const cancellationExpiry = periodEnd(subscription);
    const cancellation = await processEvent("customer.subscription.updated", subscription, recoveredAt + 60);
    expect(cancellation).toMatchObject({
      status: 200,
      body: { state: "subscription-canceled-through-period-end" }
    });
    expect(Date.parse((await entitlement(userId)).current_period_ends_at!)).toBe(cancellationExpiry * 1000);
    evidence.cancellationAtPeriodEnd = true;

    phase = "entitlement-expiration";
    const expirationClock = await advanceClock(cancellationExpiry + 60);
    subscription = await waitFor(
      "subscription-canceled",
      () => stripe.subscriptions.retrieve(subscription.id),
      (value) => value.status === "canceled"
    );
    const deletedAt = Math.max(expirationClock.frozen_time, cancellationExpiry);
    const expired = await processEvent("customer.subscription.deleted", subscription, deletedAt);
    evidence.expirationProjectionState = expired.body.state;
    if (expired.status !== 200 || expired.body.state !== "subscription-expired") {
      throw new Error("expiration-projection-not-expired");
    }
    const expiredEntitlement = await entitlement(userId);
    evidence.expirationEntitlementState = expiredEntitlement.entitlement_state;
    if (expiredEntitlement.entitlement_state !== "subscription-expired") {
      throw new Error("expiration-entitlement-not-expired");
    }
    evidence.expirationTimestampDeltaSeconds = Math.floor(
      (Date.parse(expiredEntitlement.current_period_ends_at!) - cancellationExpiry * 1000) / 1000
    );
    if (evidence.expirationTimestampDeltaSeconds !== 0) {
      throw new Error("expiration-timestamp-mismatch");
    }
    const deletionReplay = await processEvent(
      "customer.subscription.deleted", subscription, deletedAt, expired.eventId
    );
    evidence.deletionReplayState = deletionReplay.body.state;
    if (deletionReplay.status !== 200 || deletionReplay.body.state !== "processed") {
      throw new Error("expiration-replay-not-idempotent");
    }
    evidence.entitlementRemovedAtExpiration = true;

    phase = "educational-data-boundary";
    for (const table of ["teacher_profiles", "teacher_classes", "teacher_activities"]) {
      const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
      if (error || count !== 0) throw new Error("educational-data-created");
    }
    evidence.noEducationalDataCreated = true;
    evidence.blocker = null;
  } catch (error) {
    const providerCode = (error as { code?: string }).code;
    const safeMessage = error instanceof Error && /^[a-z0-9-]+$/i.test(error.message)
      ? error.message
      : null;
    evidence.failureReason = providerCode ?? safeMessage ?? "assertion-failed";
    evidence.blocker = providerCode ? `${phase}:${providerCode}` : phase;
    throw new Error(`Phase 7C Sandbox lifecycle failed at ${evidence.blocker}`);
  } finally {
    phase = "stripe-cleanup-to-zero";
    let cleanupFailed = false;
    if (clockId) {
      try {
        await deleteHarnessClock(clockId);
      } catch (error) {
        if (!isMissing(error)) cleanupFailed = true;
      }
    }
    if (customerId) {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if (!("deleted" in customer && customer.deleted)) cleanupFailed = true;
      } catch (error) {
        if (!isMissing(error)) cleanupFailed = true;
      }
    }
    if (subscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        if (subscription.status !== "canceled") cleanupFailed = true;
      } catch (error) {
        if (!isMissing(error)) cleanupFailed = true;
      }
    }
    evidence.stripeCleanupZero = !cleanupFailed;
    if (cleanupFailed && evidence.blocker === null) evidence.blocker = "stripe-cleanup-to-zero";
    evidence.passed = evidence.blocker === null && evidence.stripeCleanupZero &&
      evidence.monthlyPriceUsd599 && evidence.successfulMonthlyRenewal && evidence.failedRenewal &&
      evidence.graceSeconds === GRACE_SECONDS && evidence.graceNonExtending &&
      evidence.paymentRecovery && evidence.cancellationAtPeriodEnd &&
      evidence.entitlementRemovedAtExpiration && evidence.replayProtection &&
      evidence.staleEventProtection && evidence.noEducationalDataCreated &&
      evidence.invoiceCreatedAcknowledged && evidence.defaultPaymentMethodConfirmed &&
      evidence.paidEntitlementExtendedOnce;
    saveEvidence();
  }
}, 600_000);
