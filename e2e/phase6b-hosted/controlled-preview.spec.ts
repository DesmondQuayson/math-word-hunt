import { expect, test } from "@playwright/test";

const previewOrigin = new URL(process.env.MVH_PREVIEW_URL ?? "https://preview.example.invalid").origin;
const pilotRoutes = ["/pilot", "/pilot/privacy", "/pilot/support", "/pilot/feedback", "/pilot/exit"];

test("server-owned inactive state resists browser forgery and keeps pilot boundaries visible", async ({ page, context }) => {
  await context.addCookies([{ name: "mvh_pilot_state", value: "active", url: previewOrigin }]);
  await page.addInitScript(() => localStorage.setItem("MVH_PILOT_STATE", "active"));
  await page.goto("/pilot?pilot=active&activation=active#active");
  const banner = page.getByLabel("Restricted pilot status");
  await expect(banner).toHaveAttribute("data-pilot-state", "inactive");
  await expect(banner).toHaveAttribute("data-pilot-activation", "inactive");
  for (const text of ["Pilot inactive", "Adult teachers only", "No student data", "No organization labels", "No billing"]) {
    await expect(banner).toContainText(text);
  }
  await expect(page.locator("h1")).toHaveCount(1);
});

test("hosted Auth and onboarding copy remains truthful and organization-free", async ({ page }) => {
  for (const route of ["/sign-up", "/sign-in", "/forgot-password"]) {
    await page.goto(route);
    await expect(page.locator("[data-auth-email-state='transactional-configured']")).toBeVisible();
    await expect(page.getByText("Transactional Auth email is configured but not verified.")).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
  }
  await page.goto("/sign-up");
  await expect(page.getByLabel(/School or organization/i)).toHaveCount(0);
  await expect(page.getByText(/Organization labels are disabled/)).toBeVisible();
});

test("pilot feedback stays browser-local and disappears on reload", async ({ page }) => {
  await page.goto("/pilot/feedback");
  const unexpected: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).origin !== previewOrigin) unexpected.push(request.url());
  });
  await page.getByLabel(/Workflow being tested/).fill("Launch the canonical game");
  await page.getByLabel(/Reproducible steps/).fill("Open the play gateway and review the launch link.");
  await page.getByLabel(/Expected behavior/).fill("The preserved game remains available.");
  await page.getByLabel(/Observed behavior/).fill("The gateway remained keyboard accessible.");
  await page.getByRole("button", { name: "Prepare feedback summary" }).click();
  await expect(page.getByRole("heading", { name: "Prepared summary" })).toBeVisible();
  expect(unexpected).toEqual([]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Prepared summary" })).toHaveCount(0);
});

test("pilot routes reflow, focus visibly, and respect reduced motion and forced colors", async ({ page }) => {
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    for (const route of pilotRoutes) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/pilot");
  const privacy = page.getByRole("navigation", { name: "Pilot readiness" }).getByRole("link", { name: "Privacy" });
  await privacy.focus();
  await expect(privacy).toBeFocused();
  await page.addStyleTag({ content: "*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}html{font-size:200%!important}" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("play gateway references the preserved HTTPS game without navigating or leaking the bypass", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/play");
  const launch = page.getByTestId("legacy-game-launch");
  await expect(launch).toHaveAttribute("target", "_blank");
  await expect(launch).toHaveAttribute("rel", /noopener/);
  const destination = await launch.getAttribute("href");
  expect(destination).toMatch(/^https:\/\//);
  expect(new URL(destination ?? previewOrigin).origin).not.toBe(previewOrigin);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
