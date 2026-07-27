import "server-only";

import type { UserId } from "@math-vocabulary-hunt/platform-core";

import type { TeacherContext } from "@/lib/auth/teacher-context";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

import type { BillingConfiguration } from "./config";
import type { PaidPlanKey } from "./models";
import type { BillingProvider } from "./provider";
import { SupabaseBillingRepository, type CustomerMapping } from "./repository";
import { billingIdempotencyKey } from "./security";
import { validateApprovedPrice, validateCustomerOwnership } from "./validation";

export type CheckoutDisplayState = "processing" | "active" | "payment-incomplete" | "canceled" | "expired" | "unavailable" | "manual-review";

export class BillingOperationError extends Error {
  constructor(public readonly code: "unavailable" | "account-restricted" | "invalid-plan" | "already-subscribed" | "ownership-conflict" | "provider-resource-invalid" | "checkout-disabled" | "portal-disabled" | "no-customer") {
    super(`Billing operation unavailable (${code})`);
    this.name = "BillingOperationError";
  }
}

export function createBillingRepository(): SupabaseBillingRepository | null {
  const client = createServiceSupabaseClient();
  return client ? new SupabaseBillingRepository(client) : null;
}

function activeOwner(context: TeacherContext): { teacherUserId: UserId; email: string | null } {
  if (context.status !== "active" || !context.userId) throw new BillingOperationError("account-restricted");
  return { teacherUserId: context.userId, email: context.email };
}

export async function resolveBillingCustomer(input: Readonly<{ context: TeacherContext; config: Extract<BillingConfiguration, { enabled: true }>; provider: BillingProvider; repository: SupabaseBillingRepository }>): Promise<CustomerMapping> {
  const owner = activeOwner(input.context);
  const environment = input.config.stripeMode;
  const mapped = await input.repository.getCustomerMapping(owner.teacherUserId, environment);
  if (mapped) {
    const customer = await input.provider.retrieveCustomer(mapped.stripeCustomerId);
    if (!validateCustomerOwnership(customer, owner.teacherUserId)) throw new BillingOperationError("ownership-conflict");
    return mapped;
  }
  const key = billingIdempotencyKey("customer", owner.teacherUserId, environment);
  const customer = await input.provider.createCustomer(owner, key);
  if (!validateCustomerOwnership(customer, owner.teacherUserId)) throw new BillingOperationError("ownership-conflict");
  const stored = await input.repository.storeCustomerMapping(owner.teacherUserId, environment, customer.id);
  if (stored.stripeCustomerId !== customer.id) {
    const winner = await input.provider.retrieveCustomer(stored.stripeCustomerId);
    if (!validateCustomerOwnership(winner, owner.teacherUserId)) throw new BillingOperationError("ownership-conflict");
  }
  return stored;
}

export async function createHostedCheckout(input: Readonly<{ context: TeacherContext; config: Extract<BillingConfiguration, { enabled: true }>; provider: BillingProvider; repository: SupabaseBillingRepository; planKey: PaidPlanKey; returnDestination: "/account" | "/pricing" }>) {
  if (!input.config.checkoutEnabled) throw new BillingOperationError("checkout-disabled");
  const owner = activeOwner(input.context);
  const current = await input.repository.getCurrentSubscriptions(owner.teacherUserId, input.config.stripeMode);
  if (current.length > 0) throw new BillingOperationError("already-subscribed");
  const priceId = input.config.priceIds[input.planKey];
  const price = await input.provider.retrievePrice(priceId);
  if (!validateApprovedPrice(price, input.planKey, input.config.productId)) throw new BillingOperationError("provider-resource-invalid");
  const customer = await resolveBillingCustomer(input);
  const providerSubscriptions = await input.provider.listCustomerSubscriptions(customer.stripeCustomerId);
  if (providerSubscriptions.some((subscription) => subscription.status !== "canceled" && subscription.status !== "incomplete_expired")) {
    throw new BillingOperationError("already-subscribed");
  }
  const window = Math.floor(Date.now() / (30 * 60 * 1000));
  const session = await input.provider.createCheckoutSession({
    owner, customerId: customer.stripeCustomerId, planKey: input.planKey, priceId,
    successUrl: `${input.config.applicationBaseUrl}/checkout/status?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${input.config.applicationBaseUrl}${input.returnDestination}?checkout=canceled`,
    idempotencyKey: billingIdempotencyKey("checkout", owner.teacherUserId, `${input.planKey}:${window}`)
  });
  if (!session.url || session.livemode || session.customerId !== customer.stripeCustomerId) throw new BillingOperationError("provider-resource-invalid");
  return { url: session.url };
}

export async function createHostedPortal(input: Readonly<{ context: TeacherContext; config: Extract<BillingConfiguration, { enabled: true }>; provider: BillingProvider; repository: SupabaseBillingRepository }>) {
  if (!input.config.portalEnabled) throw new BillingOperationError("portal-disabled");
  const owner = activeOwner(input.context);
  const mapping = await input.repository.getCustomerMapping(owner.teacherUserId, input.config.stripeMode);
  if (!mapping) throw new BillingOperationError("no-customer");
  const customer = await input.provider.retrieveCustomer(mapping.stripeCustomerId);
  if (!validateCustomerOwnership(customer, owner.teacherUserId)) throw new BillingOperationError("ownership-conflict");
  return input.provider.createPortalSession({ customerId: mapping.stripeCustomerId, configurationId: input.config.portalConfigurationId, returnUrl: `${input.config.applicationBaseUrl}/account` });
}

export async function getCheckoutDisplayState(input: Readonly<{ context: TeacherContext; config: Extract<BillingConfiguration, { enabled: true }>; provider: BillingProvider; repository: SupabaseBillingRepository; sessionId: string }>): Promise<CheckoutDisplayState> {
  if (!/^cs_(?:test_|fixture_)?[A-Za-z0-9_]+$/.test(input.sessionId)) return "unavailable";
  if (input.context.status !== "active" || !input.context.userId) return "unavailable";
  try {
    const mapping = await input.repository.getCustomerMapping(input.context.userId, input.config.stripeMode);
    if (!mapping) return "unavailable";
    const session = await input.provider.retrieveCheckoutSession(input.sessionId);
    if (session.livemode || session.customerId !== mapping.stripeCustomerId || (session.ownerReference && session.ownerReference !== input.context.userId)) return "manual-review";
    const subscriptions = await input.repository.getCurrentSubscriptions(input.context.userId, input.config.stripeMode);
    const active = subscriptions.find((subscription) => subscription.status === "active" && subscription.periodEnd && Date.parse(subscription.periodEnd) > Date.now());
    if (active) return "active";
    if (session.status === "expired") return "expired";
    if (session.status === "complete" && session.paymentStatus !== "paid") return "payment-incomplete";
    if (session.status === "complete") return "processing";
    if (session.status === "open") return "processing";
    return "unavailable";
  } catch { return "unavailable"; }
}
