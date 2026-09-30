import { NextResponse } from "next/server";

import { inspectAdminAccess, validateAdminMutationCsrf } from "@/lib/admin/session";
import { adminSessionDeadline } from "@/lib/admin/session-policy";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * "Stay signed in" from the idle warning: an explicit administrator action
 * that counts as activity. inspectAdminAccess() authorizes the session and
 * refreshes its idle window (at most once a minute); the absolute 2-hour
 * lifetime is never extended. Nothing calls this automatically.
 */
export async function POST(request: Request) {
  const access = await inspectAdminAccess();
  if (access.state !== "authorized") {
    return access.state === "reauth-required" && access.recoverable
      ? NextResponse.json({ state: "ended" }, { status: 401, headers: NO_STORE })
      : new NextResponse("Not Found", { status: 404, headers: NO_STORE });
  }
  const form = await request.formData();
  if (!await validateAdminMutationCsrf(form, access.session)) {
    return NextResponse.json({ state: "csrf-denied" }, { status: 403, headers: NO_STORE });
  }
  const deadline = adminSessionDeadline(access.session);
  return NextResponse.json({
    state: "active",
    absoluteExpiresAt: new Date(deadline.absoluteExpiresAt).toISOString(),
    idleExpiresAt: new Date(deadline.idleExpiresAt).toISOString(),
    serverNow: new Date().toISOString()
  }, { headers: NO_STORE });
}
