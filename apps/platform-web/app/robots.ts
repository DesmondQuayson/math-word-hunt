import type { MetadataRoute } from "next";
import { isProductionPublicMode } from "@/lib/environment/production-public";

export default function robots(): MetadataRoute.Robots {
  if (isProductionPublicMode()) return { rules: { userAgent: "*", allow: "/", disallow: ["/not-launched"] }, sitemap: "https://mathnexa.com/sitemap.xml" };
  return { rules: { userAgent: "*", disallow: "/" } };
}
