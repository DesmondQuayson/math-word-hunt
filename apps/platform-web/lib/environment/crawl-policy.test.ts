import { afterEach, describe, expect, it } from "vitest";
import robots from "../../app/robots";
import {
  AI_TRAINING_CRAWLERS,
  CRAWL_SITEMAP_URL,
  PLATFORM_CRAWL_DISALLOW,
  getPublicCrawlPolicy
} from "./crawl-policy";

/**
 * Production bug sweep BS-02. The crawl policy is the single source of truth
 * behind robots.txt and the operational status page, so these tests pin both
 * the published rules and the derived public-indexing verdict. The "*" group
 * is unchanged since BS-02; the AI-training group was added on 2026-11-01.
 */

const publicSite = { MVH_APP_ENVIRONMENT: "production-public" };
const platform = { MVH_APP_ENVIRONMENT: "production-platform" };
const preview = { MVH_APP_ENVIRONMENT: "preview" };
const trainingGroup = { userAgent: [...AI_TRAINING_CRAWLERS], disallow: "/" };

describe("public crawl policy", () => {
  it("allows the public marketing site and publishes its sitemap", () => {
    expect(getPublicCrawlPolicy(publicSite)).toEqual({
      surface: "public-site",
      publicIndexing: "enabled",
      rules: [{ userAgent: "*", allow: "/", disallow: ["/not-launched"] }, trainingGroup],
      sitemap: CRAWL_SITEMAP_URL
    });
  });

  it("allows the platform's public pages while keeping private routes out of search", () => {
    const policy = getPublicCrawlPolicy(platform);
    expect(policy.publicIndexing).toBe("enabled");
    expect(policy.surface).toBe("platform");
    expect(policy.rules).toEqual([{ userAgent: "*", allow: "/", disallow: [...PLATFORM_CRAWL_DISALLOW] }, trainingGroup]);
    for (const path of ["/sign-in", "/account", "/subscription", "/pricing", "/checkout", "/admin", "/api"]) {
      expect(policy.rules[0].disallow).toContain(path);
    }
    expect(policy.sitemap).toBe(CRAWL_SITEMAP_URL);
  });

  it("opts out only AI-training crawlers, leaving search and AI-search crawlers under *", () => {
    for (const source of [platform, publicSite]) {
      const named = getPublicCrawlPolicy(source).rules.slice(1).flatMap((rule) => [rule.userAgent].flat()).map((agent) => agent.toLowerCase());
      expect(named).toEqual(AI_TRAINING_CRAWLERS.map((agent) => agent.toLowerCase()));
      for (const crawler of ["Googlebot", "Google-Extended", "Bingbot", "Applebot", "DuckDuckBot", "DuckAssistBot", "OAI-SearchBot", "ChatGPT-User",
        "Claude-SearchBot", "Claude-User", "PerplexityBot", "Perplexity-User", "meta-webindexer", "meta-externalfetcher", "Amzn-SearchBot", "MistralAI-User"]) {
        expect(named).not.toContain(crawler.toLowerCase());
      }
    }
  });

  it("blocks everything for previews and for an unrecognised environment", () => {
    for (const source of [preview, {}, { MVH_APP_ENVIRONMENT: "not-a-mode" }]) {
      const policy = getPublicCrawlPolicy(source);
      expect(policy.publicIndexing).toBe("blocked");
      expect(policy.rules).toEqual([{ userAgent: "*", disallow: "/" }]);
      expect(policy.sitemap).toBeUndefined();
    }
  });

  it("cannot be forged from a browser-visible variable", () => {
    expect(getPublicCrawlPolicy({ NEXT_PUBLIC_MVH_APP_ENVIRONMENT: "production-platform" }).publicIndexing).toBe("blocked");
  });
});

describe("robots.txt publishes the policy", () => {
  const original = process.env.MVH_APP_ENVIRONMENT;
  afterEach(() => {
    if (original === undefined) delete process.env.MVH_APP_ENVIRONMENT;
    else process.env.MVH_APP_ENVIRONMENT = original;
  });
  const training = {
    userAgent: ["GPTBot", "ClaudeBot", "CCBot", "Applebot-Extended", "meta-externalagent", "MistralAI-Training", "Amazonbot", "Bytespider"],
    disallow: "/"
  };

  it("serves the unchanged platform rules plus the AI-training group", () => {
    process.env.MVH_APP_ENVIRONMENT = "production-platform";
    expect(robots()).toEqual({
      rules: [
        {
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
        training
      ],
      sitemap: "https://mathnexa.com/sitemap.xml"
    });
  });

  it("serves the unchanged public-site rules plus the AI-training group", () => {
    process.env.MVH_APP_ENVIRONMENT = "production-public";
    expect(robots()).toEqual({
      rules: [{ userAgent: "*", allow: "/", disallow: ["/not-launched"] }, training],
      sitemap: "https://mathnexa.com/sitemap.xml"
    });
  });

  it("keeps every other environment fully disallowed", () => {
    process.env.MVH_APP_ENVIRONMENT = "preview";
    expect(robots()).toEqual({ rules: [{ userAgent: "*", disallow: "/" }] });
  });
});
