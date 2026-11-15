/**
 * Which requests does the site's Content Security Policy refuse while the
 * Google tag runs? Read-only: anonymous page loads in real browsers, no form,
 * no account.
 *
 * The tag asks for more on a landing URL that carries an ad click identifier
 * than on any other page, and some of its pings are sent for a sample of loads
 * only, so the probe loads ad landings (gclid, gbraid, wbraid) and ordinary
 * pages several times in Chromium, WebKit and two phone profiles, and reports
 * every refusal by directive, host and path.
 *
 *   node scripts/probe-google-tag-csp.mjs --live [--loads 3]
 *       the public site, https://mathnexa.com
 *   STAGING_ORIGIN=<staging preview> VERCEL_AUTOMATION_BYPASS_SECRET=... node scripts/probe-google-tag-csp.mjs
 *       a protected staging preview (scripts/invoke-ads-conversions-staging.ps1 -Stage csp -Origin <preview>)
 *
 * Exit code 1 when anything was refused. Vercel's preview toolbar
 * (vercel.live), which only previews carry, is not counted.
 */
import { chromium, devices, webkit } from "@playwright/test";

import { createProtectionBypass } from "./vercel-protection-bypass.mjs";

const live = process.argv.includes("--live");
const loadsArgument = process.argv.includes("--loads") ? Number(process.argv[process.argv.indexOf("--loads") + 1]) : 3;
const loads = Number.isSafeInteger(loadsArgument) && loadsArgument >= 1 && loadsArgument <= 10 ? loadsArgument : 3;
const origin = live ? "https://mathnexa.com" : (process.env.STAGING_ORIGIN ?? "").trim().replace(/\/$/, "");
if (!live && !/^https:\/\/mathnexa-platform-staging-[a-z0-9]+-bright-path-ed-tech\.vercel\.app$/.test(origin)) {
  throw new Error("Pass --live, or set STAGING_ORIGIN to a mathnexa-platform-staging preview URL.");
}
const bypass = live ? "" : (process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "").trim();
if (!live && bypass.length < 20) throw new Error("missing staging entries");
const protection = createProtectionBypass({ origin, secret: bypass });

const click = (label) => `Cj0KCQjw-CSPPROBE_${label}_0123456789`;
const PATHS = [
  "/",
  `/?gclid=${click("home")}`,
  `/online-math-prep?gclid=${click("prep")}`,
  `/math-games?gclid=${click("games")}&utm_source=google&utm_medium=cpc`,
  `/?gbraid=${click("gbraid")}`,
  `/?wbraid=${click("wbraid")}`,
  `/sign-up?gclid=${click("signup")}`,
  "/privacy",
  "/sign-in"
];
const PROFILES = {
  chromium: [chromium, devices["Desktop Chrome"]],
  webkit: [webkit, devices["Desktop Safari"]],
  "mobile-chrome": [chromium, devices["Pixel 7"]],
  "mobile-safari": [webkit, devices["iPhone 14"]]
};
const GOOGLE = /(^|\.)(google\.com|googletagmanager\.com|doubleclick\.net|googleadservices\.com|googlesyndication\.com|google-analytics\.com|gstatic\.com)$/;

const refused = new Map();
const completed = new Map();
let pages = 0;
/** A landing path without its identifier value: "/?gclid". */
const shape = (path) => path.includes("?") ? `${path.split("?")[0]}?${path.split("?")[1].split("=")[0]}` : path;

for (const [name, [engine, options]] of Object.entries(PROFILES)) {
  const browser = await engine.launch();
  try {
    for (let load = 0; load < loads; load += 1) {
      const context = await browser.newContext({ ...options });
      if (!live) await protection.install(context);
      await context.addInitScript(() => {
        window.__refused = [];
        document.addEventListener("securitypolicyviolation", (event) => window.__refused.push({ directive: event.effectiveDirective || event.violatedDirective, uri: event.blockedURI }));
      });
      context.on("requestfinished", async (request) => {
        try {
          const url = new URL(request.url());
          if (!GOOGLE.test(url.hostname)) return;
          const response = await request.response();
          const key = `${request.resourceType()} ${url.origin}${url.pathname}`;
          const entry = completed.get(key) ?? { count: 0, statuses: new Set() };
          entry.count += 1;
          entry.statuses.add(response ? response.status() : 0);
          completed.set(key, entry);
        } catch {
          // The context closed while the request was finishing.
        }
      });
      const page = await context.newPage();
      for (const path of PATHS) {
        await page.goto(`${origin}${path}`, { waitUntil: "load" }).catch(() => undefined);
        await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => undefined);
        await page.waitForTimeout(1500);
        pages += 1;
        for (const violation of await page.evaluate(() => window.__refused).catch(() => [])) {
          let key;
          try {
            const url = new URL(violation.uri);
            key = `${violation.directive} ${url.origin}${url.pathname}`;
          } catch {
            key = `${violation.directive} ${violation.uri}`;
          }
          if (key.includes("https://vercel.live")) continue;
          const entry = refused.get(key) ?? { count: 0, profiles: new Set(), paths: new Set() };
          entry.count += 1;
          entry.profiles.add(name);
          entry.paths.add(shape(path));
          refused.set(key, entry);
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

const report = {
  origin,
  pages,
  loadsPerProfile: loads,
  refused: [...refused.entries()].map(([request, value]) => ({ request, count: value.count, profiles: [...value.profiles], paths: [...value.paths] })),
  googleRequestsCompleted: [...completed.entries()].map(([request, value]) => `${request} x${value.count} [${[...value.statuses].join(",")}]`).sort(),
  result: refused.size === 0 ? "PASS" : "FAIL"
};
console.log(protection.redact(JSON.stringify(report, null, 2)));
process.exitCode = refused.size === 0 ? 0 : 1;
