import "server-only";

import { headers } from "next/headers";

import { emitOperationalEvent } from "./server";
import { securityEnvironmentLabel } from "./security-environment";
import { sanitizeSecurityDetail, type SecurityEventDetail } from "./security-redaction";
import { platformMonitoringAdapter } from "./security-sink";

export type { SecurityEventDetail } from "./security-redaction";

/**
 * The MathNexa security-event taxonomy.
 *
 * Phase 1 hardened prevention. This is the detection half: before it, the only
 * security signal the platform emitted was `rate-limiter-unavailable`, and the
 * only durable evidence of an attack was a row count in `admin_auth_rate_limits`
 * that nothing read. A failed sign-in, a refused authorized code, an
 * authorization denial and an invalid webhook signature all happened in total
 * silence.
 *
 * Everything here goes through `createSafeEvent`, which refuses any detail key
 * matching password/token/secret/authorization/cookie/email and any value
 * containing CR or LF. That is a hard barrier, not a convention: an event that
 * would carry a credential is dropped rather than logged.
 *
 * Transport is the structured console adapter (`ConsoleMonitoringAdapter`),
 * which reaches the Vercel runtime log stream and any log drain attached to it.
 * PH2-07 adds an optional, additive persistence step behind it — see
 * `platformMonitoringAdapter` — scheduled after the response, so no security
 * decision ever waits on a store. Deliberately NOT `recordAggregateSignal` for
 * the console line itself: that writes through the service Supabase client, so
 * it cannot report a failure of that very dependency, and its metric-key union
 * is fixed by a database contract.
 */
export const SECURITY_EVENTS = {
  AUTH_LOGIN_FAILED: { code: "auth-login-failed", category: "authentication", severity: "info" },
  AUTH_RATE_LIMITED: { code: "auth-rate-limited", category: "authentication", severity: "warning" },
  AUTH_SIGNUP_RATE_LIMITED: { code: "auth-signup-rate-limited", category: "authentication", severity: "warning" },
  AUTH_RECOVERY_RATE_LIMITED: { code: "auth-recovery-rate-limited", category: "authentication", severity: "warning" },
  AUTH_SPRAY_SUSPECTED: { code: "auth-spray-suspected", category: "authentication", severity: "warning" },
  AUTH_LIMITER_UNAVAILABLE: { code: "rate-limiter-unavailable", category: "authentication", severity: "critical" },
  AUTHORIZED_CODE_FAILED: { code: "authorized-code-failed", category: "authentication", severity: "info" },
  AUTHORIZED_CODE_RATE_LIMITED: { code: "authorized-code-rate-limited", category: "authentication", severity: "warning" },
  AUTHORIZATION_DENIED: { code: "authorization-denied", category: "authorization", severity: "info" },
  ADMIN_AUTH_FAILED: { code: "admin-auth-failed", category: "authorization", severity: "warning" },
  ADMIN_AUTH_RATE_LIMITED: { code: "admin-auth-rate-limited", category: "authorization", severity: "warning" },
  ADMIN_CSRF_REJECTED: { code: "admin-csrf-rejected", category: "authorization", severity: "warning" },
  SCHEDULER_AUTH_FAILED: { code: "scheduler-auth-failed", category: "authorization", severity: "warning" },
  SSRF_BLOCKED: { code: "ssrf-blocked", category: "authorization", severity: "warning" },
  WEBHOOK_SIGNATURE_INVALID: { code: "webhook-signature-invalid", category: "billing", severity: "warning" },
  WEBHOOK_REPLAY_DETECTED: { code: "webhook-replay-detected", category: "billing", severity: "warning" },
  STAGING_ACCESS_DENIED: { code: "staging-access-denied", category: "environment", severity: "info" },
  STAGING_CONFIGURATION_INVALID: { code: "staging-configuration-invalid", category: "environment", severity: "critical" },
  // A password change is not ordinary successful traffic: it is the single
  // event that converts a borrowed session into a permanent takeover, so it is
  // worth seeing even when it succeeds.
  AUTH_PASSWORD_CHANGED: { code: "auth-password-changed", category: "authentication", severity: "warning" },
  // Recovery deliberately clears the sign-in limiter state for the account, so
  // a victim whose budget an attacker spent has a way back in. Recording it
  // makes "the block was cleared correctly" a fact a reader can see.
  AUTH_RECOVERY_CLEARED_BLOCK: { code: "auth-recovery-cleared-block", category: "authentication", severity: "info" },
  SECURITY_CONFIG_ERROR: { code: "security-config-error", category: "environment", severity: "critical" },
  SECURITY_DEPENDENCY_UNAVAILABLE: { code: "security-dependency-unavailable", category: "health", severity: "critical" },
  // An owner-run scenario on a non-production deployment. Never emitted in
  // production; the route that emits it refuses there.
  SECURITY_SYNTHETIC_TEST: { code: "security-synthetic-test", category: "health", severity: "info" }
} as const;

export type SecurityEventName = keyof typeof SECURITY_EVENTS;

/**
 * A per-request identifier, used to stitch an edge request to the security
 * events it produced.
 *
 * Prefers the platform's own `x-vercel-id`, which is already present on the
 * request and already returned on the response, so it introduces no new
 * identifier and no new collection. Falls back to a random value when absent
 * (local development, tests). It is deliberately NOT derived from anything about
 * the user: it identifies a request, not a person.
 */
export function correlationIdFrom(requestHeaders: Headers): string {
  const supplied = requestHeaders.get("x-vercel-id") ?? "";
  // SafeEvent requires /^[a-zA-Z0-9_-]{8,80}$/.
  const normalized = supplied.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
  if (normalized.length >= 8) return normalized;
  return `req-${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Coarse client context.
 *
 * Only ever a truncated user-agent and a boolean for whether a forwarded address
 * was present. The address itself is NOT recorded: it would be new PII for no
 * detection benefit that the rate-limiter's own counters do not already provide,
 * and the brief is explicit about not increasing collection.
 */
function coarseClientContext(requestHeaders: Headers): SecurityEventDetail {
  const agent = requestHeaders.get("user-agent")?.trim() ?? "";
  return {
    hasForwardedFor: Boolean(requestHeaders.get("x-forwarded-for")?.trim()),
    userAgentFamily: classifyUserAgent(agent)
  };
}

/**
 * A deliberately blunt classification rather than the raw string.
 *
 * A full user-agent is a fingerprinting surface and can carry arbitrary attacker
 * text into the log. A family label is enough to tell "a browser" from "a
 * scripted client", which is the distinction that matters when reading a spike.
 */
export function classifyUserAgent(agent: string): string {
  if (!agent) return "absent";
  if (/bot|crawler|spider|slurp/i.test(agent)) return "bot";
  if (/curl|wget|python|go-http|java|okhttp|libwww|scrapy|axios|node-fetch/i.test(agent)) return "scripted";
  if (/Mozilla|AppleWebKit|Gecko/i.test(agent)) return "browser";
  return "other";
}

/**
 * Records one security event. Never throws: a detection failure must not become
 * an availability failure on a request path that was otherwise working.
 */
export async function recordSecurityEvent(
  name: SecurityEventName,
  detail: SecurityEventDetail = {},
  correlationOverride?: string
): Promise<void> {
  try {
    const requestHeaders = await headers();
    emitSecurityEvent(name, detail, requestHeaders, correlationOverride);
  } catch {
    // No request scope (or headers unavailable). Emit without client context
    // rather than losing the event entirely.
    try {
      emitSecurityEvent(name, detail, new Headers(), correlationOverride);
    } catch {
      // Detection is best-effort by design.
    }
  }
}

/**
 * Synchronous form, for callers that already hold the request headers.
 *
 * `correlationOverride` exists for the small number of events that describe a
 * *condition* rather than a request. `emitOperationalEvent` de-duplicates on
 * `category:code:correlationId` within 5 seconds, and the default correlation id
 * is per-request — so for a per-request event the dedup correctly never fires,
 * but for a sustained condition it would emit once per request and bury every
 * other signal in the same stream. Passing a stable string there lets the dedup
 * do its job. Use it only where one line per five seconds genuinely describes
 * the situation better than one line per request.
 */
export function emitSecurityEvent(
  name: SecurityEventName,
  detail: SecurityEventDetail,
  requestHeaders: Headers,
  correlationOverride?: string
): boolean {
  const descriptor = SECURITY_EVENTS[name];
  return emitOperationalEvent(platformMonitoringAdapter(), {
    category: descriptor.category,
    severity: descriptor.severity,
    code: descriptor.code,
    correlationId: correlationOverride ?? correlationIdFrom(requestHeaders),
    detail: {
      ...sanitizeSecurityDetail(detail),
      ...coarseClientContext(requestHeaders),
      environment: process.env.MVH_APP_ENVIRONMENT?.trim().toLowerCase() ?? "unknown",
      // `environment` above is the runtime identity and is the same string on
      // production and staging. `deployment` is the label that tells them
      // apart, derived from server configuration only.
      deployment: securityEnvironmentLabel()
    }
  });
}
