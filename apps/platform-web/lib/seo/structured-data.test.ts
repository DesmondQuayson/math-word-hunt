import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JsonLd } from "@/components/seo/json-ld";

import { PLATFORM_HOMEPAGE_DESCRIPTION } from "./platform-positioning";
import { MATHNEXA_LOGO, homeStructuredData } from "./structured-data";

const graph = (supportEmail: string | null) => homeStructuredData({ supportEmail })["@graph"] as ReadonlyArray<Record<string, unknown>>;

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): [number, number] {
  const bytes = readFileSync(path);
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

describe("homepage structured data", () => {
  it("publishes one OnlineBusiness and one WebSite for mathnexa.com, linked by @id", () => {
    const data = homeStructuredData({ supportEmail: "support@mathnexa.com" });
    expect(data["@context"]).toBe("https://schema.org");
    const [organization, website] = graph("support@mathnexa.com");
    expect(organization).toMatchObject({ "@type": "OnlineBusiness", "@id": "https://mathnexa.com/#organization", name: "MathNexa", url: "https://mathnexa.com/" });
    expect(website).toMatchObject({ "@type": "WebSite", "@id": "https://mathnexa.com/#website", name: "MathNexa", url: "https://mathnexa.com/", inLanguage: "en", publisher: { "@id": "https://mathnexa.com/#organization" } });
    expect(graph(null)).toHaveLength(2);
  });

  it("describes MathNexa with the homepage's own visible lede", () => {
    expect(graph(null)[0].description).toBe(PLATFORM_HOMEPAGE_DESCRIPTION);
  });

  it("uses the shipped 512 px app icon as the logo, at its real size", () => {
    expect(graph(null)[0].logo).toEqual({ "@type": "ImageObject", url: "https://mathnexa.com/icon1.png", width: 512, height: 512 });
    expect(pngSize(resolve(process.cwd(), "app", MATHNEXA_LOGO.path.slice(1)))).toEqual([MATHNEXA_LOGO.width, MATHNEXA_LOGO.height]);
  });

  it("lists the support contact only when /support shows one", () => {
    expect(graph("support@mathnexa.com")[0].contactPoint).toEqual({ "@type": "ContactPoint", contactType: "customer support", email: "support@mathnexa.com", url: "https://mathnexa.com/support" });
    expect(graph(null)[0]).not.toHaveProperty("contactPoint");
  });

  it("claims nothing MathNexa has not published: no address, phone, hours, price, rating, review, award or profile", () => {
    const text = JSON.stringify(homeStructuredData({ supportEmail: "support@mathnexa.com" }));
    for (const property of ["address", "telephone", "openingHours", "priceRange", "offers", "price", "aggregateRating", "review", "award", "hasCredential", "sameAs", "founder", "foundingDate"]) {
      expect(text).not.toContain(`"${property}"`);
    }
    for (const type of ["LocalBusiness", "FAQPage", "BreadcrumbList", "SoftwareApplication", "WebApplication", "Course", "Product"]) {
      expect(text).not.toContain(`"${type}"`);
    }
  });

  it("renders as JSON-LD that parses back to the same data and cannot close its script early", () => {
    const hostile = { name: "</script><script>alert(1)</script> <!-- & \"quoted\"" };
    const markup = renderToStaticMarkup(createElement(JsonLd, { data: hostile }));
    const match = /^<script type="application\/ld\+json">([\s\S]*)<\/script>$/.exec(markup);
    expect(match).not.toBeNull();
    expect(match?.[1]).not.toMatch(/<\/?script/i);
    expect(JSON.parse(match?.[1] ?? "")).toEqual(hostile);
    const home = homeStructuredData({ supportEmail: "support@mathnexa.com" });
    const homeMarkup = renderToStaticMarkup(createElement(JsonLd, { data: home }));
    expect(JSON.parse(homeMarkup.replace(/^<script type="application\/ld\+json">|<\/script>$/g, ""))).toEqual(home);
  });
});
