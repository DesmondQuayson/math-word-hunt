import type { AccountStatus } from "../identity/types";
import type { BillingPlanKey } from "./plan-keys";

export const BILLING_SUBSCRIPTION_STATUSES = [
  "active", "trialing", "incomplete", "incomplete_expired", "past_due",
  "unpaid", "paused", "canceled"
] as const;
export type BillingSubscriptionStatus = (typeof BILLING_SUBSCRIPTION_STATUSES)[number];

export type BillingEntitlementDecision = Readonly<{
  access: "allow" | "deny";
  disposition: "active" | "temporary-denial" | "revoked" | "manual-review";
  reason:
    | "eligible-active-subscription" | "account-restricted" | "emergency-default-deny"
    | "environment-mismatch" | "unapproved-plan" | "duplicate-subscription"
    | "missing-or-expired-period" | "trial-not-approved" | "payment-incomplete"
    | "payment-past-due" | "payment-unpaid" | "subscription-paused"
    | "subscription-ended" | "unknown-or-malformed-status";
}>;

export type BillingEntitlementInput = Readonly<{
  accountStatus: AccountStatus;
  planKey: BillingPlanKey | null;
  planApproved: boolean;
  environmentMatches: boolean;
  subscriptionStatus: unknown;
  currentPeriodEnd: string | null;
  duplicateActiveSubscriptions: boolean;
  emergencyDefaultDeny?: boolean;
  now?: Date;
}>;

export function normalizeBillingSubscriptionStatus(value: unknown): BillingSubscriptionStatus | null {
  return typeof value === "string" && BILLING_SUBSCRIPTION_STATUSES.includes(value as BillingSubscriptionStatus)
    ? value as BillingSubscriptionStatus
    : null;
}

function decision(disposition: BillingEntitlementDecision["disposition"], reason: BillingEntitlementDecision["reason"], access: "allow" | "deny" = "deny"): BillingEntitlementDecision {
  return Object.freeze({ access, disposition, reason });
}

export function deriveBillingEntitlement(input: BillingEntitlementInput): BillingEntitlementDecision {
  if (input.emergencyDefaultDeny === true) return decision("revoked", "emergency-default-deny");
  if (input.accountStatus !== "active") return decision("revoked", "account-restricted");
  if (!input.environmentMatches) return decision("manual-review", "environment-mismatch");
  if (!input.planKey || !input.planApproved) return decision("manual-review", "unapproved-plan");
  if (input.duplicateActiveSubscriptions) return decision("manual-review", "duplicate-subscription");

  const status = normalizeBillingSubscriptionStatus(input.subscriptionStatus);
  if (!status) return decision("manual-review", "unknown-or-malformed-status");
  const periodEnd = input.currentPeriodEnd === null ? null : Date.parse(input.currentPeriodEnd);
  const now = (input.now ?? new Date()).getTime();
  const validPeriod = periodEnd !== null && Number.isFinite(periodEnd) && periodEnd > now;

  if (status === "active") {
    return validPeriod ? decision("active", "eligible-active-subscription", "allow") : decision("temporary-denial", "missing-or-expired-period");
  }
  if (status === "trialing") {
    return decision("temporary-denial", "trial-not-approved");
  }
  if (status === "incomplete" || status === "incomplete_expired") return decision("temporary-denial", "payment-incomplete");
  if (status === "past_due") return decision("temporary-denial", "payment-past-due");
  if (status === "unpaid") return decision("revoked", "payment-unpaid");
  if (status === "paused") return decision("revoked", "subscription-paused");
  return decision("revoked", "subscription-ended");
}
