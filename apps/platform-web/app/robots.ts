import type { MetadataRoute } from "next";
import { isProductionPublicMode } from "@/lib/environment/production-public";
import { MATHNEXA_ORIGIN, RESTRICTED_ROBOTS_PATHS } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  if (isProductionPublicMode()) return {
    rules: { userAgent: "*", allow: "/", disallow: [...RESTRICTED_ROBOTS_PATHS] },
    sitemap: `${MATHNEXA_ORIGIN}/sitemap.xml`,
    host: MATHNEXA_ORIGIN
  };
  return { rules: { userAgent: "*", disallow: "/" } };
}
