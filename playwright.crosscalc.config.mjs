import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/crosscalc",
  timeout: 180_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"]
  }
});
