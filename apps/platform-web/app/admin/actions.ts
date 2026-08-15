"use server";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getAdminSecurityConfig, isAdminFeatureEnabled } from "@/lib/admin/config";
import type { AdminAuthFormState } from "@/lib/admin/form-state";
import { createAdminRepository } from "@/lib/admin/repository";
import { createAdminRateSubjectHash, getAdminClientContext } from "@/lib/admin/security";
import {
  clearPendingAdminMfaChallenge,
  consumePendingAdminMfaChallenge,
  createBoundAdminSession,
  createPendingAdminMfaChallenge,
  endCurrentAdminSession,
  inspectPendingMfaAdmin,
  inspectPreMfaAdmin,
  validateAdminMutationCsrf
} from "@/lib/admin/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const unavailable: AdminAuthFormState = {
  status: "error",
  message: "Admin access is unavailable. Contact the system owner through the established emergency channel."
};

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function validEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function adminSignInAction(
  _previous: AdminAuthFormState,
  formData: FormData
): Promise<AdminAuthFormState> {
  if (!isAdminFeatureEnabled()) notFound();
  const config = getAdminSecurityConfig();
  const repository = createAdminRepository();
  const supabase = await createServerSupabaseClient();
  if (!config || !repository || !supabase) return unavailable;

  const requestHeaders = await headers();
  const context = getAdminClientContext(requestHeaders);
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const rateHash = createAdminRateSubjectHash("login", validEmail(email) ? email : "invalid", context, config);

  if (!await validateAdminMutationCsrf(formData)) {
    await repository.recordAudit({ adminUserId: null, action: "admin.login.failure", metadata: { reason: "csrf" }, context });
    return { status: "error", message: "The sign-in request expired. Reload this page and try again." };
  }

  const allowed = await repository.consumeRateLimit("login", rateHash, config.loginMaxAttempts,
    config.rateWindowSeconds, config.rateBlockSeconds);
  if (!allowed) return { status: "error", message: "Sign-in is temporarily unavailable. Wait before trying again." };

  if (!validEmail(email) || password.length < 1 || password.length > 128) {
    await repository.recordAudit({ adminUserId: null, action: "admin.login.failure", metadata: { reason: "invalid-input" }, context });
    return { status: "error", message: "The email or password was not accepted." };
  }

  const signIn = await supabase.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.user || !signIn.data.user.email_confirmed_at) {
    await repository.recordAudit({ adminUserId: null, action: "admin.login.failure", metadata: { reason: "credentials" }, context });
    return { status: "error", message: "The email or password was not accepted." };
  }

  const admin = await repository.findAdminByUserId(signIn.data.user.id);
  if (!admin || admin.revoked_at !== null) {
    await repository.recordAudit({
      adminUserId: admin?.id ?? null,
      action: "admin.login.failure",
      metadata: { reason: admin?.revoked_at ? "revoked" : "not-authorized" },
      context
    });
    await supabase.auth.signOut({ scope: "local" });
    notFound();
  }

  await repository.recordAudit({ adminUserId: admin.id, action: "admin.login.success", context });
  await repository.clearRateLimit("login", rateHash);
  try {
    await createPendingAdminMfaChallenge(admin.id, repository, context);
  } catch {
    await supabase.auth.signOut({ scope: "local" });
    return unavailable;
  }
  redirect("/admin/mfa");
}

export async function adminSwitchAccountAction(formData: FormData): Promise<void> {
  if (!isAdminFeatureEnabled()) notFound();
  const preliminary = await inspectPreMfaAdmin();
  if (preliminary.state !== "non-admin") notFound();
  if (!await validateAdminMutationCsrf(formData)) redirect("/admin/sign-in?expired=1");
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/admin/sign-in?unavailable=1");
  await clearPendingAdminMfaChallenge();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/admin/sign-in?switched=1");
}

export async function adminEnrollMfaAction(
  _previous: AdminAuthFormState,
  formData: FormData
): Promise<AdminAuthFormState> {
  const preliminary = await inspectPendingMfaAdmin();
  if (preliminary.state === "unavailable") return unavailable;
  if (preliminary.state !== "ready") notFound();
  if (!await validateAdminMutationCsrf(formData)) {
    await preliminary.repository.recordAudit({
      adminUserId: preliminary.admin.id, action: "admin.mfa.failure", metadata: { reason: "csrf" }, context: preliminary.context
    });
    return { status: "error", message: "The MFA setup request expired. Reload this page and try again." };
  }

  const factors = await preliminary.supabase.auth.mfa.listFactors();
  if (factors.error) return unavailable;
  if (factors.data.totp.length > 0) {
    return { status: "error", message: "A verified authenticator is already enrolled. Use the verification form." };
  }
  for (const factor of factors.data.all.filter((item) => item.factor_type === "totp" && item.status === "unverified")) {
    await preliminary.supabase.auth.mfa.unenroll({ factorId: factor.id });
  }

  const enrollment = await preliminary.supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "MathNexa Super Admin"
  });
  if (enrollment.error) {
    await preliminary.repository.recordAudit({
      adminUserId: preliminary.admin.id, action: "admin.mfa.failure", metadata: { reason: "enrollment" }, context: preliminary.context
    });
    return { status: "error", message: "Authenticator setup could not start. Try again." };
  }

  return {
    status: "enrollment",
    message: "Scan the code, then verify the six-digit code from your authenticator app.",
    factorId: enrollment.data.id,
    qrCode: enrollment.data.totp.qr_code,
    secret: enrollment.data.totp.secret
  };
}

export async function adminVerifyMfaAction(
  _previous: AdminAuthFormState,
  formData: FormData
): Promise<AdminAuthFormState> {
  const preliminary = await inspectPendingMfaAdmin();
  if (preliminary.state === "unavailable") return unavailable;
  if (preliminary.state !== "ready") notFound();
  if (!await validateAdminMutationCsrf(formData)) {
    await preliminary.repository.recordAudit({
      adminUserId: preliminary.admin.id, action: "admin.mfa.failure", metadata: { reason: "csrf" }, context: preliminary.context
    });
    return { status: "error", message: "The verification request expired. Reload this page and try again." };
  }

  const config = getAdminSecurityConfig();
  if (!config) return unavailable;
  const rateHash = createAdminRateSubjectHash("mfa", preliminary.admin.id, preliminary.context, config);
  const allowed = await preliminary.repository.consumeRateLimit("mfa", rateHash, config.mfaMaxAttempts,
    config.rateWindowSeconds, config.rateBlockSeconds);
  if (!allowed) return { status: "error", message: "MFA verification is temporarily unavailable. Wait before trying again." };

  const factorId = field(formData, "factorId");
  const code = field(formData, "code");
  const factors = await preliminary.supabase.auth.mfa.listFactors();
  const ownedTotp = !factors.error && factors.data.all.some((factor) =>
    factor.id === factorId && factor.factor_type === "totp");
  if (!ownedTotp || !/^[0-9]{6}$/.test(code)) {
    await preliminary.repository.recordAudit({
      adminUserId: preliminary.admin.id, action: "admin.mfa.failure", metadata: { reason: "invalid-code" }, context: preliminary.context
    });
    return { status: "error", message: "The verification code was not accepted." };
  }

  const verified = await preliminary.supabase.auth.mfa.challengeAndVerify({ factorId, code });
  const assurance = await preliminary.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (verified.error || assurance.error || assurance.data.currentLevel !== "aal2") {
    await preliminary.repository.recordAudit({
      adminUserId: preliminary.admin.id, action: "admin.mfa.failure", metadata: { reason: "verification" }, context: preliminary.context
    });
    return { status: "error", message: "The verification code was not accepted." };
  }

  await preliminary.repository.markMfaEnrolled(preliminary.admin.id);
  await preliminary.repository.recordAudit({
    adminUserId: preliminary.admin.id, action: "admin.mfa.success", metadata: { factor_type: "totp" }, context: preliminary.context
  });
  if (!await consumePendingAdminMfaChallenge(preliminary)) return unavailable;
  await createBoundAdminSession(preliminary.admin.id, preliminary.repository, preliminary.context);
  await preliminary.repository.clearRateLimit("mfa", rateHash);
  redirect("/admin");
}

export async function adminSignOutAction(formData: FormData): Promise<void> {
  const preliminary = await inspectPreMfaAdmin();
  if (preliminary.state === "disabled" || preliminary.state === "non-admin") notFound();
  if (preliminary.state === "unauthenticated" || preliminary.state === "unavailable") notFound();
  if (!await validateAdminMutationCsrf(formData)) redirect("/admin?csrf=invalid");
  await endCurrentAdminSession(preliminary.repository, preliminary.context);
  await preliminary.supabase.auth.signOut({ scope: "local" });
  redirect("/admin/sign-in?signedOut=1");
}
