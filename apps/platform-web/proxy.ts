import { NextResponse, type NextRequest } from "next/server";

import { getProductionPublicConfigurationErrors, isProductionPublicMode, isProductionPublicRestrictedPath } from "@/lib/environment/production-public";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (isProductionPublicMode()) {
    const errors = getProductionPublicConfigurationErrors();
    if (errors.length > 0) {
      return new NextResponse("Public Production configuration unavailable.", { status: 503, headers: { "Cache-Control": "no-store" } });
    }
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
  return refreshSupabaseSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
