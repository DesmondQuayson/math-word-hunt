import { expect, test } from "@playwright/test";

const publicRoutes = ["/", "/play", "/about", "/help", "/privacy", "/terms", "/pricing", "/accessibility"];
const sitemapRoutes = ["/", "/pricing", "/help", "/privacy", "/terms"];
const restrictedRoutes = ["/account", "/sign-in", "/sign-up", "/forgot-password", "/update-password", "/teacher", "/teacher/classes", "/pilot", "/subscription", "/checkout/status", "/auth/callback"];
const canonicalUrl = (route: string) => route === "/" ? "https://mathnexa.com" : `https://mathnexa.com${route}`;

test("public pages are available without restricted navigation or data-entry forms", async ({ page }) => {
  for (const route of publicRoutes) {
    const response = await page.goto(route);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator('input[type="email"], input[name*="school" i], input[name*="student" i], input[name*="organization" i], form[action*="billing" i]')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", canonicalUrl(route));
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
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
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

test("the game launch CTA preserves its accessible premium visual treatment", async ({ page }) => {
  await page.goto("/play");
  const launch = page.getByTestId("legacy-game-launch");
  await expect(launch).toBeVisible();

  const baseStyles = await launch.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      backgroundImage: styles.backgroundImage,
      color: styles.color,
      fontSize: Number.parseFloat(styles.fontSize),
      fontWeight: styles.fontWeight,
      letterSpacing: Number.parseFloat(styles.letterSpacing),
      textShadow: styles.textShadow,
      transitionDuration: styles.transitionDuration,
    };
  });

  expect(baseStyles.backgroundImage).toContain("linear-gradient");
  expect(baseStyles.color).toBe("rgb(255, 255, 255)");
  expect(baseStyles.fontSize).toBeGreaterThanOrEqual(17);
  expect(Number(baseStyles.fontWeight)).toBeGreaterThanOrEqual(800);
  expect(baseStyles.letterSpacing).toBeGreaterThan(0);
  expect(baseStyles.textShadow).toContain("rgba(0, 0, 0, 0.35)");
  expect(baseStyles.transitionDuration).toContain("0.18s");

  await launch.hover();
  await expect.poll(() => launch.evaluate((element) => getComputedStyle(element).filter)).toBe("brightness(1.08)");
  await expect.poll(() => launch.evaluate((element) => getComputedStyle(element).transform)).not.toBe("none");
  await expect.poll(() => launch.evaluate((element) => getComputedStyle(element).boxShadow)).toContain("rgba(245, 197, 66, 0.24)");

  await page.setViewportSize({ width: 320, height: 720 });
  const mobileBox = await launch.boundingBox();
  expect(mobileBox).not.toBeNull();
  expect(mobileBox!.height).toBeGreaterThanOrEqual(44);
  expect(mobileBox!.x).toBeGreaterThanOrEqual(0);
  expect(mobileBox!.x + mobileBox!.width).toBeLessThanOrEqual(320);
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
  const robotsResponse = await request.get("/robots.txt");
  expect(robotsResponse.status()).toBe(200);
  expect(robotsResponse.headers()["content-type"]).toContain("text/plain");
  const robots = await robotsResponse.text();
  expect(robots).toContain("Allow: /");
  expect(robots).toContain("Disallow: /not-launched");
  const sitemapResponse = await request.get("/sitemap.xml");
  expect(sitemapResponse.status()).toBe(200);
  expect(sitemapResponse.headers()["content-type"]).toMatch(/application\/xml|text\/xml/);
  const sitemap = await sitemapResponse.text();
  for (const route of sitemapRoutes) expect(sitemap).toContain(`<loc>https://mathnexa.com${route === "/" ? "/" : route}</loc>`);
  expect(sitemap).not.toMatch(/teacher|pilot|account|subscription|checkout|sign-in|sign-up|forgot-password|update-password|\/api\//);
  expect((sitemap.match(/<loc>/g) ?? []).length).toBe(sitemapRoutes.length);
});

test("public metadata is unique, canonical, structured, and shareable", async ({ page, request }) => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const route of publicRoutes) {
    await page.goto(route);
    titles.add(await page.title());
    descriptions.add(await page.locator('meta[name="description"]').getAttribute("content") ?? "");
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "MathNexa");
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", canonicalUrl(route));
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  }
  expect(titles.size).toBe(publicRoutes.length);
  expect(descriptions.size).toBe(publicRoutes.length);

  await page.goto("/");
  const structuredData = await page.locator('script[type="application/ld+json"]').textContent();
  const entries = JSON.parse(structuredData ?? "[]") as Array<{ "@type": string }>;
  expect(entries.map((entry) => entry["@type"])).toEqual(["WebSite", "Organization"]);
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", /icon\.svg/);
  const image = await request.get("/opengraph-image");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/png");
});

test("sitemap is well-formed XML", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const xml = await (await fetch("/sitemap.xml")).text();
    const document = new DOMParser().parseFromString(xml, "application/xml");
    return { parserErrors: document.querySelectorAll("parsererror").length, locations: document.querySelectorAll("url > loc").length };
  });
  expect(result).toEqual({ parserErrors: 0, locations: sitemapRoutes.length });
});
