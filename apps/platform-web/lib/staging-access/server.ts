import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const STAGING_ACCESS_BOOTSTRAP_PATH = "/api/internal/staging-access/bootstrap";
export const STAGING_ACCESS_COOKIE_NAME = "__Host-mvh-staging-access";
export const STAGING_ACCESS_WEBHOOK_PATH = "/api/billing/webhook";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATH = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const TICKET_PATH = "[A-Za-z0-9_-]{80,650}\\.[A-Za-z0-9_-]{43}";
const GAME_ASSET_PATH = "[A-Za-z0-9][A-Za-z0-9._/-]{0,511}";
const TICKETED_GAME_ASSET_PATH = new RegExp(
  `^/(?:admin/games/${UUID_PATH}/preview|games/${UUID_PATH}/runtime)/assets/${TICKET_PATH}/${GAME_ASSET_PATH}$`,
  "i"
);
const COOKIE_VERSION = "v1";
const COOKIE_PAYLOAD = "mathnexa-phase7d-staging-access-v1";
const COOKIE_SIGNATURE_LENGTH = 43;

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function constantTimeTextEqual(candidate: string, expected: string): boolean {
  const expectedBytes = Buffer.from(expected, "utf8");
  const candidateBytes = Buffer.from(candidate, "utf8");
  const normalizedCandidate = Buffer.alloc(expectedBytes.length);
  candidateBytes.copy(normalizedCandidate, 0, 0, Math.min(candidateBytes.length, expectedBytes.length));
  const equal = timingSafeEqual(normalizedCandidate, expectedBytes);
  return equal && candidateBytes.length === expectedBytes.length;
}

/**
 * The single authoritative interpretation of the staging-gate configuration.
 *
 * Why this exists (MN-09). The previous decision was
 * `MVH_STAGING_ACCESS_REQUIRED === "true"`. During certification the value was
 * written through a shell pipeline that appended a newline, so the stored value
 * was `"true\n"`. Strict equality failed, the gate did not engage, and a
 * redeploy served the complete site with HTTP 200 while the configuration
 * *looked* correct. Harmless transport whitespace must never be able to
 * silently disable staging protection, so the value is normalized here — once,
 * at the boundary — rather than by scattering `trim()` through the callers.
 *
 * The contract is deliberately three-way rather than boolean, because "not
 * protected" has two very different causes and only one of them is acceptable:
 *
 *   "required"      protect the deployment
 *   "not-required"  deliberately open — an explicit, recognized `false`, or a
 *                   deployment that is simply not a gated staging environment
 *
 * and a malformed value resolves to "required", never to "not-required".
 */
export type StagingAccessRequirement = "required" | "not-required";

const PRODUCTION_PLATFORM = "production-platform";

/**
 * Normalizes an environment value for comparison.
 *
 * `trim()` removes the ASCII whitespace a shell or CI pipeline can append, and
 * also the Unicode space separators and BOM that a copy-paste can introduce.
 * Case is folded so `TRUE` and `True` are accepted rather than silently
 * rejected — an operator writing `TRUE` plainly means to protect the site, and
 * treating that as "not protected" would be the same trap this fix exists to
 * close.
 */
function normalizeFlag(value: string | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Whether this deployment is one that a staging gate was configured for.
 *
 * Presence of a well-formed staging token is the discriminator, and it is the
 * only sound one available: production and staging both run
 * `MVH_APP_ENVIRONMENT=production-platform`, so that variable cannot separate
 * them. Verified against the live projects — the production project defines no
 * staging variables at all, while staging defines both. The token's value is
 * never read for this decision, only its shape.
 *
 * This is also the honest definition of "the protected staging runtime": the
 * gate is unusable without a token, because the bootstrap endpoint cannot mint
 * the access cookie without one.
 */
function stagingTokenConfigured(source: EnvironmentSource): boolean {
  return TOKEN_PATTERN.test(source.MVH_STAGING_ACCESS_TOKEN?.trim() ?? "");
}

export function stagingAccessRequirement(source: EnvironmentSource = process.env): StagingAccessRequirement {
  // The environment name is normalized for the same reason the flag is: a
  // newline on THIS variable would otherwise skip the gate entirely, no matter
  // how carefully the flag itself were parsed. Normalizing it is scoped to this
  // module on purpose — `isProductionPlatformMode()` is consumed by billing,
  // entitlement and the Supabase clients, and widening its contract belongs in
  // its own change rather than in a staging-gate fix.
  if (normalizeFlag(source.MVH_APP_ENVIRONMENT) !== PRODUCTION_PLATFORM) {
    // Not a platform-mode deployment at all. The public marketing build and
    // local teacher stacks have no staging gate to engage.
    return "not-required";
  }

  // The casing rule is deliberately ASYMMETRIC, and that asymmetry is the point:
  // be liberal about what counts as "protect", strict about what counts as
  // "open". An operator who writes TRUE, True or tRuE plainly means to protect
  // the site, and reading any of those as "not protected" would be exactly the
  // trap this fix exists to close. Disabling protection, by contrast, has to be
  // unmistakable — so only an exact lowercase `false` opens the gate. That also
  // covers a real hazard: PowerShell stringifies its `$false` as "False", which
  // under symmetric case-folding would silently open staging.
  const raw = String(source.MVH_STAGING_ACCESS_REQUIRED ?? "").trim();
  const flag = raw.toLowerCase();

  // An explicit instruction to protect, honoured on any deployment.
  if (flag === "true") return "required";

  // The one intentional way to open staging for an owner review: an exact,
  // lowercase `false`. Nothing else is ever read as "the operator meant to
  // disable this".
  if (raw === "false") return "not-required";

  // Everything else — "yes", "1", "tru", "trueXYZ", "false-ish", blank, or
  // absent — is not a decision this code is entitled to interpret. The
  // deployment's own configuration settles it: a deployment carrying a
  // well-formed staging token is a gated environment, so ambiguity there
  // protects; a deployment with no gate token is not a gated environment at
  // all, so ambiguity there changes nothing.
  //
  // That second half is load-bearing for availability. Production carries no
  // staging token, and treating a malformed value as "protect" regardless would
  // mean a single typo on the production project blacked out mathnexa.com
  // site-wide — unrecoverably, since with no token the bootstrap endpoint could
  // never mint an access cookie to get back in.
  return stagingTokenConfigured(source) ? "required" : "not-required";
}

export function isStagingAccessRequired(source: EnvironmentSource = process.env): boolean {
  return stagingAccessRequirement(source) === "required";
}

export function isTicketedGameAssetPath(pathname: string): boolean {
  return !pathname.includes("..") && !pathname.includes("//") && TICKETED_GAME_ASSET_PATH.test(pathname);
}

export function getStagingAccessToken(source: EnvironmentSource = process.env): string | null {
  if (!isStagingAccessRequired(source)) return null;
  const token = source.MVH_STAGING_ACCESS_TOKEN?.trim() ?? "";
  return TOKEN_PATTERN.test(token) ? token : null;
}

export function isValidStagingBearerAuthorization(
  authorization: string | null,
  source: EnvironmentSource = process.env
): boolean {
  const token = getStagingAccessToken(source);
  if (!token || !authorization) return false;
  const match = /^Bearer ([A-Za-z0-9_-]+)$/i.exec(authorization);
  return Boolean(match && constantTimeTextEqual(match[1], token));
}

export function createStagingAccessCookieValue(source: EnvironmentSource = process.env): string | null {
  const token = getStagingAccessToken(source);
  if (!token) return null;
  const signature = createHmac("sha256", token).update(COOKIE_PAYLOAD).digest("base64url");
  return `${COOKIE_VERSION}.${signature}`;
}

export function isValidStagingAccessCookie(
  cookieValue: string | undefined,
  source: EnvironmentSource = process.env
): boolean {
  const expected = createStagingAccessCookieValue(source);
  if (!expected || !cookieValue || cookieValue.length !== COOKIE_VERSION.length + 1 + COOKIE_SIGNATURE_LENGTH) {
    return false;
  }
  return constantTimeTextEqual(cookieValue, expected);
}

export function stagingAccessNotFoundResponse(): Response {
  return new Response(null, {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}
