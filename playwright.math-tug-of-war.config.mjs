import { defineConfig, devices } from "@playwright/test";

/**
 * Math Tug of War — local modes (VS Robot, Two Teams) against the shipped
 * game document under its production route path and CSP, served by
 * scripts/mobile-gameplay-harness.mjs. Driven by scripts/run-math-tug-of-war-e2e.mjs.
 * Online Match (two real clients + API + database) lives in
 * playwright.math-tug-of-war-online.config.mjs.
 */
export default defineConfig({
  testDir: "./e2e/math-tug-of-war",
  testIgnore: ["**/online.spec.ts", "**/free-access.spec.ts"],
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: process.env.MATH_TUG_OF_WAR_URL ?? "http://127.0.0.1:4197",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
    { name: "webkit-mobile", use: { ...devices["iPhone 13"] } },
    { name: "webkit-ipad", use: { ...devices["iPad (gen 7) landscape"] } }
  ]
});
