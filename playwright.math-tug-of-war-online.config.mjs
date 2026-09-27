import { defineConfig, devices } from "@playwright/test";

/**
 * Math Tug of War Online Match: two real browser clients, the real API and
 * the real database functions (local Supabase). Driven by
 * scripts/run-math-tug-of-war-online-e2e.mjs.
 */
export default defineConfig({
  testDir: "./e2e/math-tug-of-war",
  testMatch: ["**/online.spec.ts", "**/free-access.spec.ts"],
  timeout: 300_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.MATH_TUG_OF_WAR_ONLINE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"]
  }
});
