import type { MetadataRoute } from "next";

import { isProductionPublicMode } from "@/lib/environment/production-public";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!isProductionPublicMode()) return [];
  const origin = "https://mathnexa.com";
  return ["", "/play", "/about", "/help", "/privacy", "/accessibility"].map((path) => ({ url: `${origin}${path}`, changeFrequency: "monthly" as const, priority: path === "" ? 1 : 0.7 }));
}
