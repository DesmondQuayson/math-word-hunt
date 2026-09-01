import { defineConfig, devices } from "@playwright/test";

/**
 * Cross-browser certification for the Math Vocabulary Hunt audio balance.
 * Driven by scripts/run-mvh-audio-e2e.mjs, which builds the enhanced game and
 * serves it under the production /game/runtime CSP.
 *
 * No autoplay-policy flags: a browser that would block audio for a real
 * learner must block it here too.
 */
export default defineConfig({
  testDir: "./e2e/mvh-audio",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.MVH_AUDIO_HARNESS_URL ?? "http://127.0.0.1:4188",
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
