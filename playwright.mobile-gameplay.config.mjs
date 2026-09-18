import { defineConfig, devices } from "@playwright/test";

/**
 * Mobile gameplay fit — every MathNexa game, measured and gated on phones,
 * tablets, landscape, desktop and the classroom Smart Board.
 * Driven by scripts/run-mobile-gameplay-e2e.mjs, which serves the shipped game
 * documents under their production route paths and CSPs
 * (scripts/mobile-gameplay-harness.mjs).
 */
export default defineConfig({
  testDir: "./e2e/mobile-gameplay",
  timeout: 180_000,
  expect: { timeout: 15_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: "disabled", caret: "hide" } },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  use: {
    baseURL: process.env.MOBILE_GAMEPLAY_URL ?? "http://127.0.0.1:4195",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"] } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } }
  ]
});
