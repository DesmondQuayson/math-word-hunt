import { cookies } from "next/headers";

import { productAccessDenialHref } from "@/lib/access/server";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";
import { getGameAccessView } from "@/lib/game-access/server";
import {
  createShowMePass,
  decodeShowMeReturn,
  encodeShowMeReturn,
  getShowMeAccessSecret,
  safeShowMeReturnPath,
  showMeDestination,
  showMeSite,
  SHOWME_PASS_COOKIE,
  SHOWME_RETURN_COOKIE
} from "@/lib/showme-access/pass";
import { showMePassCookieOptions, showMeReturnCookieOptions } from "@/lib/showme-access/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLOSED_HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const notFound = () => Response.json({ error: "not-found" }, { status: 404, headers: CLOSED_HEADERS });
const sendTo = (location: string) => new Response(null, { status: 307, headers: { ...CLOSED_HEADERS, Location: location } });

/**
 * Where ShowMe Math sends a visitor who has no access pass (lib/showme-access/pass.ts).
 *
 * The check is the one /map-prep and /worksheets already make: an account with
 * a trial or a subscription, or a school access code. A visitor who passes it
 * gets the pass and is sent back to the ShowMe page they asked for. Anyone else
 * is sent into the ordinary MathNexa flow (sign in, confirm, subscribe, or
 * enter a code); the page they asked for is remembered for half an hour, so
 * they still arrive there afterwards.
 *
 * `to` is a path on ShowMe and `site` chooses between the two ShowMe hosts in
 * the code. Nothing in the request can send a pass, or the visitor, anywhere
 * else. Every answer is marked no-store, whichever way it goes.
 */
export async function GET(request: Request) {
  if (!isProductionPlatformMode()) return notFound();
  const secret = getShowMeAccessSecret();
  if (!secret) return notFound();

  const query = new URL(request.url).searchParams;
  const site = showMeSite(query.get("site"));
  const asked = safeShowMeReturnPath(query.get("to"));
  const cookieStore = await cookies();

  const denial = productAccessDenialHref(await getGameAccessView(), "/map-prep");
  if (denial) {
    if (asked !== "/") cookieStore.set(SHOWME_RETURN_COOKIE, encodeShowMeReturn(site, asked), showMeReturnCookieOptions());
    return sendTo(denial);
  }

  const remembered = decodeShowMeReturn(cookieStore.get(SHOWME_RETURN_COOKIE)?.value);
  const destination = asked === "/" && remembered ? showMeDestination(remembered.site, remembered.path) : showMeDestination(site, asked);
  if (cookieStore.get(SHOWME_RETURN_COOKIE)) cookieStore.set(SHOWME_RETURN_COOKIE, "", showMeReturnCookieOptions(0));

  const pass = createShowMePass(secret);
  if (!pass) return notFound();
  cookieStore.set(SHOWME_PASS_COOKIE, pass, showMePassCookieOptions());
  return sendTo(destination);
}
