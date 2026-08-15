import "server-only";

import type { UserId } from "@math-vocabulary-hunt/platform-core";

export const BILLING_EVENT_ALLOWLIST = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed"
] as const;
export type BillingEventType = (typeof BILLING_EVENT_ALLOWLIST)[number];

export const BILLING_RETURN_DESTINATIONS = ["/account", "/pricing"] as const;
export type BillingReturnDestination = (typeof BILLING_RETURN_DESTINATIONS)[number];

export type CheckoutIntent = Readonly<{
  planKey: "teacher-pro-monthly" | "teacher-pro-annual";
  returnDestination: BillingReturnDestination;
}>;

export type BillingOwner = Readonly<{
  teacherUserId: UserId;
  accountStatus: "active" | "suspended" | "deletion-requested" | "closed";
}>;

export interface BillingProviderGateway {
  resolveOrCreateCustomer(owner: BillingOwner, idempotencyKey: string): Promise<{ customerReference: string }>;
  retrieveAuthoritativeSubscription(subscriptionReference: string): Promise<unknown>;
}

export function parseCheckoutIntent(value: unknown): CheckoutIntent {
  if (!value || typeof value !== "object") throw new Error("Invalid checkout request");
  const input = value as Record<string, unknown>;
  if (input.planKey !== "teacher-pro-monthly" && input.planKey !== "teacher-pro-annual") {
    throw new Error("Invalid checkout request");
  }
  if (input.returnDestination !== "/account" && input.returnDestination !== "/pricing") {
    throw new Error("Invalid checkout request");
  }
  return Object.freeze({ planKey: input.planKey, returnDestination: input.returnDestination });
}

export function isAllowlistedBillingEvent(value: unknown): value is BillingEventType {
  return typeof value === "string" && BILLING_EVENT_ALLOWLIST.includes(value as BillingEventType);
}
