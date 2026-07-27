import "server-only";

import type { BillingSubscriptionStatus, UserId } from "@math-vocabulary-hunt/platform-core";

export const APPROVED_TEST_PLANS = Object.freeze({
  "teacher-pro-monthly": { amountMinorUnits: 999, currency: "usd", interval: "month" },
  "teacher-pro-annual": { amountMinorUnits: 7999, currency: "usd", interval: "year" }
} as const);
export type PaidPlanKey = keyof typeof APPROVED_TEST_PLANS;

export type NormalizedCustomer = Readonly<{
  id: string;
  livemode: boolean;
  deleted: boolean;
  ownerReference: string | null;
  email: string | null;
}>;

export type NormalizedPrice = Readonly<{
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

export type NormalizedSubscription = Readonly<{
  id: string;
  customerId: string;
  livemode: boolean;
  status: BillingSubscriptionStatus | null;
  price: NormalizedPrice | null;
  quantity: number | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  trialEnd: string | null;
  ownerReference: string | null;
}>;

export type NormalizedCheckoutSession = Readonly<{
  id: string;
  customerId: string;
  subscriptionId: string | null;
  ownerReference: string | null;
  status: "open" | "complete" | "expired" | null;
  paymentStatus: string | null;
  livemode: boolean;
  url: string | null;
}>;

export type NormalizedBillingEvent = Readonly<{
  id: string;
  type: string;
  livemode: boolean;
  apiVersion: string | null;
  createdAt: string;
  objectId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  ownerReference: string | null;
}>;

export type BillingOwnerIdentity = Readonly<{
  teacherUserId: UserId;
  email: string | null;
}>;

export const BILLING_DIAGNOSTIC_CATEGORIES = [
  "no_customer_mapping", "customer_missing", "subscription_missing", "duplicate_customer",
  "duplicate_subscription", "unknown_price", "environment_mismatch", "ownership_conflict",
  "stale_event", "provider_unavailable", "database_unavailable", "api_version_mismatch",
  "manual_review_required"
] as const;
export type BillingDiagnosticCategory = (typeof BILLING_DIAGNOSTIC_CATEGORIES)[number];

