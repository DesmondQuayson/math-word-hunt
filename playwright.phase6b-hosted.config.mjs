import { defineConfig, devices } from "@playwright/test";

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
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    extraHTTPHeaders: {
      "x-vercel-protection-bypass": bypass,
      "x-vercel-skip-toolbar": "1"
    },
    ...devices["Desktop Chrome"]
  }
});
