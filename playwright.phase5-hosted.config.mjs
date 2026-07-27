import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.MVH_PREVIEW_URL;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
if (!baseURL || !bypass) throw new Error("Phase 5 hosted Playwright requires owner-approved preview inputs.");

export default defineConfig({
  testDir: "./e2e/phase5",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    extraHTTPHeaders: { "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" },
    ...devices["Desktop Chrome"]
  }
});
