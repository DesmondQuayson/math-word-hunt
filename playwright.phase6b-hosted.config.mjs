import { defineConfig, devices } from "@playwright/test";

import { HOSTED_BYPASS_STATE } from "./playwright.hosted-bypass.setup.mjs";

const baseURL = process.env.MVH_PREVIEW_URL;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
if (!baseURL || !bypass) throw new Error("Phase 6B hosted Playwright requires owner-approved Preview inputs.");

export default defineConfig({
  testDir: "./e2e/phase6b-hosted",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  // The bypass secret is exchanged once for Vercel's host-only cookie; tests carry only that cookie.
  globalSetup: "./playwright.hosted-bypass.setup.mjs",
  use: {
    baseURL,
    storageState: HOSTED_BYPASS_STATE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"]
  }
});
