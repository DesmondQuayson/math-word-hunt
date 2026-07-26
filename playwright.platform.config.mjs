import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/platform-web",
  testMatch: "**/*.spec.ts",
  timeout: 45_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4180",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"]
  }
});
