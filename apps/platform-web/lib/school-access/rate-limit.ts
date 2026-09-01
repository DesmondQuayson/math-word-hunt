import "server-only";

import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

/**
 * Budget for the authorized-code gate.
 *
 * This limiter is keyed on the network address, and a school puts a whole
 * cohort behind one. The previous 5-attempts-then-block-for-30-minutes was
 * therefore a classroom lockout waiting to happen: six mistyped codes during
 * one lesson and the entire school lost access for half an hour.
 *
 * 20 is the most the deployed `consume_admin_auth_rate_limit` function allows,
 * and the block is halved to 15 minutes. That is still overwhelming protection
 * for what it guards — the shortest permitted code is four characters from a
 * 36-symbol alphabet, so 20 attempts per 15 minutes leaves an exhaustive search
 * on the order of years, not hours — while giving a class realistic room to
 * fumble.
 *
 * The arithmetic, since an earlier version of this comment claimed "millennia"
 * and was wrong by three orders of magnitude: the shortest permitted code is
 * `[A-Z0-9][A-Z0-9_-]{3}`, so 36 x 38^3 = 1,975,392 possibilities. At 20 per 15
 * minutes that is 80 an hour, or about 2.8 years to exhaust and 1.4 to reach an
 * even chance. The previous 5-per-15-minutes budget bought 11.3 years. Both are
 * far beyond any realistic attacker's patience against a code that is rotated
 * between cohorts, and codes longer than the four-character floor multiply it by
 * 38 per character — but the honest figure is years, and it is worth restating
 * if the floor is ever lowered.
 *
 * A correct entry calls `clearSchoolAccessAttempts`, so only *consecutive
 * failures* accumulate; students who type the code correctly never consume the
 * budget for the ones behind them.
 */
const maximumAttempts = 20;
const windowSeconds = 15 * 60;
const blockSeconds = 15 * 60;

function compact(value: string | null, maximum: number): string {
  return (value ?? "").trim().slice(0, maximum);
}

/**
 * Keyed pseudonym for the caller.
 *
 * The user agent is deliberately excluded. It is chosen by the caller, so
 * including it let an attacker mint a fresh budget by changing one header — the
 * same self-defeating pattern the consumer limiter had — while doing nothing to
 * separate legitimate students, who share both the address and, often, the
 * school-issued browser.
 */
export function schoolAccessRateLimitSubject(secret: string, ip: string): string {
  return createHmac("sha256", secret)
    .update(`school-access\n${compact(ip, 128)}`)
    .digest("hex");
}

async function subject(secret: string): Promise<string> {
  const requestHeaders = await headers();
  // Prefer the address the platform sets: a caller can prepend entries to
  // x-forwarded-for, so only its leftmost value is ever considered, and only as
  // a fallback.
  const platform = compact(requestHeaders.get("x-vercel-forwarded-for"), 128);
  const forwarded = compact(requestHeaders.get("x-forwarded-for"), 256).split(",")[0]?.trim() ?? "";
  const realIp = compact(requestHeaders.get("x-real-ip"), 128);
  // Every candidate must parse as an IP; otherwise any string a caller supplies
  // becomes a bucket key of its own and varying it mints unlimited budgets.
  const first = platform.split(",")[0]?.trim() ?? "";
  const ip = isIP(first) ? first : isIP(forwarded) ? forwarded : isIP(realIp) ? realIp : "unavailable";
  return schoolAccessRateLimitSubject(secret, ip);
}

export async function consumeSchoolAccessAttempt(secret: string): Promise<boolean> {
  const client = createServiceSupabaseClient();
  if (!client) return false;
  const result = await client.rpc("consume_admin_auth_rate_limit", {
    p_scope: "login",
    p_subject_hash: await subject(secret),
    p_max_attempts: maximumAttempts,
    p_window_seconds: windowSeconds,
    p_block_seconds: blockSeconds
  });
  return !result.error && result.data === true;
}

export async function clearSchoolAccessAttempts(secret: string): Promise<void> {
  const client = createServiceSupabaseClient();
  if (!client) return;
  await client.rpc("clear_admin_auth_rate_limit", {
    p_scope: "login",
    p_subject_hash: await subject(secret)
  });
}
