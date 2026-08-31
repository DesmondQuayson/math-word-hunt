"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import type { AuthFormState, EmailConfirmationState } from "@/lib/auth/form-state";
import { POST_AUTH_DESTINATION } from "@/lib/auth/access-intent";
import { getAppBaseUrl, safeInternalRedirect } from "@/lib/auth/safe-redirect";
import { getAuthEmailExperience } from "@/lib/email/server";
import { isProductionPublicMode } from "@/lib/environment/production-public";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { recordAggregateSignal } from "@/lib/operations/server";
import { clearConsumerAuthAttempts, consumeConsumerAuthAttempt } from "@/lib/auth/rate-limit";
import { recordSecurityEvent } from "@/lib/observability/security-events";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const confirmationEmailCookie = "mathnexa-confirmation-email";
const confirmationNextCookie = "mathnexa-confirmation-next";
const confirmationCooldownCookie = "mathnexa-confirmation-resend-after";
const confirmationCookieLifetimeSeconds = 20 * 60;
const resendCooldownSeconds = 60;

function confirmationCookieOptions(maxAge = confirmationCookieLifetimeSeconds) {
  return {
    httpOnly: true,
    secure: getAppBaseUrl().startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge
  };
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "your email address";
  return `${local.slice(0, 1)}${"•".repeat(Math.min(Math.max(local.length - 1, 4), 8))}@${domain}`;
}

async function rememberConfirmationRequest(email: string, destination: string) {
  const cookieStore = await cookies();
  const options = confirmationCookieOptions();
  cookieStore.set(confirmationEmailCookie, email, options);
  cookieStore.set(confirmationNextCookie, safeInternalRedirect(destination, POST_AUTH_DESTINATION), options);
  cookieStore.delete(confirmationCooldownCookie);
}

async function confirmationDestination(): Promise<string> {
  const cookieStore = await cookies();
  return safeInternalRedirect(cookieStore.get(confirmationNextCookie)?.value, POST_AUTH_DESTINATION);
}

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

function validEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validPassword(password: string): boolean {
  return password.length >= 8 && password.length <= 128 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

const unavailable: AuthFormState = {
  status: "error",
  message: "Local teacher accounts are not configured. Start the local Supabase stack and use the local platform command."
};

/**
 * Shown when the rate limiter could not be consulted and production therefore
 * refused the attempt rather than proceeding unthrottled.
 *
 * The wording is deliberately incurious: it names no backend, no function, no
 * configuration variable, and it is byte-identical no matter which address was
 * submitted or whether an account exists for it.
 */
const temporarilyUnavailable: AuthFormState = {
  status: "error",
  message: "Authentication is temporarily unavailable. Try again in a few minutes."
};

const prohibitedConsumerFields = [
  "displayName", "schoolLabel", "organization", "role", "grade", "class",
  "roster", "student", "assignment", "progress"
] as const;

export async function signUpAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (isProductionPublicMode()) return unavailable;
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("passwordConfirmation") ?? "");
  const consumerMode = isProductionPlatformMode();
  const displayName = field(formData, "displayName");
  const schoolLabel = field(formData, "schoolLabel");
  const fieldErrors: Record<string, string> = {};
  if (!validEmail(email)) fieldErrors.email = "Enter a valid email address.";
  if (!validPassword(password)) fieldErrors.password = "Use 8 to 128 characters with at least one letter and one number.";
  if (password !== confirmation) fieldErrors.passwordConfirmation = "Passwords must match.";
  if (!consumerMode && (displayName.length < 1 || displayName.length > 80)) fieldErrors.displayName = "Display name must contain 1 to 80 characters.";
  if (consumerMode && prohibitedConsumerFields.some((name) => field(formData, name).length > 0)) {
    return { status: "error", message: "Only email and password are accepted for a MathNexa account." };
  }
  if (schoolLabel.length > 0) fieldErrors.schoolLabel = "School and organization labels are not accepted during the controlled pilot.";
  if (schoolLabel.length > 0) return {
    status: "error",
    message: "School and organization labels are not accepted during the controlled pilot.",
    fieldErrors
  };
  if (Object.keys(fieldErrors).length > 0) return { status: "error", message: "Check the highlighted account information.", fieldErrors };

  const supabase = await createServerSupabaseClient();
  if (!supabase) return unavailable;
  // Caps automated account creation, which otherwise costs us a confirmation
  // email on every request.
  const limit = await consumeConsumerAuthAttempt("sign-up", email);
  if (limit === "unavailable") return temporarilyUnavailable;
  if (limit === "throttled") {
    return { status: "error", message: "Too many account attempts. Wait a few minutes and try again." };
  }
  const destination = consumerMode
    ? safeInternalRedirect(field(formData, "next"), POST_AUTH_DESTINATION)
    : "/teacher";
  const callback = `${getAppBaseUrl()}/auth/callback?next=${encodeURIComponent(destination)}`;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: callback,
      data: consumerMode ? {} : { display_name: displayName }
    }
  });
  if (error) return { status: "error", message: "The account could not be created. Check the information and try again." };
  if (consumerMode) await rememberConfirmationRequest(email, destination);
  return {
    status: "success",
    message: getAuthEmailExperience(process.env, consumerMode ? "consumer" : "teacher").signUpResponse,
    confirmation: consumerMode ? { maskedEmail: maskEmail(email) } : undefined
  };
}

export async function resendConfirmationAction(
  _previous: EmailConfirmationState,
  _formData?: FormData
): Promise<EmailConfirmationState> {
  void _previous;
  void _formData;
  if (isProductionPublicMode()) return { status: "error", message: "Confirmation delivery is unavailable." };
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { status: "error", message: "Confirmation delivery is unavailable. Try again later." };

  const cookieStore = await cookies();
  const now = Math.floor(Date.now() / 1000);
  const retryAt = Number.parseInt(cookieStore.get(confirmationCooldownCookie)?.value ?? "0", 10);
  if (Number.isFinite(retryAt) && retryAt > now) {
    const remaining = retryAt - now;
    return {
      status: "error",
      message: `Wait ${remaining} seconds before requesting another confirmation email.`,
      cooldownSeconds: remaining
    };
  }

  const { data } = await supabase.auth.getUser();
  if (data.user?.email_confirmed_at) {
    return {
      status: "success",
      message: "Email confirmed. Your MathNexa account is ready.",
      destination: await confirmationDestination()
    };
  }
  const email = data.user?.email ?? cookieStore.get(confirmationEmailCookie)?.value;
  if (email && validEmail(email)) {
    // The 60-second cooldown above lives in a cookie, which the caller owns:
    // deleting it resets the wait, so on its own it throttled nothing and this
    // action would send an unbounded number of confirmation emails. The
    // server-side budget is the actual control; the cookie stays because it
    // gives an honest countdown to a legitimate user.
    const limit = await consumeConsumerAuthAttempt("sign-up", email);
    if (limit !== "allowed") {
      return {
        status: "error",
        message: "Another confirmation email could not be sent yet. Wait a few minutes and try again."
      };
    }
  }
  if (!email || !validEmail(email)) {
    return { status: "error", message: "Open your original confirmation email, or sign in to request another message." };
  }
  const destination = await confirmationDestination();
  const result = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${getAppBaseUrl()}/auth/callback?next=${encodeURIComponent(destination)}` }
  });
  if (result.error) {
    await recordAggregateSignal({ metricKey: "email-confirmation-failure", outcome: "failure", source: "email" });
    return { status: "error", message: "Another confirmation email could not be sent yet. Wait a moment and try again." };
  }
  cookieStore.set(
    confirmationCooldownCookie,
    String(now + resendCooldownSeconds),
    confirmationCookieOptions(resendCooldownSeconds)
  );
  await recordAggregateSignal({ metricKey: "email-confirmation-success", outcome: "success", source: "email" });
  return {
    status: "success",
    message: "A new confirmation email is on its way. Check your inbox.",
    cooldownSeconds: resendCooldownSeconds
  };
}

export async function checkEmailConfirmationAction(
  _previous: EmailConfirmationState,
  _formData?: FormData
): Promise<EmailConfirmationState> {
  void _previous;
  void _formData;
  if (isProductionPublicMode()) return { status: "error", message: "Email confirmation could not be checked." };
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { status: "error", message: "Email confirmation could not be checked. Try again later." };
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email_confirmed_at) {
    return {
      status: "error",
      message: "Your email has not been confirmed yet. Check your inbox and try again."
    };
  }
  const destination = await confirmationDestination();
  const cookieStore = await cookies();
  cookieStore.delete(confirmationEmailCookie);
  cookieStore.delete(confirmationNextCookie);
  cookieStore.delete(confirmationCooldownCookie);
  return {
    status: "success",
    message: "Email confirmed. Your MathNexa account is ready.",
    destination
  };
}

export async function signInAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (isProductionPublicMode()) return unavailable;
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const consumerMode = isProductionPlatformMode();
  if (!validEmail(email) || password.length === 0) {
    return { status: "error", message: "Enter a valid email address and password." };
  }
  const supabase = await createServerSupabaseClient();
  if (!supabase) return unavailable;
  // Consulted before the credential is checked, so a refused caller learns
  // nothing about whether the address exists or the password was close.
  const limit = await consumeConsumerAuthAttempt("sign-in", email);
  if (limit === "unavailable") return temporarilyUnavailable;
  if (limit === "throttled") {
    return { status: "error", message: "Too many sign-in attempts. Wait a few minutes and try again." };
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Detection only. The response is unchanged and still generic; a spike in
    // these is what distinguishes an attack from ordinary forgetfulness.
    await recordSecurityEvent("AUTH_LOGIN_FAILED", { scope: "sign-in" });
    return { status: "error", message: "The email or password was not accepted." };
  }
  await clearConsumerAuthAttempts("sign-in", email);
  const destination = consumerMode
    ? safeInternalRedirect(field(formData, "next"), POST_AUTH_DESTINATION)
    : "/teacher";
  redirect(destination);
}

export async function forgotPasswordAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (isProductionPublicMode()) return unavailable;
  const email = field(formData, "email").toLowerCase();
  if (!validEmail(email)) return { status: "error", message: "Enter a valid email address.", fieldErrors: { email: "Enter a valid email address." } };
  const supabase = await createServerSupabaseClient();
  if (!supabase) return unavailable;
  const limit = await consumeConsumerAuthAttempt("password-recovery", email);
  // Refusing outright would tell an attacker their probe was measured, so a
  // throttled recovery returns the same neutral copy an accepted one does.
  // The unavailable case is a different thing — no mail is being sent, and the
  // message is identical for every address, so it reveals nothing either.
  if (limit === "unavailable") return temporarilyUnavailable;
  if (limit === "throttled") {
    return { status: "success", message: getAuthEmailExperience(process.env, isProductionPlatformMode() ? "consumer" : "teacher").recoveryResponse };
  }
  const recovery = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getAppBaseUrl()}/auth/callback?next=/update-password`
  });
  await recordAggregateSignal({ metricKey: recovery.error ? "email-recovery-failure" : "email-recovery-success", outcome: recovery.error ? "failure" : "success", source: "email" });
  return { status: "success", message: getAuthEmailExperience(process.env, isProductionPlatformMode() ? "consumer" : "teacher").recoveryResponse };
}

export async function updatePasswordAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (isProductionPublicMode()) return unavailable;
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("passwordConfirmation") ?? "");
  const fieldErrors: Record<string, string> = {};
  if (!validPassword(password)) fieldErrors.password = "Use 8 to 128 characters with at least one letter and one number.";
  if (password !== confirmation) fieldErrors.passwordConfirmation = "Passwords must match.";
  if (Object.keys(fieldErrors).length > 0) return { status: "error", message: "Check the new password.", fieldErrors };
  const supabase = await createServerSupabaseClient();
  if (!supabase) return unavailable;
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { status: "error", message: "The recovery session is missing or expired. Request a new recovery message." };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { status: "error", message: "The password could not be updated. Request a new recovery message." };
  redirect("/account?password=updated");
}

export async function signOutAction(): Promise<void> {
  if (isProductionPublicMode()) redirect("/");
  const supabase = await createServerSupabaseClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/sign-in?signedOut=1");
}
