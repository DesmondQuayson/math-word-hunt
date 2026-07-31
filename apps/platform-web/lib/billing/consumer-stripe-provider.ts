import "server-only";

import type Stripe from "stripe";

import { normalizeBillingSubscriptionStatus } from "@math-vocabulary-hunt/platform-core";

import type { ConsumerBillingProvider } from "./consumer-provider";
import { ConsumerBillingProviderError } from "./consumer-provider";
import type { ConsumerBillingSubscription } from "./consumer-models";

const id = (value: unknown): string | null => typeof value === "string"
  ? value
  : value && typeof value === "object" && "id" in value && typeof value.id === "string" ? value.id : null;
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const iso = (value: unknown): string | null => typeof value === "number" ? new Date(value * 1000).toISOString() : null;
const metadata = (userId: string) => ({ mathnexa_account_id: userId, mathnexa_plan: "mathnexa-monthly" });

export class ConsumerStripeBillingProvider implements ConsumerBillingProvider {
  constructor(private readonly stripe: Stripe) {}

  async retrieveCustomer(reference: string) {
    try {
      const customer = await this.stripe.customers.retrieve(reference);
      if ("deleted" in customer && customer.deleted) {
        return { id: customer.id, livemode: false, deleted: true, ownerUserId: null, email: null };
      }
      return {
        id: customer.id,
        livemode: customer.livemode,
        deleted: false,
        ownerUserId: customer.metadata.mathnexa_account_id ?? null,
        email: customer.email ?? null
      };
    } catch {
      throw new ConsumerBillingProviderError("not-found");
    }
  }

  async createCustomer(input: Parameters<ConsumerBillingProvider["createCustomer"]>[0]) {
    try {
      const customer = await this.stripe.customers.create({
        email: input.email ?? undefined,
        metadata: metadata(input.userId)
      }, { idempotencyKey: input.idempotencyKey });
      return {
        id: customer.id,
        livemode: customer.livemode,
        deleted: false,
        ownerUserId: customer.metadata.mathnexa_account_id ?? null,
        email: customer.email ?? null
      };
    } catch {
      throw new ConsumerBillingProviderError("unavailable");
    }
  }

  async retrievePrice(reference: string) {
    try {
      const price = await this.stripe.prices.retrieve(reference, { expand: ["product"] });
      return {
        id: price.id,
        productId: id(price.product) ?? "",
        active: price.active,
        livemode: price.livemode,
        currency: price.currency,
        amountMinorUnits: price.unit_amount,
        interval: price.recurring?.interval ?? null,
        intervalCount: price.recurring?.interval_count ?? null,
        usageType: price.recurring?.usage_type ?? null
      };
    } catch {
      throw new ConsumerBillingProviderError("not-found");
    }
  }

  async createSetupCheckout(input: Parameters<ConsumerBillingProvider["createSetupCheckout"]>[0]) {
    try {
      const session = await this.stripe.checkout.sessions.create({
        mode: "setup",
        customer: input.customerId,
        client_reference_id: input.userId,
        payment_method_types: ["card"],
        metadata: metadata(input.userId),
        setup_intent_data: { metadata: metadata(input.userId) },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60
      }, { idempotencyKey: input.idempotencyKey });
      return this.normalizeSetup(session);
    } catch {
      throw new ConsumerBillingProviderError("unavailable");
    }
  }

  async retrieveSetupCheckout(reference: string) {
    try {
      return this.normalizeSetup(await this.stripe.checkout.sessions.retrieve(reference, { expand: ["setup_intent"] }));
    } catch {
      throw new ConsumerBillingProviderError("not-found");
    }
  }

  async createSubscription(input: Parameters<ConsumerBillingProvider["createSubscription"]>[0]) {
    try {
      const subscription = await this.stripe.subscriptions.create({
        customer: input.customerId,
        items: [{ price: input.priceId, quantity: 1 }],
        default_payment_method: input.paymentMethodId,
        collection_method: "charge_automatically",
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        metadata: metadata(input.userId),
        ...(input.trialEndsAt ? {
          trial_end: Math.floor(Date.parse(input.trialEndsAt) / 1000),
          trial_settings: { end_behavior: { missing_payment_method: "cancel" } }
        } : {})
      }, { idempotencyKey: input.idempotencyKey });
      return this.normalizeSubscription(subscription);
    } catch {
      throw new ConsumerBillingProviderError("unavailable");
    }
  }

  async retrieveSubscription(reference: string) {
    try {
      return this.normalizeSubscription(await this.stripe.subscriptions.retrieve(reference, {
        expand: ["items.data.price.product"]
      }));
    } catch {
      throw new ConsumerBillingProviderError("not-found");
    }
  }

  async listCustomerSubscriptions(customerId: string) {
    try {
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
        expand: ["data.items.data.price.product"]
      });
      return subscriptions.data.map((subscription) => this.normalizeSubscription(subscription));
    } catch {
      throw new ConsumerBillingProviderError("unavailable");
    }
  }

  async retrieveInvoice(reference: string) {
    try {
      const invoice = await this.stripe.invoices.retrieve(reference);
      const raw = record(invoice);
      return {
        id: invoice.id,
        customerId: id(invoice.customer),
        subscriptionId: id(raw.subscription),
        livemode: invoice.livemode,
        paid: raw.paid === true
      };
    } catch {
      throw new ConsumerBillingProviderError("not-found");
    }
  }

  async createPortalSession(input: Parameters<ConsumerBillingProvider["createPortalSession"]>[0]) {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: input.customerId,
        configuration: input.configurationId,
        return_url: input.returnUrl
      });
      return { url: session.url };
    } catch {
      throw new ConsumerBillingProviderError("unavailable");
    }
  }

  constructVerifiedEvent(payload: string | Buffer, signature: string, secret: string) {
    const event = this.stripe.webhooks.constructEvent(payload, signature, secret);
    const object = record(event.data.object);
    const objectMetadata = record(object.metadata);
    return {
      id: event.id,
      type: event.type,
      livemode: event.livemode,
      apiVersion: event.api_version ?? null,
      createdAt: new Date(event.created * 1000).toISOString(),
      objectId: id(object),
      customerId: id(object.customer),
      subscriptionId: id(object.subscription) ?? (event.type.startsWith("customer.subscription.") ? id(object) : null),
      ownerUserId: typeof objectMetadata.mathnexa_account_id === "string"
        ? objectMetadata.mathnexa_account_id
        : typeof object.client_reference_id === "string" ? object.client_reference_id : null
    };
  }

  private normalizeSetup(session: Stripe.Checkout.Session) {
    const intent = record(session.setup_intent);
    const paymentMethodId = intent.status === "succeeded" ? id(intent.payment_method) : null;
    return {
      id: session.id,
      customerId: id(session.customer) ?? "",
      ownerUserId: session.metadata?.mathnexa_account_id ?? session.client_reference_id ?? null,
      status: session.status,
      livemode: session.livemode,
      url: session.url,
      setupIntentId: id(session.setup_intent),
      paymentMethodId
    };
  }

  private normalizeSubscription(subscription: Stripe.Subscription): ConsumerBillingSubscription {
    const raw = record(subscription);
    const item = subscription.items.data[0];
    const price = item?.price;
    return {
      id: subscription.id,
      customerId: id(subscription.customer) ?? "",
      livemode: subscription.livemode,
      status: normalizeBillingSubscriptionStatus(subscription.status),
      price: price ? {
        id: price.id,
        productId: id(price.product) ?? "",
        active: price.active,
        livemode: price.livemode,
        currency: price.currency,
        amountMinorUnits: price.unit_amount,
        interval: price.recurring?.interval ?? null,
        intervalCount: price.recurring?.interval_count ?? null,
        usageType: price.recurring?.usage_type ?? null
      } : null,
      quantity: item?.quantity ?? null,
      currentPeriodStart: iso(raw.current_period_start ?? record(item).current_period_start),
      currentPeriodEnd: iso(raw.current_period_end ?? record(item).current_period_end),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: iso(subscription.canceled_at),
      trialStart: iso(subscription.trial_start),
      trialEnd: iso(subscription.trial_end),
      ownerUserId: subscription.metadata.mathnexa_account_id ?? null
    };
  }
}
