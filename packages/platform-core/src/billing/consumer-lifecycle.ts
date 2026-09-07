import { normalizeBillingSubscriptionStatus, type BillingSubscriptionStatus } from "./subscription-state";

/**
 * One place that says what every billing-provider subscription status means for MathNexa.
 *
 * The access gate never reads this: it evaluates the server-owned entitlement
 * projection. This mapper exists so the projection, the reconciliation trigger,
 * the Account UI and the admin diagnostic all describe a status the same way
 * instead of each growing its own string comparisons.
 *
 *   entitled       trialing, active — access through the provider's boundary
 *   grace-eligible past_due — access only inside the one non-extending renewal
 *                  grace window, and only after a prior successful payment
 *   pending        incomplete, unpaid, paused — locked, recoverable by payment
 *   not-entitled   canceled, incomplete_expired — ended
 *   unknown        anything the provider adds later — refused, reviewed, never coerced
 */
export type ConsumerSubscriptionCategory = "entitled" | "grace-eligible" | "pending" | "not-entitled" | "unknown";

export const CONSUMER_SUBSCRIPTION_TERMINAL_STATUSES: readonly BillingSubscriptionStatus[] = ["canceled", "incomplete_expired"];

export function classifyConsumerSubscriptionStatus(status: unknown): ConsumerSubscriptionCategory {
  const normalized = normalizeBillingSubscriptionStatus(status);
  if (!normalized) return "unknown";
  if (normalized === "active" || normalized === "trialing") return "entitled";
  if (normalized === "past_due") return "grace-eligible";
  if (normalized === "canceled" || normalized === "incomplete_expired") return "not-entitled";
  return "pending";
}

export function isTerminalConsumerSubscriptionStatus(status: unknown): boolean {
  const normalized = normalizeBillingSubscriptionStatus(status);
  return normalized !== null && CONSUMER_SUBSCRIPTION_TERMINAL_STATUSES.includes(normalized);
}

export type ConsumerSubscriptionSnapshot = Readonly<{
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
  updatedAt?: string | null;
  endedAt?: string | null;
}>;

function millis(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/**
 * Which of a customer's subscription rows speaks for their access.
 *
 * Never "the first row", "the oldest row" or "the most recently touched row":
 * a live subscription always outranks every historical one, and among rows of
 * the same rank the one whose paid period reaches furthest wins. A canceled
 * subscription that happened to be updated after a newer active one was created
 * therefore cannot make the Account page say "Ended".
 */
export function selectAuthoritativeConsumerSubscription<T extends ConsumerSubscriptionSnapshot>(rows: readonly T[]): T | null {
  if (rows.length === 0) return null;
  const ranked = [...rows].sort((left, right) => {
    const leftTerminal = isTerminalConsumerSubscriptionStatus(left.status) ? 1 : 0;
    const rightTerminal = isTerminalConsumerSubscriptionStatus(right.status) ? 1 : 0;
    if (leftTerminal !== rightTerminal) return leftTerminal - rightTerminal;
    const boundary = millis(right.currentPeriodEnd ?? right.trialEnd) - millis(left.currentPeriodEnd ?? left.trialEnd);
    if (boundary !== 0) return boundary;
    return millis(right.updatedAt) - millis(left.updatedAt);
  });
  return ranked[0] ?? null;
}

export type ConsumerSubscriptionPresentation = Readonly<{
  /** Short status label, e.g. "Active", "Trial active", "Ended". */
  label: string;
  /** One sentence the customer can act on. */
  detail: string;
  /** The date the label refers to, when there is one. */
  boundaryAt: string | null;
  /** How the boundary should be introduced: "Renews", "Access until", "Trial ends", "Ended". */
  boundaryLabel: string | null;
  tone: "success" | "information" | "warning";
  category: ConsumerSubscriptionCategory;
}>;

/**
 * Customer-facing description of a synchronized subscription row.
 *
 * "Ended" is reserved for a subscription the provider has actually ended. A
 * live subscription whose stored period boundary is already in the past is a
 * stale local record awaiting reconciliation, and is described as such.
 */
export function describeConsumerSubscription(row: ConsumerSubscriptionSnapshot, now: Date = new Date()): ConsumerSubscriptionPresentation {
  const category = classifyConsumerSubscriptionStatus(row.status);
  const status = normalizeBillingSubscriptionStatus(row.status);
  const nowMs = now.getTime();
  const periodEndMs = millis(row.currentPeriodEnd);
  const futurePeriod = periodEndMs > nowMs;

  if (status === "trialing") {
    const trialEndMs = millis(row.trialEnd);
    if (trialEndMs > nowMs) {
      return { label: "Trial active", detail: "Billing begins when the trial ends, then renews monthly until canceled.", boundaryAt: row.trialEnd, boundaryLabel: "Trial ends", tone: "success", category };
    }
    return { label: "Trial ending", detail: "The trial period has passed. The server is confirming the first paid period with the billing provider.", boundaryAt: row.trialEnd, boundaryLabel: "Trial ended", tone: "information", category };
  }
  if (status === "active") {
    if (row.cancelAtPeriodEnd) {
      return { label: futurePeriod ? "Active until period end" : "Cancellation scheduled", detail: "Renewal is canceled. Access continues through the paid period already charged.", boundaryAt: row.currentPeriodEnd, boundaryLabel: futurePeriod ? "Cancels" : "Canceled at", tone: "information", category };
    }
    if (futurePeriod) {
      return { label: "Active", detail: "The subscription renews automatically until canceled.", boundaryAt: row.currentPeriodEnd, boundaryLabel: "Renews", tone: "success", category };
    }
    return { label: "Active — confirming renewal", detail: "The billing provider reports this subscription as active. The server is confirming the latest renewal; no access change is final until it does.", boundaryAt: row.currentPeriodEnd, boundaryLabel: "Last confirmed period ended", tone: "information", category };
  }
  if (category === "grace-eligible") {
    return { label: "Payment requires attention", detail: "The latest renewal payment did not succeed. Update the payment method in billing management; access resumes automatically once payment succeeds.", boundaryAt: row.currentPeriodEnd, boundaryLabel: null, tone: "warning", category };
  }
  if (category === "pending") {
    return { label: "Payment requires attention", detail: "The subscription is waiting on a successful payment. Complete payment in billing management to restore access.", boundaryAt: null, boundaryLabel: null, tone: "warning", category };
  }
  if (category === "not-entitled") {
    const endedAt = row.endedAt ?? row.currentPeriodEnd;
    return { label: "Ended", detail: "This subscription is no longer active. Start a new subscription to restore access.", boundaryAt: endedAt, boundaryLabel: endedAt ? "Ended" : null, tone: "information", category };
  }
  return { label: "Status under review", detail: "The billing provider reported a subscription status this product does not recognize. Access follows the last verified state while support reviews it.", boundaryAt: null, boundaryLabel: null, tone: "warning", category };
}
