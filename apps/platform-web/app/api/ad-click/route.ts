import { cookies } from "next/headers";

import {
  adClickCookieOptions,
  adClickCookieValue,
  forgetAdClickForAccount,
  isAdMeasurementAllowedForRequest
} from "@/lib/analytics/ad-attribution";
import { AD_CHOICE_COOKIE, AD_CLICK_COOKIE, readAdClickIdentifiers } from "@/lib/analytics/ad-measurement";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 2048;

/**
 * Only the page itself may call this. Browsers send Sec-Fetch-Site on every
 * fetch; where it is missing, the Origin header must name this host. A
 * cross-site page therefore cannot plant or clear a visitor's ad click.
 */
function sameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null) return fetchSite === "same-origin";
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const done = () => new Response(null, { status: 204, headers: NO_STORE });

/**
 * A visitor landed with a Google Ads click identifier in the URL
 * (components/analytics/ad-click-capture.tsx). When their consent allows ad
 * measurement, keep it in an HttpOnly first-party cookie for sign-up to read.
 * The answer is always 204, whatever was decided, and nothing is stored on the
 * server here: no account exists yet.
 */
export async function POST(request: Request) {
  if (!isProductionPlatformMode()) return Response.json({ error: "not-found" }, { status: 404, headers: NO_STORE });
  if (!sameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return done();
    body = JSON.parse(text);
  } catch {
    return done();
  }
  const identifiers = body && typeof body === "object" ? readAdClickIdentifiers(body as Record<string, unknown>) : null;
  if (!identifiers) return done();
  const cookieStore = await cookies();
  if (!isAdMeasurementAllowedForRequest(request.headers, cookieStore.get(AD_CHOICE_COOKIE)?.value)) {
    if (cookieStore.get(AD_CLICK_COOKIE)) cookieStore.set(AD_CLICK_COOKIE, "", adClickCookieOptions(0));
    return done();
  }
  // Until an account holds a click, the most recent ad click is the one kept.
  cookieStore.set(AD_CLICK_COOKIE, adClickCookieValue(identifiers), adClickCookieOptions());
  return done();
}

/**
 * The visitor turned ad measurement off on the Privacy page: clear the click
 * held in this browser and, when they are signed in, the one kept with their
 * account.
 */
export async function DELETE(request: Request) {
  if (!isProductionPlatformMode()) return Response.json({ error: "not-found" }, { status: 404, headers: NO_STORE });
  if (!sameOrigin(request)) return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });
  const cookieStore = await cookies();
  if (cookieStore.get(AD_CLICK_COOKIE)) cookieStore.set(AD_CLICK_COOKIE, "", adClickCookieOptions(0));
  try {
    const supabase = await createServerSupabaseClient();
    const user = supabase ? (await supabase.auth.getUser()).data.user : null;
    if (user) await forgetAdClickForAccount(user.id);
  } catch {
    // The browser copy is already cleared.
  }
  return done();
}
