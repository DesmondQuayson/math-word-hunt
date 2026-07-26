import { expect, test } from "@playwright/test";

test("mobile vocabulary trail remains composed", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.locator(".vocabulary-board")).toHaveScreenshot(
    "home-vocabulary-trail-mobile.png",
    { animations: "disabled", maxDiffPixelRatio: 0.01 }
  );
});

test("desktop product paths remain balanced", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await expect(page.locator(".path-grid")).toHaveScreenshot(
    "home-product-paths-desktop.png",
    { animations: "disabled", maxDiffPixelRatio: 0.01 }
  );
});

test("Smart Board launch panel remains bounded", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/play");

  await expect(page.locator(".launch-panel")).toHaveScreenshot(
    "play-launch-panel-smartboard.png",
    { animations: "disabled", maxDiffPixelRatio: 0.01 }
  );
});
