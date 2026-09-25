import { describe, expect, it } from "vitest";

import { PLATFORM_PRODUCTS } from "@/lib/seo/platform-positioning";

import { ACCOUNT_NAVIGATION, isCurrentBannerPath, PRODUCT_NAVIGATION, WORKSHEET_GENERATOR_URL } from "./banner";

describe("banner navigation", () => {
  it("lists exactly the six approved product destinations, in order", () => {
    expect(PRODUCT_NAVIGATION.map((item) => item.label)).toEqual([
      "Home",
      "Math Games",
      "Online Math Prep",
      "Homework PDFs",
      "Quiz PDFs",
      "Worksheet Generator"
    ]);
  });

  it("uses the verified routes: the app's product entries and the ShowMe worksheet generator", () => {
    expect(PRODUCT_NAVIGATION.map((item) => item.href)).toEqual([
      "/",
      "/games",
      "/map-prep",
      "/homework",
      "/quizzes",
      "https://showme.mathnexa.com/worksheets"
    ]);
    // Every internal destination is one of the platform's real product routes,
    // so a renamed route fails here before it can become a 404 in the banner.
    const known = new Set<string>(["/", ...PLATFORM_PRODUCTS.map((product) => product.href)]);
    for (const item of PRODUCT_NAVIGATION.filter((entry) => !entry.external)) expect(known.has(item.href), item.href).toBe(true);
  });

  it("points Worksheet Generator directly at the ShowMe worksheet generator (canonical, no trailing slash)", () => {
    const url = new URL(WORKSHEET_GENERATOR_URL);
    expect(url.protocol).toBe("https:");
    expect(url.host).toBe("showme.mathnexa.com");
    expect(url.pathname).toBe("/worksheets");
    expect(url.search + url.hash).toBe("");
    expect(PRODUCT_NAVIGATION.find((item) => item.label === "Worksheet Generator")).toEqual({ href: WORKSHEET_GENERATOR_URL, label: "Worksheet Generator", external: true });
  });

  it("keeps account actions out of the product strip", () => {
    expect(ACCOUNT_NAVIGATION.map((item) => [item.label, item.href])).toEqual([["Subscription", "/subscription"], ["My Account", "/account"]]);
    const productLabels = PRODUCT_NAVIGATION.map((item) => item.label);
    for (const account of ACCOUNT_NAVIGATION) expect(productLabels).not.toContain(account.label);
    expect(productLabels).not.toContain("Start learning");
  });

  it("marks the current destination: Home exactly, products with their sub-routes, never the external link", () => {
    expect(isCurrentBannerPath("/", "/")).toBe(true);
    expect(isCurrentBannerPath("/", "/games")).toBe(false);
    expect(isCurrentBannerPath("/games", "/games")).toBe(true);
    expect(isCurrentBannerPath("/games", "/games/number-cross/play")).toBe(true);
    expect(isCurrentBannerPath("/games", "/gamesx")).toBe(false);
    expect(isCurrentBannerPath(WORKSHEET_GENERATOR_URL, "/worksheets")).toBe(false);
  });
});
