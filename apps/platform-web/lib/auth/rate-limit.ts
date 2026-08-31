import "server-only";

import { createHmac } from "node:crypto";
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
 * 20 attempts per hour is the tightest the deployed `consume_admin_auth_rate_limit`
 * function permits (`p_max_attempts` is validated 1..20, `p_window_seconds`
 * 30..3600), and it is also a sensible ceiling on its own terms: twenty failed
 * password attempts against one account within an hour is already far outside
 * normal use, while the cap turns unlimited distributed guessing into twenty
 * guesses an hour.
 *
 * **The unavoidable trade, stated plainly.** Any per-account limiter hands an
 * attacker who knows a victim's address a way to spend that budget deliberately
 * and lock them out. Three things keep that proportionate here:
 *
 *   1. The block is 15 minutes, not permanent, and a successful sign-in clears
 *      the counter immediately.
 *   2. It applies to **sign-in only**. Password recovery deliberately keeps just
 *      its request-level budget, so a locked-out user still has a working route
 *      back into their account rather than being stuck behind the same wall.
 *   3. The refusal is the same generic copy as any other failure, so the
 *      limiter cannot be used to confirm that an account exists.
 *
 * The alternative — leaving distributed guessing uncapped — is worse for a paid
 * product holding real accounts.
 */
const ACCOUNT_TARGET_BUDGET: Budget = Object.freeze({
  maxAttempts: 20,
  windowSeconds: 3600,
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
export function resolveLimiterSecret(source: NodeJS.ProcessEnv = process.env): string | null {
  for (const candidate of [
    source.MVH_AUTH_RATE_LIMIT_SECRET,
    source.MVH_ADMIN_CSRF_SECRET,
    source.SUPABASE_SECRET_KEY
  ]) {
    const value = candidate?.trim() ?? "";
    if (value.length >= 20 && value.length <= 512) return value;
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
  const platform = compact(requestHeaders.get("x-vercel-forwarded-for"), 128);
  if (platform) return platform.split(",")[0]!.trim();
  const forwarded = compact(requestHeaders.get("x-forwarded-for"), 256).split(",")[0]?.trim() ?? "";
  return forwarded || compact(requestHeaders.get("x-real-ip"), 128) || "unavailable";
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
  await recordSecurityEvent(THROTTLE_EVENT[scope], { scope, dimension });
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
