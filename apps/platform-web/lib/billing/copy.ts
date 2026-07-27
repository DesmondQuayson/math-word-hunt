import "server-only";

import type { SubscriptionProjection } from "./repository";

export type BillingAccountCopy = Readonly<{ title: string; message: string; tone: "information" | "success" | "warning" }>;

export function billingAccountCopy(subscription: SubscriptionProjection | null, now = new Date()): BillingAccountCopy {
  if (!subscription) return { title: "Free account", message: "No verified paid subscription is active.", tone: "information" };
  const futurePeriod = subscription.periodEnd !== null && Number.isFinite(Date.parse(subscription.periodEnd)) && Date.parse(subscription.periodEnd) > now.getTime();
  if (subscription.status === "active" && futurePeriod) return subscription.cancelAtPeriodEnd
    ? { title: "Teacher Pro ending at period end", message: "Verified access continues through the current paid period, then ends.", tone: "success" }
    : { title: "Teacher Pro active", message: "Access follows the verified internal entitlement.", tone: "success" };
  if (subscription.status === "past_due" || subscription.status === "unpaid" || subscription.status === "incomplete") return { title: "Payment needs attention", message: "Premium access is unavailable until verified billing reconciliation confirms an active subscription.", tone: "warning" };
  if (subscription.status === "canceled" || subscription.status === "incomplete_expired" || !futurePeriod) return { title: "Subscription ended", message: "The paid period is canceled or expired. The free classroom game remains available.", tone: "information" };
  return { title: "Billing review needed", message: "Premium access remains unavailable while support reviews the billing record.", tone: "warning" };
}
