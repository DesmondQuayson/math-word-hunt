import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { recordSecurityEvent } from "@/lib/observability/security-events";
import { SECURITY_ALERT_RETENTION_DAYS, securityEventRetentionDays } from "@/lib/observability/security-retention";
import { schedulerAuthorization } from "@/lib/security/scheduler-auth";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Scheduled retention for the security event store (see vercel.json).
 *
 * Same contract as the billing reconciliation job: platform-mode only, the
 * scheduler's bearer secret, fails closed. Deletes events older than the
 * configured window and alerts older than theirs, and answers with counts.
 */
export async function GET(request: Request) {
  if (!isProductionPlatformMode()) return Response.json({ error: "not-found" }, { status: 404, headers: NO_STORE });
  const authorization = schedulerAuthorization(request);
  if (authorization === "secret-missing") {
    await recordSecurityEvent("SECURITY_CONFIG_ERROR", { component: "scheduler", reason: "secret-missing" }, "scheduler-secret-missing");
    return Response.json({ state: "scheduler-secret-missing" }, { status: 503, headers: NO_STORE });
  }
  if (authorization === "unauthorized") {
    await recordSecurityEvent("SCHEDULER_AUTH_FAILED", { route: "security-retention" });
    return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const client = createServiceSupabaseClient();
  if (!client) return Response.json({ state: "database-unavailable" }, { status: 503, headers: NO_STORE });
  const eventRetentionDays = securityEventRetentionDays();
  const result = await client.rpc("purge_security_events", {
    p_event_retention_days: eventRetentionDays,
    p_alert_retention_days: SECURITY_ALERT_RETENTION_DAYS
  });
  if (result.error) return Response.json({ state: "purge-failed" }, { status: 503, headers: NO_STORE });
  const row = (Array.isArray(result.data) ? result.data[0] : result.data) as Record<string, unknown> | undefined;
  return Response.json({
    state: "purged",
    eventRetentionDays,
    alertRetentionDays: SECURITY_ALERT_RETENTION_DAYS,
    eventsDeleted: Number(row?.events_deleted ?? 0),
    alertsDeleted: Number(row?.alerts_deleted ?? 0)
  }, { status: 200, headers: NO_STORE });
}

export function POST(request: Request) { return GET(request); }
