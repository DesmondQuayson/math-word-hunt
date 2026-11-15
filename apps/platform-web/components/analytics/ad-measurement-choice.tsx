"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  AD_CHOICE_COOKIE,
  AD_CHOICE_LIFETIME_SECONDS,
  AD_CHOICE_OPT_OUT
} from "@/lib/analytics/ad-measurement";

type Choice = "checking" | "allowed" | "opted-out" | "browser-signal";

const DENIED = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" };
/** The first-party cookies the Google tag keeps an ad click and its own id in. */
const GOOGLE_AD_COOKIES = ["_gcl_au", "_gcl_aw", "_gcl_gb", "_gcl_ag", "_gcl_gs"];

function secureAttribute(): string {
  return window.location.protocol === "https:" ? "; Secure" : "";
}

function expire(name: string) {
  const host = window.location.hostname;
  for (const domain of ["", `; Domain=${host}`, `; Domain=.${host}`]) {
    document.cookie = `${name}=; Max-Age=0; Path=/${domain}`;
  }
}

function readChoice(): Choice {
  if ((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true) return "browser-signal";
  return document.cookie.split("; ").includes(`${AD_CHOICE_COOKIE}=${AD_CHOICE_OPT_OUT}`) ? "opted-out" : "allowed";
}

/**
 * The visitor's own switch for ad measurement, on the Privacy page. Turning it
 * off is remembered for this browser, tells the Google tag at once, removes the
 * tag's advertising cookies and has the server forget the ad click it holds,
 * for this browser and for the signed-in account.
 */
export function AdMeasurementChoice() {
  const [choice, setChoice] = useState<Choice>("checking");
  // The cookie and the browser signal exist only in the browser, so the first
  // render matches the server's and the real answer follows.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setChoice(readChoice()); }, []);

  function turnOff() {
    document.cookie = `${AD_CHOICE_COOKIE}=${AD_CHOICE_OPT_OUT}; Max-Age=${AD_CHOICE_LIFETIME_SECONDS}; Path=/; SameSite=Lax${secureAttribute()}`;
    (window as Window & { gtag?: (...values: unknown[]) => void }).gtag?.("consent", "update", DENIED);
    for (const name of GOOGLE_AD_COOKIES) expire(name);
    void fetch("/api/ad-click", { method: "DELETE", credentials: "same-origin", keepalive: true }).catch(() => undefined);
    setChoice("opted-out");
  }

  function turnOn() {
    document.cookie = `${AD_CHOICE_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secureAttribute()}`;
    // The tag reads its consent defaults when the page loads.
    window.location.reload();
  }

  return <div className="ad-measurement-choice" aria-live="polite">
    {choice === "browser-signal" ? <p><strong>Ad measurement is off in this browser.</strong> Your browser sends a Global Privacy Control signal, and MathNexa follows it.</p> : null}
    {choice === "opted-out" ? <><p><strong>Ad measurement is off in this browser.</strong> You turned it off here.</p><Button variant="secondary" onClick={turnOn}>Turn ad measurement back on</Button></> : null}
    {choice === "allowed" ? <><p>You have not turned ad measurement off in this browser.</p><Button variant="secondary" onClick={turnOff}>Turn off ad measurement</Button></> : null}
  </div>;
}
