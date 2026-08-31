import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";

import { ConsoleMonitoringAdapter, emitOperationalEvent } from "@/lib/observability/server";
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

export function consumerAuthSubjectHash(
  secret: string,
  scope: ConsumerAuthScope,
  identifier: string,
  ip: string,
  userAgent: string
): string {
  return createHmac("sha256", secret)
    .update(`consumer-auth\n${scope}\n${compact(identifier, 254).toLowerCase()}\n${compact(ip, 128)}\n${compact(userAgent, 512)}`)
    .digest("hex");
}

async function subject(secret: string, scope: ConsumerAuthScope, identifier: string): Promise<string> {
  const requestHeaders = await headers();
  const forwarded = compact(requestHeaders.get("x-forwarded-for"), 256).split(",")[0]?.trim() ?? "";
  const ip = forwarded || compact(requestHeaders.get("x-real-ip"), 128) || "unavailable";
  const userAgent = compact(requestHeaders.get("user-agent"), 512) || "unavailable";
  return consumerAuthSubjectHash(secret, scope, identifier, ip, userAgent);
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
  return decideRateLimit({
    productionPlatform,
    limiterConfigured: true,
    backendFailed: false,
    withinBudget: result.data === true
  });
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
}
