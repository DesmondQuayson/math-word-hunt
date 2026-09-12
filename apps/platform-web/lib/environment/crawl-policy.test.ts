import { afterEach, describe, expect, it } from "vitest";
import robots from "../../app/robots";
import {
  CRAWL_SITEMAP_URL,
  PLATFORM_CRAWL_DISALLOW,
  getPublicCrawlPolicy
} from "./crawl-policy";

/**
 * Production bug sweep BS-02. The crawl policy is the single source of truth
 * behind robots.txt and the operational status page, so these tests pin both
 * the published rules (unchanged) and the derived public-indexing verdict.
 */

const publicSite = { MVH_APP_ENVIRONMENT: "production-public" };
const platform = { MVH_APP_ENVIRONMENT: "production-platform" };
const preview = { MVH_APP_ENVIRONMENT: "preview" };

describe("public crawl policy", () => {
  it("allows the public marketing site and publishes its sitemap", () => {
    expect(getPublicCrawlPolicy(publicSite)).toEqual({
      surface: "public-site",
      publicIndexing: "enabled",
      rules: { userAgent: "*", allow: "/", disallow: ["/not-launched"] },
      sitemap: CRAWL_SITEMAP_URL
    });
  });

  it("allows the platform's public pages while keeping private routes out of search", () => {
    const policy = getPublicCrawlPolicy(platform);
    expect(policy.publicIndexing).toBe("enabled");
    expect(policy.surface).toBe("platform");
    expect(policy.rules).toEqual({ userAgent: "*", allow: "/", disallow: [...PLATFORM_CRAWL_DISALLOW] });
    for (const path of ["/sign-in", "/account", "/subscription", "/pricing", "/checkout", "/admin", "/api"]) {
      expect(policy.rules.disallow).toContain(path);
    }
    expect(policy.sitemap).toBe(CRAWL_SITEMAP_URL);
  });

  it("blocks everything for previews and for an unrecognised environment", () => {
    for (const source of [preview, {}, { MVH_APP_ENVIRONMENT: "not-a-mode" }]) {
      const policy = getPublicCrawlPolicy(source);
      expect(policy.publicIndexing).toBe("blocked");
      expect(policy.rules).toEqual({ userAgent: "*", disallow: "/" });
      expect(policy.sitemap).toBeUndefined();
    }
  });

  it("cannot be forged from a browser-visible variable", () => {
    expect(getPublicCrawlPolicy({ NEXT_PUBLIC_MVH_APP_ENVIRONMENT: "production-platform" }).publicIndexing).toBe("blocked");
  });
});

describe("robots.txt keeps publishing the same rules", () => {
  const original = process.env.MVH_APP_ENVIRONMENT;
  afterEach(() => {
    if (original === undefined) delete process.env.MVH_APP_ENVIRONMENT;
    else process.env.MVH_APP_ENVIRONMENT = original;
  });

  it("serves the platform rules unchanged", () => {
    process.env.MVH_APP_ENVIRONMENT = "production-platform";
    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/access",
          "/confirmation-required",
          "/sign-in",
          "/sign-up",
          "/forgot-password",
          "/update-password",
          "/account",
          "/my-account",
          "/subscription",
          "/pricing",
          "/checkout",
          "/game-access",
          "/subscriber-management",
          "/admin",
          "/api"
        ]
      },
      sitemap: "https://mathnexa.com/sitemap.xml"
    });
  });

  it("serves the public-site rules unchanged", () => {
    process.env.MVH_APP_ENVIRONMENT = "production-public";
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/not-launched"] },
      sitemap: "https://mathnexa.com/sitemap.xml"
    });
  });

  it("keeps every other environment fully disallowed", () => {
    process.env.MVH_APP_ENVIRONMENT = "preview";
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});
