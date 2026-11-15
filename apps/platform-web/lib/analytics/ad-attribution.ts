import "server-only";

import { cookies, headers } from "next/headers";

import { getAppBaseUrl } from "@/lib/auth/safe-redirect";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

import { decodeAdClickCookie, encodeAdClickCookie } from "./ad-click-cookie";
import {
  AD_CHOICE_COOKIE,
  AD_CLICK_COOKIE,
  AD_CLICK_LIFETIME_SECONDS,
  isAdChoiceOptOut,
  isAdMeasurementAllowed,
  type AdClickIdentifiers
} from "./ad-measurement";

type HeaderSource = Readonly<{ get(name: string): string | null }>;

/**
 * The consent answer for one request: the platform's country for the visitor,
 * the browser's Global Privacy Control header and the visitor's own choice.
 * Vercel sets `x-vercel-ip-country` on every request it serves; without Vercel
 * (a local rehearsal) there is no geolocation and the country is not required.
 */
export function isAdMeasurementAllowedForRequest(
  requestHeaders: HeaderSource,
  adChoiceCookie: string | null | undefined,
  source: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return isAdMeasurementAllowed({
    country: requestHeaders.get("x-vercel-ip-country")?.trim() || null,
    globalPrivacyControl: requestHeaders.get("sec-gpc")?.trim() === "1",
    optedOut: isAdChoiceOptOut(adChoiceCookie),
    countryRequired: Boolean(source.VERCEL)
  });
}

export function adClickCookieOptions(maxAge = AD_CLICK_LIFETIME_SECONDS) {
  return {
    httpOnly: true,
    secure: getAppBaseUrl().startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge
  };
}

export function adClickCookieValue(identifiers: AdClickIdentifiers, now: Date = new Date()): string {
  return encodeAdClickCookie({ ...identifiers, clickedAt: now.toISOString() });
}

/**
 * Keeps the ad click this browser arrived with against the account, so a
 * conversion confirmed later on the server (in another browser, or a day later
 * when the first payment succeeds) can still be reported for that click.
 *
 * Called from sign-up and from the start of Checkout. The first click stored
 * for an account wins. It must never change the outcome of either flow: every
 * failure is swallowed, and nothing is stored when the visitor's consent says
 * no. A user id the database does not know (the sign-up form's answer for an
 * address that already has an account) stores nothing and keeps the cookie.
 */
export async function rememberAdClickForAccount(
  userId: string | null | undefined,
  capturePoint: "sign-up" | "checkout"
): Promise<void> {
  try {
    if (!userId) return;
    const cookieStore = await cookies();
    const click = decodeAdClickCookie(cookieStore.get(AD_CLICK_COOKIE)?.value);
    if (!click) return;
    if (!isAdMeasurementAllowedForRequest(await headers(), cookieStore.get(AD_CHOICE_COOKIE)?.value)) {
      cookieStore.set(AD_CLICK_COOKIE, "", adClickCookieOptions(0));
      return;
    }
    const client = createServiceSupabaseClient();
    if (!client) return;
    const { data, error } = await client.rpc("store_ad_click_attribution", {
      p_user_id: userId,
      p_gclid: click.gclid,
      p_gbraid: click.gbraid,
      p_wbraid: click.wbraid,
      p_clicked_at: click.clickedAt,
      p_capture_point: capturePoint
    });
    // The account now holds its click (this one or an earlier one), so the
    // browser copy has done its job. A shared computer must not carry it on to
    // the next person's account.
    if (!error && (data === "stored" || data === "exists")) {
      cookieStore.set(AD_CLICK_COOKIE, "", adClickCookieOptions(0));
    }
  } catch {
    // Measurement never affects sign-up or Checkout.
  }
}

/** The visitor turned ad measurement off: forget the click held for their account. */
export async function forgetAdClickForAccount(userId: string): Promise<void> {
  try {
    const client = createServiceSupabaseClient();
    if (!client) return;
    await client.rpc("erase_ad_click_attribution", { p_user_id: userId });
  } catch {
    // The browser copy is cleared regardless; the feed also rechecks the account.
  }
}
