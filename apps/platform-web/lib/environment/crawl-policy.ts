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
 * rules below are the same ones robots.txt already served, and the private
 * prefixes stay denied.
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

/** The public marketing site only hides the pre-launch placeholder. */
export const PUBLIC_SITE_CRAWL_DISALLOW = ["/not-launched"] as const;

export const CRAWL_SITEMAP_URL = "https://mathnexa.com/sitemap.xml" as const;

export type PublicCrawlPolicy = Readonly<{
  /** Which published surface this deployment is. */
  surface: "public-site" | "platform" | "restricted";
  /** Whether the PUBLIC pages of this deployment may be crawled and indexed. */
  publicIndexing: "enabled" | "blocked";
  rules: { userAgent: string; allow?: string; disallow?: string | string[] };
  sitemap?: string;
}>;

export function getPublicCrawlPolicy(source: EnvironmentSource = process.env): PublicCrawlPolicy {
  if (isProductionPublicMode(source)) {
    return Object.freeze({
      surface: "public-site",
      publicIndexing: "enabled",
      rules: { userAgent: "*", allow: "/", disallow: [...PUBLIC_SITE_CRAWL_DISALLOW] },
      sitemap: CRAWL_SITEMAP_URL
    });
  }
  if (isProductionPlatformMode(source)) {
    return Object.freeze({
      surface: "platform",
      publicIndexing: "enabled",
      rules: { userAgent: "*", allow: "/", disallow: [...PLATFORM_CRAWL_DISALLOW] },
      sitemap: CRAWL_SITEMAP_URL
    });
  }
  // Previews, local development and any deployment without a recognised public
  // identity stay fully blocked, which is what robots.txt already returned.
  return Object.freeze({ surface: "restricted", publicIndexing: "blocked", rules: { userAgent: "*", disallow: "/" } });
}
