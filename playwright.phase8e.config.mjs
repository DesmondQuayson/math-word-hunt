import {defineConfig,devices} from "@playwright/test";
// The public package-delivery spec runs in Chromium AND WebKit: Chromium sends no SameSite=Lax cookie from the
// sandboxed (opaque-origin) game frame, WebKit does, and both must load the package. The admin spec is stateful
// (TOTP enrolment, one quarantine event) and stays Chromium-only.
export default defineConfig({testDir:"./e2e/phase8e",timeout:120000,expect:{timeout:10000},fullyParallel:false,workers:1,reporter:"list",use:{baseURL:"http://127.0.0.1:3000",trace:"retain-on-failure",screenshot:"only-on-failure"},projects:[{name:"chromium",use:{...devices["Desktop Chrome"]}},{name:"webkit",testMatch:/public-game-delivery\.spec\.ts$/,use:{...devices["Desktop Safari"]}}]});
