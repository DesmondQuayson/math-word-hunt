import { expect, test } from "@playwright/test";

/**
 * Text enlarged on its own (Firefox "Zoom text only", or a root font-size
 * override) must not push pages sideways at laptop widths (WCAG 1.4.4 and
 * 1.4.10). Full-page zoom and the browser's default font size were already
 * fine; this enlarges the root font size alone, as text-only zoom does, so
 * width-based media queries do not fire.
 */
for (const path of ["/", "/about", "/support", "/online-math-prep"]) {
  test(`${path} has no sideways scroll with 200% text at 900 to 1100 px`, async ({ page }) => {
    for (const width of [900, 1024, 1100]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: `${path} at ${width} px` }).toBeLessThanOrEqual(0);
    }
  });
}
