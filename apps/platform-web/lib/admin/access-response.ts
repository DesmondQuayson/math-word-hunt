import "server-only";

import { NextResponse } from "next/server";

import { safeAdminNextPath } from "./session-policy";
import type { AdminAccessDecision } from "./types";

/**
 * Where an administrator whose session ran out is sent: the sign-in page,
 * flagged as an expiry, with a validated admin page to return to afterwards.
 */
export function adminSignInPath(next: string | null | undefined): string {
  const params = new URLSearchParams({ expired: "1" });
  const safe = safeAdminNextPath(next);
  if (safe) params.set("next", safe);
  return `/admin/sign-in?${params.toString()}`;
}

/**
 * The admin page a route-handler request came from. Form posts and downloads
 * are started from an admin page, so the same-origin Referer names it; anything
 * that is not a returnable admin page on this origin is dropped.
 */
export function adminReturnPathFor(request: Request, configuredOrigin: string | undefined = process.env.MVH_APPLICATION_ORIGIN): string | null {
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    const expectedOrigin = new URL(configuredOrigin ?? request.url).origin;
    const source = new URL(referer);
    if (source.origin !== expectedOrigin) return null;
    return safeAdminNextPath(`${source.pathname}${source.search}`);
  } catch {
    return null;
  }
}

/**
 * The response for an unauthorized request to an admin route handler. A still-
 * authorized administrator whose session expired or went idle is redirected to
 * sign in again (nothing was changed). Everyone else (non-admins, revoked
 * administrators, sign-out replays, a disabled admin system, discovery
 * attempts) gets the same concealing 404 as before.
 */
export function adminAccessDeniedResponse(request: Request, access: AdminAccessDecision): Response {
  if (access.state === "reauth-required" && access.recoverable) {
    const base = process.env.MVH_APPLICATION_ORIGIN ?? request.url;
    return NextResponse.redirect(new URL(adminSignInPath(adminReturnPathFor(request)), base), 303);
  }
  return new NextResponse("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
