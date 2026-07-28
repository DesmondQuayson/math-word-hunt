import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";

import { registerVerificationNextProcess, stopVerificationNextProcess } from "./verification-processes.mjs";

const status = JSON.parse(execFileSync(process.execPath, [resolve("node_modules/supabase/dist/supabase.js"), "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
for (const key of ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"]) if (typeof status[key] !== "string" || status[key].length < 10) throw new Error(`Local Supabase status is missing ${key}.`);

const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_URL: status.API_URL,
  SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  APP_BASE_URL: "http://127.0.0.1:3000",
  LEGACY_GAME_URL: "http://127.0.0.1:4173/docs/index.html",
  MVH_APP_ENVIRONMENT: "preview",
  MVH_APPLICATION_ORIGIN: "http://127.0.0.1:3000",
  MVH_SUPABASE_PROJECT_REF: "local-phase6-preview",
  MVH_STRIPE_MODE: "test",
  MVH_EMAIL_DELIVERY: "capture",
  MVH_MONITORING_MODE: "console",
  MVH_FIXTURE_POLICY: "allowed",
  MVH_DELETION_MODE: "dry-run",
  MVH_BUILD_ID: "phase6-rehearsal",
  MVH_PILOT_READINESS: "ready-for-owner-decision",
  MVH_PILOT_ACTIVATION: "inactive",
  BILLING_ENABLED: "false",
  BILLING_CHECKOUT_ENABLED: "false",
  BILLING_PORTAL_ENABLED: "false",
  BILLING_WEBHOOK_ENABLED: "false",
  BILLING_EMERGENCY_DEFAULT_DENY: "true"
};

const staticServer = spawn(process.execPath, [resolve("scripts/serve-static.mjs"), "--port", "4173"], { stdio: ["ignore", "ignore", "inherit"] });
const app = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "dev", resolve("apps/platform-web"), "--hostname", "127.0.0.1", "--port", "3000"], { env: environment, stdio: ["ignore", "inherit", "inherit"] });
registerVerificationNextProcess(app);

async function waitFor(url, label) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch { /* local server is starting */ }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`${label} did not become ready.`);
}

async function stop(child, isNext = false) {
  if (isNext) return stopVerificationNextProcess(child);
  child.kill();
  if (child.exitCode === null) await Promise.race([once(child, "exit"), new Promise((done) => setTimeout(done, 2_000))]);
}

let exitCode = 1;
try {
  await Promise.all([waitFor("http://127.0.0.1:4173/docs/index.html", "Canonical game"), waitFor("http://127.0.0.1:3000/pilot", "Platform")]);
  const tests = spawn(process.execPath, [resolve("node_modules/@playwright/test/cli.js"), "test", "--config=playwright.phase6.config.mjs"], {
    env: { ...environment, SUPABASE_TEST_URL: status.API_URL, SUPABASE_TEST_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY, SUPABASE_TEST_SECRET_KEY: status.SECRET_KEY },
    stdio: "inherit"
  });
  [exitCode] = await once(tests, "exit");
} finally {
  await Promise.all([stop(app, true), stop(staticServer)]);
}
process.exitCode = exitCode ?? 1;
