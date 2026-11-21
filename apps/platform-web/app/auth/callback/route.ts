import { NextResponse, type NextRequest } from "next/server";

import { POST_AUTH_DESTINATION } from "@/lib/auth/access-intent";
import { classifyEmailLinkFailure } from "@/lib/auth/email-link-failure";
import { safeInternalRedirect } from "@/lib/auth/safe-redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const consumerMode = isProductionPlatformMode();
  const nextPath = safeInternalRedirect(params.get("next"), consumerMode ? POST_AUTH_DESTINATION : "/teacher");
  // On the MathNexa platform a failed link says why and keeps where the person
  // was going, so signing in continues there (app/sign-in/page.tsx). The local
  // teacher pilot keeps its original redirect.
  const failure = (exchangeAttempted: boolean) => {
    if (!consumerMode) return NextResponse.redirect(new URL("/sign-in?error=callback", request.url));
    const reason = classifyEmailLinkFailure({
      code: exchangeAttempted ? code : null,
      providerError: params.get("error_code") ?? params.get("error")
    });
    return NextResponse.redirect(new URL(`/sign-in?error=${reason}&next=${encodeURIComponent(nextPath)}`, request.url));
  };
  const supabase = await createServerSupabaseClient();
  if (!code || !supabase) return failure(false);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return failure(true);
  return NextResponse.redirect(new URL(nextPath, request.url));
}
