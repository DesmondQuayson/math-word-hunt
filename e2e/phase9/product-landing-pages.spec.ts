import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * P2 public product pages, signed out. Each page is indexable, listed in the
 * sitemap and the footer, free of file addresses, accessible, and reflows at
 * 320 px. Its button still opens the product through the unchanged access
 * check.
 */

const axeSource = readFileSync(resolve("node_modules/axe-core/axe.min.js"), "utf8");

const PAGES = [
  { path: "/online-math-prep", h1: "Online Math Prep for Grades 3–8", button: "Open Online Math Prep", target: "/map-prep" },
  { path: "/math-games", h1: "Math games for the classroom", button: "Open Math Games", target: "/games" },
  { path: "/math-games/math-tug-of-war", h1: "Math Tug of War", button: "Play for free", target: "/games/math-tug-of-war/play" },
  { path: "/homework-pdfs", h1: "Printable math homework PDFs", button: "Open Homework PDFs", target: "/homework" },
  { path: "/quiz-pdfs", h1: "Printable math quizzes by topic", button: "Open Quiz PDFs", target: "/quizzes" }
] as const;

for (const entry of PAGES) {
  test(`${entry.path} is public and indexable, and opens its product through the access check`, async ({ page }) => {
    const response = await page.goto(entry.path);
    expect(response?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /^index, follow/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://mathnexa.com${entry.path}`);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(entry.h1);
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
    const breadcrumb = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent() ?? "null");
    expect(breadcrumb["@type"]).toBe("BreadcrumbList");
    expect(breadcrumb.itemListElement.at(-1).item).toBe(`https://mathnexa.com${entry.path}`);
    const html = await response!.text();
    expect(html).not.toMatch(/\/resources\/[0-9a-f-]{36}|\/download\b|\/preview\//i);
    await expect(page.getByRole("link", { name: entry.button, exact: true }).first()).toHaveAttribute("href", entry.target);

    await page.goto(entry.target);
    await expect(page).toHaveURL(`/access?next=${entry.target}`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
}

test("the sitemap and the footer point to the product pages instead of the product routes", async ({ page, request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const entry of PAGES) expect(sitemap).toContain(`<loc>https://mathnexa.com${entry.path}</loc>`);
  for (const gated of ["/games", "/map-prep", "/homework", "/quizzes", "/worksheets"]) expect(sitemap).not.toContain(`<loc>https://mathnexa.com${gated}</loc>`);

  await page.goto("/");
  const footerProducts = page.getByRole("contentinfo").getByRole("navigation", { name: "Products" }).getByRole("link");
  await expect(footerProducts).toHaveText(["Math Games", "Online Math Prep", "Homework PDFs", "Quiz PDFs", "About MathNexa"]);
  expect(await footerProducts.evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(["/math-games", "/online-math-prep", "/homework-pdfs", "/quiz-pdfs", "/about"]);
  // The header keeps its direct product links.
  await expect(page.getByRole("banner").getByRole("link", { name: "Math Games", exact: true })).toHaveAttribute("href", "/games");
});

test("the Math Games page lists the free game from the catalog", async ({ page }) => {
  await page.goto("/math-games");
  const tug = page.locator('article[data-game="math-tug-of-war"]');
  await expect(tug.getByRole("heading", { level: 3, name: "Math Tug of War" })).toBeVisible();
  await expect(tug.getByRole("link", { name: "About Math Tug of War" })).toHaveAttribute("href", "/math-games/math-tug-of-war");
});

test("the product pages pass axe (WCAG 2.2 A/AA) and do not scroll sideways at 320 px", async ({ page }) => {
  for (const entry of PAGES) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(entry.path);
    await page.evaluate(axeSource);
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: Document, options: unknown) => Promise<{ violations: { id: string; nodes: unknown[] }[] }> } }).axe;
      const result = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
      return result.violations.map((violation) => `${violation.id} (${violation.nodes.length})`);
    });
    expect(violations, entry.path).toEqual([]);

    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(entry.path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, entry.path).toBeLessThanOrEqual(0);
  }
});
