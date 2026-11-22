import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

// The logged-out homepage hero (2026-11-22): Start free trial, Create account and
// Sign in, in that order, on their existing routes; reachable by keyboard in the
// same order with a visible focus indicator; never clipped, overlapping or
// scrolling sideways; roomy touch targets; and no axe findings for contrast,
// names or target size. Signed-in states are covered in teacher-first-access-flow.

const axeSource = readFileSync(resolve("node_modules/axe-core/axe.min.js"), "utf8");
const EXPECTED = [["Start free trial", "/sign-up?next=/subscription"], ["Create account", "/sign-up"], ["Sign in", "/sign-in"]];

test("logged-out hero: the three entry points in order, by pointer and keyboard", async ({ page }) => {
  await page.goto("/");
  const actions = page.locator(".teacher-home-actions a");
  await expect(actions).toHaveCount(3);
  expect(await actions.evaluateAll((links) => links.map((link) => [link.textContent?.trim(), link.getAttribute("href")]))).toEqual(EXPECTED);
  for (const [name] of EXPECTED) await expect(page.locator(".teacher-home-actions").getByRole("link", { name, exact: true })).toBeVisible();
  // Primary, secondary, then the lighter action.
  expect(await actions.evaluateAll((links) => links.map((link) => link.className))).toEqual(["button button-primary", "button button-secondary", "button button-ghost"]);

  // Keyboard: reach the first by Tab, then Tab walks the other two in visual order, each with a visible focus ring.
  await actions.nth(1).focus();
  await page.keyboard.press("Shift+Tab");
  for (const [name] of EXPECTED) {
    const focused = page.locator(".teacher-home-actions a:focus-visible");
    await expect(focused, name).toHaveText(name);
    const ring = await focused.evaluate((link) => {
      const style = getComputedStyle(link);
      return { outline: style.outlineStyle, width: parseFloat(style.outlineWidth), shadow: style.boxShadow };
    });
    expect((ring.outline !== "none" && ring.width > 0) || ring.shadow !== "none", `${name} focus indicator`).toBe(true);
    await page.keyboard.press("Tab");
  }

  // Each goes to its existing page.
  await page.locator(".teacher-home-actions").getByRole("link", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByLabel("Email address")).toBeVisible();
  await page.goto("/");
  await page.locator(".teacher-home-actions").getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
});

test("logged-out hero: no sideways scroll, clipping or overlap, roomy targets, and no axe findings at phone, tablet and desktop widths", async ({ page }) => {
  for (const width of [320, 375, 390, 768, 820, 1024, 1366, 1920]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await page.goto("/");
    const row = page.locator(".teacher-home-actions");
    await expect(row.locator("a")).toHaveCount(3);
    // Let the hero's one-shot entrance animations finish first (never wait on an endless one), as the
    // other phase 9 checks do, so nothing is measured half faded in.
    await page.locator(".teacher-home-copy").evaluate(async (copy) => {
      const finite = document.getAnimations().filter((animation) => {
        const target = (animation.effect as KeyframeEffect | null)?.target;
        return target instanceof Element && copy.contains(target) && Number.isFinite(Number(animation.effect?.getComputedTiming().endTime));
      });
      await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
    });
    const facts = await row.evaluate((element) => {
      const links = [...element.querySelectorAll("a")];
      const boxes = links.map((link) => link.getBoundingClientRect());
      const overlap = boxes.some((a, i) => boxes.some((b, j) => i < j && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5));
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        clipped: links.some((link) => link.scrollWidth > link.clientWidth + 1 || link.scrollHeight > link.clientHeight + 1),
        overlap,
        minHeight: Math.min(...boxes.map((box) => box.height)),
        minWidth: Math.min(...boxes.map((box) => box.width)),
        outside: boxes.some((box) => box.left < 0 || box.right > document.documentElement.clientWidth),
        order: boxes.every((box, index) => index === 0 || box.top > boxes[index - 1].top + 1 || (Math.abs(box.top - boxes[index - 1].top) <= 1 && box.left > boxes[index - 1].left))
      };
    });
    expect(facts.overflow, `${width}px horizontal overflow`).toBeLessThanOrEqual(0);
    expect(facts.clipped, `${width}px clipped label`).toBe(false);
    expect(facts.overlap, `${width}px overlapping buttons`).toBe(false);
    expect(facts.outside, `${width}px button outside the viewport`).toBe(false);
    expect(facts.minHeight, `${width}px target height`).toBeGreaterThanOrEqual(44);
    expect(facts.minWidth, `${width}px target width`).toBeGreaterThanOrEqual(44);
    expect(facts.order, `${width}px visual order follows reading order`).toBe(true);

    await page.evaluate(axeSource);
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (context: string, options: unknown) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
      const result = await axe.run(".teacher-home-copy", { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
      return result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
    });
    expect(violations, `${width}px axe`).toEqual([]);
  }
});
