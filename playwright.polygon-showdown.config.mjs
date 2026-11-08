import { defineConfig, devices } from "@playwright/test";

/**
 * Polygon Showdown: real browsers, the real API and the real database functions
 * (local Supabase). Driven by scripts/run-polygon-showdown.mjs e2e.
 */
export default defineConfig({
  testDir: "./e2e/polygon-showdown",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "test-results/polygon-showdown",
  use: {
    baseURL: process.env.POLYGON_SHOWDOWN_URL ?? "http://127.0.0.1:3102",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium", testIgnore: ["**/devices.spec.ts"], use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", testMatch: ["**/solo.spec.ts", "**/showdown.spec.ts", "**/shop.spec.ts"], use: { ...devices["Desktop Safari"] } },
    { name: "devices-chromium", testMatch: ["**/devices.spec.ts"], use: { ...devices["Desktop Chrome"] } },
    { name: "devices-webkit", testMatch: ["**/devices.spec.ts"], use: { ...devices["Desktop Safari"] } }
  ]
});
