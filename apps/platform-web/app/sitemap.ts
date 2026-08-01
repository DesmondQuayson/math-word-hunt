import type { MetadataRoute } from "next";

import { isProductionPublicMode } from "@/lib/environment/production-public";
import { MATHNEXA_ORIGIN, PUBLIC_SITEMAP_PATHS } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isProductionPublicMode()) return [];
  return PUBLIC_SITEMAP_PATHS.map((path) => ({
    url: new URL(path, MATHNEXA_ORIGIN).toString(),
    changeFrequency: "monthly" as const,
    priority: path === "/" ? 1 : path === "/pricing" || path === "/help" ? 0.8 : 0.5
  }));
}
