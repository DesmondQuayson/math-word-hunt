import "server-only";

import { cookies } from "next/headers";

import { getAppBaseUrl } from "@/lib/auth/safe-redirect";

import {
  createShowMePass,
  getShowMeAccessSecret,
  SHOWME_PASS_COOKIE,
  SHOWME_PASS_DURATION_SECONDS,
  SHOWME_RETURN_COOKIE,
  SHOWME_RETURN_SECONDS
} from "./pass";

/**
 * The pass must reach showme.mathnexa.com, so on the live site the cookie is
 * set for mathnexa.com and its subdomains. It is the only cookie this app
 * gives a domain. Anywhere else (a local rehearsal, a staging preview) it
 * stays on the host that set it.
 */
function passCookieDomain(): string | undefined {
  try {
    return new URL(getAppBaseUrl()).hostname === "mathnexa.com" ? "mathnexa.com" : undefined;
  } catch {
    return undefined;
  }
}

export function showMePassCookieOptions(maxAge = SHOWME_PASS_DURATION_SECONDS) {
  const domain = passCookieDomain();
  return {
    httpOnly: true,
    secure: getAppBaseUrl().startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    ...(domain ? { domain } : {})
  };
}

export function showMeReturnCookieOptions(maxAge = SHOWME_RETURN_SECONDS) {
  return {
    httpOnly: true,
    secure: getAppBaseUrl().startsWith("https://"),
    sameSite: "lax" as const,
    path: "/map-prep",
    maxAge
  };
}

/**
 * Gives this browser a pass. Call it only after the access check has passed.
 * Returns false when the shared secret is not configured.
 */
export async function issueShowMePass(now: Date = new Date()): Promise<boolean> {
  const secret = getShowMeAccessSecret();
  const pass = secret ? createShowMePass(secret, now) : null;
  if (!pass) return false;
  (await cookies()).set(SHOWME_PASS_COOKIE, pass, showMePassCookieOptions());
  return true;
}

/**
 * Takes the pass away from this browser: at sign-out and when authorized
 * access is ended. A failure here never stops either of those.
 */
export async function clearShowMePass(): Promise<void> {
  try {
    const cookieStore = await cookies();
    if (cookieStore.get(SHOWME_PASS_COOKIE)) cookieStore.set(SHOWME_PASS_COOKIE, "", showMePassCookieOptions(0));
    if (cookieStore.get(SHOWME_RETURN_COOKIE)) cookieStore.set(SHOWME_RETURN_COOKIE, "", showMeReturnCookieOptions(0));
  } catch {
    // The pass also expires by itself.
  }
}
