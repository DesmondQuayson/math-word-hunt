import "server-only";

import type Stripe from "stripe";

import { normalizeBillingSubscriptionStatus } from "@math-vocabulary-hunt/platform-core";

import type { BillingProvider } from "./provider";
import { BillingProviderError } from "./provider";
import { safeBillingMetadata } from "./security";

const iso = (seconds: unknown) => typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
const id = (value: unknown) => typeof value === "string" ? value : value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : null;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};

export class StripeBillingProvider implements BillingProvider {
  constructor(private readonly stripe: Stripe) {}

  async retrieveCustomer(reference: string) {
    try {
      const customer = await this.stripe.customers.retrieve(reference);
      if ("deleted" in customer && customer.deleted) return { id: customer.id, livemode: false, deleted: true, ownerReference: null, email: null };
      return { id: customer.id, livemode: customer.livemode, deleted: false, ownerReference: customer.metadata.mvh_teacher_id ?? null, email: customer.email ?? null };
    } catch { throw new BillingProviderError("not_found"); }
  }

  async createCustomer(owner: Parameters<BillingProvider["createCustomer"]>[0], idempotencyKey: string) {
    try {
      const customer = await this.stripe.customers.create({ email: owner.email ?? undefined, metadata: safeBillingMetadata(owner.teacherUserId) }, { idempotencyKey });
      return { id: customer.id, livemode: customer.livemode, deleted: false, ownerReference: customer.metadata.mvh_teacher_id ?? null, email: customer.email ?? null };
    } catch { throw new BillingProviderError("unavailable"); }
  }

  async retrievePrice(reference: string) {
    try {
      const price = await this.stripe.prices.retrieve(reference, { expand: ["product"] });
      return { id: price.id, productId: id(price.product) ?? "", active: price.active, livemode: price.livemode, currency: price.currency, amountMinorUnits: price.unit_amount, interval: price.recurring?.interval ?? null, intervalCount: price.recurring?.interval_count ?? null, usageType: price.recurring?.usage_type ?? null };
    } catch { throw new BillingProviderError("not_found"); }
  }

  async createCheckoutSession(input: Parameters<BillingProvider["createCheckoutSession"]>[0]) {
    try {
      const session = await this.stripe.checkout.sessions.create({
        mode: "subscription", customer: input.customerId, client_reference_id: input.owner.teacherUserId,
        line_items: [{ price: input.priceId, quantity: 1 }], allow_promotion_codes: false,
        success_url: input.successUrl, cancel_url: input.cancelUrl,
        metadata: safeBillingMetadata(input.owner.teacherUserId, input.planKey),
        subscription_data: { metadata: safeBillingMetadata(input.owner.teacherUserId, input.planKey) },
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60
      }, { idempotencyKey: input.idempotencyKey });
      return this.normalizeCheckout(session);
    } catch { throw new BillingProviderError("unavailable"); }
  }

  async retrieveCheckoutSession(reference: string) {
    try { return this.normalizeCheckout(await this.stripe.checkout.sessions.retrieve(reference)); }
    catch { throw new BillingProviderError("not_found"); }
  }

  async createPortalSession(input: Parameters<BillingProvider["createPortalSession"]>[0]) {
    try { const session = await this.stripe.billingPortal.sessions.create({ customer: input.customerId, configuration: input.configurationId, return_url: input.returnUrl }); return { url: session.url }; }
    catch { throw new BillingProviderError("unavailable"); }
  }

  async retrieveSubscription(reference: string) {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(reference, { expand: ["items.data.price.product"] });
      return this.normalizeSubscription(subscription);
    } catch { throw new BillingProviderError("not_found"); }
  }

  async listCustomerSubscriptions(customerReference: string) {
    try {
      const page = await this.stripe.subscriptions.list({ customer: customerReference, status: "all", limit: 100, expand: ["data.items.data.price.product"] });
      return page.data.map((subscription) => this.normalizeSubscription(subscription));
    } catch { throw new BillingProviderError("unavailable"); }
  }

  async retrieveInvoice(reference: string) {
    try { const invoice = await this.stripe.invoices.retrieve(reference); const raw = record(invoice); return { id: invoice.id, customerId: id(invoice.customer), subscriptionId: id(raw.subscription), livemode: invoice.livemode }; }
    catch { throw new BillingProviderError("not_found"); }
  }

  constructVerifiedEvent(payload: string | Buffer, signature: string, secret: string) {
    const event = this.stripe.webhooks.constructEvent(payload, signature, secret);
    const object = record(event.data.object);
    const metadata = record(object.metadata);
    return { id: event.id, type: event.type, livemode: event.livemode, apiVersion: event.api_version ?? null, createdAt: new Date(event.created * 1000).toISOString(), objectId: id(object), customerId: id(object.customer), subscriptionId: id(object.subscription) ?? (event.type.startsWith("customer.subscription.") ? id(object) : null), ownerReference: typeof metadata.mvh_teacher_id === "string" ? metadata.mvh_teacher_id : typeof object.client_reference_id === "string" ? object.client_reference_id : null };
  }

  async expireCheckoutSession(reference: string) { try { await this.stripe.checkout.sessions.expire(reference); } catch { throw new BillingProviderError("unavailable"); } }

  private normalizeCheckout(session: Stripe.Checkout.Session) {
    const metadata = session.metadata ?? {};
    return { id: session.id, customerId: id(session.customer) ?? "", subscriptionId: id(session.subscription), ownerReference: metadata.mvh_teacher_id ?? session.client_reference_id ?? null, status: session.status, paymentStatus: session.payment_status, livemode: session.livemode, url: session.url };
  }

  private normalizeSubscription(subscription: Stripe.Subscription) {
    const raw = record(subscription);
    const item = subscription.items.data[0];
    const price = item?.price;
    return {
      id: subscription.id, customerId: id(subscription.customer) ?? "", livemode: subscription.livemode,
      status: normalizeBillingSubscriptionStatus(subscription.status),
      price: price ? { id: price.id, productId: id(price.product) ?? "", active: price.active, livemode: price.livemode, currency: price.currency, amountMinorUnits: price.unit_amount, interval: price.recurring?.interval ?? null, intervalCount: price.recurring?.interval_count ?? null, usageType: price.recurring?.usage_type ?? null } : null,
      quantity: item?.quantity ?? null,
      currentPeriodStart: iso(raw.current_period_start ?? record(item).current_period_start),
      currentPeriodEnd: iso(raw.current_period_end ?? record(item).current_period_end),
      cancelAtPeriodEnd: subscription.cancel_at_period_end, canceledAt: iso(subscription.canceled_at), trialEnd: iso(subscription.trial_end),
      ownerReference: subscription.metadata.mvh_teacher_id ?? null
    };
  }
}
