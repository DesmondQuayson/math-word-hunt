import { defineConfig, devices } from "@playwright/test";

/**
 * Math Tug of War — local modes (VS Robot, Two Teams) against the shipped
 * game document under its production route path and CSP, served by
 * scripts/mobile-gameplay-harness.mjs. Driven by scripts/run-math-tug-of-war-e2e.mjs.
 * Online Match (two real clients + API + database) lives in
 * playwright.math-tug-of-war-online.config.mjs.
 */
// Chromium headless renders WebGL with SwiftShader (software) by default, which
// the game correctly treats as "classic". The 3D projects ask Chromium for the
// real GPU so the 3D scene runs at play speed; WebKit uses its own GPU path.
const GPU_ARGS = ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"];
const CLASSIC_IGNORE = ["**/online.spec.ts", "**/free-access.spec.ts", "**/scene-3d.spec.ts", "**/online-3d.spec.ts"];

export default defineConfig({
  testDir: "./e2e/math-tug-of-war",
  testIgnore: ["**/online.spec.ts", "**/free-access.spec.ts", "**/online-3d.spec.ts"],
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: process.env.MATH_TUG_OF_WAR_URL ?? "http://127.0.0.1:4197",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    // A project-level testIgnore replaces the top-level one, so the online specs stay listed here.
    { name: "chromium-desktop", testIgnore: [...CLASSIC_IGNORE], use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-desktop", testIgnore: [...CLASSIC_IGNORE], use: { ...devices["Desktop Safari"] } },
    { name: "chromium-mobile", testIgnore: [...CLASSIC_IGNORE], use: { ...devices["Pixel 7"] } },
    { name: "webkit-mobile", testIgnore: [...CLASSIC_IGNORE], use: { ...devices["iPhone 13"] } },
    { name: "webkit-ipad", testIgnore: [...CLASSIC_IGNORE], use: { ...devices["iPad (gen 7) landscape"] } },
    // 3D scene regression (forced on with ?graphics=3d), desktop and phone, both engines.
    // Traces stay off here: WebKit drops trace resources when many contexts close in one test.
    { name: "chromium-3d", testMatch: ["**/scene-3d.spec.ts"], timeout: 360_000, use: { ...devices["Desktop Chrome"], trace: "off", launchOptions: { args: GPU_ARGS } } },
    { name: "webkit-3d", testMatch: ["**/scene-3d.spec.ts"], timeout: 360_000, use: { ...devices["Desktop Safari"], trace: "off" } },
    { name: "chromium-3d-mobile", testMatch: ["**/scene-3d.spec.ts"], timeout: 360_000, use: { ...devices["Pixel 7"], trace: "off", launchOptions: { args: GPU_ARGS } } },
    // The player-camera grip acceptance on the other classroom screens: Smart Board, iPad (both ways round) and iPhone.
    { name: "chromium-3d-smart-board", testMatch: ["**/scene-3d.spec.ts"], grep: /visual acceptance/, timeout: 360_000, use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 }, trace: "off", launchOptions: { args: GPU_ARGS } } },
    { name: "webkit-3d-ipad", testMatch: ["**/scene-3d.spec.ts"], grep: /visual acceptance/, timeout: 360_000, use: { ...devices["iPad (gen 7) landscape"], trace: "off" } },
    { name: "webkit-3d-ipad-portrait", testMatch: ["**/scene-3d.spec.ts"], grep: /visual acceptance/, timeout: 360_000, use: { ...devices["iPad (gen 7)"], trace: "off" } },
    { name: "webkit-3d-iphone", testMatch: ["**/scene-3d.spec.ts"], grep: /visual acceptance/, timeout: 360_000, use: { ...devices["iPhone 13"], trace: "off" } }
  ]
});
