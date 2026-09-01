import { defineConfig, devices } from "@playwright/test";

/**
 * Real-runtime ducking certification for Math Vocabulary Hunt.
 * Driven by scripts/run-mvh-real-runtime-e2e.mjs, which serves the document the
 * shipped enhancer produces at the production route path and CSP.
 *
 * No autoplay-policy flags: a browser that would block audio for a real learner
 * must block it here too.
 */
export default defineConfig({
  testDir: "./e2e/mvh-real-runtime",
  timeout: 150_000,
  expect: { timeout: 25_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.MVH_REAL_RUNTIME_URL ?? "http://127.0.0.1:4194",
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
