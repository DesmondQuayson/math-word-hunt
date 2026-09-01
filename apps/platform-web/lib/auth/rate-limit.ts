import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";

import { ConsoleMonitoringAdapter, emitOperationalEvent } from "@/lib/observability/server";
import { recordSecurityEvent, type SecurityEventName } from "@/lib/observability/security-events";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

/**
 * Throttle for consumer-facing credential endpoints.
 *
 * Why this is needed at all: sign in, sign up and password recovery run as
 * server actions, so every call reaches Supabase from the Vercel egress
 * address. Supabase's own per-IP limits therefore see one shared client for
 * the whole internet and cannot separate an attacker from a classroom. The
 * throttle has to live here.
 *
 * Why there is no new infrastructure: this reuses the already-deployed
 * `consume_admin_auth_rate_limit` function, which admin sign-in and the
 * authorized-code gate have used since Phase 8a. That function pins `p_scope`
 * to 'login' | 'mfa', so each surface is separated inside the subject hash
 * instead — the same technique `lib/school-access/rate-limit.ts` already uses.
 * No table, no migration, no Redis, no paid add-on.
 */
export type ConsumerAuthScope = "sign-in" | "sign-up" | "password-recovery";

/**
 * `unavailable` is distinct from `throttled` on purpose. Throttled means the
 * limiter worked and this caller has spent their budget; unavailable means the
 * limiter could not be consulted, so we cannot claim any request is within a
 * limit. Both deny in production, but only one of them is the caller's fault
 * and the caller is never told which.
 */
export type RateLimitVerdict = "allowed" | "throttled" | "unavailable";

type Budget = Readonly<{ maxAttempts: number; windowSeconds: number; blockSeconds: number }>;

/**
 * Tuned so a shared school NAT still works. A classroom signing in together
 * shares one address, so the sign-in window is generous in count and short in
 * penalty; it exists to stop automated guessing, not a busy first period.
 * Password recovery is tighter because it sends mail on every accepted call.
 */
const budgets: Readonly<Record<ConsumerAuthScope, Budget>> = Object.freeze({
  "sign-in": { maxAttempts: 20, windowSeconds: 900, blockSeconds: 900 },
  "sign-up": { maxAttempts: 10, windowSeconds: 900, blockSeconds: 900 },
  "password-recovery": { maxAttempts: 6, windowSeconds: 900, blockSeconds: 1800 }
});

/**
 * The second limiter dimension: the account being aimed at.
 *
 * The Phase 1 budget keys on address + client IP + user agent, which stops one
 * machine grinding away but does nothing about an attacker spreading attempts
 * across many addresses and agents at a single known account. This closes that,
 * by counting failures against the target account no matter where they arrive
 * from.
 *
 * **The window and the block are deliberately equal, and that is the important
 * part.** The deployed function only resets a counter when the window has
 * rolled: an expired block that lands inside a still-open window whose attempts
 * already exceed the maximum re-blocks immediately, and sets
 * `blocked_until = now + block` again. So a window LONGER than the block does
 * not give a 15-minute lockout — it gives an indefinite one, because every
 * further attempt pushes the release further out. An attacker who knows a
 * victim's address could hold them out permanently for the cost of one request
 * every quarter of an hour.
 *
 * Making the two equal means an expired block always coincides with a rolled
 * window, so the counter genuinely resets and the victim gets back in. Holding
 * someone out then costs a sustained 20 attempts every 15 minutes rather than
 * one, and each cycle still opens.
 *
 * The price is that the cap is 80 guesses an hour rather than 20. Against
 * *unlimited* distributed guessing that is still an enormous reduction, and it
 * is the right trade for a paid product: a locked-out customer is a real harm,
 * and an indefinite lockout an attacker controls is worse than a slightly looser
 * ceiling. (This was found by the simulation in
 * test/security/distributed-attack.test.ts, not by reasoning about it.)
 *
 * Two further things keep the trade proportionate:
 *
 *   1. It applies to **sign-in only**. Password recovery deliberately keeps just
 *      its request-level budget, so a locked-out user still has a working route
 *      back into their account rather than being stuck behind the same wall.
 *   2. The refusal is the same generic copy as any other failure, so the limiter
 *      cannot be used to confirm that an account exists.
 */
const ACCOUNT_TARGET_BUDGET: Budget = Object.freeze({
  maxAttempts: 20,
  windowSeconds: 900,
  blockSeconds: 900
});

/**
 * Keyed pseudonym for the targeted account.
 *
 * Deliberately excludes IP and user agent — that is the whole point of this
 * dimension — and deliberately uses a different namespace prefix from the
 * request-level subject, so the two budgets can never collide in the shared
 * `admin_auth_rate_limits` table. The address is never stored, only its HMAC.
 */
export function accountTargetSubjectHash(secret: string, identifier: string): string {
  return createHmac("sha256", secret)
    .update(`consumer-account\nsign-in\n${compact(identifier, 254).toLowerCase()}`)
    .digest("hex");
}

function compact(value: string | null | undefined, maximum: number): string {
  return (value ?? "").trim().slice(0, maximum);
}

/**
 * Is a working rate limiter a hard requirement for this runtime?
 *
 * Read from `MVH_APP_ENVIRONMENT`, which is a server-only variable. The
 * browser-visible twin is `NEXT_PUBLIC_MVH_APP_ENVIRONMENT` and is deliberately
 * NOT consulted here — a caller must never be able to talk this deployment out
 * of rate limiting by supplying a value.
 *
 * `production-platform` is the mode that carries commercial consumer accounts.
 * Local stacks, tests, previews and the public marketing build keep the
 * development fallback so nobody is locked out of a machine that was never
 * meant to have this infrastructure. If `MVH_APP_ENVIRONMENT` is missing on a
 * real production deployment, `proxy.ts` already refuses the whole site with a
 * 503 before any of this runs, so a dropped variable cannot quietly downgrade
 * production into the development branch.
 */
export function rateLimitingRequired(source: NodeJS.ProcessEnv = process.env): boolean {
  return source.MVH_APP_ENVIRONMENT === "production-platform";
}

/**
 * Keying material for the subject pseudonyms. It never leaves the server and is
 * only ever used one-way, so a stored subject hash cannot be walked back to an
 * address or an email address.
 *
 * The fallback chain matters. `MVH_ADMIN_CSRF_SECRET` only exists when the
 * admin console is enabled, so keying solely on it would leave the limiter
 * unavailable on any deployment that runs without admin. `SUPABASE_SECRET_KEY`
 * is present exactly when the service client this limiter already depends on is
 * present, so it is the correct floor.
 *
 * The 20-character minimum is not arbitrary and must not be raised: it is the
 * same threshold `hasProductionIdentityConfiguration()` applies to
 * `SUPABASE_SECRET_KEY`. Requiring more here than production identity requires
 * would create a configuration in which authentication is live but the limiter
 * refuses to resolve — which, under the fail-closed rule, would lock every
 * customer out. `MVH_AUTH_RATE_LIMIT_SECRET` is the place to put a longer,
 * purpose-built secret.
 */
/** Where the limiter's keying material came from, for configuration reporting. */
export type LimiterSecretSource = "dedicated" | "admin-csrf" | "supabase-service" | "none";

const LIMITER_SECRET_SOURCES = [
  { name: "dedicated" as const, variable: "MVH_AUTH_RATE_LIMIT_SECRET" as const },
  { name: "admin-csrf" as const, variable: "MVH_ADMIN_CSRF_SECRET" as const },
  { name: "supabase-service" as const, variable: "SUPABASE_SECRET_KEY" as const }
];

/**
 * Minimum accepted length.
 *
 * Pinned to 20 because that is exactly what `hasProductionIdentityConfiguration()`
 * requires of `SUPABASE_SECRET_KEY`, which is the last fallback below. Requiring
 * MORE here than production identity requires would create a deployment where
 * authentication is live but the limiter refuses to resolve — and under the
 * fail-closed rule that locks every customer out. Do not raise it.
 */
const MINIMUM_SECRET_LENGTH = 20;

/**
 * There is deliberately NO upper bound.
 *
 * A ceiling here breaks the very invariant stated above.
 * `hasProductionIdentityConfiguration()` accepts a `SUPABASE_SECRET_KEY` of any
 * length at or above 20, so a longer key would satisfy production identity —
 * authentication live, service client working — while the limiter refused to
 * resolve it, and under the fail-closed rule that locks every customer out.
 * HMAC accepts a key of any length, and this value comes from server
 * configuration rather than from a request, so there is nothing an upper bound
 * would protect against.
 */

/**
 * Reports which source supplied the keying material, without revealing it.
 *
 * Exists so a readiness check or an operator can confirm the migration to a
 * dedicated secret actually took effect, rather than inferring it. Returns a
 * label only — never the value, and never its length.
 */
export function limiterSecretSource(source: NodeJS.ProcessEnv = process.env): LimiterSecretSource {
  for (const candidate of LIMITER_SECRET_SOURCES) {
    if (isUsableSecret(source[candidate.variable])) return candidate.name;
  }
  return "none";
}

function isUsableSecret(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? "";
  return trimmed.length >= MINIMUM_SECRET_LENGTH;
}

/**
 * Resolves the HMAC keying material for the limiter subjects.
 *
 * The preference order is a deliberate migration path, not an accident:
 *
 *   1. `MVH_AUTH_RATE_LIMIT_SECRET` — the dedicated secret. Preferred, so that
 *      setting it in an environment is all that is needed to migrate; no code
 *      change and no coordinated deploy.
 *   2. `MVH_ADMIN_CSRF_SECRET` — the legacy source, retained for compatibility
 *      with the currently deployed production configuration. Couples two
 *      security domains, which is why it is being migrated away from.
 *   3. `SUPABASE_SECRET_KEY` — the floor. Present exactly when the service
 *      client this limiter already depends on is present, so the limiter can
 *      never be unavailable on a deployment where the rest of the stack works.
 *
 * Rotating between sources resets existing counters, because the subject hashes
 * change. That is harmless: it grants at most one fresh budget at the moment of
 * the switch, and no counter is authoritative for anything but throttling.
 *
 * Values are trimmed before use, for the reason MN-09 exists: transport
 * whitespace must never silently change a security decision.
 */
export function resolveLimiterSecret(source: NodeJS.ProcessEnv = process.env): string | null {
  for (const candidate of LIMITER_SECRET_SOURCES) {
    const value = source[candidate.variable]?.trim() ?? "";
    if (isUsableSecret(value)) return value;
  }
  return null;
}

/**
 * The request-dimension subject.
 *
 * **The user agent is deliberately NOT part of this key.** Phase 1 included it,
 * reasoning that it would help separate students sharing one school address.
 * Review showed that to be self-defeating: the user agent is chosen by the
 * caller, so an attacker changes one header and mints a brand-new budget, from
 * a single address, without needing a proxy pool at all. It also let each forged
 * agent create a fresh row in `admin_auth_rate_limits`, which has no TTL — so
 * the bypass doubled as unbounded table growth.
 *
 * Dropping it costs nothing for the case it was meant to serve: students behind
 * one school address sign in with *different addresses of their own*, and the
 * address is already in this key, so their budgets stay separate regardless.
 * A rate-limit key must be built from things the caller cannot freely choose.
 */
export function consumerAuthSubjectHash(
  secret: string,
  scope: ConsumerAuthScope,
  identifier: string,
  ip: string
): string {
  return createHmac("sha256", secret)
    .update(`consumer-auth\n${scope}\n${compact(identifier, 254).toLowerCase()}\n${compact(ip, 128)}`)
    .digest("hex");
}

async function subject(secret: string, scope: ConsumerAuthScope, identifier: string): Promise<string> {
  const requestHeaders = await headers();
  return consumerAuthSubjectHash(secret, scope, identifier, clientAddress(requestHeaders));
}

/**
 * The caller's address as the platform reports it.
 *
 * `x-vercel-forwarded-for` is set by Vercel itself and cannot be spoofed by the
 * client, so it is preferred. `x-forwarded-for` is only consulted as a fallback,
 * and only its leftmost entry — a caller can prepend entries to that header, so
 * treating any other position as the client would be trusting attacker input.
 */
function clientAddress(requestHeaders: Headers): string {
  // Each candidate must actually parse as an IP address. Without that check any
  // string a caller puts in `x-forwarded-for` became a bucket key of its own, so
  // varying it minted unlimited budgets — the same defect the user agent had,
  // one header along. The admin limiter already validated this way; this brings
  // the consumer surface in line.
  const platform = compact(requestHeaders.get("x-vercel-forwarded-for"), 128).split(",")[0]?.trim() ?? "";
  const forwarded = compact(requestHeaders.get("x-forwarded-for"), 256).split(",")[0]?.trim() ?? "";
  const realIp = compact(requestHeaders.get("x-real-ip"), 128);
  return isIP(platform) ? platform : isIP(forwarded) ? forwarded : isIP(realIp) ? realIp : "unavailable";
}

/**
 * The whole availability policy, as one pure function so it can be proved
 * rather than argued about. `consumeConsumerAuthAttempt` below only supplies
 * the real-world inputs.
 *
 * The rule: production never proceeds on an unverified attempt. If the limiter
 * could not be consulted — unconfigured, or the call failed — production denies
 * rather than silently reverting to unlimited authentication. Non-production
 * allows, so a developer without this infrastructure is not locked out.
 */
export function decideRateLimit(input: Readonly<{
  productionPlatform: boolean;
  limiterConfigured: boolean;
  backendFailed: boolean;
  withinBudget: boolean;
}>): RateLimitVerdict {
  if (!input.limiterConfigured || input.backendFailed) {
    return input.productionPlatform ? "unavailable" : "allowed";
  }
  return input.withinBudget ? "allowed" : "throttled";
}

/**
 * Privacy-safe operational signal so a limiter outage is detectable.
 *
 * It goes to the structured console log rather than to `recordAggregateSignal`,
 * because that helper writes through the service Supabase client — the very
 * dependency that is missing in the case being reported. `createSafeEvent`
 * additionally refuses any detail key matching password/token/secret/
 * authorization/cookie/email, so no credential can be attached by mistake.
 * `emitOperationalEvent` de-duplicates within 5 seconds, so an outage under
 * load reports steadily instead of flooding.
 */
function reportLimiterUnavailable(scope: ConsumerAuthScope, reason: "unconfigured" | "backend-error"): void {
  emitOperationalEvent(new ConsoleMonitoringAdapter(), {
    category: "authentication",
    severity: "critical",
    code: "rate-limiter-unavailable",
    // Must satisfy /^[a-zA-Z0-9_-]{8,80}$/; the prefix also keeps the shortest
    // scope ("sign-up") above the minimum length.
    correlationId: `ratelimit-${scope}`,
    detail: { scope, reason, denied: true }
  });
}

/**
 * Reports that a caller actually hit their budget.
 *
 * Phase 1 reported only the limiter being *unavailable*, so the case the limiter
 * exists to catch — someone grinding against it — produced no signal at all. A
 * spike in these is the clearest early indicator of a credential attack.
 */
const THROTTLE_EVENT: Readonly<Record<ConsumerAuthScope, SecurityEventName>> = {
  "sign-in": "AUTH_RATE_LIMITED",
  "sign-up": "AUTH_SIGNUP_RATE_LIMITED",
  "password-recovery": "AUTH_RECOVERY_RATE_LIMITED"
};

async function reportThrottled(scope: ConsumerAuthScope, dimension: "request" | "account"): Promise<void> {
  // A stable correlation, for the same reason spray observation uses one. Being
  // throttled is a sustained CONDITION, not a discrete incident: once a subject
  // is over budget every further request returns "throttled" for the rest of the
  // window, so a per-request id would emit one line per request for as long as
  // an attacker cares to keep sending them. Collapsing them loses nothing — the
  // detail deliberately carries no subject, so the individual lines are
  // indistinguishable anyway.
  //
  // Discrete incidents keep their per-request id: one rejected credential, one
  // invalid webhook signature and one password change are each worth counting
  // individually, and that is where the volume IS the signal.
  await recordSecurityEvent(THROTTLE_EVENT[scope], { scope, dimension }, `throttled-${scope}-${dimension}`);
}

/**
 * Consults the limiter for one attempt.
 *
 * Availability note, verified rather than assumed: in `production-platform`
 * this cannot introduce a new outage. `createServiceSupabaseClient()` and
 * `createServerSupabaseClient()` share preconditions — both require
 * `hasProductionIdentityConfiguration()`, which itself requires `SUPABASE_URL`
 * and `SUPABASE_SECRET_KEY`. So any production state where this limiter is
 * unconfigured is already a state where the auth client is null and sign-in
 * fails regardless. Denying here removes a silent fail-open without removing a
 * path that otherwise worked.
 */
export async function consumeConsumerAuthAttempt(
  scope: ConsumerAuthScope,
  identifier: string
): Promise<RateLimitVerdict> {
  const productionPlatform = rateLimitingRequired();
  const secret = resolveLimiterSecret();
  const client = secret ? createServiceSupabaseClient() : null;

  if (!secret || !client) {
    if (productionPlatform) reportLimiterUnavailable(scope, "unconfigured");
    return decideRateLimit({ productionPlatform, limiterConfigured: false, backendFailed: false, withinBudget: false });
  }

  const budget = budgets[scope];
  const result = await client.rpc("consume_admin_auth_rate_limit", {
    p_scope: "login",
    p_subject_hash: await subject(secret, scope, identifier),
    p_max_attempts: budget.maxAttempts,
    p_window_seconds: budget.windowSeconds,
    p_block_seconds: budget.blockSeconds
  });

  if (result.error) {
    if (productionPlatform) reportLimiterUnavailable(scope, "backend-error");
    return decideRateLimit({ productionPlatform, limiterConfigured: true, backendFailed: true, withinBudget: false });
  }

  const requestVerdict = decideRateLimit({
    productionPlatform,
    limiterConfigured: true,
    backendFailed: false,
    withinBudget: result.data === true
  });
  if (requestVerdict === "throttled") {
    await reportThrottled(scope, "request");
    return requestVerdict;
  }
  if (requestVerdict !== "allowed") return requestVerdict;

  // Second dimension: the account being aimed at, regardless of where the
  // attempts come from. See consumeAccountTargetAttempt for why this covers
  // sign-in only.
  if (scope !== "sign-in") return requestVerdict;

  const accountResult = await client.rpc("consume_admin_auth_rate_limit", {
    p_scope: "login",
    p_subject_hash: accountTargetSubjectHash(secret, identifier),
    p_max_attempts: ACCOUNT_TARGET_BUDGET.maxAttempts,
    p_window_seconds: ACCOUNT_TARGET_BUDGET.windowSeconds,
    p_block_seconds: ACCOUNT_TARGET_BUDGET.blockSeconds
  });

  if (accountResult.error) {
    if (productionPlatform) reportLimiterUnavailable(scope, "backend-error");
    return decideRateLimit({ productionPlatform, limiterConfigured: true, backendFailed: true, withinBudget: false });
  }
  const accountVerdict = decideRateLimit({
    productionPlatform,
    limiterConfigured: true,
    backendFailed: false,
    withinBudget: accountResult.data === true
  });
  if (accountVerdict === "throttled") await reportThrottled(scope, "account");
  return accountVerdict;
}

/**
 * Watches for password spraying, and deliberately does NOT block it.
 *
 * Both existing dimensions are keyed on the account, so the one shape neither
 * catches is one guess against each of many accounts from a single address —
 * classic spraying and credential stuffing. Counting FAILED sign-ins per address
 * across all accounts is what sees it.
 *
 * **It must be called only after a credential has actually been rejected.** The
 * first version of this ran inside `consumeConsumerAuthAttempt`, which executes
 * *before* the password is checked, so it counted every attempt including every
 * success. Adversarial review reproduced the consequence: thirty students
 * signing in perfectly normally from one school address produced ten
 * `AUTH_SPRAY_SUSPECTED` events, and two hundred produced a hundred and seventy.
 * The signal was guaranteed to saturate on an ordinary school morning and bury
 * the genuine `AUTH_LOGIN_FAILED` and `AUTH_RATE_LIMITED` lines in the same
 * stream. Detection that always fires is not detection.
 *
 * It stays observation-only on purpose. The database function caps a budget at
 * 20 per window, and a class behind one school address can produce more than
 * twenty *mistyped* passwords in a quarter of an hour with nothing wrong.
 * Enforcing here would be exactly the classroom lockout the product cannot
 * afford, so this raises a signal for a human and lets the request through. If
 * the log shows real spraying, an edge rule keyed on the TLS fingerprint — which
 * distinguishes clients behind one address, unlike the address itself — is the
 * proportionate response, not a block here.
 */
const SPRAY_OBSERVATION: Budget = Object.freeze({
  maxAttempts: 20,
  windowSeconds: 900,
  blockSeconds: 900
});

/**
 * A fixed correlation id, so `emitOperationalEvent`'s 5-second de-duplication
 * applies. This event describes a sustained condition at one address, not a
 * single request; once the threshold is crossed the database function keeps
 * returning `false` for the rest of the window, so a per-request id would emit
 * one line for every subsequent sign-in.
 */
const SPRAY_CORRELATION = "spray-observation";

export async function observeFailedSignIn(): Promise<void> {
  const productionPlatform = rateLimitingRequired();
  if (!productionPlatform) return;
  const secret = resolveLimiterSecret();
  const client = secret ? createServiceSupabaseClient() : null;
  if (!secret || !client) return;
  try {
    const requestHeaders = await headers();
    const address = clientAddress(requestHeaders);
    if (address === "unavailable") return;
    const subjectHash = createHmac("sha256", secret).update(`consumer-spray\n${address}`).digest("hex");
    const result = await client.rpc("consume_admin_auth_rate_limit", {
      p_scope: "login",
      p_subject_hash: subjectHash,
      p_max_attempts: SPRAY_OBSERVATION.maxAttempts,
      p_window_seconds: SPRAY_OBSERVATION.windowSeconds,
      p_block_seconds: SPRAY_OBSERVATION.blockSeconds
    });
    // `false` means this address has crossed the observation threshold. The
    // request still proceeds; only the signal is raised.
    if (!result.error && result.data === false) {
      await recordSecurityEvent("AUTH_SPRAY_SUSPECTED", { enforced: false }, SPRAY_CORRELATION);
    }
  } catch {
    // Observation must never affect the outcome of an authentication attempt.
  }
}

/** Clears the counter after a genuine success so honest users never accumulate. */
export async function clearConsumerAuthAttempts(
  scope: ConsumerAuthScope,
  identifier: string
): Promise<void> {
  const secret = resolveLimiterSecret();
  const client = secret ? createServiceSupabaseClient() : null;
  if (!secret || !client) return;
  await client.rpc("clear_admin_auth_rate_limit", {
    p_scope: "login",
    p_subject_hash: await subject(secret, scope, identifier)
  });
  // Both dimensions must clear, or a user who signs in successfully would keep
  // an account-target counter that eventually locks them out for no reason.
  if (scope === "sign-in") {
    await client.rpc("clear_admin_auth_rate_limit", {
      p_scope: "login",
      p_subject_hash: accountTargetSubjectHash(secret, identifier)
    });
  }
}
