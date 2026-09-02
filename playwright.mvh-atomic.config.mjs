import { defineConfig, devices } from "@playwright/test";

/**
 * Version-atomic delivery certification (returning browser / hostile cache).
 * Driven by scripts/run-mvh-atomic-delivery-e2e.mjs.
 */
export default defineConfig({
  testDir: "./e2e/mvh-atomic",
  timeout: 180_000,
  expect: { timeout: 25_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.MVH_ATOMIC_URL ?? "http://127.0.0.1:4198",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } }
  ]
});
