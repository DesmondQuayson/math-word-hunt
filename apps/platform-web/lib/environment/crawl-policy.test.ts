import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import robots from "../../app/robots";
import sitemap from "../../app/sitemap";
import {
  AI_TRAINING_CRAWLERS,
  CRAWL_SITEMAP_URL,
  PLATFORM_CRAWL_ALLOW,
  PLATFORM_CRAWL_DISALLOW,
  getPublicCrawlPolicy
} from "./crawl-policy";

/**
 * Production bug sweep BS-02. The crawl policy is the single source of truth
 * behind robots.txt and the operational status page, so these tests pin both
 * the published rules and the derived public-indexing verdict. The AI-training
 * group and the /accessibility Allow were added on 2026-11-01. On 2026-11-16
 * the "*" deny list shrank to Super Admin and the API: sign-in, account and
 * billing pages carry noindex, which search engines can only read on a page
 * robots.txt lets them fetch (Search Console had reported /homework, /games and
 * /worksheets as "Indexed, though blocked by robots.txt").
 */

/** Pages that send a signed-out visitor to sign in, and the sign-in pages they send them to. */
const SIGN_IN_ACCOUNT_AND_BILLING_PAGES = [
  "/access",
  "/access?next=/games",
  "/access?next=/homework",
  "/confirmation-required",
  "/sign-in",
  "/sign-in?next=%2Fcancellation",
  "/sign-up",
  "/sign-up?next=/subscription",
  "/forgot-password",
  "/update-password",
  "/account",
  "/my-account",
  "/subscription",
  "/pricing",
  "/checkout/status",
  "/game-access",
  "/subscriber-management",
  "/homework",
  "/games",
  "/worksheets",
  "/quizzes",
  "/map-prep",
  "/play",
  "/cancellation",
  "/refunds"
] as const;

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

  it("allows the platform's public pages and denies only Super Admin and the API", () => {
    const policy = getPublicCrawlPolicy(platform);
    expect(policy.publicIndexing).toBe("enabled");
    expect(policy.surface).toBe("platform");
    expect(policy.rules).toEqual([{ userAgent: "*", allow: [...PLATFORM_CRAWL_ALLOW], disallow: [...PLATFORM_CRAWL_DISALLOW] }, trainingGroup]);
    expect(policy.rules[0].disallow).toEqual(["/admin", "/api"]);
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

  it("serves the platform rules, with /accessibility allowed, plus the AI-training group", () => {
    process.env.MVH_APP_ENVIRONMENT = "production-platform";
    expect(robots()).toEqual({
      rules: [{ userAgent: "*", allow: ["/", "/accessibility"], disallow: ["/admin", "/api"] }, training],
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

describe("robots.txt and the sitemap agree", () => {
  const original = process.env.MVH_APP_ENVIRONMENT;
  afterEach(() => {
    if (original === undefined) delete process.env.MVH_APP_ENVIRONMENT;
    else process.env.MVH_APP_ENVIRONMENT = original;
  });

  /**
   * RFC 9309 matching, as Googlebot and Bingbot apply it: a crawler obeys the
   * groups that name it (otherwise "*"), the longest matching rule wins, and
   * Allow wins a tie. "*" matches any characters and a final "$" anchors.
   */
  function crawlable(rules: ReturnType<typeof robots>["rules"], crawler: string, path: string): boolean {
    const groups = [rules].flat();
    const agents = (rule: (typeof groups)[number]) => [rule.userAgent ?? []].flat().map((agent) => agent.toLowerCase());
    const named = groups.filter((rule) => agents(rule).includes(crawler.toLowerCase()));
    let best = { length: -1, allow: true };
    for (const rule of named.length ? named : groups.filter((rule) => agents(rule).includes("*"))) {
      for (const [patterns, allow] of [[rule.allow, true], [rule.disallow, false]] as const) {
        for (const pattern of [patterns ?? []].flat()) {
          const anchored = pattern.endsWith("$");
          const body = (anchored ? pattern.slice(0, -1) : pattern).split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
          if (!pattern || !new RegExp(`^${body}${anchored ? "$" : ""}`).test(path)) continue;
          if (pattern.length > best.length || (pattern.length === best.length && allow)) best = { length: pattern.length, allow };
        }
      }
    }
    return best.allow;
  }

  it("lets search crawlers fetch every sitemap URL in both production modes", () => {
    for (const mode of ["production-platform", "production-public"]) {
      process.env.MVH_APP_ENVIRONMENT = mode;
      const { rules } = robots();
      const paths = sitemap().map((entry) => new URL(entry.url).pathname);
      expect(paths).toContain("/accessibility");
      for (const path of paths) {
        for (const crawler of ["Googlebot", "Bingbot", "Applebot", "DuckDuckBot", "OAI-SearchBot", "PerplexityBot"]) {
          expect(crawlable(rules, crawler, path), `${mode}: ${crawler} ${path}`).toBe(true);
        }
      }
    }
  });

  it("keeps Super Admin and the API closed to crawlers", () => {
    process.env.MVH_APP_ENVIRONMENT = "production-platform";
    const { rules } = robots();
    for (const path of ["/admin", "/admin/sign-in", "/admin/mfa", "/api/health", "/api/stripe/webhook"]) {
      for (const crawler of ["Googlebot", "Bingbot"]) {
        expect(crawlable(rules, crawler, path), `${crawler} ${path}`).toBe(false);
      }
    }
  });

  it("lets search crawlers reach sign-in, account and billing pages, so they can read noindex", () => {
    process.env.MVH_APP_ENVIRONMENT = "production-platform";
    const { rules } = robots();
    for (const path of SIGN_IN_ACCOUNT_AND_BILLING_PAGES) {
      for (const crawler of ["Googlebot", "Bingbot"]) {
        expect(crawlable(rules, crawler, path), `${crawler} ${path}`).toBe(true);
      }
      expect(crawlable(rules, "GPTBot", path), `GPTBot ${path}`).toBe(false);
    }
    expect(crawlable(rules, "GPTBot", "/accessibility")).toBe(false);
  });
});

describe("pages crawlers may now reach keep themselves out of search", () => {
  /**
   * robots.txt used to deny these route families. Now that crawlers may fetch
   * them, each page must say noindex itself, or only redirect (in which case
   * the page it redirects to answers for it). A new page under one of them
   * without noindex would be indexable, so this fails until it declares it.
   */
  const appDirectory = join(process.cwd(), "app");
  const formerlyDenied = ["access", "confirmation-required", "sign-in", "sign-up", "forgot-password", "update-password", "account",
    "my-account", "subscription", "pricing", "checkout", "game-access", "subscriber-management"];

  function pagesUnder(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return pagesUnder(path);
      return /^page\.(t|j)sx?$/.test(entry.name) ? [path] : [];
    });
  }

  it("finds a page in every route family that robots.txt no longer denies", () => {
    for (const family of formerlyDenied) expect(pagesUnder(join(appDirectory, family)).length, family).toBeGreaterThan(0);
  });

  it("every one of those pages declares noindex or only redirects", () => {
    for (const family of formerlyDenied) {
      for (const page of pagesUnder(join(appDirectory, family))) {
        const source = readFileSync(page, "utf8");
        const noindex = /robots:\s*[^;]*index:\s*false/.test(source);
        const redirectOnly = /^import \{ redirect \} from "next\/navigation";\s*export default function \w+\(\)\s*\{\s*redirect\("\/[^"]*"\);\s*\}\s*$/.test(source.trim());
        expect(noindex || redirectOnly, page).toBe(true);
      }
    }
  });
});
