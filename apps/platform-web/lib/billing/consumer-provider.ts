import "server-only";

import type {
  ConsumerBillingCustomer,
  ConsumerBillingEvent,
  ConsumerBillingInvoice,
  ConsumerBillingPrice,
  ConsumerBillingSubscription,
  ConsumerPortalConfiguration,
  ConsumerSetupSession
} from "./consumer-models";

export interface ConsumerBillingProvider {
  retrieveCustomer(reference: string): Promise<ConsumerBillingCustomer>;
  createCustomer(input: Readonly<{ userId: string; email: string | null; idempotencyKey: string }>): Promise<ConsumerBillingCustomer>;
  retrievePrice(reference: string): Promise<ConsumerBillingPrice>;
  createSetupCheckout(input: Readonly<{
    userId: string;
    customerId: string;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }>): Promise<ConsumerSetupSession>;
  retrieveSetupCheckout(reference: string): Promise<ConsumerSetupSession>;
  createSubscription(input: Readonly<{
    userId: string;
    customerId: string;
    paymentMethodId: string;
    priceId: string;
    trialEndsAt: string | null;
    idempotencyKey: string;
  }>): Promise<ConsumerBillingSubscription>;
  retrieveSubscription(reference: string): Promise<ConsumerBillingSubscription>;
  listCustomerSubscriptions(customerId: string): Promise<readonly ConsumerBillingSubscription[]>;
  retrieveInvoice(reference: string): Promise<ConsumerBillingInvoice>;
  retrievePortalConfiguration(reference: string): Promise<ConsumerPortalConfiguration>;
  createPortalSession(input: Readonly<{ customerId: string; configurationId: string; returnUrl: string }>): Promise<{ url: string }>;
  constructVerifiedEvent(payload: string | Buffer, signature: string, secret: string): ConsumerBillingEvent;
}

export class ConsumerBillingProviderError extends Error {
  constructor(public readonly category: "not-found" | "invalid-resource" | "unavailable") {
    super(`Consumer billing provider operation failed (${category})`);
    this.name = "ConsumerBillingProviderError";
  }
}
