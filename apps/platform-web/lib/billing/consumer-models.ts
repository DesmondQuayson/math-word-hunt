import "server-only";

import type { BillingSubscriptionStatus } from "@math-vocabulary-hunt/platform-core";

export const MATHNEXA_PLAN_KEY = "mathnexa-monthly" as const;
export const MATHNEXA_MONTHLY_AMOUNT = 599;
export const MATHNEXA_TRIAL_SECONDS = 24 * 60 * 60;

export type ConsumerBillingCustomer = Readonly<{
  id: string;
  livemode: boolean;
  deleted: boolean;
  ownerUserId: string | null;
  email: string | null;
}>;

export type ConsumerBillingPrice = Readonly<{
  id: string;
  productId: string;
  active: boolean;
  livemode: boolean;
  currency: string;
  amountMinorUnits: number | null;
  interval: string | null;
  intervalCount: number | null;
  usageType: string | null;
}>;

export type ConsumerSetupSession = Readonly<{
  id: string;
  customerId: string;
  ownerUserId: string | null;
  status: "open" | "complete" | "expired" | null;
  livemode: boolean;
  url: string | null;
  setupIntentId: string | null;
  paymentMethodId: string | null;
}>;

/**
 * The authoritative snapshot of a Stripe subscription as the synchronizer
 * consumes it. `status` is null when Stripe reports a status this build does
 * not know; such a snapshot is never projected, only reviewed.
 */
export type ConsumerBillingSubscription = Readonly<{
  id: string;
  customerId: string;
  livemode: boolean;
  status: BillingSubscriptionStatus | null;
  price: ConsumerBillingPrice | null;
  quantity: number | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  endedAt: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  latestInvoiceId: string | null;
  ownerUserId: string | null;
}>;

export type ConsumerBillingInvoice = Readonly<{
  id: string;
  customerId: string | null;
  subscriptionId: string | null;
  livemode: boolean;
  paid: boolean;
  status: string | null;
  paidAt: string | null;
  amountPaidMinorUnits: number | null;
}>;

export type ConsumerPortalConfiguration = Readonly<{
  id: string;
  active: boolean;
  livemode: boolean;
  cancelAtPeriodEnd: boolean;
  paymentMethodUpdateEnabled: boolean;
  invoiceHistoryEnabled: boolean;
}>;

export type ConsumerBillingEvent = Readonly<{
  id: string;
  type: string;
  livemode: boolean;
  apiVersion: string | null;
  createdAt: string;
  objectId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  ownerUserId: string | null;
}>;
