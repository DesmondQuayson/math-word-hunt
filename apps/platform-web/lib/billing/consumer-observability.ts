import "server-only";

import { ConsoleMonitoringAdapter, emitOperationalEvent } from "@/lib/observability/server";

/**
 * Structured, PII-free billing lifecycle events.
 *
 * A renewal that synchronizes silently and a webhook that fails silently are
 * equally dangerous: the first cannot be audited, the second cannot be acted
 * on. Every event here carries only the event type, a redacted provider
 * reference, the outcome, and a correlation id. Never an email, a card, a
 * customer id, or a payload.
 */
export const BILLING_LIFECYCLE_EVENTS = {
  SUBSCRIPTION_SYNCHRONIZED: { code: "subscription-synchronized", severity: "info" },
  SUBSCRIPTION_RENEWAL_SYNCHRONIZED: { code: "subscription-renewal-synchronized", severity: "info" },
  SUBSCRIPTION_RECONCILED: { code: "subscription-reconciled", severity: "info" },
  SUBSCRIPTION_RECONCILIATION_UNAVAILABLE: { code: "subscription-reconciliation-unavailable", severity: "warning" },
  ENTITLEMENT_MISMATCH_REPAIRED: { code: "entitlement-mismatch-repaired", severity: "warning" },
  ENTITLEMENT_MISMATCH_UNRESOLVED: { code: "entitlement-mismatch-unresolved", severity: "error" },
  SUBSCRIPTION_STATUS_UNKNOWN: { code: "subscription-status-unknown", severity: "error" },
  WEBHOOK_API_VERSION_DRIFT: { code: "webhook-api-version-drift", severity: "warning" },
  WEBHOOK_MANUAL_REVIEW: { code: "webhook-manual-review", severity: "warning" },
  WEBHOOK_PROCESSING_FAILED: { code: "webhook-processing-failed", severity: "error" },
  RECONCILIATION_SWEEP_COMPLETED: { code: "reconciliation-sweep-completed", severity: "info" }
} as const;

export type BillingLifecycleEventName = keyof typeof BILLING_LIFECYCLE_EVENTS;
export type BillingLifecycleDetail = Readonly<Record<string, string | number | boolean | null>>;

/** Last characters of a provider reference: enough to correlate, never to identify. */
export function redactProviderReference(reference: string | null | undefined): string | null {
  if (!reference) return null;
  return `…${reference.slice(-6)}`;
}

const FORBIDDEN_DETAIL_KEY = /(email|customer|payload|body|card|payment_method|secret|token|address|name)/i;

export function emitBillingLifecycleEvent(
  name: BillingLifecycleEventName,
  detail: BillingLifecycleDetail,
  correlationId: string
): boolean {
  const descriptor = BILLING_LIFECYCLE_EVENTS[name];
  const safeDetail = Object.fromEntries(
    Object.entries(detail).filter(([key, value]) =>
      !FORBIDDEN_DETAIL_KEY.test(key) && (value === null || ["string", "number", "boolean"].includes(typeof value))
    )
  );
  return emitOperationalEvent(new ConsoleMonitoringAdapter(), {
    category: "billing",
    severity: descriptor.severity,
    code: descriptor.code,
    correlationId: correlationId || "billing-lifecycle",
    detail: safeDetail
  });
}
