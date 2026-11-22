import { describe, expect, it } from "vitest";

import {
  ANALYTICS_EVENTS,
  beforeSendAnalyticsEvent,
  classifyEntrySource,
  classifyLandingPath,
  classifyReferrer,
  isSourceClass,
  redactAnalyticsUrl
} from "./attribution";

describe("landing pages", () => {
  it("keeps known public pages and folds everything else into other", () => {
    expect(classifyLandingPath("/")).toBe("/");
    expect(classifyLandingPath("/online-math-prep/")).toBe("/online-math-prep");
    expect(classifyLandingPath("/pricing")).toBe("/pricing");
    expect(classifyLandingPath("/games/9b1f0a52-41a5-4c0e-9c0e-7a1c2f3e4d5a")).toBe("other");
    expect(classifyLandingPath("/sign-in?next=/subscription")).toBe("other");
  });
});

describe("visit sources", () => {
  it("classifies referrers into fixed classes without returning the host", () => {
    expect(classifyReferrer("", "mathnexa.com")).toBe("direct");
    expect(classifyReferrer("https://www.google.com/search?q=math", "mathnexa.com")).toBe("google");
    expect(classifyReferrer("https://www.google.co.za/", "mathnexa.com")).toBe("google");
    expect(classifyReferrer("https://l.facebook.com/l.php?u=x", "mathnexa.com")).toBe("facebook");
    expect(classifyReferrer("https://m.youtube.com/shorts/abc", "mathnexa.com")).toBe("youtube");
    expect(classifyReferrer("https://www.tiktok.com/@x/video/1", "mathnexa.com")).toBe("tiktok");
    expect(classifyReferrer("https://mathnexa.com/pricing", "mathnexa.com")).toBe("direct");
    expect(classifyReferrer("https://showme.mathnexa.com/", "mathnexa.com")).toBe("showme");
    expect(classifyReferrer("https://some-blog.example/post", "mathnexa.com")).toBe("other");
    expect(classifyReferrer("not a url", "mathnexa.com")).toBe("other");
  });

  it("prefers a Google Ads click, then a known campaign tag, then the referrer", () => {
    expect(classifyEntrySource("?gclid=Cj0KCQ123", "https://www.google.com/", "mathnexa.com")).toBe("google-ads");
    expect(classifyEntrySource("?gbraid=0AAAA&utm_source=facebook", "", "mathnexa.com")).toBe("google-ads");
    expect(classifyEntrySource("?wbraid=abc", "", "mathnexa.com")).toBe("google-ads");
    expect(classifyEntrySource("?utm_source=tiktok&utm_medium=social&utm_campaign=organic_2026_12", "", "mathnexa.com")).toBe("tiktok");
    expect(classifyEntrySource("?utm_source=FB", "", "mathnexa.com")).toBe("facebook");
    expect(classifyEntrySource("?utm_source=yt", "", "mathnexa.com")).toBe("youtube");
    expect(classifyEntrySource("?utm_source=someone@example.com", "https://www.bing.com/", "mathnexa.com")).toBe("bing");
    expect(classifyEntrySource("?gclid=", "", "mathnexa.com")).toBe("direct");
    expect(classifyEntrySource("", "https://duckduckgo.com/", "mathnexa.com")).toBe("duckduckgo");
  });

  it("validates stored classes", () => {
    expect(isSourceClass("google-ads")).toBe(true);
    expect(isSourceClass("someone@example.com")).toBe(false);
    expect(isSourceClass(undefined)).toBe(false);
  });

  it("has exactly the sign-up and checkout funnel events", () => {
    expect(Object.values(ANALYTICS_EVENTS)).toEqual(["sign_up_submitted", "trial_checkout_submitted", "paid_checkout_submitted"]);
  });
});

describe("URL redaction before anything is sent", () => {
  it("cuts every address to its path", () => {
    expect(redactAnalyticsUrl("https://mathnexa.com/checkout/status?session_id=cs_live_secret&next=%2Fmap-prep")).toBe("https://mathnexa.com/checkout/status");
    expect(redactAnalyticsUrl("https://mathnexa.com/update-password?code=abc123")).toBe("https://mathnexa.com/update-password");
    expect(redactAnalyticsUrl("https://mathnexa.com/?gclid=Cj0KCQ&utm_source=facebook#top")).toBe("https://mathnexa.com/");
    expect(redactAnalyticsUrl("https://mathnexa.com/join?code=ABCD12")).toBe("https://mathnexa.com/join");
  });

  it("replaces identifiers in a path", () => {
    expect(redactAnalyticsUrl("https://mathnexa.com/games/9b1f0a52-41a5-4c0e-9c0e-7a1c2f3e4d5a")).toBe("https://mathnexa.com/games/:id");
    expect(redactAnalyticsUrl("https://mathnexa.com/content/abcdefghijklmnopqrstuvwxyz012345")).toBe("https://mathnexa.com/content/:id");
  });

  it("never sends private paths", () => {
    for (const url of [
      "https://mathnexa.com/admin", "https://mathnexa.com/admin?section=funnel", "https://mathnexa.com/api/health",
      "https://mathnexa.com/auth/callback?code=xyz", "https://mathnexa.com/game/runtime/index.html",
      "https://mathnexa.com/games/9b1f0a52-41a5-4c0e-9c0e-7a1c2f3e4d5a/runtime/assets/ticket123/app.js",
      "https://mathnexa.com/resources/abc/preview/def", "https://mathnexa.com/media/asset-1", "https://mathnexa.com/teacher/classes/1",
      "https://mathnexa.com/_vercel/insights/script.js"
    ]) expect(redactAnalyticsUrl(url)).toBeNull();
  });

  it("drops or rewrites events through beforeSend and never throws", () => {
    expect(beforeSendAnalyticsEvent({ type: "pageview", url: "https://mathnexa.com/admin/sign-in" })).toBeNull();
    expect(beforeSendAnalyticsEvent({ type: "pageview", url: "https://mathnexa.com/pricing?x=1" })).toEqual({ type: "pageview", url: "https://mathnexa.com/pricing" });
    const unchanged = { type: "pageview" as const, url: "https://mathnexa.com/pricing" };
    expect(beforeSendAnalyticsEvent(unchanged)).toBe(unchanged);
    expect(beforeSendAnalyticsEvent({ type: "event", url: undefined as unknown as string })).toBeNull();
    expect(beforeSendAnalyticsEvent({ type: "event", url: "" })).toBeNull();
  });
});
