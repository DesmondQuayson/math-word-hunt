import { expect, test } from "@playwright/test";

/**
 * A notice wraps a long unbroken word instead of pushing the page sideways
 * (WCAG 1.4.10 Reflow). Production's support address is one such word: at
 * 320 px with 200% text it made /support scroll sideways. The local support
 * address is short, so the test puts a longer synthetic one into the notice
 * before measuring.
 */
test("the support notice wraps a long address at 320 px with 200% text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/support");
  await expect(page.getByRole("note", { name: "Support contact" }).locator('a[href^="mailto:"]')).toBeVisible();
  // Change the text only after React has hydrated the link, or hydration would put the original back.
  await page.waitForFunction(() => {
    const address = document.querySelector('[aria-label="Support contact"] a[href^="mailto:"]');
    return address !== null && Object.keys(address).some((key) => key.startsWith("__reactFiber$"));
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
    const address = document.querySelector('[aria-label="Support contact"] a[href^="mailto:"]');
    if (address) address.textContent = "mathnexa-support-team-long-address@example.invalid";
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
