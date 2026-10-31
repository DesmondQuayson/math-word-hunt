import { describe, expect, it } from "vitest";

import { PLATFORM_HOMEPAGE_DESCRIPTION } from "./platform-positioning";
import { MONTHLY_PRICE_LABEL, PLATFORM_OPEN_GRAPH, PUBLIC_PAGE_SEO, SOCIAL_PREVIEW_IMAGE, TRIAL_HOURS, publicPageMetadata, type PublicSeoPath } from "./public-pages";

// app/sitemap.ts (production platform) plus /status, the one other indexable page.
const INDEXABLE_PAGES = ["/about", "/help", "/privacy", "/accessibility", "/terms", "/support", "/status"];

describe("public page search metadata", () => {
  it("covers every indexable public page", () => {
    expect(Object.keys(PUBLIC_PAGE_SEO).sort()).toEqual([...INDEXABLE_PAGES].sort());
  });

  it("gives every page its own description, none of them the homepage's, each short enough for a search snippet", () => {
    const descriptions = Object.values(PUBLIC_PAGE_SEO).map((page) => page.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const description of descriptions) {
      expect(description).not.toBe(PLATFORM_HOMEPAGE_DESCRIPTION);
      expect(description.length).toBeGreaterThanOrEqual(70);
      expect(description.length).toBeLessThanOrEqual(160);
    }
  });

  it("gives every page its own title", () => {
    const titles = Object.values(PUBLIC_PAGE_SEO).map((page) => typeof page.title === "string" ? page.title : page.title.absolute);
    expect(new Set(titles).size).toBe(titles.length);
    expect(PUBLIC_PAGE_SEO["/about"].title).toEqual({ absolute: "About MathNexa: Online Math Prep for Grades 3–8" });
  });

  it("quotes the price and trial length from the billing policy, as the terms do", () => {
    expect(MONTHLY_PRICE_LABEL).toBe("$5.99 USD");
    expect(TRIAL_HOURS).toBe(24);
    expect(PUBLIC_PAGE_SEO["/terms"].description).toContain("$5.99 USD a month after a 24-hour trial");
  });

  it("adds the page's own og:url and the square app icon as the social image", () => {
    for (const path of INDEXABLE_PAGES as PublicSeoPath[]) {
      const metadata = publicPageMetadata(path);
      expect(metadata.description).toBe(PUBLIC_PAGE_SEO[path].description);
      expect(metadata.openGraph).toMatchObject({ siteName: "MathNexa", type: "website", url: path, images: [SOCIAL_PREVIEW_IMAGE] });
    }
    expect(PLATFORM_OPEN_GRAPH.images).toEqual([{ url: "/icon1.png", width: 512, height: 512, alt: "MathNexa" }]);
  });
});
