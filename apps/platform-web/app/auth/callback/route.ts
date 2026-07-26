import { NextResponse, type NextRequest } from "next/server";

import { safeInternalRedirect } from "@/lib/auth/safe-redirect";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = safeInternalRedirect(request.nextUrl.searchParams.get("next"));
  const supabase = await createServerSupabaseClient();
  if (!code || !supabase) return NextResponse.redirect(new URL("/sign-in?error=callback", request.url));
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/sign-in?error=callback", request.url));
  return NextResponse.redirect(new URL(nextPath, request.url));
}
