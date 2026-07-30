import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { get } from "node:http";
import { resolve } from "node:path";

import { registerVerificationNextProcess, stopRegisteredVerificationNextProcesses, stopVerificationNextProcess } from "./verification-processes.mjs";

const restrictedNames = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "MVH_SUPABASE_PROJECT_REF",
  "STRIPE_PUBLISHABLE_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY", "VERCEL_AUTOMATION_BYPASS_SECRET"
];
const environment = {
  ...process.env,
  NODE_ENV: "production",
  MVH_APP_ENVIRONMENT: "production-public",
  MVH_APPLICATION_ORIGIN: "https://mathnexa.com",
  MVH_STRIPE_MODE: "disabled",
  MVH_EMAIL_DELIVERY: "disabled",
  MVH_MONITORING_MODE: "console",
  MVH_FIXTURE_POLICY: "forbidden",
  MVH_DELETION_MODE: "disabled",
  MVH_BUILD_ID: "production-public-e2e",
  MVH_PILOT_STATE: "inactive",
  MVH_INVITATIONS_ENABLED: "false",
  BILLING_ENABLED: "false",
  BILLING_ENVIRONMENT: "production-public",
  BILLING_CHECKOUT_ENABLED: "false",
  BILLING_PORTAL_ENABLED: "false",
  BILLING_WEBHOOK_ENABLED: "false",
  BILLING_EMERGENCY_DEFAULT_DENY: "true",
  APP_BASE_URL: "https://mathnexa.com",
  LEGACY_GAME_URL: "http://127.0.0.1:4173/docs/index.html"
};
for (const name of restrictedNames) environment[name] = "";

await stopRegisteredVerificationNextProcesses();
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const build = spawnSync(npm, ["run", "build"], { env: environment, stdio: "inherit", shell: process.platform === "win32" });
if (build.status !== 0) process.exit(build.status ?? 1);

const staticServer = spawn(process.execPath, [resolve("scripts/serve-static.mjs"), "--port", "4173"], { stdio: ["ignore", "ignore", "inherit"] });
const app = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", resolve("apps/platform-web"), "--hostname", "127.0.0.1", "--port", "4190"], { env: environment, stdio: ["ignore", "inherit", "inherit"] });
registerVerificationNextProcess(app);

async function waitFor(url, label) {
  const deadline = Date.now() + 45_000;
  let lastResult = "no response";
  while (Date.now() < deadline) {
    try {
      const status = await new Promise((resolveStatus, reject) => {
        const request = get(url, (response) => { response.resume(); resolveStatus(response.statusCode ?? 0); });
        request.setTimeout(2_000, () => request.destroy(new Error("readiness timeout")));
        request.once("error", reject);
      });
      if (status >= 200 && status < 400) return;
      lastResult = `HTTP ${status}`;
    } catch (error) { lastResult = error instanceof Error ? error.message : String(error); }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`${label} did not become ready: ${lastResult}.`);
}

async function stop(child, isNext = false) {
  if (isNext) return stopVerificationNextProcess(child);
  child.kill();
  if (child.exitCode === null) await Promise.race([once(child, "exit"), new Promise((done) => setTimeout(done, 2_000))]);
}

let exitCode = 1;
try {
  await Promise.all([waitFor("http://127.0.0.1:4173/docs/index.html", "Canonical game"), waitFor("http://127.0.0.1:4190/", "Public Production platform")]);
  const tests = spawn(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), "test", "--config=playwright.production-public.config.mjs"], { env: environment, stdio: "inherit" });
  [exitCode] = await once(tests, "exit");
} finally {
  await Promise.all([stop(app, true), stop(staticServer)]);
}
process.exitCode = exitCode ?? 1;
