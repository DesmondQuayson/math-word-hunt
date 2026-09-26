import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/quiz-pdfs",
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    // axe-core is injected as an inline script; the app's CSP would refuse it.
    bypassCSP: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } }
  ]
});
