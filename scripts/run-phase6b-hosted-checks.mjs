import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const approval = process.env.PHASE6B_HOSTED_APPROVAL === "owner-approved";
const enabled = process.env.PHASE6B_HOSTED_CHECKS_ENABLED === "true";
const origin = process.env.MVH_PREVIEW_URL;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

if (!approval || !enabled) throw new Error("Phase 6B hosted checks require explicit owner approval and an enabled check gate.");
if (!origin || !bypass) throw new Error("Phase 6B hosted checks require the protected Preview origin and existing automation bypass.");
const preview = new URL(origin);
if (preview.protocol !== "https:" || preview.pathname !== "/" || preview.search || preview.hash || preview.username || preview.password) {
  throw new Error("Phase 6B hosted checks require an exact HTTPS Preview origin.");
}
for (const [name, prohibited] of [["MVH_PILOT_STATE", "active"], ["BILLING_ENABLED", "true"], ["MVH_APP_ENVIRONMENT", "production"]]) {
  if (process.env[name] === prohibited) throw new Error(`${name}=${prohibited} is prohibited during inactive hosted verification.`);
}

const anonymous = await fetch(new URL("/status", preview), { redirect: "manual", signal: AbortSignal.timeout(15_000) });
if (anonymous.status === 200) throw new Error("Protected Preview was publicly accessible without the automation bypass.");
if (![301, 302, 303, 307, 308, 401, 403, 451].includes(anonymous.status)) {
  throw new Error(`Protected Preview returned unexpected anonymous HTTP ${anonymous.status}.`);
}
console.log(`Phase 6B anonymous protection check passed with HTTP ${anonymous.status}.`);

const result = spawnSync(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), "test", "--config=playwright.phase6b-hosted.config.mjs"], {
  env: process.env,
  stdio: "inherit"
});
if (result.status !== 0) process.exit(result.status ?? 1);
console.log("Phase 6B hosted inactive-pilot checks passed. No account, email, participant, billing, or activation action was performed.");
