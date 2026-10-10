import { defineConfig, devices } from "@playwright/test";

/**
 * Math Tug of War Online Match: two real browser clients, the real API and
 * the real database functions (local Supabase). Driven by
 * scripts/run-math-tug-of-war-online-e2e.mjs.
 */
// Hardware GL for the 3D project (headless Chromium is software GL by default).
const GPU_ARGS = ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"];

export default defineConfig({
  testDir: "./e2e/math-tug-of-war",
  testMatch: ["**/online.spec.ts", "**/free-access.spec.ts", "**/online-3d.spec.ts"],
  timeout: 300_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.MATH_TUG_OF_WAR_ONLINE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    { name: "chromium", testMatch: ["**/online.spec.ts", "**/free-access.spec.ts"], use: { ...devices["Desktop Chrome"] } },
    // Both clients with the 3D scene on: the two 3D layers must follow one room state.
    { name: "chromium-3d", testMatch: ["**/online-3d.spec.ts"], use: { ...devices["Desktop Chrome"], trace: "off", launchOptions: { args: GPU_ARGS } } }
  ]
});
