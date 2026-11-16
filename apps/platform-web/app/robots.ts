import type { MetadataRoute } from "next";
import { getPublicCrawlPolicy } from "@/lib/environment/crawl-policy";

/**
 * Published from the shared crawl policy (lib/environment/crawl-policy.ts), so
 * robots.txt and the operational status page can never disagree about what is
 * crawlable (production bug sweep BS-02). The "*" group denies only Super Admin
 * and the API; sign-in, account and billing pages stay crawlable so search
 * engines can read their noindex (2026-11-16). An Allow keeps /accessibility
 * crawlable, and AI model-training crawlers have their own group (owner
 * decisions, 2026-11-01).
 */
export default function robots(): MetadataRoute.Robots {
  const policy = getPublicCrawlPolicy();
  return policy.sitemap ? { rules: policy.rules, sitemap: policy.sitemap } : { rules: policy.rules };
}
