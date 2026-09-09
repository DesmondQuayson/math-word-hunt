import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Authorization for platform-scheduled internal routes.
 *
 * The same rule the billing reconciliation route has applied since v1.2.7:
 * the scheduler presents `Authorization: Bearer <CRON_SECRET>`, compared in
 * constant time, and a deployment without a usable secret fails closed rather
 * than running unscheduled. Shared here so the security retention job cannot
 * drift from it.
 */
export type SchedulerAuthorization = "authorized" | "unauthorized" | "secret-missing";

export function schedulerAuthorization(
  request: Request,
  source: Readonly<Record<string, string | undefined>> = process.env
): SchedulerAuthorization {
  const secret = source.CRON_SECRET?.trim() ?? "";
  if (secret.length < 16) return "secret-missing";
  const expected = Buffer.from(`Bearer ${secret}`);
  const presented = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === presented.length && timingSafeEqual(expected, presented) ? "authorized" : "unauthorized";
}
