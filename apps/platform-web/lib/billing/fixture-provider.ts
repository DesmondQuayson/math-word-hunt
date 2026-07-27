import "server-only";

import { createHash } from "node:crypto";
import Stripe from "stripe";

import { STRIPE_API_VERSION, type BillingConfiguration } from "./config";
import { APPROVED_TEST_PLANS, type NormalizedCheckoutSession, type NormalizedCustomer, type NormalizedSubscription } from "./models";
import type { BillingProvider } from "./provider";
import { StripeBillingProvider } from "./stripe-provider";

type State = { customers: Map<string, NormalizedCustomer>; sessions: Map<string, NormalizedCheckoutSession>; subscriptions: Map<string, NormalizedSubscription> };
const globalState = globalThis as typeof globalThis & { __mvhBillingFixture?: State };
const state = globalState.__mvhBillingFixture ??= { customers: new Map(), sessions: new Map(), subscriptions: new Map() };
const suffix = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 18);

export class FixtureBillingProvider implements BillingProvider {
  private readonly verifier: StripeBillingProvider;
  constructor(private readonly config: Extract<BillingConfiguration, { enabled: true }>) {
    this.verifier = new StripeBillingProvider(new Stripe(config.secretKey, { apiVersion: STRIPE_API_VERSION }));
  }
  async retrieveCustomer(reference: string) { const value = state.customers.get(reference); if (!value) throw new Error("Fixture customer missing"); return value; }
  async createCustomer(owner: Parameters<BillingProvider["createCustomer"]>[0]) {
    const id = `cus_fixture${suffix(owner.teacherUserId)}`;
    const value = { id, livemode: false, deleted: false, ownerReference: owner.teacherUserId, email: owner.email } as const;
    state.customers.set(id, value); return value;
  }
  async retrievePrice(reference: string) {
    const entry = Object.entries(this.config.priceIds).find(([, id]) => id === reference);
    if (!entry) throw new Error("Fixture price missing");
    const plan = APPROVED_TEST_PLANS[entry[0] as keyof typeof APPROVED_TEST_PLANS];
    return { id: reference, productId: this.config.productId, active: true, livemode: false, currency: plan.currency, amountMinorUnits: plan.amountMinorUnits, interval: plan.interval, intervalCount: 1, usageType: "licensed" };
  }
  async createCheckoutSession(input: Parameters<BillingProvider["createCheckoutSession"]>[0]) {
    const id = `cs_fixture${suffix(input.idempotencyKey)}`;
    const value = { id, customerId: input.customerId, subscriptionId: null, ownerReference: input.owner.teacherUserId, status: "open", paymentStatus: "unpaid", livemode: false, url: input.successUrl.replace("{CHECKOUT_SESSION_ID}", id) } as const;
    state.sessions.set(id, value); return value;
  }
  async retrieveCheckoutSession(reference: string) { const value = state.sessions.get(reference); if (!value) throw new Error("Fixture session missing"); return value; }
  async createPortalSession(input: Parameters<BillingProvider["createPortalSession"]>[0]) { return { url: `${input.returnUrl}?billing=fixture-portal` }; }
  async retrieveSubscription(reference: string) { const value = state.subscriptions.get(reference); if (!value) throw new Error("Fixture subscription missing"); return value; }
  async listCustomerSubscriptions(customerReference: string) { return [...state.subscriptions.values()].filter((subscription) => subscription.customerId === customerReference); }
  async retrieveInvoice(reference: string) { return { id: reference, customerId: null, subscriptionId: null, livemode: false }; }
  constructVerifiedEvent(payload: string | Buffer, signature: string, secret: string) { return this.verifier.constructVerifiedEvent(payload, signature, secret); }
  async expireCheckoutSession(reference: string) { const current = await this.retrieveCheckoutSession(reference); state.sessions.set(reference, { ...current, status: "expired", url: null }); }
}
