import "server-only";

import type { PaidPlanKey, BillingOwnerIdentity, NormalizedBillingEvent, NormalizedCheckoutSession, NormalizedCustomer, NormalizedPrice, NormalizedSubscription } from "./models";

export interface BillingProvider {
  retrieveCustomer(reference: string): Promise<NormalizedCustomer>;
  createCustomer(owner: BillingOwnerIdentity, idempotencyKey: string): Promise<NormalizedCustomer>;
  retrievePrice(reference: string): Promise<NormalizedPrice>;
  createCheckoutSession(input: Readonly<{
    owner: BillingOwnerIdentity;
    customerId: string;
    planKey: PaidPlanKey;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }>): Promise<NormalizedCheckoutSession>;
  retrieveCheckoutSession(reference: string): Promise<NormalizedCheckoutSession>;
  createPortalSession(input: Readonly<{ customerId: string; configurationId: string; returnUrl: string }>): Promise<{ url: string }>;
  retrieveSubscription(reference: string): Promise<NormalizedSubscription>;
  listCustomerSubscriptions(customerReference: string): Promise<readonly NormalizedSubscription[]>;
  retrieveInvoice(reference: string): Promise<{ id: string; customerId: string | null; subscriptionId: string | null; livemode: boolean }>;
  constructVerifiedEvent(payload: string | Buffer, signature: string, secret: string): NormalizedBillingEvent;
  expireCheckoutSession(reference: string): Promise<void>;
}

export class BillingProviderError extends Error {
  constructor(public readonly category: "configuration" | "not_found" | "invalid_resource" | "unavailable") {
    super(`Billing provider operation failed (${category})`);
    this.name = "BillingProviderError";
  }
}
