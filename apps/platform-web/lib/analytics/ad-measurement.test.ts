// @vitest-environment node
import { describe, expect, it } from "vitest";

import { decodeAdClickCookie, encodeAdClickCookie } from "./ad-click-cookie";
import {
  AD_CLICK_LIFETIME_SECONDS,
  AD_MEASUREMENT_COUNTRIES,
  isAdChoiceOptOut,
  isAdMeasurementAllowed,
  parseAdClickIdentifier,
  readAdClickIdentifiers
} from "./ad-measurement";

const GCLID = "Cj0KCQjw-TESTgclid_0123456789AbCdEf";
const allowed = { country: "US", globalPrivacyControl: false, optedOut: false, countryRequired: true };

describe("ad click identifiers", () => {
  it("accepts only the characters and lengths a Google Ads click identifier has", () => {
    expect(parseAdClickIdentifier(GCLID)).toBe(GCLID);
    for (const value of [undefined, null, 12345678901, "", "short", "has space in the id", "semi;colon-injection", "quote\"12345678", "a".repeat(513), "<script>alert(1)</script>"]) {
      expect(parseAdClickIdentifier(value), String(value)).toBeNull();
    }
  });

  it("reads gclid, gbraid and wbraid from a landing URL and nothing else", () => {
    expect(readAdClickIdentifiers(new URLSearchParams(`gclid=${GCLID}&utm_source=google&email=someone@example.com`)))
      .toEqual({ gclid: GCLID, gbraid: null, wbraid: null });
    expect(readAdClickIdentifiers(new URLSearchParams("gbraid=0AAAAAo_gbraid_value&wbraid=0AAAAAo_wbraid_value")))
      .toEqual({ gclid: null, gbraid: "0AAAAAo_gbraid_value", wbraid: "0AAAAAo_wbraid_value" });
    expect(readAdClickIdentifiers(new URLSearchParams("utm_source=google&fbclid=abcdefghijklmnop"))).toBeNull();
    expect(readAdClickIdentifiers(new URLSearchParams("gclid=bad value"))).toBeNull();
    expect(readAdClickIdentifiers({ gclid: GCLID, email: "someone@example.com" })).toEqual({ gclid: GCLID, gbraid: null, wbraid: null });
  });
});

describe("ad measurement consent", () => {
  it("is on only in the listed countries", () => {
    expect(AD_MEASUREMENT_COUNTRIES).toEqual(["US"]);
    expect(isAdMeasurementAllowed(allowed)).toBe(true);
    expect(isAdMeasurementAllowed({ ...allowed, country: "us" })).toBe(true);
    for (const country of ["GB", "DE", "FR", "IE", "CH", "CA", "AU", "IN", "XX", ""]) {
      expect(isAdMeasurementAllowed({ ...allowed, country }), country).toBe(false);
    }
  });

  it("is off when the browser sends Global Privacy Control or the visitor opted out", () => {
    expect(isAdMeasurementAllowed({ ...allowed, globalPrivacyControl: true })).toBe(false);
    expect(isAdMeasurementAllowed({ ...allowed, optedOut: true })).toBe(false);
    expect(isAdChoiceOptOut("opt-out")).toBe(true);
    for (const value of [undefined, null, "", "opt-in", "OPT-OUT", "1"]) expect(isAdChoiceOptOut(value)).toBe(false);
  });

  it("needs a country on a hosted deployment, and not for a local rehearsal", () => {
    expect(isAdMeasurementAllowed({ ...allowed, country: null })).toBe(false);
    expect(isAdMeasurementAllowed({ ...allowed, country: null, countryRequired: false })).toBe(true);
    expect(isAdMeasurementAllowed({ ...allowed, country: null, countryRequired: false, globalPrivacyControl: true })).toBe(false);
  });
});

describe("ad click cookie", () => {
  const now = new Date("2026-11-14T12:00:00.000Z");
  const click = { gclid: GCLID, gbraid: null, wbraid: null, clickedAt: "2026-11-14T11:00:00.000Z" };

  it("round-trips the identifiers and the landing time", () => {
    const value = encodeAdClickCookie(click);
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeAdClickCookie(value, now)).toEqual(click);
  });

  it("treats a malformed, forged, future or expired value as absent", () => {
    const encode = (payload: unknown) => Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    for (const value of [undefined, null, "", "not-base64-json", encode(null), encode([]), encode({ g: "bad value", t: click.clickedAt }),
      encode({ g: GCLID }), encode({ g: GCLID, t: "not a date" }), encode({ t: click.clickedAt }),
      encode({ g: GCLID, t: "2026-11-14T12:30:00.000Z" }),
      encode({ g: GCLID, t: new Date(now.getTime() - (AD_CLICK_LIFETIME_SECONDS + 60) * 1000).toISOString() }),
      "x".repeat(5000)]) {
      expect(decodeAdClickCookie(value, now), String(value).slice(0, 40)).toBeNull();
    }
  });

  it("keeps a click for the 90 days Google Ads accepts", () => {
    const old = { ...click, clickedAt: new Date(now.getTime() - (AD_CLICK_LIFETIME_SECONDS - 60) * 1000).toISOString() };
    expect(decodeAdClickCookie(encodeAdClickCookie(old), now)).toEqual(old);
  });
});
