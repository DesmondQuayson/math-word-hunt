import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cms/public", () => ({ loadPublishedCmsDocument: vi.fn(async () => null) }));

import { SiteFooter } from "./site-footer";

const original = process.env.MVH_APP_ENVIRONMENT;

beforeEach(() => {
  process.env.MVH_APP_ENVIRONMENT = "production-platform";
});

afterEach(() => {
  cleanup();
  if (original === undefined) delete process.env.MVH_APP_ENVIRONMENT;
  else process.env.MVH_APP_ENVIRONMENT = original;
});

describe("platform footer", () => {
  it("links each product to its public page, in navigation order", async () => {
    render(await SiteFooter());
    const products = within(screen.getByRole("navigation", { name: "Products" })).getAllByRole("link");
    expect(products.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Math Games", "/math-games"],
      ["Online Math Prep", "/online-math-prep"],
      ["Homework PDFs", "/homework-pdfs"],
      ["Quiz PDFs", "/quiz-pdfs"],
      ["About MathNexa", "/about"]
    ]);
  });

  it("sends the cancellation and refund link to the public Terms section, not to sign-in", async () => {
    render(await SiteFooter());
    const legal = within(screen.getByRole("navigation", { name: "Legal" })).getAllByRole("link");
    expect(legal.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
      ["Accessibility", "/accessibility"],
      ["Cancellation and refunds", "/terms#terms-cancellation"]
    ]);
  });

  it("keeps the positioning sentence and describes access to every resource", async () => {
    const { container } = render(await SiteFooter());
    const tagline = container.querySelector(".footer-brand p:not(.brand-name)")?.textContent ?? "";
    // e2e/phase7b allows the word "teacher" only in this exact sentence.
    expect(tagline.startsWith("Teacher-led math resources in one platform. ")).toBe(true);
    expect(tagline).toBe("Teacher-led math resources in one platform. MathNexa stores only the minimum account and subscription data required to provide access to its resources.");
    expect(container.textContent).not.toMatch(/\bPro\b/);
  });
});
