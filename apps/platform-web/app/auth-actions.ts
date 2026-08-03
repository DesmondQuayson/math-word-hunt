"use server";

import { redirect } from "next/navigation";

import type { AuthFormState } from "@/lib/auth/form-state";
import { getAppBaseUrl, safeInternalRedirect } from "@/lib/auth/safe-redirect";
import { getAuthEmailExperience } from "@/lib/email/server";
import { isProductionPublicMode } from "@/lib/environment/production-public";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { recordAggregateSignal } from "@/lib/operations/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
  const callback = `${getAppBaseUrl()}/auth/callback?next=${consumerMode ? "/account" : "/teacher"}`;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: callback,
      data: consumerMode ? {} : { display_name: displayName }
    }
  });
  if (error) return { status: "error", message: "The account could not be created. Check the information and try again." };
  return { status: "success", message: getAuthEmailExperience(process.env, consumerMode ? "consumer" : "teacher").signUpResponse };
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
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { status: "error", message: "The email or password was not accepted." };
  const destination = consumerMode
    ? safeInternalRedirect(field(formData, "next"), "/account")
    : "/teacher";
  redirect(destination);
}

export async function forgotPasswordAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (isProductionPublicMode()) return unavailable;
  const email = field(formData, "email").toLowerCase();
  if (!validEmail(email)) return { status: "error", message: "Enter a valid email address.", fieldErrors: { email: "Enter a valid email address." } };
  const supabase = await createServerSupabaseClient();
  if (!supabase) return unavailable;
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
