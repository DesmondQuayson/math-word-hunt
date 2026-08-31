"use server";

import { redirect } from "next/navigation";

import {
  POST_AUTH_DESTINATION,
  confirmationRequiredHref,
  safeAccessIntentDestination
} from "@/lib/auth/access-intent";
import { resolveConsumerContext } from "@/lib/auth/consumer-context";
import { recordSecurityEvent } from "@/lib/observability/security-events";
import {
  authorizedCodeMatches,
  getSchoolAccessConfiguration
} from "@/lib/school-access/config";
import {
  clearSchoolAccessAttempts,
  consumeSchoolAccessAttempt
} from "@/lib/school-access/rate-limit";
import type { AuthorizedCodeFormState } from "@/lib/school-access/form-state";
import {
  clearSchoolAccessSession,
  startSchoolAccessSession
} from "@/lib/school-access/session";

export async function authorizeSchoolAccessAction(
  _previous: AuthorizedCodeFormState,
  formData: FormData
): Promise<AuthorizedCodeFormState> {
  const destination = safeAccessIntentDestination(String(formData.get("next") ?? ""), POST_AUTH_DESTINATION);
  const context = await resolveConsumerContext();
  if (context.status === "unconfirmed") redirect(confirmationRequiredHref(destination));
  if (context.status !== "anonymous" && context.status !== "unconfigured") redirect(destination);

  const configuration = getSchoolAccessConfiguration();
  if (!configuration) return { status: "error", message: "Authorized access is temporarily unavailable." };
  if (!await consumeSchoolAccessAttempt(configuration.sessionSecret)) {
    await recordSecurityEvent("AUTHORIZED_CODE_RATE_LIMITED", {});
    return { status: "error", message: "Authorized access is temporarily unavailable. Try again later." };
  }
  if (!authorizedCodeMatches(formData.get("authorizedCode"), configuration)) {
    // The submitted code is never recorded, only the fact of a refusal.
    await recordSecurityEvent("AUTHORIZED_CODE_FAILED", {});
    return { status: "error", message: "Invalid authorized code." };
  }
  const session = await startSchoolAccessSession();
  if (!session) return { status: "error", message: "Authorized access is temporarily unavailable." };
  await clearSchoolAccessAttempts(configuration.sessionSecret);
  redirect(destination);
}

export async function exitSchoolAccessAction(): Promise<void> {
  await clearSchoolAccessSession();
  redirect("/");
}
