/**
 * Local ↔ hosted header parity for the routes that send their own security
 * headers (internal game documents, game-package assets).
 *
 * `next dev` and Vercel resolve a header that is set both by `next.config.mjs`
 * and by a route response in OPPOSITE directions: locally the configured value
 * wins and the route's is dropped (Next.js 16 server/send-response.js); on
 * Vercel the function's value replaces the configured one. Under the global
 * platform policy the internal games (whose `<base href>` needs
 * `base-uri 'self'`) never mounted locally while working in production.
 *
 * These tests evaluate the REAL shipped configuration for each Next phase,
 * compile its rules with Next.js's own route compiler, apply them to the REAL
 * route responses, and require:
 *   - every `next build` to ship exactly the header rules it shipped before;
 *   - `next dev` to differ only by leaving the route-owned paths alone and by
 *     React's development `'unsafe-eval'` on platform pages;
 *   - `next dev` to serve every game document the headers Vercel serves.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from "next/constants";
import { buildCustomRoute } from "next/dist/lib/build-custom-route";
import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, buildSecurityHeaders } from "@/lib/security/headers.mjs";
import { DEVELOPMENT_PLATFORM_HEADER_SOURCE, ROUTE_OWNED_HEADER_SOURCES } from "@/lib/security/route-owned-headers.mjs";
import {
  createCrossCalcV2PreviewResponse,
  createInternalGameResponse,
  getInternalGameRegistration,
  internalGameKeys
} from "@/lib/games/internal-registry";

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

const appRoot = resolve(__dirname, "../..");
const CSP = "content-security-policy";
/** Vercel builds with `next build`; the headers are compiled into the build (and `next start` serves that manifest). */
const BUILD_PHASES = [PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER] as const;
/** Every local game e2e suite runs `next dev`. */
const DEV = PHASE_DEVELOPMENT_SERVER;
const SAMPLE_ID = "6ede98c7-76e8-4332-b2db-00d9015fa8a0";
const AUDIO_RUNTIME_SOURCE = "/game-suite/:runtime(mvh-audio-runtime\\.[0-9a-f]{12}\\.js)";
const CONCEALMENT = [{ key: "Cache-Control", value: "no-store" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }];

async function shippedHeaderRules(phase: string): Promise<HeaderRule[]> {
  // A computed specifier keeps the untyped .mjs config out of the type check.
  const specifier = pathToFileURL(resolve(appRoot, "next.config.mjs")).href;
  const exported = (await import(/* @vite-ignore */ specifier)).default as (phase: string) => { headers: () => Promise<HeaderRule[]> };
  return exported(phase).headers();
}

function matches(source: string, pathname: string): boolean {
  const { regex } = buildCustomRoute("header", { source, headers: [] });
  return new RegExp(regex).test(pathname);
}

/** What `next.config.mjs` applies to a path: Next.js's own compiler, last matching rule wins per name. */
function configured(rules: readonly HeaderRule[], pathname: string): Map<string, string> {
  const applied = new Map<string, string>();
  for (const rule of rules) {
    if (!matches(rule.source, pathname)) continue;
    for (const { key, value } of rule.headers) applied.set(key.toLowerCase(), value);
  }
  return applied;
}

/** `next dev`: a route header is copied only when the configuration has not set that name. */
function servedLocally(config: Map<string, string>, route: Headers): Map<string, string> {
  const served = new Map(config);
  route.forEach((value, name) => {
    if (!served.has(name)) served.set(name, value);
  });
  return served;
}

/** Vercel: the function's header replaces the configured header of the same name. */
function servedOnVercel(config: Map<string, string>, route: Headers): Map<string, string> {
  const served = new Map(config);
  route.forEach((value, name) => served.set(name, value));
  return served;
}

/** The headers Vercel (a production build) and `next dev` serve for a route response at a path. */
async function served(pathname: string, route: Headers) {
  return {
    hosted: servedOnVercel(configured(await shippedHeaderRules(PHASE_PRODUCTION_BUILD), pathname), route),
    local: servedLocally(configured(await shippedHeaderRules(DEV), pathname), route)
  };
}

/** A concrete path for a `source` pattern. */
function sample(source: string): string {
  return source.replace(/:asset\*$/, "game/index.html").replace(/:[A-Za-z]+/g, SAMPLE_ID);
}

/** Next.js `source` pattern of an App Router route file, e.g. app/games/[resourceId]/play/route.ts -> /games/:resourceId/play. */
function routeSource(file: string): string {
  const segments = relative(resolve(appRoot, "app"), file).split(sep).slice(0, -1);
  return "/" + segments
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .map((segment) => segment.replace(/^\[\.\.\.(.+)\]$/, ":$1*").replace(/^\[(.+)\]$/, ":$1"))
    .join("/");
}

function routeFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === "route.ts" ? [path] : [];
  });
}

describe("every production build ships the same header rules as before", () => {
  it("has exactly the global, admin-concealment and audio-runtime rules", async () => {
    for (const phase of BUILD_PHASES) {
      const rules = await shippedHeaderRules(phase);
      expect(rules.map((rule) => rule.source), phase).toEqual(["/:path*", "/admin", "/admin/:path*", AUDIO_RUNTIME_SOURCE]);
      expect(rules[0].headers, phase).toEqual(buildSecurityHeaders());
      expect(rules[1].headers, phase).toEqual(CONCEALMENT);
      expect(rules[2].headers, phase).toEqual(CONCEALMENT);
      expect(rules[3].headers, phase).toEqual([{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]);
    }
  });

  it("never ships 'unsafe-eval'", async () => {
    expect(buildContentSecurityPolicy({})).not.toContain("unsafe-eval");
    for (const phase of BUILD_PHASES) {
      for (const rule of await shippedHeaderRules(phase)) {
        for (const { value } of rule.headers) expect(value, `${phase} ${rule.source}`).not.toContain("unsafe-eval");
      }
    }
  });
});

describe("next dev differs from a build only where it must", () => {
  it("changes only the platform rule's source and React's development eval", async () => {
    const build = await shippedHeaderRules(PHASE_PRODUCTION_BUILD);
    const dev = await shippedHeaderRules(DEV);
    expect(dev.slice(1)).toEqual(build.slice(1));
    expect(dev[0].source).toBe(DEVELOPMENT_PLATFORM_HEADER_SOURCE);
    const developmentCsp = buildContentSecurityPolicy(process.env, { developmentServer: true });
    expect(developmentCsp).toBe(buildContentSecurityPolicy(process.env).replace("script-src 'self' 'unsafe-inline'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'"));
    expect(dev[0].headers).toEqual(buildSecurityHeaders().map((header) => header.key === "Content-Security-Policy" ? { ...header, value: developmentCsp } : header));
  });

  it("adds 'unsafe-eval' only for a literal developmentServer: true", () => {
    const build = buildContentSecurityPolicy({});
    expect(buildContentSecurityPolicy({}, { developmentServer: "true" as never })).toBe(build);
    expect(buildContentSecurityPolicy({}, { developmentServer: false })).toBe(build);
    expect(buildContentSecurityPolicy({}, { developmentServer: true })).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval';");
  });

  it("leaves exactly the route-owned paths alone", () => {
    for (const source of ROUTE_OWNED_HEADER_SOURCES) {
      const pathname = sample(source);
      expect(matches(source, pathname), `${source} matches ${pathname}`).toBe(true);
      expect(matches(DEVELOPMENT_PLATFORM_HEADER_SOURCE, pathname), `next dev leaves ${pathname} alone`).toBe(false);
    }
    for (const pathname of [
      "/",
      "/access",
      "/games",
      "/games/number-logic",
      "/games/number-logic/maintenance",
      "/games/number-cross/launch",
      "/games/number-logic/play/extra",
      "/games/crosscalc/v2",
      `/games/${SAMPLE_ID}`,
      `/games/${SAMPLE_ID}/runtime`,
      `/games/${SAMPLE_ID}/runtime/assets`,
      "/game/runtime/index.html",
      "/internal-games/number-logic/assets/index.js",
      "/admin",
      "/admin/games",
      `/admin/games/catalog/${SAMPLE_ID}`,
      `/admin/games/${SAMPLE_ID}/preview`,
      "/api/health",
      "/play"
    ]) {
      expect(matches(DEVELOPMENT_PLATFORM_HEADER_SOURCE, pathname), `next dev sends the platform headers on ${pathname}`).toBe(true);
    }
  });
});

describe("internal game documents: next dev serves what Vercel serves", () => {
  // The platform security headers; the separate Admin concealment rule
  // (Cache-Control no-store, X-Robots-Tag) is out of scope and still applies.
  const SECURITY_HEADER_NAMES = new Set(buildSecurityHeaders().map((header) => header.key.toLowerCase()));

  async function expectParity(pathname: string, route: Headers, label: string) {
    const { hosted, local } = await served(pathname, route);
    let compared = 0;
    route.forEach((value, name) => {
      if (!SECURITY_HEADER_NAMES.has(name)) return;
      compared += 1;
      expect(hosted.get(name), `${label}: Vercel serves the route's ${name}`).toBe(value);
      expect(local.get(name), `${label}: next dev serves the route's ${name}`).toBe(value);
    });
    expect(compared, `${label}: the route sets its own security headers`).toBeGreaterThanOrEqual(5);
    return { hosted, local };
  }

  it("serves every published game document with its own headers", async () => {
    for (const key of internalGameKeys()) {
      const registration = getInternalGameRegistration(key)!;
      const { local } = await expectParity(registration.route, createInternalGameResponse(key).headers, key);
      expect(local.get(CSP), key).toContain("base-uri 'self'");
      expect(local.get(CSP), key).not.toContain("unsafe-eval");
      expect(local.get("x-frame-options"), key).toBe("DENY");
    }
    // CrossCalc V2 is served on the CrossCalc route when the catalog version is 0.2.0.
    await expectParity("/games/crosscalc/play", createInternalGameResponse("crosscalc", "0.2.0").headers, "crosscalc 0.2.0");
  });

  it("serves the CrossCalc V2 preview and every Admin catalog preview with their own headers", async () => {
    await expectParity("/games/crosscalc/v2/preview", createCrossCalcV2PreviewResponse().headers, "crosscalc v2 preview");
    for (const key of internalGameKeys()) {
      await expectParity(`/admin/games/catalog/${SAMPLE_ID}/preview`, createInternalGameResponse(key).headers, `admin preview ${key}`);
    }
  });
});

describe("coverage", () => {
  it("leaves every route that serves its own game document or package asset to its route headers", () => {
    const owning = routeFiles(resolve(appRoot, "app"))
      .filter((file) => /createInternalGameResponse|createCrossCalcV2PreviewResponse|deliverPrivateGameAsset/.test(readFileSync(file, "utf8")))
      .map(routeSource)
      .sort();
    expect(owning.length).toBeGreaterThanOrEqual(5);
    for (const source of owning) {
      expect(matches(DEVELOPMENT_PLATFORM_HEADER_SOURCE, sample(source)), `${source} owns its headers but next dev would override them`).toBe(false);
    }
  });

  it("matters for the <base href> documents, which resolve their bundle relative to it", async () => {
    const withBase: string[] = [];
    for (const key of internalGameKeys()) {
      const registration = getInternalGameRegistration(key)!;
      if ((await createInternalGameResponse(key).text()).includes(`<base href="${registration.assetBase}"`)) withBase.push(key);
    }
    // Math Tug of War uses absolute asset URLs and no <base>; the others depend on it.
    expect(withBase.sort()).toEqual(["crosscalc", "number-cross", "number-logic"]);
  });
});
