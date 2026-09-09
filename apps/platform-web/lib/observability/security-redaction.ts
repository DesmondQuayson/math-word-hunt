import "server-only";

/**
 * The security-event redaction layer, shared by every path an event can take.
 *
 * This is the SAME filter set the emitter has applied since Phase 2 — it moved
 * here, unchanged in what it refuses, so the observability read path can apply
 * it a second time at its own boundary without a competing implementation.
 * One definition, two enforcement points: before a line is written, and again
 * when a line is read back from the platform log stream, where it is treated
 * as untrusted input.
 */

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
export const FORBIDDEN_DETAIL_KEY = new RegExp(
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
    "private", "signing", "\\bpem\\b", "certificate", "passphrase", "salt",
    // Identifiers that the read path must never accumulate: a whole customer,
    // subscription or card reference, or a client network address.
    "customer.?id", "subscription.?id", "client.?ip", "remote.?ip"
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
export const CREDENTIAL_SHAPED_VALUE = new RegExp(
  [
    "-----BEGIN[\\s\\S]*?KEY",           // PEM block
    "\\b(?:sk|pk|rk)_(?:live|test)_\\w{8,}", // Stripe
    "\\bwhsec_\\w{8,}",                   // Stripe webhook
    "\\bsb_secret_\\w{8,}",               // Supabase
    "\\bsbp_[a-f0-9]{20,}",               // Supabase personal
    "\\beyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}", // JWT
    "\\bBearer\\s+[A-Za-z0-9._~+/-]{16,}", // Authorization value
    "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b", // an email address under any key
    "\\bcus_[A-Za-z0-9]{14,}", "\\bsub_[A-Za-z0-9]{14,}", "\\bin_[A-Za-z0-9]{14,}" // whole Stripe object ids
  ].join("|"),
  "i"
);

export const MAXIMUM_DETAIL_STRING_LENGTH = 120;
export const MAXIMUM_DETAIL_KEYS = 24;
const DETAIL_KEY_SHAPE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

/**
 * Drops anything that could carry a credential or an identity, bounds what
 * remains, and strips CR/LF so a value cannot forge a second log line.
 *
 * Accepts `unknown` values deliberately: on the read path the input is a line
 * parsed from a log stream, not a typed detail, so non-primitive values are
 * refused here rather than trusted.
 */
export function sanitizeSecurityDetail(detail: Readonly<Record<string, unknown>>): SecurityEventDetail {
  const safe: Record<string, string | number | boolean | null> = {};
  let kept = 0;
  for (const [key, value] of Object.entries(detail)) {
    if (kept >= MAXIMUM_DETAIL_KEYS) break;
    if (!DETAIL_KEY_SHAPE.test(key)) continue;
    if (FORBIDDEN_DETAIL_KEY.test(key)) continue;
    if (value !== null && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;
    if (typeof value === "string" && CREDENTIAL_SHAPED_VALUE.test(value)) continue;
    // Bound strings so an attacker-controlled field cannot bloat the log, and
    // strip CR/LF so it cannot forge a second log line.
    safe[key] = typeof value === "string" ? value.replace(/[\r\n]/g, " ").slice(0, MAXIMUM_DETAIL_STRING_LENGTH) : value;
    kept += 1;
  }
  return Object.freeze(safe);
}

/** True when free text still carries something the redaction layer would refuse. */
export function containsCredentialShape(text: string): boolean {
  return CREDENTIAL_SHAPED_VALUE.test(text);
}
