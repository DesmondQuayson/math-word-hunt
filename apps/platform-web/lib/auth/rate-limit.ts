import "server-only";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";

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
 * Keying material for the subject pseudonyms. It never leaves the server and is
 * only ever used one-way, so a stored subject hash cannot be walked back to an
 * address or an email address.
 *
 * The fallback chain matters. `MVH_ADMIN_CSRF_SECRET` only exists when the
 * admin console is enabled, so keying solely on it would leave the limiter
 * unavailable on any deployment that runs without admin. `SUPABASE_SECRET_KEY`
 * is present exactly when the service client this limiter already depends on is
 * present, so it is the correct floor. A dedicated `MVH_AUTH_RATE_LIMIT_SECRET`
 * can be introduced later without touching code.
 */
export function resolveLimiterSecret(source: NodeJS.ProcessEnv = process.env): string | null {
  for (const candidate of [
    source.MVH_AUTH_RATE_LIMIT_SECRET,
    source.MVH_ADMIN_CSRF_SECRET,
    source.SUPABASE_SECRET_KEY
  ]) {
    const value = candidate?.trim() ?? "";
    if (value.length >= 32 && value.length <= 512) return value;
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
 * True when this deployment can actually throttle. A production readiness check
 * can assert this so the allow-on-unconfigured branch below is never the state
 * a paying deployment is silently left in.
 */
export function limiterConfigured(): boolean {
  return resolveLimiterSecret() !== null && createServiceSupabaseClient() !== null;
}

/**
 * Returns true when the attempt may proceed.
 *
 * Availability policy, stated deliberately because the two failure modes are
 * not the same thing:
 *
 *   - Limiter NOT CONFIGURED (no secret, or no service client) -> allow.
 *     This is a deployment state, not an attack signal. Denying here would mean
 *     one missing environment variable silently locks every customer out of a
 *     paid product, which is a worse outcome than the window it closes.
 *   - Limiter CONFIGURED but the call FAILS, or the budget is spent -> deny.
 *     Once the limiter is real, an error may be attacker-induced pressure, so
 *     the secure reading is to refuse.
 */
export async function consumeConsumerAuthAttempt(
  scope: ConsumerAuthScope,
  identifier: string
): Promise<boolean> {
  const secret = resolveLimiterSecret();
  const client = secret ? createServiceSupabaseClient() : null;
  if (!secret || !client) return true;

  const budget = budgets[scope];
  const result = await client.rpc("consume_admin_auth_rate_limit", {
    p_scope: "login",
    p_subject_hash: await subject(secret, scope, identifier),
    p_max_attempts: budget.maxAttempts,
    p_window_seconds: budget.windowSeconds,
    p_block_seconds: budget.blockSeconds
  });
  return !result.error && result.data === true;
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
