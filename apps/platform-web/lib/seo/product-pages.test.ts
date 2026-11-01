import { afterEach, describe, expect, it } from "vitest";

import sitemap from "../../app/sitemap";
import { PLATFORM_CRAWL_DISALLOW } from "../environment/crawl-policy";
import { PLATFORM_PRODUCTS } from "./platform-positioning";
import { PRODUCT_PAGE_FOR_ROUTE, PRODUCT_PAGE_LINKS, PRODUCT_PAGE_PATHS, productPageTrail } from "./product-pages";
import { breadcrumbStructuredData } from "./structured-data";

const GATED_ROUTES = ["/games", "/map-prep", "/homework", "/quizzes", "/worksheets", "/play"];

describe("public product pages", () => {
  it("gives each product route its own public page, with the navigation's names", () => {
    expect(PLATFORM_PRODUCTS.map((product) => [product.href, PRODUCT_PAGE_FOR_ROUTE[product.href]])).toEqual([
      ["/games", "/math-games"],
      ["/map-prep", "/online-math-prep"],
      ["/homework", "/homework-pdfs"],
      ["/quizzes", "/quiz-pdfs"]
    ]);
    expect(PRODUCT_PAGE_LINKS).toEqual([
      { path: "/online-math-prep", label: "Online Math Prep" },
      { path: "/math-games", label: "Math Games" },
      { path: "/math-games/math-tug-of-war", label: "Math Tug of War" },
      { path: "/homework-pdfs", label: "Homework PDFs" },
      { path: "/quiz-pdfs", label: "Quiz PDFs" }
    ]);
  });

  it("never lives under a gated route, and no robots Disallow can match it", () => {
    for (const { path } of PRODUCT_PAGE_LINKS) {
      for (const gated of GATED_ROUTES) {
        expect(path === gated || path.startsWith(`${gated}/`), `${path} under ${gated}`).toBe(false);
      }
      // robots.txt matching is a plain string prefix.
      for (const disallowed of PLATFORM_CRAWL_DISALLOW) expect(path.startsWith(disallowed), `${path} vs ${disallowed}`).toBe(false);
    }
  });

  it("shows a breadcrumb trail from the home page, with Math Tug of War under Math Games", () => {
    expect(productPageTrail(PRODUCT_PAGE_PATHS.onlineMathPrep)).toEqual([
      { name: "Home", path: "/" },
      { name: "Online Math Prep", path: "/online-math-prep" }
    ]);
    expect(productPageTrail(PRODUCT_PAGE_PATHS.mathTugOfWar)).toEqual([
      { name: "Home", path: "/" },
      { name: "Math Games", path: "/math-games" },
      { name: "Math Tug of War", path: "/math-games/math-tug-of-war" }
    ]);
  });

  it("publishes the same trail as BreadcrumbList JSON-LD with absolute URLs", () => {
    expect(breadcrumbStructuredData(productPageTrail(PRODUCT_PAGE_PATHS.mathTugOfWar))).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://mathnexa.com/" },
        { "@type": "ListItem", position: 2, name: "Math Games", item: "https://mathnexa.com/math-games" },
        { "@type": "ListItem", position: 3, name: "Math Tug of War", item: "https://mathnexa.com/math-games/math-tug-of-war" }
      ]
    });
  });
});

describe("sitemap", () => {
  const original = process.env.MVH_APP_ENVIRONMENT;
  afterEach(() => {
    if (original === undefined) delete process.env.MVH_APP_ENVIRONMENT;
    else process.env.MVH_APP_ENVIRONMENT = original;
  });

  it("lists the product pages on the production platform, never the gated product routes", () => {
    process.env.MVH_APP_ENVIRONMENT = "production-platform";
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toEqual([
      "https://mathnexa.com",
      "https://mathnexa.com/about",
      "https://mathnexa.com/online-math-prep",
      "https://mathnexa.com/math-games",
      "https://mathnexa.com/math-games/math-tug-of-war",
      "https://mathnexa.com/homework-pdfs",
      "https://mathnexa.com/quiz-pdfs",
      "https://mathnexa.com/help",
      "https://mathnexa.com/privacy",
      "https://mathnexa.com/accessibility",
      "https://mathnexa.com/terms",
      "https://mathnexa.com/support"
    ]);
    for (const gated of GATED_ROUTES) expect(urls).not.toContain(`https://mathnexa.com${gated}`);
  });

  it("keeps the public-site sitemap and every other environment unchanged", () => {
    process.env.MVH_APP_ENVIRONMENT = "production-public";
    expect(sitemap().map((entry) => entry.url)).toEqual([
      "https://mathnexa.com",
      "https://mathnexa.com/play",
      "https://mathnexa.com/about",
      "https://mathnexa.com/help",
      "https://mathnexa.com/privacy",
      "https://mathnexa.com/accessibility"
    ]);
    process.env.MVH_APP_ENVIRONMENT = "preview";
    expect(sitemap()).toEqual([]);
  });
});
