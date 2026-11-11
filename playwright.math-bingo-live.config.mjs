import { defineConfig, devices } from "@playwright/test";

/**
 * Math Bingo Live: a signed-in free teacher and several anonymous students in
 * separate browser contexts, the real API and the real database functions
 * (local Supabase). Driven by scripts/run-math-bingo-live.mjs e2e.
 */
export default defineConfig({
  testDir: "./e2e/math-bingo-live",
  timeout: 420_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "test-results/math-bingo-live",
  use: {
    baseURL: process.env.MATH_BINGO_LIVE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium", testIgnore: ["**/devices.spec.ts"], use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", testMatch: ["**/live.spec.ts", "**/fractions.spec.ts", "**/reconnect.spec.ts", "**/join-emoji.spec.ts", "**/winners.spec.ts"], use: { ...devices["Desktop Safari"] } },
    { name: "devices-chromium", testMatch: ["**/devices.spec.ts"], use: { ...devices["Desktop Chrome"] } },
    { name: "devices-webkit", testMatch: ["**/devices.spec.ts"], use: { ...devices["Desktop Safari"] } }
  ]
});
