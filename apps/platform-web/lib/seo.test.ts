import { describe, expect, it } from "vitest";

import {
  getMathNexaStructuredData,
  getPublicPageMetadata,
  MATHNEXA_ORIGIN,
  PUBLIC_PAGE_SEO,
  PUBLIC_SITEMAP_PATHS,
  RESTRICTED_ROBOTS_PATHS
} from "./seo";

describe("MathNexa public search contract", () => {
  it("publishes only the approved sitemap surface", () => {
    expect(PUBLIC_SITEMAP_PATHS).toEqual(["/", "/pricing", "/help", "/privacy", "/terms"]);
    expect(PUBLIC_SITEMAP_PATHS.some((path) => RESTRICTED_ROBOTS_PATHS.some((restricted) => String(path) === restricted || path.startsWith(`${restricted}/`)))).toBe(false);
  });

  it("provides unique canonical, Open Graph, and social metadata", () => {
    const pages = Object.entries(PUBLIC_PAGE_SEO);
    expect(new Set(pages.map(([, page]) => page.title)).size).toBe(pages.length);
    expect(new Set(pages.map(([, page]) => page.description)).size).toBe(pages.length);
    for (const [key, page] of pages) {
      const metadata = getPublicPageMetadata(key as keyof typeof PUBLIC_PAGE_SEO);
      expect(metadata.alternates?.canonical).toBe(new URL(page.path, MATHNEXA_ORIGIN).toString());
      expect(metadata.openGraph).toMatchObject({ siteName: "MathNexa", title: page.title, description: page.description });
      expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title: page.title, description: page.description });
    }
  });

  it("emits only truthful WebSite and Organization structured data", () => {
    const data = getMathNexaStructuredData();
    expect(data.map((entry) => entry["@type"])).toEqual(["WebSite", "Organization"]);
    expect(JSON.stringify(data)).not.toMatch(/rating|review|offer|price|student|school|class|roster/i);
    expect(data.every((entry) => entry.url === MATHNEXA_ORIGIN)).toBe(true);
  });
});
