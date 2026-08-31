import "server-only";

import { headers } from "next/headers";

import { ConsoleMonitoringAdapter, emitOperationalEvent } from "./server";

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
 * Transport is the structured console adapter, which reaches the Vercel runtime
 * log drain. Deliberately NOT `recordAggregateSignal` — that writes through the
 * service Supabase client, so it cannot report a failure of that very
 * dependency, and its metric-key union is fixed by a database contract.
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
  WEBHOOK_SIGNATURE_INVALID: { code: "webhook-signature-invalid", category: "billing", severity: "warning" },
  WEBHOOK_REPLAY_DETECTED: { code: "webhook-replay-detected", category: "billing", severity: "warning" },
  STAGING_ACCESS_DENIED: { code: "staging-access-denied", category: "environment", severity: "info" },
  STAGING_CONFIGURATION_INVALID: { code: "staging-configuration-invalid", category: "environment", severity: "critical" },
  // A password change is not ordinary successful traffic: it is the single
  // event that converts a borrowed session into a permanent takeover, so it is
  // worth seeing even when it succeeds.
  AUTH_PASSWORD_CHANGED: { code: "auth-password-changed", category: "authentication", severity: "warning" },
  SECURITY_CONFIG_ERROR: { code: "security-config-error", category: "environment", severity: "critical" },
  SECURITY_DEPENDENCY_UNAVAILABLE: { code: "security-dependency-unavailable", category: "health", severity: "critical" }
} as const;

export type SecurityEventName = keyof typeof SECURITY_EVENTS;

/**
 * Values permitted in an event detail. Deliberately narrow: primitives only, so
 * no object can smuggle a nested credential past the top-level key filter.
 */
export type SecurityEventDetail = Readonly<Record<string, string | number | boolean | null>>;

/**
 * Keys that are never acceptable on a security event, checked here as well as
 * inside `createSafeEvent`.
 *
 * The overlap is intentional. `createSafeEvent`'s filter protects the generic
 * observability channel; this one additionally refuses fields that are specific
 * to this domain and that a future caller might reasonably think are harmless —
 * an email address, a subject hash, a raw code. Two independent filters mean a
 * change to either one alone cannot open the hole.
 */
const FORBIDDEN_DETAIL_KEY = new RegExp(
  [
    // Mirrors createSafeEvent's own filter.
    "password", "token", "secret", "authorization", "cookie", "email", "service.?role",
    // Domain-specific additions.
    "credential", "api.?key", "session", "subject", "hash", "address", "payload", "body",
    // The authorized school code, in the spellings a caller might reach for.
    // Deliberately not a bare /code/ — that would also reject useful,
    // non-sensitive fields such as statusCode or errorCode.
    "access.?code", "school.?code", "^code$",
    // Key material under any of its usual names.
    "private", "signing", "\\bpem\\b", "certificate", "passphrase", "salt"
  ].join("|"),
  "i"
);

/**
 * Value-shape redaction, applied on top of the key-name filter.
 *
 * Filtering by key name alone assumes the caller names things honestly. It
 * caught `password` but not `privateKey`, and it would never catch a credential
 * passed as `note` or `reason`. Matching the VALUE closes that: a PEM block, a
 * provider-prefixed key or a long high-entropy blob is dropped regardless of
 * what the field is called.
 *
 * Kept narrow on purpose. The point is to catch things that are unmistakably
 * credential-shaped, not to mangle ordinary diagnostic text.
 */
const CREDENTIAL_SHAPED_VALUE = new RegExp(
  [
    "-----BEGIN[\\s\\S]*?KEY",           // PEM block
    "\\b(?:sk|pk|rk)_(?:live|test)_\\w{8,}", // Stripe
    "\\bwhsec_\\w{8,}",                   // Stripe webhook
    "\\bsb_secret_\\w{8,}",               // Supabase
    "\\bsbp_[a-f0-9]{20,}",               // Supabase personal
    "\\beyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}", // JWT
    "\\bBearer\\s+[A-Za-z0-9._~+/-]{16,}" // Authorization value
  ].join("|"),
  "i"
);

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

function sanitizeDetail(detail: SecurityEventDetail): SecurityEventDetail {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(detail)) {
    if (FORBIDDEN_DETAIL_KEY.test(key)) continue;
    if (typeof value === "string" && CREDENTIAL_SHAPED_VALUE.test(value)) continue;
    // Bound strings so an attacker-controlled field cannot bloat the log, and
    // strip CR/LF so it cannot forge a second log line.
    safe[key] = typeof value === "string" ? value.replace(/[\r\n]/g, " ").slice(0, 120) : value;
  }
  return Object.freeze(safe);
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
  return emitOperationalEvent(new ConsoleMonitoringAdapter(), {
    category: descriptor.category,
    severity: descriptor.severity,
    code: descriptor.code,
    correlationId: correlationOverride ?? correlationIdFrom(requestHeaders),
    detail: {
      ...sanitizeDetail(detail),
      ...coarseClientContext(requestHeaders),
      environment: process.env.MVH_APP_ENVIRONMENT?.trim().toLowerCase() ?? "unknown"
    }
  });
}
