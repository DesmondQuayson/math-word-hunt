import { describe, expect, it } from "vitest";

import { PRODUCT_DESTINATIONS } from "@/lib/auth/access-intent";
import { PLATFORM_PRODUCTS } from "@/lib/seo/platform-positioning";

import {
  ACCOUNT_NAVIGATION,
  AUTHORIZED_ACCESS_ANCHOR,
  isCurrentBannerPath,
  PRODUCT_NAVIGATION,
  WORKSHEET_GENERATOR_URL
} from "./banner";

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

  it("uses only app-owned routes: Home, the four product entries and the gated /worksheets entry, never a direct off-site link", () => {
    expect(PRODUCT_NAVIGATION.map((item) => item.href)).toEqual([
      "/",
      "/games",
      "/map-prep",
      "/homework",
      "/quizzes",
      "/worksheets"
    ]);
    for (const item of PRODUCT_NAVIGATION) expect(item.href.startsWith("/"), item.href).toBe(true);
    expect(PRODUCT_NAVIGATION.some((item) => "external" in item)).toBe(false);
    // Every destination other than Home is a server-gated product entry:
    // lib/access/server.ts decides entitlement before any of them opens.
    const gated = new Set<string>(PRODUCT_DESTINATIONS);
    for (const item of PRODUCT_NAVIGATION.filter((entry) => entry.href !== "/")) expect(gated.has(item.href), item.href).toBe(true);
    // The four product pages are the platform's real routes, so a renamed
    // route fails here before it can become a 404 in the banner.
    const known = new Set<string>(["/", "/worksheets", ...PLATFORM_PRODUCTS.map((product) => product.href)]);
    for (const item of PRODUCT_NAVIGATION) expect(known.has(item.href), item.href).toBe(true);
  });

  it("keeps the ShowMe worksheet generator as the destination behind the gate (canonical, no trailing slash), not as a banner link", () => {
    const url = new URL(WORKSHEET_GENERATOR_URL);
    expect(url.protocol).toBe("https:");
    expect(url.host).toBe("showme.mathnexa.com");
    expect(url.pathname).toBe("/worksheets");
    expect(url.search + url.hash).toBe("");
    expect(PRODUCT_NAVIGATION.map((item) => item.href)).not.toContain(WORKSHEET_GENERATOR_URL);
    expect(PRODUCT_NAVIGATION.find((item) => item.label === "Worksheet Generator")).toEqual({ href: "/worksheets", label: "Worksheet Generator" });
  });

  it("keeps account actions out of the product strip", () => {
    expect(ACCOUNT_NAVIGATION.map((item) => [item.label, item.href])).toEqual([["Subscription", "/subscription"], ["My Account", "/account"]]);
    const productLabels = PRODUCT_NAVIGATION.map((item) => item.label);
    for (const account of ACCOUNT_NAVIGATION) expect(productLabels).not.toContain(account.label);
    expect(productLabels).not.toContain("Start learning");
    expect(productLabels).not.toContain("Authorize Code");
  });

  it("marks the current destination: Home exactly, products with their sub-routes, the worksheet entry included", () => {
    expect(isCurrentBannerPath("/", "/")).toBe(true);
    expect(isCurrentBannerPath("/", "/games")).toBe(false);
    expect(isCurrentBannerPath("/games", "/games")).toBe(true);
    expect(isCurrentBannerPath("/games", "/games/number-cross/play")).toBe(true);
    expect(isCurrentBannerPath("/games", "/gamesx")).toBe(false);
    expect(isCurrentBannerPath("/worksheets", "/worksheets")).toBe(true);
    expect(isCurrentBannerPath("/worksheets", "/")).toBe(false);
    expect(isCurrentBannerPath(WORKSHEET_GENERATOR_URL, "/worksheets")).toBe(false);
  });

  it("names the homepage anchor the banner's Authorize Code link points at", () => {
    expect(AUTHORIZED_ACCESS_ANCHOR).toBe("authorized-access");
  });
});
