import { NextResponse, type NextRequest } from "next/server";

import { getPlatformCanonicalRedirectUrl, getProductionPublicCanonicalRedirectUrl, getProductionPublicConfigurationErrors, isProductionPublicMode, isProductionPublicRestrictedPath } from "@/lib/environment/production-public";
import { getServerEnvironment } from "@/lib/environment/server";
import { isProductionPlatformDeferredBillingPath, isProductionPlatformMode, isProductionPlatformRestrictedPath } from "@/lib/environment/production-platform";
import {
  isStagingAccessRequired,
  isTicketedGameAssetPath,
  isValidStagingAccessCookie,
  STAGING_ACCESS_BOOTSTRAP_PATH,
  STAGING_ACCESS_COOKIE_NAME,
  STAGING_ACCESS_WEBHOOK_PATH,
  stagingAccessNotFoundResponse
} from "@/lib/staging-access/server";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  // The staging gate is evaluated FIRST, before any environment-mode branch.
  //
  // It used to live inside the `isProductionPlatformMode()` block below, which
  // compares MVH_APP_ENVIRONMENT with strict equality. That made the gate
  // unreachable whenever that variable carried transport whitespace — the exact
  // defect class as MN-09, on a sibling variable, and it would have skipped the
  // gate no matter how carefully the flag itself were parsed. Deciding here,
  // from `stagingAccessRequirement()`'s normalized reading of BOTH variables,
  // is what actually closes it.
  //
  // Ordering is safe: a deployment with no staging gate configured resolves to
  // "not-required" and falls through to exactly the behaviour it had before.
  if (isStagingAccessRequired()) {
    const gatedPath = request.nextUrl.pathname;
    if (
      gatedPath !== STAGING_ACCESS_BOOTSTRAP_PATH &&
      gatedPath !== STAGING_ACCESS_WEBHOOK_PATH &&
      !isTicketedGameAssetPath(gatedPath) &&
      !isValidStagingAccessCookie(request.cookies.get(STAGING_ACCESS_COOKIE_NAME)?.value)
    ) {
      return stagingAccessNotFoundResponse();
    }
  }
  if (isProductionPublicMode()) {
    const errors = getProductionPublicConfigurationErrors();
    if (errors.length > 0) {
      return new NextResponse("Public Production configuration unavailable.", { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const canonicalRedirect = getProductionPublicCanonicalRedirectUrl(request.url, request.headers.get("host"));
    if (canonicalRedirect) return NextResponse.redirect(canonicalRedirect, 308);
    if (isProductionPublicRestrictedPath(request.nextUrl.pathname)) {
      if (request.nextUrl.pathname.startsWith("/api/")) {
        return Response.json({ error: "not-found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
      }
      const destination = request.nextUrl.clone();
      destination.pathname = "/not-launched";
      destination.search = "";
      return NextResponse.rewrite(destination, { status: 404 });
    }
    return NextResponse.next({ request });
  }
  if (isProductionPlatformMode()) {
    // Normalize www.mathnexa.com and *.vercel.app aliases onto the apex so
    // search engines and stale links converge on one host. Applies only when
    // this deployment's configured origin IS https://mathnexa.com.
    const canonicalRedirect = getPlatformCanonicalRedirectUrl(request.url, request.headers.get("host"));
    if (canonicalRedirect) return NextResponse.redirect(canonicalRedirect, 308);
    const pathname = request.nextUrl.pathname;
    // The staging gate already ran above, before this mode branch.
    const environment = getServerEnvironment();
    if (!environment || environment.identity !== "production-platform") {
      return new NextResponse("Production account configuration unavailable.", { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    if (isProductionPlatformRestrictedPath(pathname) ||
      (isProductionPlatformDeferredBillingPath(pathname) && !environment.billingAvailable)) {
      if (pathname.startsWith("/api/")) {
        return Response.json({ error: "not-found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
      }
      return new NextResponse(
        "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Not found · MathNexa</title></head><body><main><h1>This feature has not launched</h1><p>The requested MathNexa route is unavailable.</p><p><a href=\"/\">Return to MathNexa</a></p></main></body></html>",
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store",
            "Content-Security-Policy": "default-src 'none'; style-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
            "Content-Type": "text/html; charset=utf-8",
            "X-Robots-Tag": "noindex, nofollow",
            "X-Content-Type-Options": "nosniff"
          }
        }
      );
    }
  }
  const response = await refreshSupabaseSession(request);
  const pathname = request.nextUrl.pathname;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
