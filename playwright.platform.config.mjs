import { defineConfig, devices } from "@playwright/test";

const platformBaseUrl = process.env.MVH_PLATFORM_TEST_BASE_URL ?? "http://127.0.0.1:4180";

export default defineConfig({
  testDir: "./e2e/platform-web",
  testMatch: "**/*.spec.ts",
  timeout: 45_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: platformBaseUrl,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"]
  }
});
