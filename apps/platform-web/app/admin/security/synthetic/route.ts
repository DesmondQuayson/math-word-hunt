import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { createAdminRepository } from "@/lib/admin/repository";
import { getAdminClientContext } from "@/lib/admin/security";
import { inspectAdminAccess, validateAdminMutationCsrf } from "@/lib/admin/session";
import { isSyntheticSecurityTestingAllowed } from "@/lib/observability/security-environment";
import { isSyntheticScenarioKey, runSyntheticSecurityScenario } from "@/lib/observability/security-synthetic";

function back(request: Request, result: string) {
  const target = new URL("/admin", process.env.MVH_APPLICATION_ORIGIN ?? request.url);
  target.searchParams.set("section", "security");
  target.searchParams.set("security", result);
  return NextResponse.redirect(target, 303);
}

/**
 * Owner-only synthetic security scenario.
 *
 * The same contract as every other admin mutation — authorized AAL2 session,
 * same-origin CSRF token, audited — plus one rule of its own: it does not exist
 * on a production deployment. That check comes before the form is even read,
 * so no path through this handler can put a synthetic event into production.
 */
export async function POST(request: Request) {
  const access = await inspectAdminAccess();
  if (access.state !== "authorized") return new NextResponse("Not Found", { status: 404 });
  if (!isSyntheticSecurityTestingAllowed()) return new NextResponse("Not Found", { status: 404 });
  const form = await request.formData();
  if (!await validateAdminMutationCsrf(form)) return back(request, "csrf-denied");
  const scenario = String(form.get("scenario") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  const confirmed = String(form.get("confirm") ?? "") === "synthetic";
  if (!isSyntheticScenarioKey(scenario) || reason.length < 3 || reason.length > 500 || !confirmed) {
    return back(request, "invalid-scenario");
  }
  const repository = createAdminRepository();
  if (!repository) return back(request, "unavailable");
  await repository.recordAudit({
    adminUserId: access.admin.id,
    action: "admin.security.synthetic-test",
    target: scenario,
    metadata: { reason, session_id: access.session.id },
    context: getAdminClientContext(await headers())
  });
  const outcome = await runSyntheticSecurityScenario(scenario);
  if (outcome.failure) return back(request, `synthetic-failed-${outcome.failure}`);
  return back(request, `synthetic-${scenario}-stored-${outcome.stored ?? 0}-alerts-${outcome.alerts.length}`);
}

export function GET() {
  return new NextResponse("Not Found", { status: 404 });
}
