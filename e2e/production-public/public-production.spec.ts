import { expect, test } from "@playwright/test";

const publicRoutes = ["/", "/play", "/about", "/help", "/privacy", "/accessibility"];
const restrictedRoutes = ["/account", "/sign-in", "/sign-up", "/forgot-password", "/update-password", "/teacher", "/teacher/classes", "/pilot", "/pricing", "/checkout/status", "/auth/callback"];

test("public pages are available without restricted navigation or data-entry forms", async ({ page }) => {
  for (const route of publicRoutes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator('input[type="email"], input[name*="school" i], input[name*="student" i], input[name*="organization" i], form[action*="billing" i]')).toHaveCount(0);
  }
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).not.toContainText(/Teacher|Pilot|Account|Pricing/);
  await expect(page.getByRole("link", { name: "MathNexa home" })).toBeVisible();
});

test("account, teacher, pilot, billing, recovery, and internal routes are deliberately unavailable", async ({ page, request }) => {
  for (const route of restrictedRoutes) {
    const response = await page.goto(route);
    expect([200, 404], route).toContain(response?.status());
    await expect(page.getByRole("heading", { name: "This feature has not launched" })).toBeVisible();
    await expect(page.locator("form, input, textarea, select")).toHaveCount(0);
  }
  for (const route of ["/api/health", "/api/billing/webhook"]) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(404);
    expect(await response.json()).toEqual({ error: "not-found" });
  }
});

test("the gateway opens the preserved canonical game", async ({ page }) => {
  await page.goto("/play");
  const launch = page.getByTestId("legacy-game-launch");
  await expect(launch).toHaveAttribute("href", "http://127.0.0.1:4173/docs/index.html");
  const popupPromise = page.waitForEvent("popup");
  await launch.click();
  const game = await popupPromise;
  await game.waitForLoadState("domcontentloaded");
  await expect(game.locator("body")).toContainText(/Math|Puzzle|Grade/i);
  await game.close();
});

test("public pages preserve keyboard focus, mobile reflow, reduced motion, and forced colors", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const route of publicRoutes) {
    await page.goto(route);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, route).toBeLessThanOrEqual(1);
  }
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/accessibility");
  await expect(page.getByRole("heading", { name: "Multiple ways to navigate and play" })).toBeVisible();
  await page.emulateMedia({ forcedColors: "active" });
  await expect(page.getByRole("link", { name: "Open the game gateway" })).toBeVisible();
});

test("HTML and client assets expose no provider secrets or Preview configuration", async ({ page, request }) => {
  const forbidden = /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|RESEND_API_KEY|VERCEL_AUTOMATION_BYPASS_SECRET|ioodoktlxvvmghyvevgn|sb_secret_|sk_(?:test|live)_|whsec_/i;
  for (const route of publicRoutes) {
    const response = await request.get(route);
    expect(await response.text(), route).not.toMatch(forbidden);
  }
  await page.goto("/");
  const scripts = await page.locator("script[src]").evaluateAll((nodes) => nodes.map((node) => (node as HTMLScriptElement).src));
  for (const script of scripts) {
    const response = await request.get(script);
    expect(await response.text(), script).not.toMatch(forbidden);
  }
});

test("robots and sitemap expose only the intended public surface", async ({ request }) => {
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Allow: /");
  expect(robots).toContain("Disallow: /not-launched");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const route of publicRoutes) expect(sitemap).toContain(`https://mathnexa.com${route === "/" ? "" : route}`);
  expect(sitemap).not.toMatch(/teacher|pilot|account|pricing|sign-in|sign-up/);
});
