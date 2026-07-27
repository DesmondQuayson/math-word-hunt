import { expect, test } from "@playwright/test";

test("preview is persistently labeled and not indexable", async ({ page }) => {
  await page.goto("/status");
  await expect(page.getByRole("status", { name: "Preview environment status" })).toContainText("Preview environment");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Preview status");
  await expect(page.getByText("no live payments", { exact: false })).toBeVisible();
});

test("health boundary exposes only safe readiness metadata", async ({ request }) => {
  const response=await request.get("/api/health"); expect(response.status()).toBe(200);
  const body=await response.json(); expect(body).toEqual({status:"ready",environment:"preview",build:"phase4-e2e"});
  expect(JSON.stringify(body)).not.toMatch(/secret|token|key|project/i);
});

test("preview UI supports keyboard, focus, reduced motion, and forced colors", async ({ page }) => {
  await page.emulateMedia({ reducedMotion:"reduce", forcedColors:"active" }); await page.goto("/status");
  await page.keyboard.press("Tab"); const focused=page.locator(":focus"); await expect(focused).toBeVisible();
  const outline=await focused.evaluate((node)=>getComputedStyle(node).outlineStyle); expect(outline).not.toBe("none");
  expect(await page.locator("h1").count()).toBe(1);
});

for (const [name,width,height] of [["phone-small",320,568],["phone",360,800],["phone-modern",390,844],["phone-large",412,915],["tablet-portrait",768,1024],["tablet-landscape",1024,768],["smartboard-small",1280,720],["laptop",1366,768],["smartboard-hd",1920,1080]] as const) {
  test(`status reflows without page overflow at ${name}`, async ({ page }) => {
    await page.setViewportSize({width,height}); await page.goto("/status");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  });
}

test("status withstands text spacing and 400-percent reflow equivalent", async ({ page }) => {
  await page.setViewportSize({width:320,height:568}); await page.goto("/status");
  await page.addStyleTag({content:"*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}html{font-size:200%!important}"});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});

