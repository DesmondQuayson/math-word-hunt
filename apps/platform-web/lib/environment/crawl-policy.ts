import { isProductionPlatformMode } from "./production-platform";
import { isProductionPublicMode } from "./production-public";

/**
 * The public crawl policy — one place that decides what search engines are
 * allowed to see, so `app/robots.ts` (which publishes it) and the operational
 * status contract (which reports it) can never disagree.
 *
 * Production bug sweep BS-02: `/status` printed the literal string "Blocked"
 * for search indexing while `robots.txt` had been publishing `Allow: /` with a
 * private-route deny list since launch. The page contradicted the shipped
 * policy because nothing connected the two.
 *
 * This module only DESCRIBES configuration. It never changes indexing: the
 * "*" rules below are the same ones robots.txt already served, and the private
 * prefixes stay denied. Two owner decisions (2026-11-01) add to them: a
 * separate group that opts AI model-training crawlers out of the whole site,
 * and an Allow that keeps /accessibility crawlable (PLATFORM_CRAWL_ALLOW).
 */

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

/**
 * Authenticated, billing and machine routes stay out of search results. They
 * are deny entries, not evidence that the public site is blocked.
 */
export const PLATFORM_CRAWL_DISALLOW = [
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
] as const;

/**
 * Public pages that a deny entry above would otherwise catch. robots.txt
 * rules are prefix matches, so "/access" also matched "/accessibility", a
 * sitemap page, and hid it from every search engine. Crawlers apply the
 * longest matching rule (RFC 9309), so this Allow wins for that page only.
 */
export const PLATFORM_CRAWL_ALLOW = ["/", "/accessibility"] as const;

/** The public marketing site only hides the pre-launch placeholder. */
export const PUBLIC_SITE_CRAWL_DISALLOW = ["/not-launched"] as const;

/**
 * Crawlers that collect pages to train AI models, opted out of every page.
 * Only training tokens are named: search engines and AI search or answer
 * crawlers (Googlebot, Bingbot, Applebot, DuckDuckBot, OAI-SearchBot,
 * Claude-SearchBot, PerplexityBot and the like) stay under "*", so search and
 * AI-search visibility does not change. Google-Extended is deliberately absent:
 * it also decides whether the Gemini apps may cite MathNexa, which the owner
 * chose to keep. robots.txt is advisory; the sign-in wall, not this list, keeps
 * learning content private.
 */
export const AI_TRAINING_CRAWLERS = [
  "GPTBot",
  "ClaudeBot",
  "CCBot",
  "Applebot-Extended",
  "meta-externalagent",
  "MistralAI-Training",
  "Amazonbot",
  "Bytespider"
] as const;

export const CRAWL_SITEMAP_URL = "https://mathnexa.com/sitemap.xml" as const;

/** One robots.txt group; `userAgent` may name several crawlers. */
export type CrawlRule = { userAgent: string | string[]; allow?: string | string[]; disallow?: string | string[] };

export type PublicCrawlPolicy = Readonly<{
  /** Which published surface this deployment is. */
  surface: "public-site" | "platform" | "restricted";
  /** Whether the PUBLIC pages of this deployment may be crawled and indexed. */
  publicIndexing: "enabled" | "blocked";
  rules: CrawlRule[];
  sitemap?: string;
}>;

function aiTrainingRule(): CrawlRule {
  return { userAgent: [...AI_TRAINING_CRAWLERS], disallow: "/" };
}

export function getPublicCrawlPolicy(source: EnvironmentSource = process.env): PublicCrawlPolicy {
  if (isProductionPublicMode(source)) {
    return Object.freeze({
      surface: "public-site",
      publicIndexing: "enabled",
      rules: [{ userAgent: "*", allow: "/", disallow: [...PUBLIC_SITE_CRAWL_DISALLOW] }, aiTrainingRule()],
      sitemap: CRAWL_SITEMAP_URL
    });
  }
  if (isProductionPlatformMode(source)) {
    return Object.freeze({
      surface: "platform",
      publicIndexing: "enabled",
      rules: [{ userAgent: "*", allow: [...PLATFORM_CRAWL_ALLOW], disallow: [...PLATFORM_CRAWL_DISALLOW] }, aiTrainingRule()],
      sitemap: CRAWL_SITEMAP_URL
    });
  }
  // Previews, local development and any deployment without a recognised public
  // identity stay fully blocked, which is what robots.txt already returned.
  return Object.freeze({ surface: "restricted", publicIndexing: "blocked", rules: [{ userAgent: "*", disallow: "/" }] });
}
