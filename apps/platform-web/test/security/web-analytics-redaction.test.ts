// Security baseline for Web Analytics and the Super Admin funnel: no event may
// carry a query string (Checkout session ids, recovery codes, click ids,
// `next` destinations), private paths are never reported, event properties
// come from fixed vocabularies, analytics is off unless switched on, the
// Content Security Policy needs no third-party analytics host, and the funnel
// loader uses sign-in addresses only to recognise reserved test names.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { beforeSendAnalyticsEvent, classifyEntrySource, classifyLandingPath, LANDING_PATHS, SOURCE_CLASSES } from "@/lib/analytics/attribution";
import { isWebAnalyticsEnabled } from "@/lib/analytics/web-analytics-config";
import { buildContentSecurityPolicy } from "@/lib/security/headers.mjs";

const appRoot = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(appRoot, path), "utf8");

const SENSITIVE_URLS = [
  "https://mathnexa.com/checkout/status?session_id=cs_live_a1B2c3D4e5F6",
  "https://mathnexa.com/update-password?code=0f3e2d1c-aaaa-bbbb-cccc-dddddddddddd",
  "https://mathnexa.com/sign-in?next=/account#token=abc",
  "https://mathnexa.com/?gclid=Cj0KCQiA_secret_click&email=someone@example.com",
  "https://mathnexa.com/access?next=/games/math-tug-of-war/play"
];

describe("web analytics redaction", () => {
  it("never forwards a query string, fragment or identifier", () => {
    for (const url of SENSITIVE_URLS) {
      const event = beforeSendAnalyticsEvent({ type: "pageview", url });
      expect(event).not.toBeNull();
      expect(event!.url).not.toMatch(/[?#]|cs_live|secret|@|0f3e2d1c/);
    }
  });

  it("conceals admin, API, auth callback, game runtime and protected file requests", () => {
    for (const url of [
      "https://mathnexa.com/admin", "https://mathnexa.com/admin/sign-in", "https://mathnexa.com/api/billing/webhook",
      "https://mathnexa.com/auth/callback", "https://mathnexa.com/game/runtime/index.html", "https://mathnexa.com/media/a1"
    ]) {
      expect(beforeSendAnalyticsEvent({ type: "pageview", url })).toBeNull();
      expect(beforeSendAnalyticsEvent({ type: "event", url })).toBeNull();
    }
  });

  it("keeps event properties inside fixed vocabularies", () => {
    const landing = new Set<string>([...LANDING_PATHS, "other"]);
    for (const path of ["/", "/quiz-pdfs", "/games/9c2b1f3e-1111-4222-8333-444455556666", "/resources/abc/download", "/admin"]) {
      expect(landing.has(classifyLandingPath(path))).toBe(true);
    }
    for (const [search, referrer] of [["", ""], ["?utm_source=someone@example.com", "https://attacker.example/?email=someone@example.com"], ["", "mailto:someone@example.com"], ["?gclid=abc", ""]]) {
      expect(SOURCE_CLASSES).toContain(classifyEntrySource(search, referrer, "mathnexa.com"));
    }
  });

  it("calls the analytics library only from the one reviewed module", () => {
    const client = read("lib/analytics/client.ts");
    expect(client).toMatch(/send\(name, \{ landing: entry\.landing, source: entry\.source \}\)/);
    const layout = read("app/layout.tsx");
    expect(layout).toMatch(/const webAnalytics = productionPlatform && isWebAnalyticsEnabled\(\);/);
    expect(layout).toMatch(/\{webAnalytics \? <SiteAnalytics \/> : null\}/);
    expect(read("components/analytics/site-analytics.tsx")).toMatch(/<Analytics beforeSend=\{beforeSendAnalyticsEvent\} debug=\{false\} \/>/);
  });

  it("is off unless the flag is exactly enabled", () => {
    expect(isWebAnalyticsEnabled({})).toBe(false);
    expect(isWebAnalyticsEnabled({ MVH_WEB_ANALYTICS: "true" })).toBe(false);
    expect(isWebAnalyticsEnabled({ MVH_WEB_ANALYTICS: "ENABLED" })).toBe(false);
    expect(isWebAnalyticsEnabled({ MVH_WEB_ANALYTICS: " enabled " })).toBe(true);
  });

  it("needs no third-party analytics host in the Content Security Policy", () => {
    const policy = buildContentSecurityPolicy({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" });
    expect(policy).not.toMatch(/vercel-scripts\.com|vercel-insights\.com|vitals\.vercel/);
    expect(policy).toMatch(/script-src 'self'/);
    expect(policy).toMatch(/connect-src 'self'/);
  });
});

describe("subscriber funnel privacy", () => {
  it("uses sign-in addresses only to recognise reserved test names and returns counts only", () => {
    const loader = read("lib/admin/subscriber-funnel.ts");
    expect(loader.match(/\.email\b/g)).toEqual([".email"]);
    expect(loader).toMatch(/if \(isReservedTestAddress\(user\.email\)\) ids\.add\(user\.id\);/);
    expect(loader).toMatch(/^import "server-only";/);
    const model = read("lib/admin/subscriber-funnel-model.ts");
    expect(model).not.toMatch(/email:/);
  });
});
