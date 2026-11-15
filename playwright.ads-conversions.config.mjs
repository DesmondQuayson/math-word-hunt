import { defineConfig, devices } from "@playwright/test";

// Google Ads conversion measurement: the full funnel in Chrome, Safari's engine
// and two phone profiles. One worker: each project drives its own synthetic
// accounts through one local application and database.
export default defineConfig({
  testDir: "./e2e/ads-conversions",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 14"] } }
  ]
});
