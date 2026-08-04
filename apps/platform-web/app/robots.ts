import type { MetadataRoute } from "next";
import { isProductionPublicMode } from "@/lib/environment/production-public";
import { isProductionPlatformMode } from "@/lib/environment/production-platform";

export default function robots(): MetadataRoute.Robots {
  if (isProductionPublicMode()) return { rules: { userAgent: "*", allow: "/", disallow: ["/not-launched"] }, sitemap: "https://mathnexa.com/sitemap.xml" };
  if (isProductionPlatformMode()) return {
    rules: {
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
    sitemap: "https://mathnexa.com/sitemap.xml"
  };
  return { rules: { userAgent: "*", disallow: "/" } };
}
