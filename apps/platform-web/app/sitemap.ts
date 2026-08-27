import type { MetadataRoute } from "next";

import { isProductionPublicMode } from "@/lib/environment/production-public";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isProductionPublicMode() && !isProductionPlatformMode()) return [];
  const origin = "https://mathnexa.com";
  // Only directly reachable, indexable pages belong here: /cancellation and
  // /refunds 307 to sign-in for anonymous crawlers and were being indexed as
  // redirecting URLs.
  const paths = isProductionPlatformMode()
    ? ["", "/about", "/help", "/privacy", "/accessibility", "/terms", "/support"]
    : ["", "/play", "/about", "/help", "/privacy", "/accessibility"];
  return paths.map((path) => ({ url: `${origin}${path}`, changeFrequency: "monthly" as const, priority: path === "" ? 1 : 0.7 }));
}
