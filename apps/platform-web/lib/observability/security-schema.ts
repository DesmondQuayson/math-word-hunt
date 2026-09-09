import "server-only";

import type { ObservabilityCategory } from "@math-vocabulary-hunt/platform-core";

import type { SecurityEnvironment } from "./security-environment";
import type { SecurityEventDetail } from "./security-redaction";

/**
 * The typed security-event contract of the read path (schema version 1).
 *
 * Producers keep emitting the `SafeEvent` shape they always have; nothing
 * upstream was redesigned. This module defines what those lines MEAN once they
 * are read back: which codes are security events at all, how serious each one
 * is on its own, what outcome it describes, and which component produced it.
 *
 * Severity here is the base severity of ONE event. A pattern of events is a
 * different question and is answered by the alert rules — a single rejected
 * sign-in is `info`, a hundred and fifty in a quarter of an hour is not.
 */
export const SECURITY_SEVERITIES = ["info", "medium", "high", "critical"] as const;
export type SecuritySeverity = (typeof SECURITY_SEVERITIES)[number];

export const SECURITY_OUTCOMES = [
  "blocked", "denied", "observed", "failed", "recovered", "ignored", "succeeded", "unavailable"
] as const;
export type SecurityOutcome = (typeof SECURITY_OUTCOMES)[number];

export const SECURITY_INGEST_SOURCES = ["in-process", "log-drain", "synthetic"] as const;
export type SecurityIngestSource = (typeof SECURITY_INGEST_SOURCES)[number];

export type SecurityEventDescriptor = Readonly<{
  category: ObservabilityCategory;
  severity: SecuritySeverity;
  outcome: SecurityOutcome;
  /** The component that produced the event; a label, never an identifier. */
  source: string;
  /** False for the pipeline's own self-reports, which are console-only so a failing store can never recurse into itself. */
  persisted: boolean;
  summary: string;
}>;

const descriptor = (
  category: ObservabilityCategory,
  severity: SecuritySeverity,
  outcome: SecurityOutcome,
  source: string,
  summary: string,
  persisted = true
): SecurityEventDescriptor => Object.freeze({ category, severity, outcome, source, persisted, summary });

/**
 * Every log code the read path recognizes as a security event. A line whose
 * code is not here is not a security event and is ignored by the ingest path,
 * which is what keeps ordinary application logging out of the security store.
 */
export const SECURITY_EVENT_REGISTRY = Object.freeze({
  // Consumer authentication.
  "auth-login-failed": descriptor("authentication", "info", "denied", "consumer-auth", "A sign-in was rejected"),
  "auth-rate-limited": descriptor("authentication", "medium", "blocked", "consumer-auth", "A sign-in budget was exhausted"),
  "auth-signup-rate-limited": descriptor("authentication", "medium", "blocked", "consumer-auth", "A sign-up budget was exhausted"),
  "auth-recovery-rate-limited": descriptor("authentication", "medium", "blocked", "consumer-auth", "A recovery budget was exhausted"),
  "auth-spray-suspected": descriptor("authentication", "high", "observed", "consumer-auth", "One address failed against many accounts"),
  "rate-limiter-unavailable": descriptor("authentication", "critical", "unavailable", "rate-limiter", "The limiter could not decide; production fails closed"),
  "auth-password-changed": descriptor("authentication", "info", "succeeded", "consumer-auth", "A password was changed"),
  "auth-recovery-cleared-block": descriptor("authentication", "info", "recovered", "consumer-auth", "Recovery cleared the sign-in limiter state"),
  // Authorized school access.
  "authorized-code-failed": descriptor("authentication", "info", "denied", "school-access", "An authorized code was refused"),
  "authorized-code-rate-limited": descriptor("authentication", "medium", "blocked", "school-access", "The authorized-code budget was exhausted"),
  // Authorization and admin.
  "authorization-denied": descriptor("authorization", "info", "denied", "authorization", "A protected surface refused a caller"),
  "admin-auth-failed": descriptor("authorization", "medium", "denied", "admin-auth", "An admin sign-in or MFA step failed"),
  "admin-auth-rate-limited": descriptor("authorization", "high", "blocked", "admin-auth", "The admin authentication budget was exhausted"),
  "admin-csrf-rejected": descriptor("authorization", "medium", "denied", "admin-auth", "An admin mutation failed the CSRF check"),
  "scheduler-auth-failed": descriptor("authorization", "high", "denied", "scheduler", "A scheduler route refused a caller"),
  "ssrf-blocked": descriptor("authorization", "high", "blocked", "egress", "An outbound destination was refused"),
  // Billing webhooks and synchronization.
  "webhook-signature-invalid": descriptor("billing", "medium", "denied", "billing-webhook", "A webhook arrived without a valid signature"),
  "webhook-replay-detected": descriptor("billing", "medium", "ignored", "billing-webhook", "A webhook event was delivered again"),
  "webhook-api-version-drift": descriptor("billing", "info", "observed", "billing-webhook", "A webhook carried a different API version"),
  "webhook-manual-review": descriptor("billing", "medium", "failed", "billing-webhook", "A webhook was parked for manual review"),
  "webhook-processing-failed": descriptor("billing", "medium", "failed", "billing-webhook", "Webhook processing failed and will retry"),
  "subscription-synchronized": descriptor("billing", "info", "succeeded", "billing-sync", "A subscription snapshot was applied"),
  "subscription-renewal-synchronized": descriptor("billing", "info", "succeeded", "billing-sync", "A renewal was applied"),
  "subscription-reconciled": descriptor("billing", "info", "succeeded", "billing-sync", "Reconciliation confirmed a subscription"),
  "subscription-reconciliation-unavailable": descriptor("billing", "medium", "unavailable", "billing-sync", "Reconciliation could not reach the provider"),
  "entitlement-mismatch-repaired": descriptor("billing", "medium", "recovered", "billing-sync", "Reconciliation repaired an entitlement"),
  "entitlement-mismatch-unresolved": descriptor("billing", "high", "failed", "billing-sync", "An entitlement invariant could not be repaired"),
  "subscription-status-unknown": descriptor("billing", "high", "failed", "billing-sync", "The provider reported an unknown subscription status"),
  "reconciliation-sweep-completed": descriptor("billing", "info", "succeeded", "billing-sync", "The scheduled sweep completed"),
  // Environment and configuration.
  "staging-access-denied": descriptor("environment", "info", "denied", "staging-gate", "A locked staging deployment was probed"),
  "staging-configuration-invalid": descriptor("environment", "critical", "failed", "staging-gate", "The staging gate configuration could not be interpreted"),
  "security-config-error": descriptor("environment", "critical", "failed", "configuration", "A security control is misconfigured"),
  "security-dependency-unavailable": descriptor("health", "critical", "unavailable", "dependency", "A security control's dependency is unavailable"),
  // The read path reporting on itself. Console-only by design.
  "security-pipeline-error": descriptor("health", "medium", "failed", "security-pipeline", "The security event store or alert path failed", false),
  "security-alert-raised": descriptor("health", "info", "observed", "security-alerts", "An alert rule fired", false),
  "security-synthetic-test": descriptor("health", "info", "observed", "security-synthetic", "An owner ran a synthetic security scenario")
} as const);

export type SecurityEventType = keyof typeof SECURITY_EVENT_REGISTRY;

export function isSecurityEventType(value: unknown): value is SecurityEventType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SECURITY_EVENT_REGISTRY, value);
}

export function securityEventDescriptor(type: SecurityEventType): SecurityEventDescriptor {
  return SECURITY_EVENT_REGISTRY[type];
}

/**
 * Base severity adjusted by what the event itself says. The only escalation is
 * an authorization denial the producer marked as an anomaly — an authenticated
 * non-admin reaching an admin surface, or a forged entitlement ticket — which
 * is a different thing from an anonymous visitor bouncing off a login wall.
 */
export function classifySecuritySeverity(type: SecurityEventType, metadata: SecurityEventDetail): SecuritySeverity {
  if (type === "authorization-denied" && metadata.anomaly === true) return "high";
  return SECURITY_EVENT_REGISTRY[type].severity;
}

/**
 * Outcome adjusted by the producer's own result field, where one exists. A
 * synchronization the database ignored as stale or superseded did not
 * "succeed"; it was correctly ignored, and the read path should say so.
 */
export function classifySecurityOutcome(type: SecurityEventType, metadata: SecurityEventDetail): SecurityOutcome {
  const result = metadata.result;
  if (typeof result === "string" && (type === "subscription-synchronized" || type === "subscription-renewal-synchronized")) {
    if (result === "stale_ignored" || result === "superseded_ignored") return "ignored";
    if (result === "conflicting_current_subscription" || result === "trial_shape_conflict") return "failed";
  }
  return SECURITY_EVENT_REGISTRY[type].outcome;
}

export type SecurityEvent = Readonly<{
  version: 1;
  /** 32 lowercase hex characters; identical on every path the same emission travels, so the store de-duplicates. */
  eventId: string;
  eventType: SecurityEventType;
  category: ObservabilityCategory;
  severity: SecuritySeverity;
  /** ISO-8601, UTC, from a server clock. Never from a client. */
  occurredAt: string;
  environment: SecurityEnvironment;
  source: string;
  outcome: SecurityOutcome;
  correlationId: string;
  /** Redacted references only: a provider-object suffix, never a whole identifier. */
  actorRefRedacted: string | null;
  accountRefRedacted: string | null;
  networkRefRedacted: string | null;
  synthetic: boolean;
  ingestSource: SecurityIngestSource;
  metadataSafe: SecurityEventDetail;
}>;

export const SECURITY_EVENT_ID_SHAPE = /^[0-9a-f]{32}$/;
export const SECURITY_CORRELATION_SHAPE = /^[a-zA-Z0-9_-]{8,80}$/;
