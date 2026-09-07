import { timingSafeEqual } from "node:crypto";

import { tryGetConsumerBillingConfiguration } from "@/lib/billing/consumer-config";
import { createConsumerBillingProvider } from "@/lib/billing/consumer-provider-factory";
import { runConsumerReconciliationSweep } from "@/lib/billing/consumer-reconciliation";
import { createConsumerBillingRepository } from "@/lib/billing/consumer-service";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim() ?? "";
  if (secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const presented = Buffer.from(request.headers.get("authorization") ?? "");
  return expected.length === presented.length && timingSafeEqual(expected, presented);
}

/**
 * Scheduled drift detection and repair for live subscriptions.
 *
 * Invoked by the platform scheduler with its `CRON_SECRET` bearer token (see
 * vercel.json). Without that secret the route fails closed. It re-reads every
 * live subscription whose recorded period boundary is about to pass, has
 * passed, or has not been confirmed recently, through the same canonical
 * synchronizer the webhook uses. The response carries aggregate counts only.
 */
export async function GET(request: Request) {
  if (!isProductionPlatformMode()) return Response.json({ error: "not-found" }, { status: 404, headers: NO_STORE });
  if ((process.env.CRON_SECRET?.trim() ?? "").length < 16) {
    return Response.json({ state: "scheduler-secret-missing" }, { status: 503, headers: NO_STORE });
  }
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  const config = tryGetConsumerBillingConfiguration();
  if (!config) return Response.json({ state: "billing-disabled" }, { status: 503, headers: NO_STORE });
  const repository = createConsumerBillingRepository(config);
  if (!repository) return Response.json({ state: "database-unavailable" }, { status: 503, headers: NO_STORE });
  const summary = await runConsumerReconciliationSweep({
    config,
    provider: createConsumerBillingProvider(config),
    repository,
    limit: 50
  });
  return Response.json(summary, { status: 200, headers: NO_STORE });
}

export function POST(request: Request) { return GET(request); }
