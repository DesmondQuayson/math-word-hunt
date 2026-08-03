import { NextResponse } from "next/server";

import { parseAdminAccountAction } from "@math-vocabulary-hunt/platform-core";

import { createAdminPortalForTarget } from "@/lib/admin/account-operations";
import { getAdminSecurityConfig } from "@/lib/admin/config";
import { inspectAdminAccess, validateAdminMutationCsrf } from "@/lib/admin/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { recordAggregateSignal } from "@/lib/operations/server";

function back(request: Request, result: string) {
  const url = new URL("/admin", process.env.MVH_APPLICATION_ORIGIN ?? request.url);
  url.searchParams.set("section", "users"); url.searchParams.set("account", result);
  return NextResponse.redirect(url, 303);
}
function fields(form: FormData): Record<string, unknown> {
  return Object.fromEntries(["operation", "targetUserId", "idempotencyKey", "reason", "durationDays", "refundRequestId"].map((key) => [key, String(form.get(key) ?? "")]));
}
function errorCode(value: unknown) {
  const message = value instanceof Error ? value.message.toLowerCase() : "operation-failed";
  if (message.includes("reauthentication")) return "reauth-required";
  if (message.includes("eligible")) return "not-eligible";
  if (message.includes("portal")) return "portal-unavailable";
  return "operation-failed";
}

export async function POST(request: Request) {
  const access = await inspectAdminAccess();
  if (access.state !== "authorized") return new NextResponse("Not Found", { status: 404 });
  const form = await request.formData();
  if (!await validateAdminMutationCsrf(form)) return back(request, "csrf-denied");
  const input = parseAdminAccountAction(fields(form));
  const client = createServiceSupabaseClient();
  if (!input || !client) return back(request, "invalid-input");

  const prepared = await client.rpc("prepare_admin_account_operation", {
    p_admin_user_id: access.admin.id, p_admin_session_id: access.session.id,
    p_target_user_id: input.targetUserId, p_operation: input.operation,
    p_idempotency_key: input.idempotencyKey, p_reason: input.reason
  });
  if (prepared.error || typeof prepared.data !== "string") return back(request, errorCode(prepared.error));
  const operationId = prepared.data;
  const finish = async (outcome: "succeeded" | "failed" | "manual_review", code: string | null) =>
    client.rpc("finish_admin_account_operation", {
      p_admin_user_id: access.admin.id, p_admin_session_id: access.session.id,
      p_operation_id: operationId, p_outcome: outcome, p_error_code: code
    });

  try {
    if (input.operation === "resend-confirmation") {
      const target = await client.auth.admin.getUserById(input.targetUserId);
      if (target.error || !target.data.user?.email || target.data.user.email_confirmed_at) throw new Error("confirmation-unavailable");
      const config = getAdminSecurityConfig(); if (!config) throw new Error("confirmation-unavailable");
      const sent = await client.auth.resend({ type: "signup", email: target.data.user.email, options: { emailRedirectTo: `${config.applicationOrigin}/auth/callback` } });
      await recordAggregateSignal({ metricKey: sent.error ? "email-confirmation-failure" : "email-confirmation-success", outcome: sent.error ? "failure" : "success", source: "email" });
      if (sent.error) throw new Error("confirmation-unavailable");
    } else if (input.operation === "revoke-sessions") {
      const signedOut = await client.rpc("revoke_admin_consumer_sessions", { p_admin_user_id: access.admin.id, p_admin_session_id: access.session.id, p_operation_id: operationId, p_target_user_id: input.targetUserId }); if (signedOut.error) throw new Error("session-revocation-failed");
    } else if (["suspend", "restore", "emergency-revoke"].includes(input.operation)) {
      if (input.operation !== "restore") {
        const signedOut = await client.rpc("revoke_admin_consumer_sessions", { p_admin_user_id: access.admin.id, p_admin_session_id: access.session.id, p_operation_id: operationId, p_target_user_id: input.targetUserId }); if (signedOut.error) throw new Error("session-revocation-failed");
      }
      const status = await client.rpc("set_admin_consumer_account_status", {
        p_admin_user_id: access.admin.id, p_admin_session_id: access.session.id, p_operation_id: operationId,
        p_target_user_id: input.targetUserId, p_status: input.operation === "restore" ? "active" : "suspended"
      });
      if (status.error) throw status.error;
    } else if (input.operation === "grant-complimentary") {
      const granted = await client.rpc("grant_admin_complimentary_entitlement", {
        p_admin_user_id: access.admin.id, p_admin_session_id: access.session.id, p_operation_id: operationId,
        p_target_user_id: input.targetUserId, p_expires_at: new Date(Date.now() + input.durationDays! * 86_400_000).toISOString()
      }); if (granted.error) throw granted.error;
    } else if (input.operation === "remove-complimentary") {
      const revoked = await client.rpc("revoke_admin_complimentary_entitlement", {
        p_admin_user_id: access.admin.id, p_admin_session_id: access.session.id,
        p_operation_id: operationId, p_target_user_id: input.targetUserId
      }); if (revoked.error) throw revoked.error;
    } else if (input.operation === "submit-refund-review") {
      const refund = await client.rpc("submit_admin_refund_review", {
        p_admin_user_id: access.admin.id, p_admin_session_id: access.session.id,
        p_operation_id: operationId, p_target_user_id: input.targetUserId
      }); if (refund.error) throw refund.error;
    } else if (input.operation === "deny-refund-review") {
      const refund = await client.rpc("deny_admin_refund_review", {
        p_admin_user_id: access.admin.id, p_admin_session_id: access.session.id, p_operation_id: operationId,
        p_target_user_id: input.targetUserId, p_request_id: input.refundRequestId
      }); if (refund.error || refund.data !== true) throw new Error("refund-review-unavailable");
    } else if (input.operation === "open-portal" || input.operation === "cancel-at-period-end") {
      const portal = await createAdminPortalForTarget(input.targetUserId);
      await finish("succeeded", null);
      return NextResponse.redirect(portal.url, 303);
    }
    const completed = await finish("succeeded", null); if (completed.error) throw completed.error;
    return back(request, `${input.operation}-succeeded`);
  } catch (error) {
    const code = errorCode(error);
    await finish(code === "not-eligible" || code === "portal-unavailable" ? "manual_review" : "failed", code);
    return back(request, code);
  }
}
