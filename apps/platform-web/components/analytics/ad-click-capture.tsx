"use client";

import { useEffect } from "react";

import { AD_CHOICE_COOKIE, AD_CHOICE_OPT_OUT, readAdClickIdentifiers } from "@/lib/analytics/ad-measurement";

/**
 * When a visitor lands from a Google ad, hands the click identifier in the URL
 * to the server, which decides from their consent whether to keep it
 * (app/api/ad-click/route.ts). It runs once per document load, sends nothing
 * for any other visit, and renders nothing.
 */
export function AdClickCapture() {
  useEffect(() => {
    const identifiers = readAdClickIdentifiers(new URLSearchParams(window.location.search));
    if (!identifiers) return;
    const privacySignal = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
    const optedOut = document.cookie.split("; ").includes(`${AD_CHOICE_COOKIE}=${AD_CHOICE_OPT_OUT}`);
    // The server makes the same decision; not asking at all is simply kinder.
    if (privacySignal || optedOut) return;
    void fetch("/api/ad-click", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(identifiers),
      credentials: "same-origin",
      keepalive: true
    }).catch(() => undefined);
  }, []);
  return null;
}
