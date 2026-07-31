import "server-only";

import { createHash } from "node:crypto";

import type { ConsumerContext } from "@/lib/auth/consumer-context";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

import type { ConsumerBillingConfiguration } from "./consumer-config";
import {
  MATHNEXA_MONTHLY_AMOUNT,
  MATHNEXA_TRIAL_SECONDS,
  type ConsumerBillingSubscription,
  type ConsumerSetupSession
} from "./consumer-models";
import type { ConsumerBillingProvider } from "./consumer-provider";
import {
  SupabaseConsumerBillingRepository,
  type ConsumerCustomerMapping
} from "./consumer-repository";
import { billingIdempotencyKey } from "./security";

export class ConsumerBillingOperationError extends Error {
  constructor(public readonly code:
    | "account-restricted"
    | "checkout-disabled"
    | "portal-disabled"
    | "already-subscribed"
    | "no-customer"
    | "ownership-conflict"
    | "provider-resource-invalid"
    | "setup-incomplete"
    | "trial-ineligible"
    | "unavailable"
  ) {
    super(`Consumer billing operation unavailable (${code})`);
    this.name = "ConsumerBillingOperationError";
  }
}

export function createConsumerBillingRepository(): SupabaseConsumerBillingRepository | null {
  const client = createServiceSupabaseClient();
  return client ? new SupabaseConsumerBillingRepository(client) : null;
}

function owner(context: ConsumerContext) {
  if (context.status !== "active" || !context.userId || !context.account || !context.account.emailConfirmedAt) {
    throw new ConsumerBillingOperationError("account-restricted");
  }
  return { userId: context.userId, email: context.email, account: context.account };
}

function validCustomer(customer: Awaited<ReturnType<ConsumerBillingProvider["retrieveCustomer"]>>, userId: string) {
  return !customer.deleted && !customer.livemode &&
    (customer.ownerUserId === null || customer.ownerUserId === userId);
}

function validPrice(
  price: Awaited<ReturnType<ConsumerBillingProvider["retrievePrice"]>>,
  config: ConsumerBillingConfiguration
) {
  return !price.livemode && price.active && price.id === config.priceId &&
    price.productId === config.productId && price.currency === "usd" &&
    price.amountMinorUnits === MATHNEXA_MONTHLY_AMOUNT &&
    price.interval === "month" && price.intervalCount === 1 &&
    price.usageType === "licensed";
}

function validSubscription(
  subscription: ConsumerBillingSubscription,
  input: Readonly<{ userId: string; customerId: string; config: ConsumerBillingConfiguration }>
) {
  return !subscription.livemode &&
    subscription.customerId === input.customerId &&
    subscription.ownerUserId === input.userId &&
    subscription.quantity === 1 &&
    subscription.price !== null &&
    validPrice(subscription.price, input.config);
}

function validHostedRedirect(
  value: string,
  config: ConsumerBillingConfiguration,
  kind: "checkout" | "portal"
): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (config.provider === "fixture") {
      return url.origin === config.applicationBaseUrl;
    }
    return url.protocol === "https:" &&
      url.hostname === (kind === "checkout" ? "checkout.stripe.com" : "billing.stripe.com");
  } catch {
    return false;
  }
}

export async function resolveConsumerBillingCustomer(input: Readonly<{
  userId: string;
  email: string | null;
  config: ConsumerBillingConfiguration;
  provider: ConsumerBillingProvider;
  repository: SupabaseConsumerBillingRepository;
}>): Promise<ConsumerCustomerMapping> {
  const mapped = await input.repository.getCustomerMapping(input.userId);
  if (mapped) {
    const customer = await input.provider.retrieveCustomer(mapped.stripeCustomerId);
    if (!validCustomer(customer, input.userId)) throw new ConsumerBillingOperationError("ownership-conflict");
    return mapped;
  }
  const customer = await input.provider.createCustomer({
    userId: input.userId,
    email: input.email,
    idempotencyKey: billingIdempotencyKey("consumer-customer", input.userId, "test")
  });
  if (!validCustomer(customer, input.userId)) throw new ConsumerBillingOperationError("ownership-conflict");
  const stored = await input.repository.storeCustomerMapping(input.userId, customer.id);
  if (stored.stripeCustomerId !== customer.id) {
    const winner = await input.provider.retrieveCustomer(stored.stripeCustomerId);
    if (!validCustomer(winner, input.userId)) throw new ConsumerBillingOperationError("ownership-conflict");
  }
  return stored;
}

export async function createConsumerSetupCheckout(input: Readonly<{
  context: ConsumerContext;
  config: ConsumerBillingConfiguration;
  provider: ConsumerBillingProvider;
  repository: SupabaseConsumerBillingRepository;
}>): Promise<{ url: string; trialEligible: boolean }> {
  if (!input.config.checkoutEnabled) throw new ConsumerBillingOperationError("checkout-disabled");
  const activeOwner = owner(input.context);
  const current = await input.repository.getCurrentSubscriptions(activeOwner.userId);
  if (current.length > 0) throw new ConsumerBillingOperationError("already-subscribed");
  const price = await input.provider.retrievePrice(input.config.priceId);
  if (!validPrice(price, input.config)) throw new ConsumerBillingOperationError("provider-resource-invalid");
  const customer = await resolveConsumerBillingCustomer({
    userId: activeOwner.userId,
    email: activeOwner.email,
    config: input.config,
    provider: input.provider,
    repository: input.repository
  });
  const providerSubscriptions = await input.provider.listCustomerSubscriptions(customer.stripeCustomerId);
  if (providerSubscriptions.some((subscription) =>
    subscription.status !== "canceled" && subscription.status !== "incomplete_expired"
  )) throw new ConsumerBillingOperationError("already-subscribed");

  const window = Math.floor(Date.now() / (30 * 60 * 1000));
  const session = await input.provider.createSetupCheckout({
    userId: activeOwner.userId,
    customerId: customer.stripeCustomerId,
    successUrl: `${input.config.applicationBaseUrl}/checkout/status?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${input.config.applicationBaseUrl}/pricing?checkout=canceled`,
    idempotencyKey: billingIdempotencyKey("consumer-setup", activeOwner.userId, String(window))
  });
  if (!session.url || !validHostedRedirect(session.url, input.config, "checkout") ||
    session.livemode || session.customerId !== customer.stripeCustomerId ||
    session.ownerUserId !== activeOwner.userId) {
    throw new ConsumerBillingOperationError("provider-resource-invalid");
  }
  return { url: session.url, trialEligible: activeOwner.account.trialRedeemedAt === null };
}

export async function activateConsumerSetupCheckout(input: Readonly<{
  session: ConsumerSetupSession;
  eventCreatedAt: string;
  config: ConsumerBillingConfiguration;
  provider: ConsumerBillingProvider;
  repository: SupabaseConsumerBillingRepository;
}>): Promise<ConsumerBillingSubscription> {
  if (input.session.livemode || input.session.status !== "complete" ||
    !input.session.paymentMethodId || !input.session.ownerUserId || !input.session.customerId) {
    throw new ConsumerBillingOperationError("setup-incomplete");
  }
  const mapping = await input.repository.getMappingByCustomer(input.session.customerId);
  if (!mapping || mapping.ownerUserId !== input.session.ownerUserId) {
    throw new ConsumerBillingOperationError("ownership-conflict");
  }
  const account = await input.repository.getAccount(mapping.ownerUserId);
  if (!account || account.account_status !== "active") {
    throw new ConsumerBillingOperationError("account-restricted");
  }
  const existing = await input.repository.getCurrentSubscriptions(mapping.ownerUserId);
  if (existing.length > 0) {
    return input.provider.retrieveSubscription(existing[0]!.stripeSubscriptionId);
  }
  const checkoutHash = createHash("sha256").update(input.session.id).digest("hex");
  const eventTime = new Date(input.eventCreatedAt);
  if (!Number.isFinite(eventTime.getTime())) throw new ConsumerBillingOperationError("unavailable");
  const trialEligible = account.trial_redeemed_at === null ||
    account.trial_redemption_checkout_hash === checkoutHash;
  let trialEndsAt: string | null = null;
  if (trialEligible) {
    const claim = await input.repository.claimTrial(mapping.ownerUserId, checkoutHash, eventTime.toISOString());
    if (claim !== "claimed" && claim !== "already_claimed") {
      throw new ConsumerBillingOperationError("trial-ineligible");
    }
    trialEndsAt = new Date(eventTime.getTime() + MATHNEXA_TRIAL_SECONDS * 1000).toISOString();
  }
  const subscription = await input.provider.createSubscription({
    userId: mapping.ownerUserId,
    customerId: mapping.stripeCustomerId,
    paymentMethodId: input.session.paymentMethodId,
    priceId: input.config.priceId,
    trialEndsAt,
    idempotencyKey: billingIdempotencyKey("consumer-subscription", mapping.ownerUserId, input.session.id)
  });
  if (!validSubscription(subscription, {
    userId: mapping.ownerUserId,
    customerId: mapping.stripeCustomerId,
    config: input.config
  })) throw new ConsumerBillingOperationError("provider-resource-invalid");
  if (trialEndsAt && (
    subscription.status !== "trialing" ||
    !subscription.trialStart ||
    !subscription.trialEnd ||
    Date.parse(subscription.trialEnd) - Date.parse(subscription.trialStart) !== MATHNEXA_TRIAL_SECONDS * 1000
  )) throw new ConsumerBillingOperationError("provider-resource-invalid");
  return subscription;
}

export async function createConsumerPortal(input: Readonly<{
  context: ConsumerContext;
  config: ConsumerBillingConfiguration;
  provider: ConsumerBillingProvider;
  repository: SupabaseConsumerBillingRepository;
}>) {
  if (!input.config.portalEnabled) throw new ConsumerBillingOperationError("portal-disabled");
  const activeOwner = owner(input.context);
  const mapping = await input.repository.getCustomerMapping(activeOwner.userId);
  if (!mapping) throw new ConsumerBillingOperationError("no-customer");
  const customer = await input.provider.retrieveCustomer(mapping.stripeCustomerId);
  if (!validCustomer(customer, activeOwner.userId)) throw new ConsumerBillingOperationError("ownership-conflict");
  const session = await input.provider.createPortalSession({
    customerId: mapping.stripeCustomerId,
    configurationId: input.config.portalConfigurationId,
    returnUrl: `${input.config.applicationBaseUrl}/subscription`
  });
  if (!validHostedRedirect(session.url, input.config, "portal")) {
    throw new ConsumerBillingOperationError("provider-resource-invalid");
  }
  return session;
}

export async function getConsumerCheckoutState(input: Readonly<{
  context: ConsumerContext;
  sessionId: string;
  provider: ConsumerBillingProvider;
  repository: SupabaseConsumerBillingRepository;
}>): Promise<"processing" | "trialing" | "active" | "payment-required" | "expired" | "unavailable" | "manual-review"> {
  if (!/^cs_(?:test_|fixture)?[A-Za-z0-9_]+$/.test(input.sessionId) ||
    input.context.status !== "active" || !input.context.userId) return "unavailable";
  try {
    const mapping = await input.repository.getCustomerMapping(input.context.userId);
    if (!mapping) return "unavailable";
    const session = await input.provider.retrieveSetupCheckout(input.sessionId);
    if (session.livemode || session.customerId !== mapping.stripeCustomerId ||
      session.ownerUserId !== input.context.userId) return "manual-review";
    const latest = await input.repository.getLatestSubscription(input.context.userId);
    if (latest?.status === "trialing" && latest.trialEnd && Date.parse(latest.trialEnd) > Date.now()) return "trialing";
    if (latest?.status === "active" && latest.currentPeriodEnd && Date.parse(latest.currentPeriodEnd) > Date.now()) return "active";
    if (latest && ["past_due", "unpaid", "incomplete", "incomplete_expired"].includes(latest.status)) return "payment-required";
    if (session.status === "expired") return "expired";
    return session.status === "complete" ? "processing" : "processing";
  } catch {
    return "unavailable";
  }
}
