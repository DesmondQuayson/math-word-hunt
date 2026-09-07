import "server-only";

import { createHash } from "node:crypto";

import Stripe from "stripe";

import { STRIPE_API_VERSION } from "./config";
import type { ConsumerBillingConfiguration } from "./consumer-config";
import {
  MATHNEXA_MONTHLY_AMOUNT,
  type ConsumerBillingCustomer,
  type ConsumerBillingInvoice,
  type ConsumerBillingSubscription,
  type ConsumerSetupSession
} from "./consumer-models";
import type { ConsumerBillingProvider } from "./consumer-provider";
import { ConsumerStripeBillingProvider } from "./consumer-stripe-provider";

type State = {
  customers: Map<string, ConsumerBillingCustomer>;
  sessions: Map<string, ConsumerSetupSession>;
  subscriptions: Map<string, ConsumerBillingSubscription>;
  invoices: Map<string, ConsumerBillingInvoice>;
};
const globals = globalThis as typeof globalThis & { __mathnexaConsumerBillingFixture?: State };
const state = globals.__mathnexaConsumerBillingFixture ??= {
  customers: new Map(),
  sessions: new Map(),
  subscriptions: new Map(),
  invoices: new Map()
};
if (!state.invoices) state.invoices = new Map();
const suffix = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 18);

/**
 * Deterministic lifecycle control for the local rehearsal only. The fixture
 * provider stands in for Stripe, so renewals, failures and cancellations have
 * to be simulated by mutating its in-memory state. These helpers are reachable
 * solely through the fixture-gated internal route; the Stripe provider has no
 * equivalent and the configuration parser only admits the fixture provider on
 * a loopback rehearsal in test mode.
 */
export function readFixtureSubscription(subscriptionId: string): ConsumerBillingSubscription | null {
  return state.subscriptions.get(subscriptionId) ?? null;
}

export function mutateFixtureSubscription(
  subscriptionId: string,
  patch: Partial<ConsumerBillingSubscription>
): ConsumerBillingSubscription | null {
  const current = state.subscriptions.get(subscriptionId);
  if (!current) return null;
  const next: ConsumerBillingSubscription = Object.freeze({ ...current, ...patch, id: current.id, customerId: current.customerId });
  state.subscriptions.set(subscriptionId, next);
  return next;
}

export function recordFixtureInvoice(invoice: ConsumerBillingInvoice): ConsumerBillingInvoice {
  const frozen = Object.freeze({ ...invoice });
  state.invoices.set(invoice.id, frozen);
  return frozen;
}

export class ConsumerFixtureBillingProvider implements ConsumerBillingProvider {
  private readonly verifier: ConsumerStripeBillingProvider;

  constructor(private readonly config: ConsumerBillingConfiguration) {
    this.verifier = new ConsumerStripeBillingProvider(
      new Stripe(config.secretKey, { apiVersion: STRIPE_API_VERSION }),
      config.stripeMode
    );
  }

  async retrieveCustomer(reference: string) {
    const customer = state.customers.get(reference);
    if (!customer) throw new Error("Fixture customer missing");
    return customer;
  }

  async createCustomer(input: Parameters<ConsumerBillingProvider["createCustomer"]>[0]) {
    const id = `cus_fixture${suffix(input.userId)}`;
    const customer = {
      id, livemode: false, deleted: false, ownerUserId: input.userId, email: input.email
    } as const;
    state.customers.set(id, customer);
    return customer;
  }

  async retrievePrice(reference: string) {
    if (reference !== this.config.priceId) throw new Error("Fixture price missing");
    return {
      id: reference,
      productId: this.config.productId,
      active: true,
      livemode: false,
      currency: "usd",
      amountMinorUnits: MATHNEXA_MONTHLY_AMOUNT,
      interval: "month",
      intervalCount: 1,
      usageType: "licensed"
    };
  }

  async createSetupCheckout(input: Parameters<ConsumerBillingProvider["createSetupCheckout"]>[0]) {
    const id = `cs_fixture${suffix(input.idempotencyKey)}`;
    const session = {
      id,
      customerId: input.customerId,
      ownerUserId: input.userId,
      status: "complete",
      livemode: false,
      url: input.successUrl.replace("{CHECKOUT_SESSION_ID}", id),
      setupIntentId: `seti_fixture${suffix(id)}`,
      paymentMethodId: `pm_fixture${suffix(id)}`
    } as const;
    state.sessions.set(id, session);
    return session;
  }

  async retrieveSetupCheckout(reference: string) {
    const session = state.sessions.get(reference);
    if (!session) throw new Error("Fixture session missing");
    return session;
  }

  async createSubscription(input: Parameters<ConsumerBillingProvider["createSubscription"]>[0]) {
    const id = `sub_fixture${suffix(input.idempotencyKey)}`;
    const trialEnd = input.trialEndsAt;
    const now = trialEnd
      ? new Date(Date.parse(trialEnd) - 24 * 60 * 60 * 1000)
      : new Date();
    const periodEnd = trialEnd ?? new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds()
    )).toISOString();
    const subscription: ConsumerBillingSubscription = {
      id,
      customerId: input.customerId,
      livemode: false,
      status: trialEnd ? "trialing" : "active",
      price: await this.retrievePrice(input.priceId),
      quantity: 1,
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      endedAt: null,
      trialStart: trialEnd ? now.toISOString() : null,
      trialEnd,
      latestInvoiceId: null,
      ownerUserId: input.userId
    };
    state.subscriptions.set(id, subscription);
    return subscription;
  }

  async retrieveSubscription(reference: string) {
    const subscription = state.subscriptions.get(reference);
    if (!subscription) throw new Error("Fixture subscription missing");
    return subscription;
  }

  async listCustomerSubscriptions(customerId: string) {
    return [...state.subscriptions.values()].filter((subscription) => subscription.customerId === customerId);
  }

  async retrieveInvoice(reference: string) {
    const recorded = state.invoices.get(reference);
    if (recorded) return recorded;
    const subscription = [...state.subscriptions.values()][0] ?? null;
    return {
      id: reference,
      customerId: subscription?.customerId ?? null,
      subscriptionId: subscription?.id ?? null,
      livemode: false,
      paid: reference.includes("paid"),
      status: reference.includes("paid") ? "paid" : "open",
      paidAt: null,
      amountPaidMinorUnits: reference.includes("paid") ? MATHNEXA_MONTHLY_AMOUNT : 0
    };
  }

  async createPortalSession(input: Parameters<ConsumerBillingProvider["createPortalSession"]>[0]) {
    return { url: `${input.returnUrl}?billing=fixture-portal` };
  }

  async retrievePortalConfiguration(reference: string) {
    return {
      id: reference,
      active: true,
      livemode: false,
      cancelAtPeriodEnd: true,
      paymentMethodUpdateEnabled: true,
      invoiceHistoryEnabled: true
    };
  }

  constructVerifiedEvent(payload: string | Buffer, signature: string, secret: string) {
    return this.verifier.constructVerifiedEvent(payload, signature, secret);
  }
}
