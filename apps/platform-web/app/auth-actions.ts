"use server";

import { redirect } from "next/navigation";

import type { AuthFormState } from "@/lib/auth/form-state";
import { getAppBaseUrl } from "@/lib/auth/safe-redirect";
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

export async function signUpAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("passwordConfirmation") ?? "");
  const displayName = field(formData, "displayName");
  const schoolLabel = field(formData, "schoolLabel");
  const fieldErrors: Record<string, string> = {};
  if (!validEmail(email)) fieldErrors.email = "Enter a valid email address.";
  if (!validPassword(password)) fieldErrors.password = "Use 8 to 128 characters with at least one letter and one number.";
  if (password !== confirmation) fieldErrors.passwordConfirmation = "Passwords must match.";
  if (displayName.length < 1 || displayName.length > 80) fieldErrors.displayName = "Display name must contain 1 to 80 characters.";
  if (schoolLabel.length > 120) fieldErrors.schoolLabel = "School or organization must contain no more than 120 characters.";
  if (Object.keys(fieldErrors).length > 0) return { status: "error", message: "Check the highlighted account information.", fieldErrors };

  const supabase = await createServerSupabaseClient();
  if (!supabase) return unavailable;
  const callback = `${getAppBaseUrl()}/auth/callback?next=/teacher`;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: callback,
      data: {
        display_name: displayName,
        school_or_organization_label: schoolLabel || null
      }
    }
  });
  if (error) return { status: "error", message: "The account could not be created. Check the information and try again." };
  return { status: "success", message: "Check the local email inbox to verify the address before signing in." };
}

export async function signInAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!validEmail(email) || password.length === 0) {
    return { status: "error", message: "Enter a valid email address and password." };
  }
  const supabase = await createServerSupabaseClient();
  if (!supabase) return unavailable;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { status: "error", message: "The email or password was not accepted." };
  redirect("/teacher");
}

export async function forgotPasswordAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = field(formData, "email").toLowerCase();
  if (!validEmail(email)) return { status: "error", message: "Enter a valid email address.", fieldErrors: { email: "Enter a valid email address." } };
  const supabase = await createServerSupabaseClient();
  if (!supabase) return unavailable;
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getAppBaseUrl()}/auth/callback?next=/update-password`
  });
  return { status: "success", message: "If that teacher account exists, a recovery message is available in the local email inbox." };
}

export async function updatePasswordAction(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
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
  const supabase = await createServerSupabaseClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/sign-in?signedOut=1");
}
