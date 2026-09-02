import { defineConfig, devices } from "@playwright/test";

/**
 * Same-session relaunch certification (deployment happening underneath a live
 * browser session). Driven by scripts/run-mvh-session-e2e.mjs.
 */
export default defineConfig({
  testDir: "./e2e/mvh-session",
  timeout: 180_000,
  expect: { timeout: 25_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.MVH_SESSION_URL ?? "http://127.0.0.1:4199",
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
