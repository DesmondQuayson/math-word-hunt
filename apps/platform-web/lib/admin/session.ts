import "server-only";

import { cookies, headers } from "next/headers";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { inspectAdminEmergencyFlag } from "@/lib/operations/server";

import { getAdminSecurityConfig, isAdminFeatureEnabled } from "./config";
import { createAdminRepository, type AdminRepository } from "./repository";
import {
  adminSessionCookieOptions,
  createAdminSessionToken,
  decideAdminAccess,
  decideCookieOnlyAccess,
  getAdminClientContext,
  hashAdminSessionToken,
  isSameOriginAdminRequest,
  verifyAdminCsrfToken,
  verifyAdminSessionCsrfToken
} from "./security";
import { shouldRecordAdminActivity } from "./session-policy";
import type { AdminAccessDecision, AdminClientContext, AdminSessionRecord, AdminUserRecord } from "./types";

export const ADMIN_SESSION_COOKIE = "mvh-admin-session";
export const ADMIN_MFA_CHALLENGE_COOKIE = "mvh-admin-mfa-pending";
const ADMIN_MFA_CHALLENGE_MINUTES = 5;

export type PreMfaAdminContext = Readonly<{
  state: "ready";
  admin: AdminUserRecord;
  assuranceLevel: string | null;
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>;
  repository: AdminRepository;
  context: AdminClientContext;
}> | Readonly<{ state: "disabled" }>
  | Readonly<{ state: "unavailable" }>
  | Readonly<{ state: "unauthenticated" }>
  | Readonly<{ state: "non-admin" }>;

export type PendingMfaAdminContext = Extract<PreMfaAdminContext, { state: "ready" }> & Readonly<{
  challengeTokenHash: string;
}>;

export async function inspectPreMfaAdmin(): Promise<PreMfaAdminContext> {
  if (!isAdminFeatureEnabled()) return { state: "disabled" };
  const emergency = await inspectAdminEmergencyFlag();
  if (emergency === "enabled") return { state: "disabled" };
  if (emergency === "unavailable") return { state: "unavailable" };
  const config = getAdminSecurityConfig();
  const supabase = await createServerSupabaseClient();
  const repository = createAdminRepository();
  if (!config || !supabase || !repository) return { state: "unavailable" };

  const userResult = await supabase.auth.getUser();
  const user = userResult.data.user;
  if (userResult.error || !user || !user.email_confirmed_at) return { state: "unauthenticated" };

  let admin: AdminUserRecord | null;
  try { admin = await repository.findAdminByUserId(user.id); }
  catch { return { state: "unavailable" }; }
  if (!admin || admin.revoked_at !== null) return { state: "non-admin" };

  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const requestHeaders = await headers();
  return {
    state: "ready",
    admin,
    assuranceLevel: assurance.error ? null : assurance.data.currentLevel,
    supabase,
    repository,
    context: getAdminClientContext(requestHeaders)
  };
}

/**
 * The server-side authority for every protected Super Admin request. Checks,
 * in order: the kill switch, the emergency flag, the Supabase user and email
 * confirmation, admin membership and revocation, MFA enrollment and AAL2, and
 * the admin session (token, owner, revocation, end, absolute expiry, idle
 * expiry). A session found expired or idle is ended server-side with that
 * reason. An authorized request refreshes the idle window at most once a minute.
 */
export async function inspectAdminAccess(now = new Date()): Promise<AdminAccessDecision> {
  const featureEnabled = isAdminFeatureEnabled();
  if (!featureEnabled) return { state: "disabled" };
  const emergency = await inspectAdminEmergencyFlag();
  if (emergency === "enabled") return { state: "disabled" };
  if (emergency === "unavailable") return { state: "unavailable" };
  const config = getAdminSecurityConfig();
  const supabase = await createServerSupabaseClient();
  const repository = createAdminRepository();
  if (!config || !supabase || !repository) return { state: "unavailable" };

  const rawToken = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value ?? "";
  const tokenHash = hashAdminSessionToken(rawToken);
  const userResult = await supabase.auth.getUser();
  const user = userResult.data.user;
  if (userResult.error || !user) {
    if (!tokenHash) return { state: "unauthenticated" };
    try {
      const session = await repository.findSessionByHash(tokenHash);
      const admin = session ? await repository.findAdminById(session.admin_user_id) : null;
      return decideCookieOnlyAccess({ admin, session, now });
    } catch {
      return { state: "unauthenticated" };
    }
  }

  let admin: AdminUserRecord | null = null;
  let session: AdminSessionRecord | null = null;
  const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  try {
    admin = await repository.findAdminByUserId(user.id);
    if (tokenHash) session = await repository.findSessionByHash(tokenHash);
  } catch {
    return { state: "unavailable" };
  }

  const decision = decideAdminAccess({
    featureEnabled,
    infrastructureAvailable: true,
    authenticated: true,
    emailVerified: Boolean(user.email_confirmed_at),
    assuranceLevel: assurance.error ? null : assurance.data.currentLevel,
    admin,
    session,
    sessionTokenValid: Boolean(tokenHash),
    now
  });

  if (decision.state === "reauth-required" && (decision.reason === "expired" || decision.reason === "idle") &&
      tokenHash && session && session.ended_at === null && session.revoked_at === null) {
    try {
      await repository.endSession(tokenHash, decision.reason === "idle" ? "idle-expired" : "expired", getAdminClientContext(await headers()));
    } catch {
      // The database refuses an expired or idle session on its own; ending it
      // here only records the end and its reason.
    }
  }

  if (decision.state === "authorized" && tokenHash && shouldRecordAdminActivity(decision.session, now)) {
    try {
      if (await repository.touchSession(tokenHash)) {
        return { ...decision, session: { ...decision.session, last_activity_at: now.toISOString() } };
      }
    } catch {
      // Best effort: a missed activity write can only shorten the idle window.
    }
  }
  return decision;
}

/** Session-bound CSRF check for every state-changing request inside the Super Admin shell. */
export async function validateAdminMutationCsrf(formData: FormData, session: Pick<AdminSessionRecord, "id">): Promise<boolean> {
  const config = getAdminSecurityConfig();
  if (!config) return false;
  const token = String(formData.get("csrfToken") ?? "");
  const requestHeaders = await headers();
  return isSameOriginAdminRequest(requestHeaders, config.applicationOrigin) &&
    verifyAdminSessionCsrfToken(token, config, session.id);
}

/** CSRF check for the sign-in, MFA and account-switch forms, which run before an admin session exists. */
export async function validatePreSessionCsrf(formData: FormData): Promise<boolean> {
  const config = getAdminSecurityConfig();
  if (!config) return false;
  const token = String(formData.get("csrfToken") ?? "");
  const requestHeaders = await headers();
  return isSameOriginAdminRequest(requestHeaders, config.applicationOrigin) &&
    verifyAdminCsrfToken(token, config);
}

/**
 * Sign-out carries the token bound to the session in this browser's cookie,
 * so it still works after that session has expired or gone idle.
 */
export async function validateAdminSignOutCsrf(formData: FormData, repository: AdminRepository): Promise<boolean> {
  const config = getAdminSecurityConfig();
  if (!config) return false;
  const tokenHash = hashAdminSessionToken((await cookies()).get(ADMIN_SESSION_COOKIE)?.value ?? "");
  if (!tokenHash) return false;
  let session: AdminSessionRecord | null;
  try { session = await repository.findSessionByHash(tokenHash); } catch { return false; }
  if (!session) return false;
  return validateAdminMutationCsrf(formData, session);
}

export async function createPendingAdminMfaChallenge(
  adminUserId: string,
  repository: AdminRepository,
  context: AdminClientContext
): Promise<void> {
  const config = getAdminSecurityConfig();
  if (!config) throw new Error("Admin security configuration unavailable.");
  const token = createAdminSessionToken();
  const tokenHash = hashAdminSessionToken(token);
  if (!tokenHash) throw new Error("Admin MFA challenge token generation failed.");
  const expiresAt = new Date(Date.now() + ADMIN_MFA_CHALLENGE_MINUTES * 60_000);
  await repository.startMfaChallenge(adminUserId, tokenHash, expiresAt, context);
  (await cookies()).set(ADMIN_MFA_CHALLENGE_COOKIE, token, {
    httpOnly: true,
    secure: config.secureCookie,
    sameSite: "strict",
    path: "/admin",
    expires: expiresAt
  });
}

export async function inspectPendingMfaAdmin(now = new Date()): Promise<PendingMfaAdminContext | Readonly<{ state: "missing" | "unavailable" | "disabled" | "unauthenticated" | "non-admin" }>> {
  const preliminary = await inspectPreMfaAdmin();
  if (preliminary.state !== "ready") return preliminary;
  const token = (await cookies()).get(ADMIN_MFA_CHALLENGE_COOKIE)?.value ?? "";
  const tokenHash = hashAdminSessionToken(token);
  if (!tokenHash) return { state: "missing" };
  try {
    const challenge = await preliminary.repository.findMfaChallengeByHash(tokenHash);
    if (!challenge || challenge.admin_user_id !== preliminary.admin.id || challenge.consumed_at || challenge.revoked_at ||
        Date.parse(challenge.expires_at) <= now.getTime()) return { state: "missing" };
    return { ...preliminary, challengeTokenHash: tokenHash };
  } catch {
    return { state: "unavailable" };
  }
}

export async function consumePendingAdminMfaChallenge(context: PendingMfaAdminContext): Promise<boolean> {
  const consumed = await context.repository.consumeMfaChallenge(context.challengeTokenHash);
  (await cookies()).set(ADMIN_MFA_CHALLENGE_COOKIE, "", {
    httpOnly: true,
    secure: getAdminSecurityConfig()?.secureCookie ?? true,
    sameSite: "strict",
    path: "/admin",
    maxAge: 0
  });
  return consumed;
}

export async function clearPendingAdminMfaChallenge(): Promise<void> {
  const config = getAdminSecurityConfig();
  (await cookies()).set(ADMIN_MFA_CHALLENGE_COOKIE, "", {
    httpOnly: true,
    secure: config?.secureCookie ?? true,
    sameSite: "strict",
    path: "/admin",
    maxAge: 0
  });
}

export async function createBoundAdminSession(
  adminUserId: string,
  repository: AdminRepository,
  context: AdminClientContext
): Promise<void> {
  const config = getAdminSecurityConfig();
  if (!config) throw new Error("Admin security configuration unavailable.");
  const token = createAdminSessionToken();
  const tokenHash = hashAdminSessionToken(token);
  if (!tokenHash) throw new Error("Admin session token generation failed.");
  const expiresAt = new Date(Date.now() + config.sessionMinutes * 60_000);
  await repository.startSession(adminUserId, tokenHash, expiresAt, context);
  (await cookies()).set(ADMIN_SESSION_COOKIE, token, adminSessionCookieOptions(config, expiresAt));
}

export async function endCurrentAdminSession(
  repository: AdminRepository,
  context: AdminClientContext,
  reason: "signed-out" | "expired" = "signed-out"
): Promise<void> {
  const config = getAdminSecurityConfig();
  if (!config) throw new Error("Admin security configuration unavailable.");
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value ?? "";
  const tokenHash = hashAdminSessionToken(rawToken);
  if (tokenHash) await repository.endSession(tokenHash, reason, context);
  cookieStore.set(ADMIN_SESSION_COOKIE, "", { ...adminSessionCookieOptions(config, new Date(0)), expires: undefined, maxAge: 0 });
  cookieStore.set(ADMIN_MFA_CHALLENGE_COOKIE, "", {
    httpOnly: true,
    secure: config.secureCookie,
    sameSite: "strict",
    path: "/admin",
    maxAge: 0
  });
}
