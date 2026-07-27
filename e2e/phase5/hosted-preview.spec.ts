import { expect, test } from "@playwright/test";

test("restricted preview is labeled, blocked from indexing, and sanitized", async ({ page, request }) => {
  await page.goto("/status");
  await expect(page.getByRole("status", { name: "Preview environment status" })).toContainText("Preview environment");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator("h1")).toHaveCount(1);
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toMatch(/Disallow:\s*\//);
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  const body = await health.json();
  expect(body.status).toBe("ready");
  expect(body.environment).toBe("preview");
  expect(JSON.stringify(body)).not.toMatch(/secret|token|key|project|supabase|stripe/i);
});

for (const [name, width, height] of [["phone-small",320,568],["phone",360,800],["phone-modern",390,844],["phone-large",412,915],["tablet-portrait",768,1024],["tablet-landscape",1024,768],["smartboard-small",1280,720],["laptop",1366,768],["smartboard-hd",1920,1080]] as const) {
  test(`hosted status has no horizontal overflow at ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/status");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test("hosted status retains keyboard focus, reduced motion, forced colors, and text reflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/status");
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toBeVisible();
  expect(await focused.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe("none");
  await page.addStyleTag({ content: "*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}html{font-size:200%!important}" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
