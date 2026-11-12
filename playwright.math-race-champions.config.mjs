import { defineConfig, devices } from "@playwright/test";

/**
 * Math Race Champions: real browsers, the real API and the real database
 * functions (local Supabase). Driven by scripts/run-math-race-champions.mjs e2e.
 */
export default defineConfig({
  testDir: "./e2e/math-race-champions",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "test-results/math-race-champions",
  use: {
    baseURL: process.env.MATH_RACE_CHAMPIONS_URL ?? "http://127.0.0.1:3103",
    // One stuck click must not cost a whole test's time budget.
    actionTimeout: 45_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Headless WebKit is several times slower per click on the review machine.
    { name: "webkit", timeout: 900_000, use: { ...devices["Desktop Safari"] } }
  ]
});
