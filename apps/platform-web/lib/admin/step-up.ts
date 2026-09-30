import "server-only";

import { headers } from "next/headers";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import { getAdminSecurityConfig } from "./config";
import { createAdminRepository } from "./repository";
import { createAdminRateSubjectHash, getAdminClientContext } from "./security";
import { adminStepUpNeeded } from "./session-policy";
import type { AdminSessionRecord, AdminUserRecord } from "./types";

export { STEP_UP_ACCOUNT_OPERATIONS, STEP_UP_FEATURE_FLAGS } from "./session-policy";

export type AdminStepUpOutcome = "fresh" | "verified" | "required" | "failed" | "rate-limited" | "unavailable";

/**
 * Makes sure the administrator verified a TOTP code recently enough for a
 * sensitive operation, without restarting the admin session:
 * - fresh: a verification (the sign-in MFA or an earlier step-up) is recent;
 * - required: it is not, and no code was submitted, so the form asks for one;
 * - verified: the submitted code was verified by Supabase Auth against the
 *   administrator's own enrolled factor and recorded as step_up_at.
 * Attempts are limited twice: per administrator and network address, and per
 * admin session regardless of address (so a stolen session cannot spread
 * guesses across many addresses). Both are kept apart from the sign-in MFA
 * limit, so failed step-ups never lock the owner out of signing in. Codes are
 * never logged or stored.
 */
export async function ensureAdminStepUp(input: Readonly<{
  admin: AdminUserRecord;
  session: AdminSessionRecord;
  code: string;
  now?: Date;
}>): Promise<AdminStepUpOutcome> {
  if (!adminStepUpNeeded(input.session, input.now ?? new Date())) return "fresh";
  const code = input.code.trim();
  if (!code) return "required";

  const config = getAdminSecurityConfig();
  const repository = createAdminRepository();
  const supabase = await createServerSupabaseClient();
  if (!config || !repository || !supabase) return "unavailable";
  const context = getAdminClientContext(await headers());
  const failure = async (reason: string) => {
    try {
      await repository.recordAudit({ adminUserId: input.admin.id, action: "admin.step-up.failure", target: input.session.id, metadata: { reason }, context });
    } catch { /* the failure itself is still returned */ }
  };

  const addressHash = createAdminRateSubjectHash("mfa", `step-up:${input.admin.id}`, context, config);
  const sessionHash = createAdminRateSubjectHash("mfa", `step-up-session:${input.session.id}`, { ip: null, userAgent: null }, config);
  let allowed: boolean;
  try {
    const byAddress = await repository.consumeRateLimit("mfa", addressHash, config.mfaMaxAttempts, config.rateWindowSeconds, config.rateBlockSeconds);
    const bySession = await repository.consumeRateLimit("mfa", sessionHash, config.mfaMaxAttempts, config.rateWindowSeconds, config.rateBlockSeconds);
    allowed = byAddress && bySession;
  } catch {
    return "unavailable";
  }
  if (!allowed) {
    await failure("rate-limited");
    return "rate-limited";
  }
  if (!/^[0-9]{6}$/.test(code)) {
    await failure("invalid-code");
    return "failed";
  }

  const factors = await supabase.auth.mfa.listFactors();
  const factorId = factors.error ? undefined : factors.data.totp[0]?.id;
  if (!factorId) {
    await failure("no-verified-factor");
    return "failed";
  }
  const verified = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (verified.error) {
    await failure("verification");
    return "failed";
  }

  try {
    await repository.recordStepUp(input.admin.id, input.session.id, context);
  } catch {
    return "unavailable";
  }
  try {
    await repository.clearRateLimit("mfa", addressHash);
    await repository.clearRateLimit("mfa", sessionHash);
  } catch { /* the windows expire on their own */ }
  return "verified";
}
